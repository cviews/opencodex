import { memo, useMemo } from 'react';
import { MarkdownRenderer } from '../rendering/MarkdownRenderer';
import { StreamDraftPreview } from './StreamDraftPreview';
import type { ActivityStep } from './activitySteps';
import type { ChatMessage } from './types';

interface MessageCardsProps {
  cards: NonNullable<ChatMessage['cards']>;
}

function MessageCards({ cards }: MessageCardsProps) {
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

export interface AssistantMessageBodyProps {
  message: ChatMessage;
  activitySteps?: ActivityStep[];
  isStreaming?: boolean;
  compactionRunning?: boolean;
  isThinking?: boolean;
  reasoningText?: string;
}

export const AssistantMessageBody = memo(function AssistantMessageBody({
  message,
  activitySteps = [],
  isStreaming,
  compactionRunning = false,
}: AssistantMessageBodyProps) {
  const content = message.content ?? '';
  const hasContent = !!content.trim();

  const hasRunningStep = useMemo(
    () => activitySteps.some((step) => step.status === 'running'),
    [activitySteps],
  );

  /** Gray draft for final-answer streaming (after tools finish or pure-text turns). */
  const showDraftPreview =
    isStreaming &&
    !compactionRunning &&
    hasContent &&
    !hasRunningStep;

  if (!hasContent && !isStreaming) return null;
  if (isStreaming && activitySteps.length > 0 && hasRunningStep) return null;

  return (
    <>
      {showDraftPreview && <StreamDraftPreview content={content} />}
      {!isStreaming && hasContent && (
        <div className="message-assistant-content message-stream-align text-[14px] leading-[1.7] text-[var(--color-msg-text)]">
          <MarkdownRenderer content={content} isStreaming={false} cacheKey={message.id} />
        </div>
      )}
      {message.cards && message.cards.length > 0 && <MessageCards cards={message.cards} />}
    </>
  );
});
