import type { PendingPermission, PendingQuestion } from '../types';

export interface DirectoryPendingSnapshot {
  permissions: PendingPermission[];
  questions: PendingQuestion[];
}

export function emptyDirectoryPendingSnapshot(): DirectoryPendingSnapshot {
  return { permissions: [], questions: [] };
}

export function upsertDirectoryPermission(
  snapshot: DirectoryPendingSnapshot,
  permission: PendingPermission,
): DirectoryPendingSnapshot {
  if (snapshot.permissions.some((item) => item.id === permission.id)) return snapshot;
  return {
    ...snapshot,
    permissions: [...snapshot.permissions, permission],
  };
}

export function removeDirectoryPermission(
  snapshot: DirectoryPendingSnapshot,
  permissionId: string,
): DirectoryPendingSnapshot {
  return {
    ...snapshot,
    permissions: snapshot.permissions.filter((item) => item.id !== permissionId),
  };
}

export function upsertDirectoryQuestion(
  snapshot: DirectoryPendingSnapshot,
  question: PendingQuestion,
): DirectoryPendingSnapshot {
  const byId = new Map(snapshot.questions.map((item) => [item.id, item]));
  byId.set(question.id, question);
  return {
    ...snapshot,
    questions: [...byId.values()],
  };
}

export function removeDirectoryQuestion(
  snapshot: DirectoryPendingSnapshot,
  questionId: string,
): DirectoryPendingSnapshot {
  return {
    ...snapshot,
    questions: snapshot.questions.filter((item) => item.id !== questionId),
  };
}
