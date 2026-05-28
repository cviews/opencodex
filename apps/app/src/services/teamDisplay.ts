import type { SubAgentItem, TeamInfo, TeamMember, TeamMemberStatus } from '../types';
import { useSessionStore } from '../stores/session';
import { debugWarn } from '../utils/debugLog';

export function displayNameFromSpawnTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return '';
  const fromTitle = trimmed.match(/^(.+?)\s+\(@/)?.[1]?.trim();
  return fromTitle || trimmed;
}

/** Lead uses session title; workers use spawn title only when it looks like a spawn label. */
export function memberDisplayName(
  member: Pick<TeamMember, 'name' | 'role'>,
  leadSessionTitle?: string,
): string {
  if (member.role === 'lead') {
    return leadSessionTitle?.trim() || member.name?.trim() || 'Lead';
  }
  const name = member.name?.trim() ?? '';
  if (/\s+\(@/.test(name)) return displayNameFromSpawnTitle(name);
  return name || 'member';
}

function statusFromSessionRun(
  sessionRun: 'idle' | 'running' | 'error' | undefined,
): TeamMemberStatus | undefined {
  if (sessionRun === 'running') return 'working';
  if (sessionRun === 'error') return 'error';
  if (sessionRun === 'idle') return 'idle';
  return undefined;
}

function mergeMemberDisplayStatus(
  baseStatus: TeamMemberStatus,
  sessionRun: 'idle' | 'running' | 'error' | undefined,
): TeamMemberStatus {
  if (sessionRun === 'running') return 'working';
  if (sessionRun === 'error') return 'error';
  if (sessionRun === 'idle') {
    if (baseStatus === 'completed' || baseStatus === 'waiting' || baseStatus === 'error') {
      return baseStatus;
    }
    return 'idle';
  }
  return baseStatus;
}

function pickMemberStatus(
  preferred: TeamMemberStatus | undefined,
  fallback: TeamMemberStatus,
): TeamMemberStatus {
  return preferred ?? fallback;
}

function subAgentStatusToMemberStatus(status: SubAgentItem['status']): TeamMemberStatus {
  if (status === 'running') return 'working';
  if (status === 'completed') return 'completed';
  return 'idle';
}

function memberKey(member: Pick<TeamMember, 'id' | 'sessionID' | 'name'>): string {
  if (member.sessionID) return member.sessionID;
  return `${member.name}:${member.id}`;
}

/** Spawn title: `req-analyst (@req-analyst teammate, model)`. */
export function isTeammateSessionTitle(title: string): boolean {
  return /\s+\(@[^)]+\s+teammate/i.test(title) || title.includes(' teammate,');
}

/** Task tool title: `description (@explore subagent)`. */
export function isTaskSubagentSessionTitle(title: string): boolean {
  return /\s+\(@[^)]+\s+subagent\)/i.test(title) || title.includes(' subagent)');
}

function workerMemberSessionIds(team: TeamInfo): Set<string> {
  return new Set(
    team.members
      .filter((m) => m.role !== 'lead' && m.sessionID)
      .map((m) => m.sessionID as string),
  );
}

function scopedSubAgents(subAgents: SubAgentItem[], leadSessionId: string): SubAgentItem[] {
  return subAgents.filter((agent) => agent.parentSessionId === leadSessionId);
}

/** True when this child session is a team_spawn teammate (not a task subagent). */
export function isTeammateChildSession(agent: SubAgentItem, team: TeamInfo): boolean {
  const workerSessions = workerMemberSessionIds(team);
  if (workerSessions.has(agent.sessionId)) return true;
  if (isTeammateSessionTitle(agent.title)) return true;
  if (isTaskSubagentSessionTitle(agent.title)) return false;
  return false;
}

/** True when this child session was created by the task tool (or hangs under a teammate). */
export function isTaskSubagentChildSession(
  agent: SubAgentItem,
  team: TeamInfo,
  leadSessionId: string,
): boolean {
  if (isTeammateChildSession(agent, team)) return false;

  const workerSessions = workerMemberSessionIds(team);
  if (agent.parentSessionId !== leadSessionId && workerSessions.has(agent.parentSessionId)) {
    return true;
  }
  if (isTaskSubagentSessionTitle(agent.title)) return true;

  if (
    agent.parentSessionId === leadSessionId
    && !workerSessions.has(agent.sessionId)
    && !isTeammateSessionTitle(agent.title)
  ) {
    return true;
  }

  return false;
}

/**
 * Team members for sidebar / header: API team.members + teammate children only.
 * Does not include task-tool subagents.
 */
