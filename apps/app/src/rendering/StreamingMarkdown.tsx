import { useEffect, useRef } from 'react';
import { StaticMarkdown } from './StaticMarkdown';

interface StreamingMarkdownProps {
  content: string;
  cacheKey?: string;
  streaming?: boolean;
  className?: string;
}

/**
 * Cursor-style streaming: plain text while SSE is active (no caret).
 * Full markdown only after the turn completes (streaming=false → StaticMarkdown).
 */
export function StreamingMarkdown({
  content,
  streaming = false,
  className,
}: StreamingMarkdownProps) {
  const bodyRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!streaming || !bodyRef.current) return;
    bodyRef.current.textContent = content;
  }, [content, streaming]);

  if (!streaming) {
    return (
      <div className={className ?? 'message-markdown'}>
        <StaticMarkdown content={content} />
      </div>
    );
  }

  if (!content) return null;

  return (
    <div
      className={className ?? 'message-markdown message-stream-plain message-draft-plain'}
      aria-live="polite"
    >
      <span ref={bodyRef} className="message-stream-plain-body" />
    </div>
  );
}
