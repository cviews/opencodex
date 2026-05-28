import type { SessionActivity } from '../stores/message';
import type { SessionRunStatus } from '../stores/session';
import { getDisplayTeamMembers } from '../stores/team';
import type { SubAgentItem, TeamInfo } from '../types';

export function collectLeadDelegationWorkerSessionIds(
  leadSessionId: string,
  teamModeEnabled: boolean,
  currentTeam: TeamInfo | null,
  subAgents: SubAgentItem[],
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  const push = (sessionId: string | undefined) => {
    if (!sessionId || seen.has(sessionId)) return;
    seen.add(sessionId);
    ids.push(sessionId);
  };

  for (const agent of subAgents) {
    if (agent.parentSessionId === leadSessionId) {
      push(agent.sessionId);
    }
  }

  if (teamModeEnabled && currentTeam?.sessionId === leadSessionId) {
    for (const member of getDisplayTeamMembers(currentTeam, subAgents, leadSessionId)) {
      if (member.role !== 'lead') {
        push(member.sessionID);
      }
    }
  }

  return ids;
}

export function isWorkerSessionBusy(
  sessionId: string,
  sessionRunStatus: Record<string, SessionRunStatus>,
  loadingBySession: Record<string, boolean>,
  sessionActivity: Record<string, SessionActivity>,
): boolean {
  if (sessionRunStatus[sessionId] === 'running') return true;
  if (loadingBySession[sessionId]) return true;

  const activity = sessionActivity[sessionId];
  if (activity && activity.kind !== 'permission' && activity.kind !== 'question') {
    return true;
  }

  return false;
}

export function isLeadSessionAwaitingDelegation(
  leadSessionId: string,
  sessionRunStatus: Record<string, SessionRunStatus>,
  loadingBySession: Record<string, boolean>,
  sessionActivity: Record<string, SessionActivity>,
  teamModeEnabled: boolean,
  currentTeam: TeamInfo | null,
  subAgents: SubAgentItem[],
): boolean {
  if (!leadSessionId) return false;

  if (teamModeEnabled && currentTeam?.sessionId === leadSessionId) {
    for (const member of getDisplayTeamMembers(currentTeam, subAgents, leadSessionId)) {
      if (member.role === 'lead') continue;
      if (member.status === 'working' || member.status === 'waiting') {
        return true;
      }
    }
  }

  const workerSessionIds = collectLeadDelegationWorkerSessionIds(
    leadSessionId,
    teamModeEnabled,
    currentTeam,
    subAgents,
  );

  return workerSessionIds.some((sessionId) =>
    isWorkerSessionBusy(sessionId, sessionRunStatus, loadingBySession, sessionActivity),
  );
}

export function resolveLeadSessionIdForWorkerSession(
  workerSessionId: string,
  teamModeEnabled: boolean,
  currentTeam: TeamInfo | null,
  subAgents: SubAgentItem[],
): string | undefined {
  const fromSubAgent = subAgents.find((agent) => agent.sessionId === workerSessionId);
  if (fromSubAgent?.parentSessionId) return fromSubAgent.parentSessionId;

  if (teamModeEnabled && currentTeam) {
    const member = currentTeam.members.find((item) => item.sessionID === workerSessionId);
    if (member && member.role !== 'lead') {
      return currentTeam.sessionId;
    }
    if (currentTeam.sessionId && workerSessionId !== currentTeam.sessionId) {
      for (const agent of subAgents) {
        if (agent.sessionId === workerSessionId) {
          return currentTeam.sessionId;
        }
      }
    }
  }

  return undefined;
}
