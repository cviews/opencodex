import { useState, useEffect, useRef } from 'react';
import { CircularProgress } from '../components/CircularProgress';
import type { ContextUsageInfo } from '../types';

function formatTokens(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
  }
  return String(n);
}

function getUsageColor(percentage: number): string {
  if (percentage < 70) return '#10A37F';
  if (percentage < 90) return '#F59E0B';
  return '#EF4444';
}

export function ContextUsageIndicator({
  context,
  variant = 'default',
  onCompress,
}: {
  context: ContextUsageInfo;
  variant?: 'default' | 'composer';
  onCompress?: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLDivElement>(null);

  const isComposer = variant === 'composer';
  const ringSize = isComposer ? 18 : 16;
  const tooltipWidth = isComposer ? 220 : 180;
  const tooltipHeight = isComposer ? 96 : 48;
  const openUp = isComposer;

  useEffect(() => {
    if (!showTooltip || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const GAP = 8;

    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    let top = openUp ? rect.top - tooltipHeight - GAP : rect.bottom + GAP;

    if (left + tooltipWidth > window.innerWidth - 8) left = window.innerWidth - tooltipWidth - 8;
    if (left < 8) left = 8;
    if (openUp && top < 8) top = rect.bottom + GAP;
    if (!openUp && top + tooltipHeight > window.innerHeight - 8) top = rect.top - tooltipHeight - GAP;

    setTooltipPos({ top, left });
  }, [showTooltip, tooltipWidth, tooltipHeight, openUp]);

  const { percentage, usedTokens, totalTokens } = context;
  const remaining = Math.max(totalTokens - usedTokens, 0);
  const usageColor = getUsageColor(percentage);
  const showCompressHint = percentage >= 70 && onCompress;

  if (!context.totalTokens && percentage === 0 && usedTokens === 0) {
    return null;
  }

  return (
    <div
      ref={anchorRef}
      className="relative shrink-0"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        type="button"
        className={`rounded transition-colors ${
          isComposer
            ? 'p-1 text-[#9A9A9A] hover:text-[#1F1F1F] hover:bg-[#F0F0F0]'
            : 'p-0.5 hover:bg-[#F0F0F0]'
        }`}
        title="上下文使用量"
        aria-label={`上下文 ${percentage}% 已使用`}
      >
        <CircularProgress percentage={percentage} size={ringSize} variant="usage" />
      </button>

      {showTooltip && (
        <div
          className="fixed z-[60] border border-[#E5E5E5] pointer-events-none"
          style={{ top: tooltipPos.top, left: tooltipPos.left, width: tooltipWidth }}
        >
          <div className="bg-white text-[#1F1F1F] text-xs rounded-lg px-3 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            <div className="flex items-center gap-2 mb-1.5">
              <CircularProgress percentage={percentage} size={20} variant="usage" />
              <div>
                <div className="font-medium" style={{ color: usageColor }}>
                  {percentage}% 上下文已用
                </div>
                {isComposer && (
                  <div className="text-[#9A9A9A] mt-0.5">会话输入 token 占用</div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between text-[#6B6B6B]">
              <span>{formatTokens(usedTokens)} / {formatTokens(totalTokens)}</span>
              <span>剩余 {formatTokens(remaining)}</span>
            </div>
            {showCompressHint && (
              <div className="mt-2 pt-2 border-t border-[#ECECEC] text-[#9A9A9A]">
                上下文接近上限，输入 <span className="text-[#6B6B6B] font-medium">/compress</span> 可压缩
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
