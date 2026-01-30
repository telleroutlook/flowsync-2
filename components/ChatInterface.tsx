import React, { memo, useCallback, useRef, useState } from 'react';
import { ChatBubble } from './ChatBubble';
import { ChatMessage, ChatAttachment, Draft, DraftAction, Project, Task, ActionableSuggestion } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RotateCcw, X, Paperclip, Send, File, XCircle, AlertTriangle, Download } from 'lucide-react';
import { useI18n } from '../src/i18n';
import { getActionLabel, getEntityLabel } from '../src/i18n/labels';
import { Button } from './ui/Button';
import { cn } from '../src/utils/cn';
import { exportChatToHtml } from '../src/utils/chatExport';

// Extracted sub-components for better memoization

interface ThinkingIndicatorProps {
  isProcessing: boolean;
  thinkingPreview: string;
  processingSteps: Array<{ label: string; elapsedMs?: number }>;
  t: ReturnType<typeof useI18n>['t'];
}

const ThinkingIndicator = memo<ThinkingIndicatorProps>(({ isProcessing, thinkingPreview, processingSteps, t }) => {
  if (!isProcessing) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="flex justify-start mb-4"
    >
      <div className="bg-surface px-4 py-3 rounded-2xl rounded-bl-none border border-joule-start/50 shadow-md shadow-joule-start/10 max-w-[85%]">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-sm font-bold text-joule-start">{t('chat.thinking')}</span>
          <div className="flex gap-1.5" aria-hidden="true">
            <motion.span
              animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1, delay: 0 }}
              className="w-2 h-2 bg-joule-start rounded-full"
            />
            <motion.span
              animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
              className="w-2 h-2 bg-joule-start rounded-full"
            />
            <motion.span
              animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
              className="w-2 h-2 bg-joule-start rounded-full"
            />
          </div>
        </div>

        {thinkingPreview && (
          <div className="text-xs text-text-secondary italic border-l-2 border-joule-start/30 pl-3 mb-2 break-words">
            {thinkingPreview}
          </div>
        )}

        {processingSteps.length > 0 && (
          <div className="space-y-1.5 mt-2">
            {processingSteps.map((step, index) => (
              <motion.div
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                key={`${step.label}-${index}`}
                className="flex items-center gap-2 text-xs text-text-secondary"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-success shrink-0" aria-hidden="true" />
                <span className="break-words">{step.label}</span>
                {typeof step.elapsedMs === 'number' && (
                  <span className="opacity-50 shrink-0">· {(step.elapsedMs / 1000).toFixed(1)}s</span>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
});
ThinkingIndicator.displayName = 'ThinkingIndicator';

interface DraftNotificationProps {
  pendingDraft: Draft;
  draftWarnings: string[];
  draftProcessingState: 'applying' | 'discarding' | null;
  onApplyDraft: (draftId: string) => void;
  onDiscardDraft: (draftId: string) => void;
  t: ReturnType<typeof useI18n>['t'];
}

const DraftNotification = memo<DraftNotificationProps>(({
  pendingDraft,
  draftWarnings,
  draftProcessingState,
  onApplyDraft,
  onDiscardDraft,
  t,
}) => (
  <motion.div
    initial={{ height: 0, opacity: 0 }}
    animate={{ height: 'auto', opacity: 1 }}
    exit={{ height: 0, opacity: 0 }}
    className="px-4 py-3 border-t border-border-subtle border-l-4 border-l-critical bg-surface shrink-0"
  >
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-critical" aria-hidden="true" />
        <p className="text-xs font-bold text-text-primary">{t('chat.pending.title')}</p>
      </div>
      <span className="text-xs font-semibold text-critical bg-critical/10 px-2 py-0.5 rounded-full border border-critical/20">
        {t('chat.pending.action_count', { count: pendingDraft.actions.length })}
      </span>
    </div>
    <div className="space-y-1 pl-5 mb-3">
      {pendingDraft.actions.slice(0, 3).map((action: DraftAction) => (
        <div key={action.id} className="text-xs text-text-secondary truncate font-medium">
          {getActionLabel(action.action, t)} <span className="opacity-75">{getEntityLabel(action.entityType, t)}</span>
        </div>
      ))}
      {pendingDraft.actions.length > 3 && (
        <div className="text-xs text-critical italic">{t('chat.pending.more', { count: pendingDraft.actions.length - 3 })}</div>
      )}
    </div>
    {draftWarnings.length > 0 && (
      <div className="space-y-1 pl-5 mb-3">
        {draftWarnings.map((warning, index) => (
          <div key={index} className="text-xs text-critical break-words">
            {warning}
          </div>
        ))}
      </div>
    )}
    <div className="flex gap-2 pl-5">
      <Button
        variant="default"
        size="sm"
        onClick={() => onApplyDraft(pendingDraft.id)}
        isLoading={draftProcessingState === 'applying'}
        disabled={draftProcessingState !== null}
        className="flex-1 h-8 bg-success hover:bg-success/90 text-success-foreground"
      >
        {t('chat.accept')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onDiscardDraft(pendingDraft.id)}
        isLoading={draftProcessingState === 'discarding'}
        disabled={draftProcessingState !== null}
        className="flex-1 h-8"
      >
        {t('chat.discard')}
      </Button>
    </div>
  </motion.div>
));
DraftNotification.displayName = 'DraftNotification';

interface AttachmentPreviewProps {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
}

const AttachmentPreview = memo<AttachmentPreviewProps>(({ attachments, onRemove }) => (
  <motion.div
    initial={{ height: 0, opacity: 0 }}
    animate={{ height: 'auto', opacity: 1 }}
    className="mb-3 flex flex-wrap gap-2"
  >
    {attachments.map((file) => (
      <div
        key={file.id}
        className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm text-primary"
      >
        <File className="w-3 h-3" aria-hidden="true" />
        <span className="max-w-[120px] truncate font-medium">{file.name}</span>
        <button
          type="button"
          onClick={() => onRemove(file.id)}
          className="text-primary/60 hover:text-primary p-0.5 rounded-full hover:bg-primary/20 transition-colors"
        >
          <XCircle className="w-3.5 h-3.5" />
        </button>
      </div>
    ))}
  </motion.div>
));
AttachmentPreview.displayName = 'AttachmentPreview';

interface ChatInterfaceProps {
  isChatOpen: boolean;
  setIsChatOpen: (isOpen: boolean) => void;
  pendingDraft: Draft | null;
  draftWarnings: string[];
  onApplyDraft: (draftId: string) => void | Promise<void>;
  onDiscardDraft: (draftId: string) => void | Promise<void>;
  messages: ChatMessage[];
  isProcessing: boolean;
  processingSteps: { label: string; elapsedMs?: number }[];
  thinkingPreview: string;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onSendMessage: (e?: React.FormEvent, overrideText?: string) => void;
  onRetryLastMessage: () => void;
  pendingAttachments: ChatAttachment[];
  onRemoveAttachment: (id: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onAttachFiles: (files: FileList | null) => void;
  inputText: string;
  setInputText: (text: string) => void;
  onResetChat: () => void;
  isMobile?: boolean;
  project?: Project;
  tasks?: Task[];
  isProcessingDraft?: boolean;
}

export const ChatInterface = memo<ChatInterfaceProps>(({
  isChatOpen,
  setIsChatOpen,
  pendingDraft,
  draftWarnings,
  onApplyDraft,
  onDiscardDraft,
  messages,
  isProcessing,
  processingSteps,
  thinkingPreview,
  messagesEndRef,
  onSendMessage,
  onRetryLastMessage,
  pendingAttachments,
  onRemoveAttachment,
  fileInputRef,
  onAttachFiles,
  inputText,
  setInputText,
  onResetChat,
  isMobile = false,
  project,
  tasks,
  isProcessingDraft = false,
}) => {
  const { t } = useI18n();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoScrolling = useRef(false);
  const [draftProcessingState, setDraftProcessingState] = useState<'applying' | 'discarding' | null>(null);

  // Wrap draft handlers with loading state
  const handleApplyDraft = useCallback(
    async (draftId: string) => {
      setDraftProcessingState('applying');
      try {
        await onApplyDraft(draftId);
      } finally {
        setDraftProcessingState(null);
      }
    },
    [onApplyDraft]
  );

  const handleDiscardDraft = useCallback(
    async (draftId: string) => {
      setDraftProcessingState('discarding');
      try {
        await onDiscardDraft(draftId);
      } finally {
        setDraftProcessingState(null);
      }
    },
    [onDiscardDraft]
  );

  // Use external processing state if provided, otherwise use local state
  const effectiveDraftProcessingState = isProcessingDraft ? 'applying' : draftProcessingState;

  // Smart scrolling logic
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      if (messagesEndRef.current) {
        isAutoScrolling.current = true;
        messagesEndRef.current.scrollIntoView({ behavior });
        if (autoScrollTimerRef.current) clearTimeout(autoScrollTimerRef.current);
        autoScrollTimerRef.current = setTimeout(() => {
          isAutoScrolling.current = false;
        }, 500);
      }
    },
    [messagesEndRef]
  );

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (autoScrollTimerRef.current) clearTimeout(autoScrollTimerRef.current);
    };
  }, []);

  // Auto-scroll on new messages
  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    const lastMessage = messages[messages.length - 1];
    const isUserMessage = lastMessage?.role === 'user';

    if (isNearBottom || isUserMessage || isProcessing) {
      scrollToBottom(isUserMessage ? 'auto' : 'smooth');
    }
  }, [messages, isProcessing, scrollToBottom]);

  // Event handlers
  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onAttachFiles(event.target.files);
      event.currentTarget.value = '';
    },
    [onAttachFiles]
  );

  const handleTextareaChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputText(event.target.value);
      event.target.style.height = 'auto';
      event.target.style.height = Math.min(event.target.scrollHeight, 120) + 'px';
    },
    [setInputText]
  );

  const handleTextareaKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const target = event.target as HTMLTextAreaElement;
        target.style.height = 'auto';
        onSendMessage();
      }
    },
    [onSendMessage]
  );

  const handleSuggestionClick = useCallback(
    (suggestion: ActionableSuggestion) => {
      const { action, params, text } = suggestion;

      // If no action specified, send the text directly
      if (!action) {
        onSendMessage(undefined, text);
        return;
      }

      // Generate intelligent prompts based on action type
      const promptMap: Record<string, () => string> = {
        view_kanban: () => `切换到看板视图`,
        view_gantt: () => `切换到甘特图视图`,
        view_list: () => `切换到列表视图`,
        create_task: () => `创建一个新任务`,
        update_task: () => {
          const taskName = params?.taskName || params?.title || '任务';
          return `帮我更新任务"${taskName}"的信息`;
        },
        set_status: () => {
          const taskName = params?.taskName || params?.title || '任务';
          const status = params?.status || '进行中';
          return `将任务"${taskName}"的状态设置为${status}`;
        },
        reschedule: () => {
          const taskName = params?.taskName || params?.title || '任务';
          const daysToAdd = params?.daysToAdd || 3;
          return `将任务"${taskName}"的日期延后${daysToAdd}天`;
        },
        view_tasks: () => {
          const filter = params?.filter || params?.status || '全部';
          return `查看${filter}任务`;
        },
      };

      // Generate prompt for action
      const promptGenerator = promptMap[action];
      if (promptGenerator) {
        onSendMessage(undefined, promptGenerator());
      } else {
        // Unknown action, send the original text
        onSendMessage(undefined, text);
      }
    },
    [onSendMessage]
  );

  const handleExportChat = useCallback(() => {
    exportChatToHtml(messages, t('chat.assistant_name'), project, tasks);
  }, [messages, t, project, tasks]);

  return (
    <motion.div
      initial={false}
      animate={isMobile ? {
        width: '100%',
        opacity: 1,
        marginRight: 0,
        marginLeft: 0,
      } : {
        width: isChatOpen ? 360 : 0,
        opacity: isChatOpen ? 1 : 0,
        marginRight: isChatOpen ? 16 : 0,
        marginLeft: isChatOpen ? 8 : 0,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={cn(
        "flex flex-col bg-surface relative z-20 shrink-0 overflow-hidden",
        isMobile 
          ? "h-full border-none rounded-none shadow-none" 
          : "h-[calc(100vh-2rem)] my-4 rounded-2xl border border-border-subtle/50 shadow-float ring-1 ring-black/5"
      )}
    >
      {/* Header */}
      <div className="h-14 px-4 border-b border-border-subtle flex items-center justify-between bg-surface/95 backdrop-blur-md sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-joule-start to-joule-end flex items-center justify-center shadow-md shadow-joule-start/20 ring-1 ring-black/5" aria-hidden="true">
            <Sparkles className="w-4 h-4 text-accent-foreground" />
          </div>
          <div className="flex flex-col">
            <h1 className="font-bold text-sm text-text-primary tracking-tight">{t('chat.assistant_name')}</h1>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success/75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
              </span>
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">{t('chat.status_online')}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExportChat}
            className="text-text-secondary hover:text-primary p-2 rounded-lg hover:bg-background transition-colors"
            title={t('app.header.export_chat')}
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={onResetChat}
            className="text-text-secondary hover:text-primary p-2 rounded-lg hover:bg-background transition-colors"
            title={t('chat.new_chat')}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsChatOpen(false)}
            className="text-text-secondary hover:text-text-primary p-2 rounded-lg hover:bg-background transition-colors"
            title={t('chat.close_chat')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar bg-background scroll-smooth">
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            message={msg}
            onRetry={onRetryLastMessage}
            isProcessing={isProcessing}
            onSuggestionClick={handleSuggestionClick}
            hideSuggestions={!!pendingDraft}
          />
        ))}

        {/* Thinking Indicator */}
        <AnimatePresence>
          <ThinkingIndicator isProcessing={isProcessing} thinkingPreview={thinkingPreview} processingSteps={processingSteps} t={t} />
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Pending Draft Notification */}
      <AnimatePresence>
        {pendingDraft && (
          <DraftNotification
            pendingDraft={pendingDraft}
            draftWarnings={draftWarnings}
            draftProcessingState={effectiveDraftProcessingState}
            onApplyDraft={handleApplyDraft}
            onDiscardDraft={handleDiscardDraft}
            t={t}
          />
        )}
      </AnimatePresence>

      {/* Input Area */}
      <div className="p-4 border-t border-border-subtle bg-surface z-20 shrink-0">
        <form onSubmit={onSendMessage} className="relative group">
          {/* File Attachments Preview */}
          {pendingAttachments.length > 0 && <AttachmentPreview attachments={pendingAttachments} onRemove={onRemoveAttachment} />}

          <div className="flex items-end gap-2 bg-background p-2 rounded-xl border border-border-subtle focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all shadow-sm">
            <input ref={fileInputRef} type="file" className="hidden" multiple onChange={handleFileInputChange} disabled={isProcessing} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:text-primary hover:bg-surface transition-colors"
              disabled={isProcessing}
              title={t('chat.attach_files')}
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <textarea
              rows={1}
              value={inputText}
              onChange={handleTextareaChange}
              onKeyDown={handleTextareaKeyDown}
              placeholder={t('chat.placeholder')}
              className="w-full bg-transparent text-text-primary py-2.5 outline-none placeholder:text-text-secondary/60 text-sm resize-none max-h-[120px] custom-scrollbar leading-relaxed"
              disabled={isProcessing}
            />

            <button
              type="submit"
              disabled={(inputText.trim().length === 0 && pendingAttachments.length === 0) || isProcessing}
              className="h-9 w-9 shrink-0 flex items-center justify-center bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:hover:bg-primary transition-all shadow-sm"
              aria-label="Send message"
            >
              <Send className="w-4 h-4 translate-x-0.5 translate-y-0.5" />
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
});
ChatInterface.displayName = 'ChatInterface';
