export const PENDING_SESSION_PREFIX = 'pending-session-';

export function isPendingSessionId(sessionId: string | null | undefined): boolean {
  return !!sessionId?.startsWith(PENDING_SESSION_PREFIX);
}

export function createPendingSessionId(): string {
  return `${PENDING_SESSION_PREFIX}${Date.now()}`;
}
