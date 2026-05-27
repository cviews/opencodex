import type { TeamInfo } from '../types';

const POSITIVE_TTL_MS = 30_000;
const NEGATIVE_TTL_MS = 60_000;

interface CacheEntry {
  team: TeamInfo | null;
  at: number;
  negative: boolean;
}

const cache = new Map<string, CacheEntry>();

export function invalidateTeamBySessionCache(sessionId?: string): void {
  if (sessionId) {
    cache.delete(sessionId);
    return;
  }
  cache.clear();
}

/** undefined = cache miss; null = known no team for session. */
export function getCachedTeamBySession(sessionId: string): TeamInfo | null | undefined {
  const entry = cache.get(sessionId);
  if (!entry) return undefined;
  const ttl = entry.negative ? NEGATIVE_TTL_MS : POSITIVE_TTL_MS;
  if (Date.now() - entry.at > ttl) {
    cache.delete(sessionId);
    return undefined;
  }
  return entry.team;
}

export function writeTeamBySessionCache(sessionId: string, team: TeamInfo | null): void {
  cache.set(sessionId, { team, at: Date.now(), negative: team === null });
}
