import { useState, memo } from 'react';
import { Copy, Undo2, GitFork, Check } from 'lucide-react';
import { ThinkingMessage } from './ThinkingMessage';
import { ActivityRail } from './ActivityRail';
import { AssistantMessageBody } from './AssistantMessageBody';
import type { ActivityStep } from './activitySteps';
import { UserMessageContent } from './UserMessageContent';
import { getUserMessageDisplay } from './displayContent';
import type { ChatMessage } from './types';

interface MessageItemProps {
  message: ChatMessage;
  agentName?: string;
  activitySteps?: ActivityStep[];
  isStreaming?: boolean;
  /** Hide narrative while turn-level activity rail is showing (Cursor-style). */
  suppressBody?: boolean;
  /** Manual/auto compaction in progress — hide gray stream draft. */
  compactionRunning?: boolean;
  /** Activity rail rendered at turn level — do not duplicate per message part. */
  hideActivityRail?: boolean;
  isThinking?: boolean;
  reasoningText?: string;
  onRestoreToComposer?: (text: string) => void;
}

function getRestoreText(message: ChatMessage): string {
  if (message.role === 'user') {
    return getUserMessageDisplay(message);
  }
  return message.content ?? '';
}

function ActionBar({
  message,
  align = 'end',
  onRestoreToComposer,
}: {
  message: ChatMessage;
  align?: 'start' | 'end';
  onRestoreToComposer?: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(getUserMessageDisplay(message));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handleRestore = () => {
    const text = getRestoreText(message);
    if (text.trim()) {
      onRestoreToComposer?.(text);
    }
  };

  return (
    <div
      className={`message-action-bar flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
        align === 'end' ? 'justify-end' : 'justify-start'
      }`}
    >
      <button
        onClick={handleCopy}
        className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-msg-muted)] transition-colors hover:bg-[var(--color-msg-hover)] hover:text-[var(--color-msg-text)]"
        title="复制"
      >
        {copied ? <Check size={14} className="text-[var(--color-msg-accent)]" /> : <Copy size={14} />}
      </button>
      <button
        onClick={handleRestore}
        className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-msg-muted)] transition-colors hover:bg-[var(--color-msg-hover)] hover:text-[var(--color-msg-text)]"
        title="重发"
      >
        <Undo2 size={14} />
      </button>
      <button
        onClick={() => console.log('fork', message.id)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-msg-muted)] transition-colors hover:bg-[var(--color-msg-hover)] hover:text-[var(--color-msg-text)]"
        title="分支"
      >
        <GitFork size={14} />
      </button>
    </div>
  );
}

function MessageCards({ cards }: { cards: NonNullable<ChatMessage['cards']> }) {
  return (
    <div className="mt-3 space-y-2">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-[var(--color-msg-border)] bg-[var(--color-msg-surface)] px-3 py-2"
        >
          {card.title && <div className="text-sm font-medium text-[var(--color-msg-text)]">{card.title}</div>}
          {card.description && (
            <div className="mt-0.5 text-xs text-[var(--color-msg-muted)]">{card.description}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function UserMessageItem({
  message,
  onRestoreToComposer,
}: {
  message: ChatMessage;
  onRestoreToComposer?: (text: string) => void;
}) {
  const visibleContent = getUserMessageDisplay(message);

  return (
    <div className="group message-turn-user">
      <div className="rounded-xl border border-[var(--color-msg-border)] bg-[var(--color-msg-user-bg)] px-4 py-3">
        <UserMessageContent content={visibleContent} />
        {message.cards && message.cards.length > 0 && <MessageCards cards={message.cards} />}
      </div>
      <div className="mt-1.5">
        <ActionBar message={message} align="end" onRestoreToComposer={onRestoreToComposer} />
      </div>
    </div>
  );
}

export const AssistantMessageItem = memo(function AssistantMessageItem({
  message,
  agentName: externalAgentName,
  activitySteps = [],
  isStreaming,
  suppressBody = false,
  compactionRunning = false,
  hideActivityRail = false,
  isThinking,
  reasoningText,
  onRestoreToComposer,
}: MessageItemProps) {
  const agentLabel = message.agentName || externalAgentName;

  return (
    <div className="group message-turn-assistant message-turn-assistant-body">
      {!hideActivityRail && activitySteps.length > 0 && <ActivityRail steps={activitySteps} />}
      {!suppressBody && (
        <AssistantMessageBody
          message={message}
          activitySteps={activitySteps}
          isStreaming={isStreaming}
          compactionRunning={compactionRunning}
          isThinking={isThinking}
          reasoningText={reasoningText}
        />
      )}

      {!(isStreaming && suppressBody) && (
        <div className="message-action-row flex items-center justify-between gap-2 min-h-[24px]">
          {agentLabel ? (
            <span className="text-[11px] text-[var(--color-msg-muted)] opacity-0 transition-opacity group-hover:opacity-100 truncate">
              {agentLabel}
            </span>
          ) : (
            <span />
          )}
          <ActionBar message={message} align="start" onRestoreToComposer={onRestoreToComposer} />
        </div>
      )}
    </div>
  );
});

/** @deprecated Use UserMessageItem or AssistantMessageItem directly */
export function MessageItem(props: MessageItemProps) {
  const isUser = props.message.role === 'user';

  if (props.message.thinking) {
    return (
      <div className="message-turn-assistant">
        <ThinkingMessage />
      </div>
    );
  }

  if (isUser) {
    return <UserMessageItem message={props.message} />;
  }

  return <AssistantMessageItem {...props} />;
}