function suppressOrphanDuplicateSpawns(members: TeamMember[], team: TeamInfo): TeamMember[] {
  const registeredSessionByName = new Map<string, string>();
  for (const member of team.members) {
    if (member.role === 'lead' || !member.sessionID) continue;
    registeredSessionByName.set(member.name.toLowerCase(), member.sessionID);
  }

  let hidden = 0;
  const filtered = members.filter((member) => {
    if (member.role === 'lead') return true;
    const registeredSession = registeredSessionByName.get(member.name.toLowerCase());
    if (!registeredSession || !member.sessionID) return true;
    if (member.sessionID === registeredSession) return true;
    hidden += 1;
    return false;
  });

  if (hidden > 0) {
    debugWarn('team.duplicateSpawnHidden', `已隐藏 ${hidden} 个重复 spawn 的 orphan 成员会话`, {
      team: team.name,
    });
  }

  return filtered;
}

export function resolveTeamMembersForDisplay(
  team: TeamInfo,
  subAgents: SubAgentItem[],
  parentSessionId?: string,
  sessionRunStatus?: Record<string, 'idle' | 'running' | 'error'>,
): TeamInfo['members'] {
  const leadSessionId = parentSessionId ?? team.sessionId;
  const children = scopedSubAgents(subAgents, leadSessionId);

  const byKey = new Map<string, TeamMember>();

  const leadFromApi = team.members.find((member) => member.role === 'lead');
  const leadSessionTitle = useSessionStore
    .getState()
    .sessions.find((s) => s.id === leadSessionId)?.title?.trim();
  const lead: TeamMember = {
    ...(leadFromApi ?? {
      id: 'lead',
      agentId: 'lead',
      name: 'Lead',
      role: 'lead' as const,
      status: 'idle' as const,
      sessionID: leadSessionId,
    }),
    name: memberDisplayName(
      {
        name:
          leadSessionTitle
          || (leadFromApi?.name && !/^lead$/i.test(leadFromApi.name) ? leadFromApi.name : 'Lead'),
        role: 'lead',
      },
      leadSessionTitle,
    ),
    sessionID: leadFromApi?.sessionID || leadSessionId,
    role: 'lead',
  };
  const runStatus = sessionRunStatus ?? useSessionStore.getState().sessionRunStatus;
  lead.status = mergeMemberDisplayStatus(lead.status, runStatus[leadSessionId]);
  byKey.set(memberKey(lead), lead);

  for (const member of team.members) {
    if (member.role === 'lead') continue;
    const sessionRun = member.sessionID ? runStatus[member.sessionID] : undefined;
    const status = mergeMemberDisplayStatus(member.status, sessionRun);
    byKey.set(memberKey(member), { ...member, status });
  }
  for (const agent of children) {
    if (!isTeammateChildSession(agent, team)) continue;
    const name = displayNameFromSpawnTitle(agent.title || agent.name || agent.id);
    const baseStatus = subAgentStatusToMemberStatus(agent.status);
    const sessionRun = runStatus[agent.sessionId];
    const status = mergeMemberDisplayStatus(
      pickMemberStatus(statusFromSessionRun(sessionRun), baseStatus),
      sessionRun,
    );
    const entry: TeamMember = {
      id: agent.id,
      agentId: agent.name || name,
      name,
      role: 'worker',
      status,
      sessionID: agent.sessionId,
    };
    const key = memberKey(entry);
    if (!byKey.has(key)) {
      byKey.set(key, entry);
      continue;
    }
    const existing = byKey.get(key)!;
    const mergedStatus =
      entry.status === 'working' || existing.status === 'working'
        ? 'working'
        : entry.status === 'waiting' || existing.status === 'waiting'
          ? 'waiting'
          : existing.status;
    byKey.set(key, {
      ...existing,
      sessionID: existing.sessionID || entry.sessionID,
      status: mergedStatus,
    });
  }

  const workers = [...byKey.values()].filter((member) => member.role !== 'lead');
  return suppressOrphanDuplicateSpawns([lead, ...workers], team);
}

/** Task-tool subagents only (excludes team_spawn teammates). */
export function resolveTaskSubAgentsForDisplay(
  team: TeamInfo | null,
  subAgents: SubAgentItem[],
  parentSessionId?: string,
): SubAgentItem[] {
  if (!team) {
    const leadSessionId = parentSessionId ?? '';
    return leadSessionId
      ? subAgents.filter((a) => a.parentSessionId === leadSessionId)
      : subAgents;
  }

  const leadSessionId = parentSessionId ?? team.sessionId;
  return scopedSubAgents(subAgents, leadSessionId).filter((agent) =>
    isTaskSubagentChildSession(agent, team, leadSessionId),
  );
}
