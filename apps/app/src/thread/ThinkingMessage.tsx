import { useState } from 'react';
import { ChevronRight, Brain } from 'lucide-react';

interface ThinkingMessageProps {
  reasoningText?: string;
  collapsedByDefault?: boolean;
  isPending?: boolean;
}

export function ThinkingMessage({
  reasoningText,
  collapsedByDefault = false,
  isPending = false,
}: ThinkingMessageProps) {
  const [expanded, setExpanded] = useState(!collapsedByDefault);
  const hasReasoning = !!reasoningText && reasoningText.length > 0;
  const showPulse = isPending || !hasReasoning;

  return (
    <div className={`message-thinking mb-3 ${showPulse ? 'rounded-lg bg-[var(--color-msg-surface)] px-3 py-2' : ''}`}>
      <button
        type="button"
        onClick={() => hasReasoning && setExpanded((v) => !v)}
        className={`flex items-center gap-1.5 text-[13px] text-[var(--color-msg-muted)] transition-colors ${
          hasReasoning ? 'cursor-pointer hover:text-[var(--color-msg-text-secondary)]' : 'cursor-default'
        }`}
      >
        {hasReasoning ? (
          <ChevronRight
            size={14}
            className={`shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          />
        ) : (
          <Brain size={14} className="shrink-0 opacity-60" />
        )}
        <span className={`font-medium ${showPulse ? 'activity-step-label--active' : ''}`}>
          Thinking
        </span>
      </button>

      {hasReasoning && expanded && (
        <div className="scrollbar-hover message-reasoning mt-2 max-h-48 overflow-y-auto border-l-2 border-[var(--color-msg-border)] pl-3 text-[13px] leading-relaxed text-[var(--color-msg-muted)] whitespace-pre-wrap break-words">
          {reasoningText}
        </div>
      )}
    </div>
  );
}
