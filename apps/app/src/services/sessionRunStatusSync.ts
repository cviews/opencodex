import type { SessionRunStatus } from '../stores/session';

type SessionRunStatusSyncHandler = (sessionId: string, status: SessionRunStatus) => void;

let syncHandler: SessionRunStatusSyncHandler | null = null;

export function setSessionRunStatusSyncHandler(handler: SessionRunStatusSyncHandler | null): void {
  syncHandler = handler;
}

export function syncSessionRunStatusToMessageStore(
  sessionId: string,
  status: SessionRunStatus,
): void {
  syncHandler?.(sessionId, status);
}
