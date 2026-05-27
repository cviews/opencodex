import { useMemo } from 'react';
import { AtSign, FileText, Sparkles, Users } from 'lucide-react';

interface UserMessageContentProps {
  content: string;
}

type Segment =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string; kind: 'agent' | 'file' | 'model' | 'skill' | 'team' };

const MENTION_PATTERN = /(@team\s+\S+|@(?:agent|file|model|skill)\s+\S+|\/\S+|@\S+)/g;

function classifyMention(raw: string): { kind: 'agent' | 'file' | 'model' | 'skill' | 'team'; label: string } {
  if (raw.startsWith('/')) {
    return { kind: 'skill', label: raw.slice(1) };
  }
  if (raw.startsWith('@team ')) {
    return { kind: 'team', label: raw.slice(6) };
  }
  if (raw.startsWith('@model ')) {
    return { kind: 'model', label: raw.slice(7) };
  }
  if (raw.startsWith('@agent ')) {
    return { kind: 'agent', label: raw.slice(7) };
  }
  if (raw.startsWith('@file ')) {
    return { kind: 'file', label: raw.slice(6) };
  }
  if (raw.startsWith('@skill ')) {
    return { kind: 'skill', label: raw.slice(7) };
  }
  return { kind: 'agent', label: raw.slice(1) };
}

function parseContent(content: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(MENTION_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, index) });
    }
    const raw = match[0];
    const { kind, label } = classifyMention(raw);
    segments.push({ type: 'mention', value: label, kind });
    lastIndex = index + raw.length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: content }];
}

const chipStyles = {
  agent: 'bg-[rgba(43,143,255,0.12)] text-[#2B8FFF] border-[rgba(43,143,255,0.25)]',
  file: 'bg-[rgba(16,163,127,0.12)] text-[#10A37F] border-[rgba(16,163,127,0.25)]',
  model: 'bg-[rgba(14,165,233,0.12)] text-[#0EA5E9] border-[rgba(14,165,233,0.25)]',
  skill: 'bg-[rgba(139,92,246,0.12)] text-[#8B5CF6] border-[rgba(139,92,246,0.25)]',
  team: 'bg-[rgba(20,184,166,0.12)] text-[#14B8A6] border-[rgba(20,184,166,0.25)]',
} as const;

function MentionChip({ kind, label }: { kind: 'agent' | 'file' | 'model' | 'skill' | 'team'; label: string }) {
  const Icon =
    kind === 'file' ? FileText : kind === 'skill' ? Sparkles : kind === 'team' ? Users : AtSign;
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
  const segments = useMemo(() => parseContent(content), [content]);

  return (
    <div className="message-user-content whitespace-pre-wrap break-words text-[14px] leading-[1.65] text-[var(--color-msg-text)]">
      {segments.map((seg, i) => {
        if (seg.type === 'mention') {
          return <MentionChip key={i} kind={seg.kind} label={seg.value} />;
        }
        return <span key={i}>{seg.value}</span>;
      })}
    </div>
  );
}
