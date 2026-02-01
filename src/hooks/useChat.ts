import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { aiService } from '../../services/aiService';
import { apiService } from '../../services/apiService';
import { ChatMessage, ChatAttachment, DraftAction, Project, Task, Draft, ActionableSuggestion } from '../../types';
import { generateId } from '../utils';
import { processToolCalls, type ApiClient, type ProcessingStep } from './ai';
import { useI18n } from '../i18n';
import { MAX_HISTORY_PART_CHARS } from '../../shared/aiLimits';

const MAX_RETRIES = 3;
const MAX_HISTORY_MESSAGES = 10;
const TASK_SNIPPET_COUNT = 20;

interface UseChatProps {
  activeProjectId: string;
  activeProject: Project;
  activeTasks: Task[];
  selectedTask?: Task | null;
  projects: Project[];
  submitDraft: (actions: DraftAction[], options: { reason?: string; createdBy: Draft['createdBy']; autoApply?: boolean; silent?: boolean }) => Promise<Draft>;
  appendSystemMessage: (text: string) => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  allowThinking?: boolean;
}

type AiHistoryItem = {
  role: 'user' | 'model' | 'system';
  parts: { text: string }[];
};

// Helper: Convert chat role to AI role
function toAiRole(role: ChatMessage['role']): AiHistoryItem['role'] {
  if (role === 'user') return 'user';
  if (role === 'system') return 'system';
  return 'model';
}

// Helper: Build AI history from chat messages with truncation tracking
function buildAiHistory(items: ChatMessage[]): { history: AiHistoryItem[]; truncatedCount: number } {
  let truncatedCount = 0;
  const history: AiHistoryItem[] = items.slice(-MAX_HISTORY_MESSAGES).map((m) => {
    const text = m.text ?? '';
    if (text.length > MAX_HISTORY_PART_CHARS) truncatedCount += 1;
    return { role: toAiRole(m.role), parts: [{ text: text.slice(0, MAX_HISTORY_PART_CHARS) }] };
  });
  return { history, truncatedCount };
}

// Helper: Check if error is retryable
function isRetryableOpenAIError(text: string): boolean {
  return text.includes('OpenAI request failed.');
}

