import type { Session } from '@zmn-codex/types';
import type { PendingQuestion } from '../types';
import type { SubAgentItem } from '../types';

/** Match official OpenCode app: question may belong to parent or child session. */
export function collectRelatedSessionIds(
  sessionId: string | null | undefined,
  sessions: Session[],
  subAgents: SubAgentItem[],
): string[] {
  if (!sessionId) return [];

  const parentByChild = new Map<string, string>();
  for (const session of sessions) {
    const parentID = session.parentID?.trim();
    if (parentID) parentByChild.set(session.id, parentID);
  }
  for (const agent of subAgents) {
    if (agent.sessionId && agent.parentSessionId) {
      parentByChild.set(agent.sessionId, agent.parentSessionId);
    }
  }

  const seen = new Set<string>();
  const ordered: string[] = [];
  const queue = [sessionId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);

    for (const [child, parent] of parentByChild.entries()) {
      if (parent === id && !seen.has(child)) queue.push(child);
      if (child === id && parent && !seen.has(parent)) queue.push(parent);
    }
  }
  return ordered;
}

export function pickQuestionForSessionTree(
  questions: PendingQuestion[],
  preferredSessionId: string | null,
  sessions: Session[],
  subAgents: SubAgentItem[],
): PendingQuestion | null {
  if (questions.length === 0) return null;

  if (preferredSessionId) {
    const related = collectRelatedSessionIds(preferredSessionId, sessions, subAgents);
    for (const sessionId of related) {
      const matched = questions.find((q) => q.sessionId === sessionId);
      if (matched) return matched;
    }
  }

  return questions[0];
}
