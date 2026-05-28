import type { SessionRunStatus } from '../stores/session';
import { useTeamStore } from '../stores/team';

function memberStatusFromRunStatus(
  currentStatus: 'working' | 'idle' | 'completed' | 'error' | 'waiting',
  status: SessionRunStatus,
): 'working' | 'idle' | 'completed' | 'error' | 'waiting' {
  if (status === 'running') return 'working';
  if (status === 'error') return 'error';
  if (currentStatus === 'completed' || currentStatus === 'waiting') return currentStatus;
  return 'idle';
}

/** Keep team member rows aligned with session run status from SSE/polling. */
export function syncTeamMemberStatusFromRunStatus(sessionId: string, status: SessionRunStatus): void {
  const { teamModeEnabled, currentTeam } = useTeamStore.getState();
  if (!teamModeEnabled || !currentTeam) return;

  const teamRef = currentTeam.name || currentTeam.id;
  const leadSessionId = currentTeam.sessionId;
  if (!teamRef || !leadSessionId) return;

  if (sessionId === leadSessionId) {
    const lead = currentTeam.members.find((member) => member.role === 'lead');
    const memberKey = lead?.name ?? 'lead';
    useTeamStore
      .getState()
      .updateMemberStatus(teamRef, memberKey, memberStatusFromRunStatus(lead?.status ?? 'idle', status));
    return;
  }

  const member = currentTeam.members.find((item) => item.sessionID === sessionId);
  if (!member) return;

  useTeamStore
    .getState()
    .updateMemberStatus(
      teamRef,
      member.name,
      memberStatusFromRunStatus(member.status, status),
    );
}