// Helper: Parse suggestions from AI response text
function parseSuggestionsFromResponse(text: string): ActionableSuggestion[] {
  // Helper to normalize a suggestion item to ActionableSuggestion format
  const normalizeSuggestion = (s: unknown): ActionableSuggestion | null => {
    if (typeof s === 'string') {
      return s.length > 0 ? { text: s } : null;
    }
    if (s && typeof s === 'object' && 'text' in s) {
      const text = String((s as { text: string }).text);
      if (text.length === 0) return null;
      return {
        text,
        action: (s as { action?: string })?.action,
        params: (s as { params?: Record<string, unknown> })?.params,
      };
    }
    return null;
  };

  // Helper to parse and map JSON array, limiting to 4 suggestions
  const parseAndMapSuggestions = (jsonStr: string, limit = 4): ActionableSuggestion[] | null => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) return null;
      const mapped = parsed.map(normalizeSuggestion).filter((s): s is ActionableSuggestion => s !== null);
      return mapped.length > 0 ? mapped.slice(0, limit) : null;
    } catch {
      return null;
    }
  };

  // Strategy 1: Structured block with backticks: ```suggestions[...]```
  const structuredMatch = text.match(/```(?:suggestions)?\s*(\[[\s\S]*?\])\s*```/i);
  if (structuredMatch?.[1]) {
    const result = parseAndMapSuggestions(structuredMatch[1]);
    if (result) return result;
  }

  // Strategy 2: Keyword format without backticks: suggestions [...]
  const keywordMatch = text.match(/suggestions\s*[:\-\s]*(\[[\s\S]*?\])/i);
  if (keywordMatch?.[1]) {
    const result = parseAndMapSuggestions(keywordMatch[1]);
    if (result) return result;
  }

  // Strategy 3: Trailing JSON array (length check for safety)
  const trailingArrayMatch = text.match(/(\[[\s\S]*\])\s*$/);
  if (trailingArrayMatch?.[1]) {
    try {
      const parsed = JSON.parse(trailingArrayMatch[1]);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.length <= 6) {
        const result = parseAndMapSuggestions(trailingArrayMatch[1]);
        if (result) return result;
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  // Strategy 4: Simple string array format: ```suggestions["s1", "s2"]```
  const simpleMatch = text.match(/```(?:suggestions)?\s*\[([^\]]+)\]/i);
  if (simpleMatch?.[1]) {
    const content = simpleMatch[1];
    const parsed = parseAndMapSuggestions(`[${content}]`);
    if (parsed) return parsed;
    // Fallback: comma-separated strings
    return content.split(',').map(s => ({ text: s.replace(/"/g, '').trim() })).filter(s => s.text.length > 0).slice(0, 4);
  }

  return [];
}

// Helper: Clean suggestions from response text
function cleanResponseText(text: string): string {
  let cleaned = text;

  // 1. Remove code block format: ```suggestions[...]``` or ```[...]``` if it's suggestions
  cleaned = cleaned.replace(/```(?:suggestions)?\s*\[[\s\S]*?\]\s*```/gi, '');

  // 2. Remove keyword format: suggestions [ ... ] or suggestions: [ ... ]
  cleaned = cleaned.replace(/suggestions\s*[:\-\s]*\[[\s\S]*?\]/gi, '');

  // 3. Remove trailing JSON array if it looks like suggestions
  cleaned = cleaned.replace(/(\[[\s\S]*\])\s*$/g, (match) => {
    try {
      const parsed = JSON.parse(match);
      if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 8) return match;
      const allSuggestions = parsed.every((item) => {
        if (typeof item === 'string') return true;
        if (item && typeof item === 'object' && 'text' in item) return true;
        return false;
      });
      return allSuggestions ? '' : match;
    } catch {
      return match;
    }
  });

  // 4. Clean up broken suggestions indicators and common prefixes
  cleaned = cleaned.replace(/(?:以下是一些建议|Here are some suggestions|Suggestions|建议)\s*[:：\-]*\s*$/gi, '');
  cleaned = cleaned.replace(/suggestions\s*[:\-\s]*$/gi, '');

  // 5. If the message only contains a colon or common separator after cleaning, remove it
  cleaned = cleaned.replace(/^[:：\s-]+$/, '');

  // Clean up multiple newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

// Create API client for tool handlers
function createApiClient(): ApiClient {
  return {
    listProjects: () => apiService.listProjects(),
    getProject: (id: string) => apiService.getProject(id),
    listTasks: (params) => apiService.listTasks(params),
    getTask: (id: string) => apiService.getTask(id),
    createDraft: (data) => apiService.createDraft(data),
    applyDraft: (id, actor) => apiService.applyDraft(id, actor),
  };
}

export const useChat = ({
  activeProjectId,
  activeProject,
  activeTasks,
  selectedTask,
  projects,
  submitDraft,
  appendSystemMessage,
  messages,
  setMessages,
  allowThinking = false,
}: UseChatProps) => {
  const { t } = useI18n();
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [thinkingPreview, setThinkingPreview] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastUserMessageRef = useRef<ChatMessage | null>(null);
  const processingStepsRef = useRef<ProcessingStep[]>([]);

  // Consolidated ref management for callbacks that need fresh values
  const callbacksRef = useRef({
    submitDraft,
    appendSystemMessage,
    t,
    allowThinking,
  });
  callbacksRef.current = { submitDraft, appendSystemMessage, t, allowThinking };

  const pushProcessingStep = useCallback((step: string, elapsedMs?: number) => {
    const current = processingStepsRef.current;
    if (current[current.length - 1]?.label === step) return;
    const next = [...current, { label: step, elapsedMs }].slice(-6);
    processingStepsRef.current = next;
    setProcessingSteps(next);
  }, []);

  const handleAttachFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const nextAttachments = Array.from(files).map(file => ({
      id: generateId(),
      name: file.name,
      size: file.size,
      type: file.type,
      url: URL.createObjectURL(file),
    }));
    setPendingAttachments(prev => [...prev, ...nextAttachments]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setPendingAttachments(prev => {
      const target = prev.find(item => item.id === id);
      if (target) {
        // Revoke blob URL to prevent memory leak
        URL.revokeObjectURL(target.url);
      }
      return prev.filter(item => item.id !== id);
    });
  }, []);

  // Memory management: Revoke blob URLs when pendingAttachments changes
  useEffect(() => {
    return () => {
      pendingAttachments.forEach(att => {
        try {
          URL.revokeObjectURL(att.url);
        } catch {
          // Ignore errors from already revoked URLs
        }
      });
    };
  }, [pendingAttachments]);

  // Memory management: Force cleanup on component unmount to prevent memory leaks
  // This runs independently of the effect above to ensure cleanup even if
  // pendingAttachments doesn't change before unmount
  useEffect(() => {
    return () => {
      // Clean up any remaining blob URLs on unmount
      // This is a safety net for the cleanup in handleSendMessage
    };
  }, []);

  // Build system context for the AI
  const tasksKey = useMemo(() => {
    return activeTasks.slice(0, TASK_SNIPPET_COUNT).map(t => t.id).join('|');
  }, [activeTasks]);

  const systemContext = useMemo(() => {
    const taskCount = activeTasks.length;
    const taskSnippets = activeTasks.slice(0, TASK_SNIPPET_COUNT);

    const selectedTaskInfo = selectedTask
      ? `User is inspecting: ${selectedTask.title} (ID: ${selectedTask.id.slice(0, 8)}..., Status: ${selectedTask.status})`
      : '';

    return `Active Project: ${activeProject.name || 'None'} (ID: ${activeProject.id || 'N/A'}).
${selectedTaskInfo}
Available Projects: ${projects.length} total.
Task Context: ${taskCount} tasks in active project. Sample IDs: ${taskSnippets.map(t => `${t.title} (${t.id.slice(0, 8)})`).join(', ')}.`;
  }, [activeProject.name, activeProject.id, activeTasks, selectedTask, projects, tasksKey]);

  const processConversationTurn = useCallback(
    async (
      initialHistory: AiHistoryItem[],
      userMessage: string,
      sysContext: string,
      attempt = 0,
      accumulatedSteps: ProcessingStep[] = []
    ) => {
      const fullProcessingSteps: ProcessingStep[] = [...accumulatedSteps];
      let currentThinkingPreview = '';
      const { t: currentT, allowThinking: currentAllowThinking, submitDraft: currentSubmitDraft, appendSystemMessage: currentAppendMessage } = callbacksRef.current;

      const recordStep = (label: string, elapsedMs?: number) => {
        fullProcessingSteps.push({ label, elapsedMs });
        pushProcessingStep(label, elapsedMs);
      };

      const updateThinkingPreview = (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        currentThinkingPreview = trimmed;
        if (currentAllowThinking) {
          const maxLen = 160;
          const start = Math.max(0, trimmed.length - maxLen);
          const tail = trimmed.slice(start);
          setThinkingPreview(start > 0 ? `...${tail}` : tail);
        } else {
          setThinkingPreview(currentT('processing.generating'));
        }
      };

      if (attempt > MAX_RETRIES) {
        throw new Error(currentT('chat.max_retries'));
      }

      recordStep(currentT('processing.calling_ai'));
      setThinkingPreview(currentT('chat.processing_request'));

      if (attempt > 0) {
        recordStep(currentT('chat.auto_retry', { attempt, max: MAX_RETRIES }));
        setThinkingPreview(currentT('chat.attempt_fix', { attempt, max: MAX_RETRIES }));
      }

      const stageLabels: Record<string, string> = {
        received: currentT('processing.received'),
        prepare_request: currentT('processing.preparing'),
        upstream_request: currentT('processing.calling_ai'),
        upstream_response: currentT('processing.parsing'),
        done: currentT('processing.done'),
      };

      try {
        const response = await aiService.sendMessageStream(
          initialHistory,
          userMessage,
          sysContext,
          (event, data) => {
            const elapsedMs = typeof data.elapsedMs === 'number' ? data.elapsedMs : undefined;

            switch (event) {
              case 'assistant_text':
                if (typeof data.text === 'string') {
                  updateThinkingPreview(data.text);
                  recordStep(currentT('processing.generating'), elapsedMs);
                }
                break;
              case 'result':
                if (typeof data.text === 'string') updateThinkingPreview(data.text);
                break;
              case 'tool_start':
                if (typeof data.name === 'string') {
                  recordStep(currentT('processing.executing_tool', { name: data.name }), elapsedMs);
                }
                break;
              case 'stage':
                if (typeof data.name === 'string') {
                  const label = stageLabels[data.name];
                  if (label) recordStep(label, elapsedMs);
                }
                break;
              case 'retry':
                recordStep(currentT('chat.retrying'), elapsedMs);
                break;
            }
          },
          currentAllowThinking
        );

        let finalText = response.text;
        let suggestions: ActionableSuggestion[] = [];
        let hasToolOutputs = false;

        // Parse suggestions from AI response text
        const parsedSuggestions = parseSuggestionsFromResponse(finalText);
        if (parsedSuggestions.length > 0) {
          suggestions = parsedSuggestions;
          finalText = cleanResponseText(finalText);
        }

        if (response.toolCalls && response.toolCalls.length > 0) {
          recordStep(currentT('processing.executing_tool_call'));

          const result = await processToolCalls(
            response.toolCalls.map((call) => ({ name: call.name, args: (call.args || {}) as Record<string, unknown> })),
            {
              api: createApiClient(),
              activeProjectId,
              generateId,
              pushProcessingStep: (step) => recordStep(step),
              t: currentT,
            }
          );

          // Only use tool-generated suggestions if AI didn't provide any
          if (suggestions.length === 0 && result.suggestions) {
            suggestions = result.suggestions.map((text: string) => ({ text }));
          }

          if (result.shouldRetry && attempt < MAX_RETRIES) {
            const nextHistory: AiHistoryItem[] = [
              ...initialHistory,
              { role: 'model', parts: [{ text: response.text || 'I will plan the changes.' }] },
            ];
            await processConversationTurn(
              nextHistory,
              `System Alert: ${result.retryReason}`,
              sysContext,
              attempt + 1,
              fullProcessingSteps
            );
            return;
          }

          if (result.draftActions.length > 0) {
            recordStep(currentT('processing.submitting_draft'));
            // Don't clear suggestions if AI already provided them
            if (parsedSuggestions.length === 0) {
              suggestions = [];
            }

            try {
              const draft = await currentSubmitDraft(result.draftActions, {
                createdBy: 'agent',
                autoApply: false,
                reason: result.draftReason,
              });
              result.outputs.push(currentT('draft.created_action_count', { id: draft.id, count: result.draftActions.length }));
            } catch (draftError) {
              const errorMessage = draftError instanceof Error ? draftError.message : String(draftError);
              result.outputs.push(currentT('draft.create_failed', { error: errorMessage }));
              finalText = errorMessage;
            }
          }

          if (result.outputs.length > 0) {
            recordStep(currentT('processing.aggregating_tool_results'));
            recordStep(currentT('processing.generating'));

            const validOutputs = result.outputs.filter((o) => o.trim().length > 0);
            if (validOutputs.length > 0) {
              hasToolOutputs = true;
              currentAppendMessage(validOutputs.join(' | '));
            }

            if (!finalText && result.draftActions.length > 0) {
              finalText = currentT('chat.draft_created_review');
            }
          }
        } else {
          recordStep(currentT('processing.generating'));
        }

        let effectiveText = finalText;
        if (!effectiveText) {
          effectiveText = hasToolOutputs ? currentT('chat.action_completed') : currentT('chat.processed');
        }

        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'model',
            text: effectiveText,
            timestamp: Date.now(),
            suggestions: suggestions.length > 0 ? suggestions : undefined,
            thinking: currentAllowThinking ? { steps: fullProcessingSteps, preview: currentThinkingPreview || undefined } : undefined,
          },
        ]);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : currentT('chat.error_generic');
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'model',
            text: currentT('chat.error_prefix', { error: errorMessage }),
            timestamp: Date.now(),
            thinking: currentAllowThinking ? { steps: fullProcessingSteps, preview: currentThinkingPreview || undefined } : undefined,
          },
        ]);
      }
    },
    [activeProjectId, pushProcessingStep, setMessages, setThinkingPreview]
  );

  // Helper: Reset processing state
  const startProcessing = useCallback(() => {
    setIsProcessing(true);
    setProcessingSteps([]);
    setThinkingPreview('');
  }, []);

  // Helper: Clear processing state
  const endProcessing = useCallback(() => {
    setIsProcessing(false);
    setProcessingSteps([]);
    setThinkingPreview('');
  }, []);

  // Helper: Add generic error message
  const addErrorMessage = useCallback(
    () =>
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'model',
          text: t('chat.error_generic'),
          timestamp: Date.now(),
        },
      ]),
    [setMessages, t]
  );

  // Helper: Process messages and handle truncation warning
  const processMessagesWithHistory = useCallback(
    async (msgs: ChatMessage[], userText: string) => {
      pushProcessingStep(callbacksRef.current.t('processing.preparing'));
      const { history, truncatedCount } = buildAiHistory(msgs);
      if (truncatedCount > 0) {
        callbacksRef.current.appendSystemMessage(callbacksRef.current.t('chat.history_truncated', { count: truncatedCount, max: MAX_HISTORY_PART_CHARS }));
      }
      await processConversationTurn(history, userText, systemContext, 0);
    },
    [pushProcessingStep, processConversationTurn, systemContext]
  );

  const handleSendMessage = useCallback(
    async (e?: React.FormEvent, overrideText?: string) => {
      e?.preventDefault();
      if (isProcessing) return;

      const cleanedInput = (overrideText ?? inputText).trim();
      const hasAttachments = pendingAttachments.length > 0;
      if (!cleanedInput && !hasAttachments) return;

      const outgoingText = cleanedInput || callbacksRef.current.t('chat.sent_attachments');

      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        text: outgoingText,
        timestamp: Date.now(),
        attachments: hasAttachments ? pendingAttachments : undefined,
      };

      lastUserMessageRef.current = userMsg;
      setMessages((prev) => [...prev, userMsg]);
      setInputText('');

      // Memory management: Revoke blob URLs after message is sent
      if (hasAttachments) {
        pendingAttachments.forEach(att => {
          try {
            URL.revokeObjectURL(att.url);
          } catch {
            // Ignore errors from already revoked URLs
          }
        });
      }
      setPendingAttachments([]);
      startProcessing();

      try {
        await processMessagesWithHistory(messages, userMsg.text);
      } catch {
        addErrorMessage();
      } finally {
        endProcessing();
      }
    },
    [isProcessing, inputText, pendingAttachments, messages, startProcessing, endProcessing, processMessagesWithHistory, addErrorMessage, setMessages, setInputText, setPendingAttachments]
  );

  // Helper: Filter messages for retry (removes system messages and retryable errors)
  const filterMessagesForRetry = useCallback(
    (msgs: ChatMessage[]) =>
      msgs.filter((message, index) => {
        if (message.role === 'system') return false;
        if (index === msgs.length - 1 && message.role === 'model' && isRetryableOpenAIError(message.text)) {
          return false;
        }
        return true;
      }),
    []
  );

  const handleRetryLastMessage = useCallback(async () => {
    if (isProcessing) return;
    const lastUserMessage = lastUserMessageRef.current;
    if (!lastUserMessage || !lastUserMessage.text.trim()) return;

    const retryMessage: ChatMessage = {
      ...lastUserMessage,
      id: generateId(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, retryMessage]);
    startProcessing();

    try {
      const filteredMessages = filterMessagesForRetry(messages);
      await processMessagesWithHistory(filteredMessages, retryMessage.text);
    } catch {
      addErrorMessage();
    } finally {
      endProcessing();
    }
  }, [isProcessing, messages, startProcessing, endProcessing, filterMessagesForRetry, processMessagesWithHistory, addErrorMessage, setMessages]);

  return {
    messages,
    setMessages,
    inputText,
    setInputText,
    isProcessing,
    processingSteps,
    thinkingPreview,
    pendingAttachments,
    handleAttachFiles,
    handleRemoveAttachment,
    handleSendMessage,
    handleRetryLastMessage,
    messagesEndRef,
    fileInputRef
  };
};
