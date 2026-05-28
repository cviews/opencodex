import { useMessageStore } from '../stores/message';
import { useSessionStore } from '../stores/session';
import { isPendingSessionId } from '../utils/pendingSession';

/** Reload messages for the active session and any session still running on the server. */
export async function resyncRunningProjectSessions(): Promise<void> {
  const { activeSessionId, sessionRunStatus } = useSessionStore.getState();
  const sessionIds = new Set<string>();

  if (activeSessionId && !isPendingSessionId(activeSessionId)) {
    sessionIds.add(activeSessionId);
  }
  for (const [sessionId, status] of Object.entries(sessionRunStatus)) {
    if (status === 'running' && !isPendingSessionId(sessionId)) {
      sessionIds.add(sessionId);
    }
  }

  if (sessionIds.size === 0) return;

  await Promise.allSettled(
    [...sessionIds].map((sessionId) => useMessageStore.getState().loadMessages(sessionId)),
  );
}
