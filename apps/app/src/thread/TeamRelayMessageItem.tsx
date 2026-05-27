import { useMemo, memo } from 'react';
import { Users } from 'lucide-react';
import { MarkdownRenderer } from '../rendering/MarkdownRenderer';
import { getTeamRelayDisplayBody, parseTeamRelayMessage } from './displayContent';
import type { ChatMessage } from './types';

const MAX_TEAM_RELAY_MARKDOWN = 120_000;

function clipMarkdown(content: string): string {
  if (content.length <= MAX_TEAM_RELAY_MARKDOWN) return content;
  return `${content.slice(0, MAX_TEAM_RELAY_MARKDOWN)}\n\n---\n\n*（内容过长，已截断显示）*`;
}

interface TeamRelayMessageItemProps {
  message: ChatMessage;
}

export const TeamRelayMessageItem = memo(function TeamRelayMessageItem({
  message,
}: TeamRelayMessageItemProps) {
  const parsed = useMemo(() => {
    const raw = message.displayContent || message.content || '';
    return parseTeamRelayMessage(raw);
  }, [message.content, message.displayContent]);

  const body = useMemo(
    () => clipMarkdown(getTeamRelayDisplayBody(message)),
    [message],
  );

  if (!parsed && !body.trim()) return null;

  return (
    <div className="message-turn-team-relay py-1">
      <div className="flex items-center gap-2 mb-2 pl-[18px] text-[12px] font-medium text-[#14B8A6]">
        <Users size={14} className="shrink-0 opacity-80" />
        <span>{parsed?.from ?? '团队成员'}</span>
        <span className="font-normal text-[var(--color-msg-muted)]">团队消息</span>
      </div>
      <div className="message-stream-align text-[14px] leading-[1.7] text-[var(--color-msg-text)] border-l-2 border-[rgba(20,184,166,0.35)] pl-3 ml-[18px]">
        <MarkdownRenderer content={body} isStreaming={false} cacheKey={message.id} />
      </div>
    </div>
  );
});
