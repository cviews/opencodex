import type { SessionActivity } from '../stores/message';
import type { SessionRunStatus } from '../stores/session';

/** Resolve sidebar session icon state (Cursor-style dots + running spinner). */
export function resolveSidebarSessionRunStatus(
  sessionId: string,
  sessionRunStatus: Record<string, SessionRunStatus>,
  loadingBySession: Record<string, boolean>,
  sessionActivity: Record<string, SessionActivity>,
): SessionRunStatus | undefined {
  const cached = sessionRunStatus[sessionId];
  if (cached === 'running') return 'running';
  if (cached === 'error') return 'error';
  // Trust server/SSE/poll terminal states over stale loading flags in other sessions.
  if (cached === 'idle') return 'idle';

  if (loadingBySession[sessionId]) return 'running';

  const activity = sessionActivity[sessionId];
  if (activity && activity.kind !== 'permission' && activity.kind !== 'question') {
    return 'running';
  }

  return undefined;
}

export function isSessionExecuting(
  sessionId: string | null | undefined,
  sessionRunStatus: Record<string, SessionRunStatus>,
  loadingBySession: Record<string, boolean>,
  sessionActivity: Record<string, SessionActivity>,
): boolean {
  if (!sessionId) return false;

  const cached = sessionRunStatus[sessionId];
  if (cached === 'running') return true;
  if (cached === 'idle' || cached === 'error') return false;

  if (loadingBySession[sessionId]) return true;

  const activity = sessionActivity[sessionId];
  if (activity && activity.kind !== 'permission' && activity.kind !== 'question') {
    return true;
  }

  return false;
}
