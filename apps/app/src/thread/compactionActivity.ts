import type { Message } from '@zmn-codex/types';
import type { ActivityStep } from './activitySteps';

export interface CompactionActivity {
  id: string;
  sessionId: string;
  /** User turn this compaction belongs to. */
  turnUserMessageId?: string;
  /** Insert after this assistant message's tool steps (chronological). */
  afterMessageId?: string;
  reason?: 'auto' | 'manual';
  status: 'running' | 'done';
  streamText: string;
  summary?: string;
  include?: string;
  startedAt: number;
  endedAt?: number;
}

type RawSessionMessage = {
  info?: Record<string, unknown>;
  parts?: unknown[];
};

export interface SessionMessagesFetchResult {
  messages: Message[];
  compactions: CompactionActivity[];
  raw: RawSessionMessage[];
}

function extractTextFromRawItem(item: RawSessionMessage): string {
  const info = (item.info ?? item) as Record<string, unknown>;
  const parts = item.parts ?? (info.parts as unknown[] | undefined);
  if (!Array.isArray(parts)) return '';
  const texts: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    const p = part as Record<string, unknown>;
    if (p.type === 'text' && typeof p.text === 'string' && p.text.trim()) {
      texts.push(p.text);
    }
  }
  return texts.join('\n\n');
}

export function parseCompactionsFromSessionMessages(
  items: RawSessionMessage[],
  sessionId: string,
): CompactionActivity[] {
  const results: CompactionActivity[] = [];
  let currentTurnUserId: string | undefined;
  let lastAssistantId: string | undefined;

  for (const item of items) {
    const info = (item.info ?? item) as Record<string, unknown>;
    const role = info.role as string | undefined;
    const msgId = typeof info.id === 'string' ? info.id : undefined;

    if (role === 'user' && msgId) {
      currentTurnUserId = msgId;
    }
    if (role === 'assistant' && msgId) {
      const parts = item.parts ?? (info.parts as unknown[] | undefined);
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (!part || typeof part !== 'object') continue;
          const p = part as Record<string, unknown>;
          if (p.type !== 'compaction') continue;

          const time = p.time as Record<string, unknown> | undefined;
          const created = typeof time?.created === 'number' ? time.created : Date.now();
          const compacted = typeof time?.compacted === 'number' ? time.compacted : undefined;

          results.push({
            id: (typeof p.id === 'string' && p.id) || `compaction-${results.length}-${created}`,
            sessionId,
            turnUserMessageId: currentTurnUserId,
            afterMessageId: lastAssistantId,
            reason: p.auto === true ? 'auto' : p.auto === false ? 'manual' : undefined,
            status: compacted != null ? 'done' : 'done',
            streamText: '',
            startedAt: created,
            endedAt: compacted ?? created,
          });
        }
      }

      if (info.summary === true && typeof info.parentID === 'string') {
        const summaryText = extractTextFromRawItem(item);
        if (summaryText) {
          const parentId = info.parentID;
          const match = results.findLast(
            (c) => c.turnUserMessageId === parentId || c.id === parentId,
          );
          if (match) {
            match.summary = summaryText;
            match.status = 'done';
            if (!match.endedAt) match.endedAt = Date.now();
          }
        }
      }

      lastAssistantId = msgId;
    }
  }

  return results;
}

export function buildCompactionBody(c: CompactionActivity): string | undefined {
  const sections: string[] = [];
  if (c.reason) {
    sections.push(
      c.reason === 'auto'
        ? 'Reason: automatic (context window full)'
        : 'Reason: manual (/compress)',
    );
  }
  const stream = c.streamText.trim();
  if (stream) sections.push(stream);
  if (c.summary?.trim() && c.summary.trim() !== stream) {
    sections.push(c.summary.trim());
  }
  if (c.include?.trim()) {
    sections.push(`Preserved: ${c.include.trim()}`);
  }
  if (sections.length === 0 && c.status === 'done') {
    sections.push('Context compacted.');
  }
  if (sections.length === 0 && c.status === 'running') {
    return undefined;
  }
  return sections.length > 0 ? sections.join('\n\n') : undefined;
}

export function compactionToActivityStep(c: CompactionActivity): ActivityStep {
  const isRunning = c.status === 'running';
  const body = buildCompactionBody(c);
  const detail =
    c.reason === 'auto' ? 'auto' : c.reason === 'manual' ? 'manual' : undefined;
  const fallback = isRunning
    ? c.reason === 'manual'
      ? '正在压缩上下文…'
      : '正在自动压缩上下文…'
    : 'Context compacted.';
  return {
    id: `compaction-${c.id}`,
    label: isRunning ? 'Compressing' : 'Compressed',
    detail,
    body: body?.trim() ? body : fallback,
    status: isRunning ? 'running' : 'done',
  };
}

export function isCompactionStepLabel(label: string): boolean {
  return label === 'Compressing' || label === 'Compressed';
}
