import { memo, useEffect, useRef } from 'react';

interface StreamDraftPreviewProps {
  content: string;
  className?: string;
}

/**
 * Cursor-style: clipped gray preview while streaming.
 * Fixed height — does not grow the thread or force scroll on every token.
 */
export const StreamDraftPreview = memo(function StreamDraftPreview({
  content,
  className = '',
}: StreamDraftPreviewProps) {
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.textContent = content;
    el.scrollTop = el.scrollHeight;
  }, [content]);

  if (!content.trim()) return null;

  return (
    <div
      className={`message-draft-preview message-stream-align ${className}`.trim()}
      aria-hidden
    >
      <div ref={innerRef} className="message-draft-preview-inner" />
    </div>
  );
});
