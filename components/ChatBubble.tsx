import { memo, useMemo, useState } from 'react';
import { ChatMessage, ChatAttachment, ActionableSuggestion } from '../types';
import { Paperclip, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'isomorphic-dompurify';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '../src/i18n';
import { cn } from '../src/utils/cn';
import { Button } from './ui/Button';

// ============================================================================
// XSS PROTECTION CONFIGURATION
// ============================================================================

// DOMPurify configuration to balance security and functionality
// Allows safe HTML elements for markdown rendering while sanitizing malicious content
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote',
    'a', 'img',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'div', 'span',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class', 'target', 'rel',
    'colspan', 'rowspan',
  ],
  // Allow data: URIs for images (needed for markdown)
  ALLOW_DATA_ATTR: true,
  // Allow URI schemes for links
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

// Sanitize markdown content to prevent XSS attacks
// This protects against malicious script injection in AI-generated content
const sanitizeMarkdown = (content: string): string => {
  return DOMPurify.sanitize(content, PURIFY_CONFIG);
};

interface ChatBubbleProps {
  message: ChatMessage;
  onRetry?: () => void;
  isProcessing?: boolean;
  onSuggestionClick?: (suggestion: ActionableSuggestion) => void;
  hideSuggestions?: boolean;
}

const formatBytes = (value: number): string => {
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
};

interface AttachmentProps {
  attachment: ChatAttachment;
  isUser: boolean;
}

const Attachment = memo<AttachmentProps>(({ attachment, isUser }) => (
  <a
    href={attachment.url}
    download={attachment.name}
    className={cn(
      "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors",
      isUser
        ? "border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
        : "border-border-subtle bg-background text-text-primary hover:bg-secondary/10"
    )}
    rel="noopener noreferrer nofollow"
  >
    <Paperclip className="w-3.5 h-3.5 opacity-70" />
    <div className="flex flex-col min-w-0">
      <span className="truncate font-medium">{attachment.name}</span>
      <span className={cn("text-[10px]", isUser ? "text-primary-foreground/70" : "text-text-secondary")}>
        {formatBytes(attachment.size)}
      </span>
    </div>
  </a>
));
Attachment.displayName = 'Attachment';

interface MarkdownContentProps {
  content: string;
  isUser: boolean;
  codeLabel: string;
}

