import type { SessionActivity } from '../stores/message';
import type { PendingPermission, PendingQuestion } from '../types';

export function buildSessionsNeedingUserAction(
  pendingPermissions: PendingPermission[],
  pendingQuestions: PendingQuestion[],
  sessionActivity: Record<string, SessionActivity>,
): Set<string> {
  const ids = new Set<string>();

  for (const permission of pendingPermissions) {
    if (permission.sessionId) ids.add(permission.sessionId);
  }
  for (const question of pendingQuestions) {
    if (question.sessionId) ids.add(question.sessionId);
  }
  for (const [sessionId, activity] of Object.entries(sessionActivity)) {
    if (activity?.kind === 'permission' || activity?.kind === 'question') ids.add(sessionId);
  }

  return ids;
}
