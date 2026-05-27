import { Loader2, ShieldCheck } from 'lucide-react';
import type { LiveExecutionState } from './liveExecution';

interface LiveExecutionLineProps {
  state: LiveExecutionState;
}

export function LiveExecutionLine({ state }: LiveExecutionLineProps) {
  if (!state) return null;

  const Icon = state.kind === 'permission' ? ShieldCheck : Loader2;
  const spinning = state.kind !== 'permission';
  const detail = state.kind === 'thinking' ? undefined : state.detail;

  return (
    <div className="message-live-execution flex items-center gap-2 py-1 text-[13px] text-[var(--color-msg-muted)]">
      <Icon
        size={14}
        className={`shrink-0 text-[var(--color-msg-accent)] ${spinning ? 'animate-spin' : ''}`}
      />
      <span className="font-medium text-[var(--color-msg-text-secondary)]">{state.label}</span>
      {detail && (
        <span className="min-w-0 truncate font-mono text-[12px] text-[var(--color-msg-muted)]">
          {detail}
        </span>
      )}
    </div>
  );
}