const MarkdownContent = memo<MarkdownContentProps>(({ content, isUser, codeLabel }) => {
  // Sanitize content to prevent XSS attacks before rendering markdown
  // This is critical for AI-generated content which could contain malicious scripts
  const sanitizedContent = useMemo(() => sanitizeMarkdown(content), [content]);

  // Move components definition outside useMemo to simplify - only style-dependent parts vary
  const tableClass = "overflow-x-auto my-2 rounded-lg border border-inherit/20";
  const theadClass = isUser ? 'bg-primary-foreground/10' : 'bg-background';
  const thClass = cn("px-2 py-1.5 border-b font-semibold", isUser ? "border-primary-foreground/20" : "border-border-subtle text-text-secondary");
  const trClass = cn("border-b last:border-0", isUser ? "border-primary-foreground/10 hover:bg-primary-foreground/5" : "border-border-subtle hover:bg-background");
  const blockquoteClass = cn("border-l-2 pl-3 my-1.5 italic", isUser ? "border-primary-foreground/40 text-primary-foreground/90" : "border-primary/40 text-text-secondary");
  const inlineCodeClass = cn("px-1 py-0.5 rounded font-mono text-[0.9em]", isUser ? "bg-primary-foreground/20 border border-primary-foreground/20" : "bg-secondary/10 border border-border-subtle text-text-primary");
  const blockCodeWrapperClass = cn("rounded-lg overflow-hidden my-2 border", isUser ? "border-primary-foreground/20 bg-primary-foreground/10" : "border-border-subtle bg-background");
  const blockCodeHeaderClass = cn("text-[10px] px-3 py-1.5 font-mono opacity-80 border-b", isUser ? "border-primary-foreground/10 bg-primary-foreground/5" : "border-border-subtle bg-secondary/5 text-text-secondary");
  const blockCodeClass = cn("block p-3 overflow-x-auto font-mono text-xs", isUser ? "text-primary-foreground/90" : "text-text-primary");

  const components = useMemo(() => ({
    table: ({ node, ...props }: any) => (
      <div className={tableClass}>
        <table className="w-full text-left text-xs border-collapse" {...props} />
      </div>
    ),
    thead: ({ node, ...props }: any) => <thead className={theadClass} {...props} />,
    th: ({ node, ...props }: any) => <th className={thClass} {...props} />,
    tr: ({ node, ...props }: any) => <tr className={trClass} {...props} />,
    td: ({ node, ...props }: any) => <td className="px-2 py-1.5" {...props} />,
    p: ({ node, ...props }: any) => <p className="mb-1.5 last:mb-0 leading-relaxed" {...props} />,
    // Add rel="noopener noreferrer nofollow" to all links for security
    a: ({ node, ...props }: any) => <a target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 opacity-90 hover:opacity-100 font-medium" {...props} />,
    ul: ({ node, ...props }: any) => <ul className="list-disc list-outside ml-4 mb-1.5 space-y-0.5" {...props} />,
    ol: ({ node, ...props }: any) => <ol className="list-decimal list-outside ml-4 mb-1.5 space-y-0.5" {...props} />,
    li: ({ node, ...props }: any) => <li className="pl-0.5" {...props} />,
    blockquote: ({ node, ...props }: any) => <blockquote className={blockquoteClass} {...props} />,
    code: ({ node, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      const isInline = !match && !String(children).includes('\n');
      return isInline ? (
        <code className={inlineCodeClass} {...props}>{children}</code>
      ) : (
        <div className={blockCodeWrapperClass}>
          <div className={blockCodeHeaderClass}>
            {match ? match[1] : codeLabel}
          </div>
          <code className={blockCodeClass} {...props}>{children}</code>
        </div>
      );
    },
    pre: ({ node, ...props }: any) => {
      const { ref, ...rest } = props as any;
      return <div className="not-prose" {...rest} />;
    },
  }), [tableClass, theadClass, thClass, trClass, blockquoteClass, inlineCodeClass, blockCodeWrapperClass, blockCodeHeaderClass, blockCodeClass, codeLabel]);

  return (
    <div className={isUser ? 'text-primary-foreground' : 'text-text-primary'}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {sanitizedContent}
      </ReactMarkdown>
    </div>
  );
});
MarkdownContent.displayName = 'MarkdownContent';

export const ChatBubble = memo<ChatBubbleProps>(({ message, onRetry, isProcessing, onSuggestionClick, hideSuggestions }) => {
  const { t, locale } = useI18n();
  const [isThinkingOpen, setIsThinkingOpen] = useState(false);
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const hasText = message.text.trim().length > 0;
  const attachments = message.attachments || [];
  const suggestions = message.suggestions || [];
  const isRetryableError = !isUser && !isSystem && message.text.includes('OpenAI request failed.');

  const timestamp = useMemo(() =>
    new Date(message.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    [message.timestamp, locale]
  );

  if (isSystem) {
    return (
      <div className="flex justify-center my-4 animate-fade-in w-full">
        <div className="max-w-[85%] text-[10px] font-medium text-text-secondary bg-background px-3 py-1.5 rounded-lg border border-border-subtle shadow-sm text-center break-words whitespace-pre-wrap">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col w-full mb-4 animate-fade-in", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[92%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm transition-all break-words overflow-hidden",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-none"
            : "bg-surface text-text-primary border border-border-subtle rounded-bl-none"
        )}
      >
        {message.thinking && message.thinking.steps && message.thinking.steps.length > 0 && !isUser && (
          <div className="mb-3 border-b border-border-subtle/50 pb-2">
            <button 
              onClick={() => setIsThinkingOpen(!isThinkingOpen)}
              className="flex items-center gap-2 text-xs font-medium text-text-secondary hover:text-primary transition-colors select-none w-full text-left"
            >
              <div className={cn("p-0.5 rounded-md transition-colors shrink-0", isThinkingOpen ? "bg-primary/10 text-primary" : "bg-secondary/10 text-text-secondary")}>
                 {isThinkingOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </div>
              <span className="opacity-80 hover:opacity-100">{t('chat.thinking_process') || 'Thinking Process'}</span>
              <span className="text-[10px] opacity-50 ml-auto font-mono shrink-0">
                {message.thinking.steps.length} steps
              </span>
            </button>
            
            <AnimatePresence>
              {isThinkingOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2 pl-1 space-y-2 mt-1">
                     {message.thinking.steps.map((step, idx) => (
                       <div key={idx} className="flex items-start gap-2 text-[11px] text-text-secondary/80">
                          <div className="w-1 h-1 rounded-full bg-primary/40 mt-1.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="break-words leading-relaxed">{step.label}</span>
                            {typeof step.elapsedMs === 'number' && (
                              <span className="ml-1.5 text-[10px] opacity-40 font-mono">{(step.elapsedMs / 1000).toFixed(1)}s</span>
                            )}
                          </div>
                       </div>
                     ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {hasText && <MarkdownContent content={message.text} isUser={isUser} codeLabel={t('chat.code')} />}

        {attachments.length > 0 && (
          <div className={cn("mt-2 flex flex-col gap-1.5 min-w-0", !hasText && "mt-0")}>
            {attachments.map((attachment) => (
              <Attachment key={attachment.id} attachment={attachment} isUser={isUser} />
            ))}
          </div>
        )}

        {isRetryableError && onRetry && (
          <div className="mt-2 flex justify-start">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRetry}
              disabled={isProcessing}
              className="h-7 px-2 text-xs"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              {t('chat.retry')}
            </Button>
          </div>
        )}

        <div className={cn("text-[10px] mt-1.5 flex items-center justify-end gap-1", isUser ? "text-primary-foreground/70" : "text-text-secondary/70")}>
          {timestamp}
          {isUser && <span>• {t('chat.you')}</span>}
        </div>
      </div>

      {suggestions.length > 0 && !isUser && !hideSuggestions && (
        <div className="flex flex-wrap gap-2 mt-2 ml-1 max-w-[92%]">
          {suggestions.map((suggestion, index) => {
            const hasAction = suggestion.action && suggestion.action.length > 0;
            return (
              <button
                key={index}
                onClick={() => onSuggestionClick?.(suggestion)}
                disabled={isProcessing}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm",
                  hasAction
                    ? "bg-primary/10 border border-primary/30 hover:border-primary/60 text-primary font-medium"
                    : "bg-surface border border-primary/20 hover:border-primary/50 text-primary"
                )}
              >
                {hasAction && <span className="mr-1">⚡</span>}
                {suggestion.text}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
ChatBubble.displayName = 'ChatBubble';
