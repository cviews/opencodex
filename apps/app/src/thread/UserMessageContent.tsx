import { useMemo } from 'react';
import { AtSign, Sparkles, Users } from 'lucide-react';
import { MarkdownRenderer } from '../rendering/MarkdownRenderer';
import { useAgentStore } from '../stores/agent';
import type { ReferenceKind } from './composer/referenceChip';
import { ReferenceChip } from './ReferenceChip';
import { buildDisplayTokenCatalog } from './displayTokenCatalog';
import { parseDisplaySegments } from './displayTokens';

interface UserMessageContentProps {
  content: string;
}

const chipStyles = {
  agent: 'bg-[rgba(43,143,255,0.12)] text-[#2B8FFF] border-[rgba(43,143,255,0.25)]',
  model: 'bg-[rgba(14,165,233,0.12)] text-[#0EA5E9] border-[rgba(14,165,233,0.25)]',
  skill: 'bg-[rgba(139,92,246,0.12)] text-[#8B5CF6] border-[rgba(139,92,246,0.25)]',
  team: 'bg-[rgba(20,184,166,0.12)] text-[#14B8A6] border-[rgba(20,184,166,0.25)]',
} as const;

function MentionChip({ kind, label }: { kind: 'agent' | 'model' | 'skill' | 'team'; label: string }) {
  const Icon = kind === 'skill' ? Sparkles : kind === 'team' ? Users : AtSign;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[13px] font-medium align-middle mx-0.5 ${chipStyles[kind]}`}
    >
      <Icon size={12} className="shrink-0 opacity-70" />
      {label}
    </span>
  );
}

export function UserMessageContent({ content }: UserMessageContentProps) {
  const agents = useAgentStore((s) => s.agents);
  const teams = useAgentStore((s) => s.teams);
  const segments = useMemo(() => {
    const catalog = buildDisplayTokenCatalog();
    return parseDisplaySegments(content, catalog);
  }, [content, agents, teams]);

  const hasChips = segments.some((seg) => seg.type !== 'text');

  return (
    <div
      className={`message-user-content break-words text-[14px] leading-[1.65] text-[var(--color-msg-text)]${
        hasChips ? '' : ' whitespace-pre-wrap'
      }`}
    >
      {segments.map((seg, i) => {
        if (seg.type === 'mention') {
          return <MentionChip key={i} kind={seg.kind} label={seg.value} />;
        }
        if (seg.type === 'reference') {
          return <ReferenceChip key={i} kind={seg.kind as ReferenceKind} label={seg.value} />;
        }
        if (!seg.value) return null;
        return (
          <MarkdownRenderer
            key={i}
            content={seg.value}
            cacheKey={`user-msg-${i}`}
          />
        );
      })}
    </div>
  );
}
