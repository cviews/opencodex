import type { SessionActivity } from '../stores/message';
import type { SessionRunStatus } from '../stores/session';
import { isLeadSessionAwaitingDelegation } from '../services/teamLeadSessionStatus';
import type { SubAgentItem, TeamInfo } from '../types';

export interface SidebarDelegationContext {
  teamModeEnabled: boolean;
  currentTeam: TeamInfo | null;
  subAgents: SubAgentItem[];
}

/** Resolve sidebar session icon state (Cursor-style dots + running spinner). */
export function resolveSidebarSessionRunStatus(
  sessionId: string,
  sessionRunStatus: Record<string, SessionRunStatus>,
  loadingBySession: Record<string, boolean>,
  sessionActivity: Record<string, SessionActivity>,
  delegationContext?: SidebarDelegationContext,
): SessionRunStatus | undefined {
  const awaitingDelegation = delegationContext
    && delegationContext.currentTeam?.sessionId === sessionId
    && isLeadSessionAwaitingDelegation(
      sessionId,
      sessionRunStatus,
      loadingBySession,
      sessionActivity,
      delegationContext.teamModeEnabled,
      delegationContext.currentTeam,
      delegationContext.subAgents,
    );

  const cached = sessionRunStatus[sessionId];
  if (cached === 'running' || awaitingDelegation) return 'running';
  if (cached === 'error') return 'error';
  if (loadingBySession[sessionId]) return 'running';
  // Trust server/SSE/poll terminal states over stale loading flags in other sessions.
  if (cached === 'idle') return 'idle';

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
  delegationContext?: SidebarDelegationContext,
): boolean {
  if (!sessionId) return false;

  return resolveSidebarSessionRunStatus(
    sessionId,
    sessionRunStatus,
    loadingBySession,
    sessionActivity,
    delegationContext,
  ) === 'running';
}
