import { isTeamRelayMessage, parseTeamRelayMessage } from './displayContent';
import type { ChatMessage } from './types';

export const TEAM_RELAY_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

export interface MessageTurn {
  id: string;
  user?: ChatMessage;
  assistants: ChatMessage[];
}

function relayDedupeKey(message: ChatMessage): string | null {
  const raw = message.displayContent || message.content || '';
  if (!isTeamRelayMessage(raw)) return null;
  const parsed = parseTeamRelayMessage(raw);
  if (!parsed) return null;
  return `${parsed.from}:${parsed.body.trim()}`;
}

function messageTimestamp(message: ChatMessage): number {
  if (message.createdAt) {
    const parsed = Date.parse(message.createdAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

/** Collapse duplicate team relay user turns (same sender + body within window). */
export function dedupeTeamRelayTurns(turns: MessageTurn[]): MessageTurn[] {
  const seen = new Map<string, number>();
  const out: MessageTurn[] = [];

  for (const turn of turns) {
    if (!turn.user) {
      out.push(turn);
      continue;
    }

    const key = relayDedupeKey(turn.user);
    if (!key) {
      out.push(turn);
      continue;
    }

    const ts = messageTimestamp(turn.user);
    const prev = seen.get(key);
    if (prev !== undefined && Math.abs(ts - prev) < TEAM_RELAY_DEDUPE_WINDOW_MS) {
      continue;
    }

    seen.set(key, ts);
    out.push(turn);
  }

  return out;
}
