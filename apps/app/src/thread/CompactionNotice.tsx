import { Loader2, Shrink } from 'lucide-react';
import { getCompactionNoticeMessage } from './compactionActivity';

interface CompactionNoticeProps {
  reason?: 'auto' | 'manual';
}

export function CompactionNotice({ reason }: CompactionNoticeProps) {
  return (
    <div className="compaction-notice mx-auto max-w-3xl px-4 pb-4">
      <div
        role="status"
        aria-live="polite"
        className="flex items-start gap-2.5 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm text-[#1D4ED8]"
      >
        <Shrink size={16} className="mt-0.5 shrink-0 opacity-80" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-medium">
            <Loader2 size={14} className="shrink-0 animate-spin" />
            <span>{getCompactionNoticeMessage(reason)}</span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-[#2563EB]/80">
            压缩完成后会继续执行，期间请勿重复发送消息。
          </p>
        </div>
      </div>
    </div>
  );
}
