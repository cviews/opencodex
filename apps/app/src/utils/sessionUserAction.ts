import type { SessionActivity } from '../stores/message';
import type { PendingPermission, PendingQuestion } from '../types';
import { resolveProjectDirectoryKey } from '../sdk/eventDirectory';
import type { DirectoryPendingSnapshot } from '../services/crossProjectPending';

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

export function buildSessionsNeedingUserActionForProject(
  projectPath: string,
  isCurrentProject: boolean,
  pendingPermissions: PendingPermission[],
  pendingQuestions: PendingQuestion[],
  pendingByDirectory: Record<string, DirectoryPendingSnapshot>,
  sessionActivity: Record<string, SessionActivity>,
): Set<string> {
  if (isCurrentProject) {
    return buildSessionsNeedingUserAction(pendingPermissions, pendingQuestions, sessionActivity);
  }

  const key = resolveProjectDirectoryKey(projectPath, pendingByDirectory);
  const snapshot = pendingByDirectory[key];
  return buildSessionsNeedingUserAction(
    snapshot?.permissions ?? [],
    snapshot?.questions ?? [],
    sessionActivity,
  );
}
