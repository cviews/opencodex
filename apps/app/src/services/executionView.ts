import { useSessionStore } from '../stores/session';
import { getDisplayTeamMembers, useTeamStore } from '../stores/team';
import { useMessageStore } from '../stores/message';

export function getEffectiveSessionId(): string | null {
  const { activeSessionId, subAgents, selectedSubAgentId } = useSessionStore.getState();
  const { teamModeEnabled, currentTeam, selectedMemberId } = useTeamStore.getState();

  const displayMembers = getDisplayTeamMembers(currentTeam, subAgents, activeSessionId ?? undefined);
  const selectedMember =
    teamModeEnabled && selectedMemberId
      ? displayMembers.find((m) => m.id === selectedMemberId)
      : null;
  const selectedSubAgent = selectedSubAgentId
    ? subAgents.find((a) => a.id === selectedSubAgentId)
    : null;

  if (selectedMember?.sessionID) return selectedMember.sessionID;
  if (selectedSubAgent?.sessionId) return selectedSubAgent.sessionId;
  return activeSessionId;
}

function syncMessages(sessionId: string | null) {
  if (sessionId) {
    useMessageStore.getState().setActiveSession(sessionId);
    void useMessageStore.getState().loadMessages(sessionId);
  } else {
    useMessageStore.getState().setActiveSession(null);
  }
}

export function selectSession(sessionId: string) {
  useSessionStore.getState().setActiveSession(sessionId);
  useSessionStore.getState().setSelectedSubAgentId(null);
  useTeamStore.getState().setSelectedMemberId(null);
  syncMessages(sessionId);
  void useTeamStore.getState().setCurrentTeamBySession(sessionId);
}

export function selectTeamMember(memberId: string) {
  const { selectedMemberId, currentTeam } = useTeamStore.getState();
  const { activeSessionId, subAgents } = useSessionStore.getState();
  const nextId = selectedMemberId === memberId ? null : memberId;

  useTeamStore.getState().setSelectedMemberId(nextId);
  if (nextId) {
    useSessionStore.getState().setSelectedSubAgentId(null);
    const displayMembers = getDisplayTeamMembers(currentTeam, subAgents, activeSessionId ?? undefined);
    const member = displayMembers.find((m) => m.id === nextId);
    syncMessages(member?.sessionID ?? activeSessionId);
  } else {
    syncMessages(useSessionStore.getState().activeSessionId);
  }
}

export function selectSubAgent(agentId: string) {
  const { selectedSubAgentId, subAgents, activeSessionId } = useSessionStore.getState();
  const nextId = selectedSubAgentId === agentId ? null : agentId;

  useSessionStore.getState().setSelectedSubAgentId(nextId);
  if (nextId) {
    useTeamStore.getState().setSelectedMemberId(null);
    const agent = subAgents.find((a) => a.id === nextId);
    syncMessages(agent?.sessionId ?? activeSessionId);
  } else {
    syncMessages(activeSessionId);
  }
}

export function clearExecutionView() {
  useTeamStore.getState().setSelectedMemberId(null);
  useSessionStore.getState().setSelectedSubAgentId(null);
  syncMessages(useSessionStore.getState().activeSessionId);
}
