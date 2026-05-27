import { memo } from 'react';
import { StaticMarkdown } from './StaticMarkdown';
import { StreamingMarkdown } from './StreamingMarkdown';
import { getModelLabel } from '../thread/composer/models';

export function highlightModelMentions(text: string): string {
  return text.replace(/@model\s+(\S+)/g, (_, modelId) => {
    const label = getModelLabel(modelId) || modelId;
    return `\`model:${modelId}:${label}\``;
  });
}

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  cacheKey?: string;
}

function MarkdownRendererInner({ content, isStreaming = false, cacheKey }: MarkdownRendererProps) {
  if (!content) return null;

  if (isStreaming) {
    return (
      <StreamingMarkdown
        content={content}
        cacheKey={cacheKey ?? 'stream'}
        streaming
      />
    );
  }

  return <StaticMarkdown content={content} />;
}

export const MarkdownRenderer = memo(
  MarkdownRendererInner,
  (prev, next) =>
    prev.content === next.content
    && prev.isStreaming === next.isStreaming
    && prev.cacheKey === next.cacheKey,
);

MarkdownRenderer.displayName = 'MarkdownRenderer';
