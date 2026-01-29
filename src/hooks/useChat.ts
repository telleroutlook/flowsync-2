import React, { useState, useRef, useCallback, useMemo } from 'react';
import { aiService } from '../../services/aiService';
import { apiService } from '../../services/apiService';
import { ChatMessage, ChatAttachment, DraftAction, Project, Task } from '../../types';
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
  refreshData: () => Promise<void>;
  submitDraft: (actions: DraftAction[], options: { reason?: string; createdBy: string; autoApply?: boolean; silent?: boolean }) => Promise<any>;
  handleApplyDraft: (draftId: string) => Promise<void>;
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
const toAiRole = (role: ChatMessage['role']): AiHistoryItem['role'] => {
  if (role === 'user') return 'user';
  if (role === 'system') return 'system';
  return 'model';
};

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

// Helper: Format timestamp for AI context
const formatAiDate = (ts: number | null | undefined): string => {
  if (!ts) return 'N/A';
  return new Date(ts).toISOString().split('T')[0];
};

// Helper: Check if error is retryable
const isRetryableOpenAIError = (text: string): boolean => text.includes('OpenAI request failed.');

// Create API client for tool handlers (stable factory)
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
  refreshData,
  submitDraft,
  handleApplyDraft,
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
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter(item => item.id !== id);
    });
  }, []);

  // Build system context for the AI (optimized to reduce token usage and recomputation)
  const systemContext = useMemo(() => {
    const taskCount = activeTasks.length;
    const taskSnippets = activeTasks.slice(0, TASK_SNIPPET_COUNT);

    const selectedTaskInfo = selectedTask
      ? `User is inspecting: ${selectedTask.title} (ID: ${selectedTask.id.slice(0, 8)}..., Status: ${selectedTask.status})`
      : '';

    const projectCount = projects.length;

    return `Active Project: ${activeProject.name || 'None'} (ID: ${activeProject.id || 'N/A'}).
${selectedTaskInfo}
Available Projects: ${projectCount} total.
Task Context: ${taskCount} tasks in active project. Sample IDs: ${taskSnippets.map(t => `${t.title} (${t.id.slice(0, 8)})`).join(', ')}.`;
  }, [activeProject.name, activeProject.id, activeTasks, selectedTask, projects.length]);

  // Process a single conversation turn with the AI
  // Using ref to avoid stale closure issues while maintaining dependency stability
  const apiClientRef = useRef<ApiClient | null>(null);
  apiClientRef.current = createApiClient();

  const submitDraftRef = useRef(submitDraft);
  submitDraftRef.current = submitDraft;

  const appendSystemMessageRef = useRef(appendSystemMessage);
  appendSystemMessageRef.current = appendSystemMessage;

  const tRef = useRef(t);
  tRef.current = t;

  const allowThinkingRef = useRef(allowThinking);
  allowThinkingRef.current = allowThinking;

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
      const currentT = tRef.current;
      const currentAllowThinking = allowThinkingRef.current;

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
        let suggestions: string[] = [];
        let hasToolOutputs = false;

        if (response.toolCalls && response.toolCalls.length > 0) {
          recordStep(currentT('processing.executing_tool_call'));

          const result = await processToolCalls(
            response.toolCalls.map((call) => ({ name: call.name, args: (call.args || {}) as Record<string, unknown> })),
            {
              api: apiClientRef.current!,
              activeProjectId,
              generateId,
              pushProcessingStep: (step) => recordStep(step),
              t: currentT,
            }
          );

          suggestions = result.suggestions ?? [];

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
            suggestions = [];

            try {
              const draft = await submitDraftRef.current(result.draftActions, {
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
              appendSystemMessageRef.current(validOutputs.join(' | '));
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
      pushProcessingStep(tRef.current('processing.preparing'));
      const { history, truncatedCount } = buildAiHistory(msgs);
      if (truncatedCount > 0) {
        appendSystemMessageRef.current(tRef.current('chat.history_truncated', { count: truncatedCount, max: MAX_HISTORY_PART_CHARS }));
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

      const outgoingText = cleanedInput || tRef.current('chat.sent_attachments');

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
