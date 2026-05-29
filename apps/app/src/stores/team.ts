import { create } from 'zustand';
import type { TeamInfo, TeamEvent, TeamMember, TeamTask } from '../types';
import { invalidateTeamListCache, invalidateTeamBySessionCache, opencodeTeam } from '../services/opencodeAdapter';
import { registerCrossProjectEventHandler, extractEventPayload } from '../sdk/eventRouter';
import { scheduleTeamMemberExecution } from '../services/teamMemberExecution';
import { scheduleLeadOrchestrationResume } from '../services/teamLeadExecution';
import { scheduleNotifyLeadOfMemberCompletion } from '../services/teamMemberCompletionNotify';
import { getCachedTeamBySession } from '../services/teamSessionCache';
import {
  resolveTaskSubAgentsForDisplay,
  resolveTeamMembersForDisplay,
} from '../services/teamDisplay';
import { useSessionStore } from './session';
import { useMessageStore } from './message';
import { debugError } from '../utils/debugLog';

interface TeamState {
  teamModeEnabled: boolean;
  activeTeams: TeamInfo[];
  currentTeam: TeamInfo | null;
  selectedMemberId: string | null;

  setTeamModeEnabled: (enabled: boolean) => void;
  setActiveTeams: (teams: TeamInfo[]) => void;
  setCurrentTeamBySession: (sessionId: string) => void;
  refreshCurrentTeam: () => Promise<void>;
  clearTeamRunScope: (leadSessionId: string) => void;
  deactivateSessionTeam: (sessionId: string) => void;
  setSelectedMemberId: (id: string | null) => void;
  handleTeamEvent: (event: TeamEvent) => void;
  updateMemberStatus: (teamId: string, memberId: string, status: TeamMember['status'], currentTask?: string) => void;
  updateTask: (teamId: string, taskId: string, updates: Partial<TeamTask>) => void;
  spawnTeam: (sessionId: string) => Promise<void>;
  shutdownTeam: (teamId: string) => Promise<void>;
  fetchActiveTeams: () => Promise<void>;
  subscribeToEvents: () => () => void;
}

const TEAM_MODE_KEY = 'codex-team-mode-enabled';
const TEAM_POLL_DELAYS_MS = [2000, 5000, 10000];
let spawnPollInFlight: string | null = null;

function teamMatchesEvent(team: TeamInfo, event: TeamEvent): boolean {
  const cleanedName = String(event.data.teamName ?? event.data.name ?? '');
  return team.id === event.teamId
    || team.name === event.teamId
    || (!!cleanedName && (team.name === cleanedName || team.key === cleanedName));
}

function readTeamModeEnabled(): boolean {
  try {
    const saved = localStorage.getItem(TEAM_MODE_KEY);
    if (saved !== null) return saved === 'true';
  } catch { /* ignore */ }
  return false;
}

function mergeMemberOnRefresh(incoming: TeamMember, existing?: TeamMember): TeamMember {
  if (!existing) return incoming;

  let status = incoming.status;
  const sessionRun = existing.sessionID
    ? useSessionStore.getState().sessionRunStatus[existing.sessionID]
    : undefined;

  if (existing.status === 'working' && (incoming.status === 'idle' || incoming.status === 'waiting')) {
    status = sessionRun === 'idle' || sessionRun === 'error' ? 'completed' : 'working';
  } else if (incoming.status === 'completed' || incoming.status === 'error') {
    status = incoming.status;
  } else if (existing.status === 'waiting' && incoming.status === 'idle') {
    status = sessionRun === 'idle' ? 'completed' : existing.status;
  } else if (sessionRun === 'idle' && existing.status === 'working') {
    status = 'completed';
  }

  return {
    ...incoming,
    status,
    currentTask: incoming.currentTask ?? existing.currentTask,
  };
}

function mergeTeamMembersOnRefresh(incoming: TeamInfo, previous: TeamInfo | null): TeamInfo {
  if (!previous || previous.sessionId !== incoming.sessionId) return incoming;
  return {
    ...incoming,
    members: incoming.members.map((member) => {
      const existing = previous.members.find(
        (m) =>
          (member.sessionID && m.sessionID === member.sessionID)
          || m.id === member.id
          || m.name === member.name
          || m.agentId === member.agentId,
      );
      return mergeMemberOnRefresh(member, existing);
    }),
  };
}

function mergeTeamIntoLists(team: TeamInfo, state: Pick<TeamState, 'activeTeams' | 'currentTeam'>): {
  activeTeams: TeamInfo[];
  currentTeam: TeamInfo | null;
} {
  const previousCurrent =
    state.currentTeam
    && (state.currentTeam.sessionId === team.sessionId || state.currentTeam.name === team.name)
      ? state.currentTeam
      : null;
  const mergedTeam = mergeTeamMembersOnRefresh(team, previousCurrent);
  const activeTeams = [
    mergedTeam,
    ...state.activeTeams.filter((t) => t.id !== mergedTeam.id && t.sessionId !== mergedTeam.sessionId && t.name !== mergedTeam.name),
  ];
  const currentTeam =
    state.currentTeam
    && (state.currentTeam.sessionId === mergedTeam.sessionId || state.currentTeam.name === mergedTeam.name)
      ? mergedTeam
      : state.currentTeam;
  return { activeTeams, currentTeam };
}

function opencodeStatusToMemberStatus(raw: unknown): TeamMember['status'] | undefined {
  switch (raw) {
    case 'working':
    case 'busy':
      return 'working';
    case 'waiting':
    case 'shutdown_requested':
      return 'waiting';
    case 'running':
    case 'starting':
      return 'working';
    case 'completed':
    case 'shutdown':
      return 'completed';
    case 'error':
    case 'failed':
    case 'errored':
      return 'error';
    case 'ready':
    case 'idle':
      return 'idle';
    default:
      return undefined;
  }
}

function memberMatchesKey(member: TeamMember, key: string): boolean {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return false;
  return (
    member.id.toLowerCase() === normalized
    || member.name.toLowerCase() === normalized
    || member.agentId.toLowerCase() === normalized
  );
}

function teamRefMatches(team: TeamInfo, ref: string): boolean {
  if (!ref) return false;
  return team.id === ref || team.name === ref || team.key === ref;
}

export const useTeamStore = create<TeamState>((set, get) => ({
  teamModeEnabled: readTeamModeEnabled(),
  activeTeams: [],
  currentTeam: null,
  selectedMemberId: null,

  setTeamModeEnabled: (enabled) => {
    try { localStorage.setItem(TEAM_MODE_KEY, String(enabled)); } catch { /* ignore */ }
    set((state) => ({
      teamModeEnabled: enabled,
      currentTeam: enabled ? state.currentTeam : null,
      selectedMemberId: null,
    }));
  },

  setActiveTeams: (teams) => set({ activeTeams: teams }),

  refreshCurrentTeam: async () => {
    const { currentTeam } = get();
    if (!currentTeam) return;

    let team: TeamInfo | null = null;
    if (currentTeam.sessionId) {
      team = await opencodeTeam.fetchTeamBySession(currentTeam.sessionId);
    }
    if (!team && currentTeam.name) {
      team = await opencodeTeam.fetchTeamByName(currentTeam.name);
    }
    if (!team) return;

    set((state) => mergeTeamIntoLists(team, state));
  },

  setCurrentTeamBySession: async (sessionId) => {
    const leadSessionId = get().currentTeam?.sessionId;
    const isViewingMemberSession =
      !!leadSessionId
      && sessionId !== leadSessionId
      && get().currentTeam?.members.some((m) => m.sessionID === sessionId);
    if (isViewingMemberSession) {
      return;
    }

    const sessionChanged = leadSessionId !== sessionId;
    const applyTeam = (team: TeamInfo | null) => {
      if (team) {
        set((state) => ({
          ...mergeTeamIntoLists(team, state),
          currentTeam: team,
          ...(sessionChanged ? { selectedMemberId: null } : {}),
        }));
        void useSessionStore.getState().fetchSubAgents();
        return;
      }
      const keepTeam =
        get().currentTeam?.members.some((m) => m.sessionID === sessionId) ?? false;
      if (!keepTeam) {
        set({
          currentTeam: null,
          ...(sessionChanged ? { selectedMemberId: null } : {}),
        });
      }
    };

    const cached = getCachedTeamBySession(sessionId);
    if (cached !== undefined) {
      applyTeam(cached);
      void opencodeTeam.fetchTeamBySession(sessionId, { enrich: true, skipCache: true }).then(applyTeam).catch(() => {});
      return;
    }

    try {
      const team = await opencodeTeam.fetchTeamBySession(sessionId);
      applyTeam(team);
    } catch {
      const keepTeam =
        get().currentTeam?.members.some((m) => m.sessionID === sessionId) ?? false;
      if (!keepTeam) {
        set({
          currentTeam: null,
          ...(sessionChanged ? { selectedMemberId: null } : {}),
        });
      }
    }
  },

  setSelectedMemberId: (id) => set({ selectedMemberId: id }),

  clearTeamRunScope: (leadSessionId) => {
    set((state) => {
      if (!state.currentTeam || state.currentTeam.sessionId !== leadSessionId) {
        return { selectedMemberId: null };
      }
      const lead = state.currentTeam.members.find((member) => member.role === 'lead');
      return {
        selectedMemberId: null,
        currentTeam: {
          ...state.currentTeam,
          tasks: [],
          members: lead ? [lead] : state.currentTeam.members.filter((member) => member.role === 'lead'),
        },
      };
    });
  },

  deactivateSessionTeam: (sessionId) => {
    try { localStorage.setItem(TEAM_MODE_KEY, 'false'); } catch { /* ignore */ }
    set((state) => {
      const matches = state.currentTeam?.sessionId === sessionId;
      return {
        teamModeEnabled: false,
        selectedMemberId: null,
        currentTeam: matches ? null : state.currentTeam,
      };
    });
    invalidateTeamBySessionCache();
  },

  handleTeamEvent: (event) => {
    invalidateTeamListCache();
    invalidateTeamBySessionCache();
    const store = useTeamStore.getState();
    const teamName = String(event.data.teamName ?? event.teamId ?? '');

    switch (event.type) {
      case 'team.member.status':
      case 'team.member.execution': {
        const memberKey = String(
          event.data.memberName ?? event.data.memberId ?? event.data.id ?? '',
        );
        const rawStatus = event.data.status;
        const status = opencodeStatusToMemberStatus(rawStatus);
        const currentTask = typeof event.data.currentTask === 'string' ? event.data.currentTask : undefined;
        if (memberKey && status) {
          store.updateMemberStatus(teamName || event.teamId, memberKey, status, currentTask);
        }
        if (status === 'working' && store.currentTeam) {
          const member = store.currentTeam.members.find((m) => memberMatchesKey(m, memberKey));
          if (member?.sessionID) {
            void useMessageStore.getState().loadMessages(member.sessionID);
          }
        }
        const leadSessionId = store.currentTeam?.sessionId;
        const failed =
          rawStatus === 'error' ||
          rawStatus === 'failed' ||
          rawStatus === 'errored';
        if (failed && leadSessionId && memberKey) {
          const errDetail =
            typeof event.data.error === 'string'
              ? event.data.error
              : '后台成员循环异常（常见：InstanceRef not provided）';
          debugError('team.member.failed', errDetail, {
            teamName,
            memberKey,
            rawStatus,
            leadSessionId,
            eventType: event.type,
          });
          useMessageStore.getState().setSessionActivity(leadSessionId, {
            sessionId: leadSessionId,
            kind: 'tool-running',
            label: `成员 ${memberKey} 执行失败`,
            toolName: 'team_spawn',
            detail: errDetail,
          });
        }
        if (
          leadSessionId
          && (rawStatus === 'idle' || rawStatus === 'completed')
        ) {
          void useSessionStore.getState().fetchSubAgents();
          const member = store.currentTeam?.members.find((m) => memberMatchesKey(m, memberKey));
          if (member && member.role !== 'lead') {
            scheduleNotifyLeadOfMemberCompletion(member, leadSessionId);
          }
          scheduleLeadOrchestrationResume(leadSessionId, {
            reason: 'member-completed',
            memberName: memberKey,
          });
        }
        void store.refreshCurrentTeam();
        break;
      }
      case 'team.member.spawned':
      case 'team.created': {
        void store.refreshCurrentTeam();
        void useSessionStore.getState().fetchSubAgents();
        break;
      }
      case 'team.message': {
        const leadSessionId = store.currentTeam?.sessionId;
        const to = String(event.data.to ?? '');
        if (leadSessionId && to === 'lead') {
          void useMessageStore.getState().loadMessages(leadSessionId);
          scheduleLeadOrchestrationResume(leadSessionId, { reason: 'member-message' });
        }
        if (to && to !== 'lead' && store.currentTeam) {
          const target = store.currentTeam.members.find((member) => memberMatchesKey(member, to));
          if (target?.sessionID) {
            void useMessageStore.getState().loadMessages(target.sessionID);
            void useSessionStore.getState().fetchSubAgents();
            scheduleTeamMemberExecution(target, event.data);
          }
        }
        void store.refreshCurrentTeam();
        break;
      }
      case 'team.task.created':
      case 'team.task.updated':
      case 'team.task.claimed': {
        const taskId = String(event.data.taskId ?? event.data.id ?? '');
        if (taskId) {
          store.updateTask(event.teamId, taskId, event.data as Partial<TeamTask>);
        }
        void store.refreshCurrentTeam();
        break;
      }
      case 'team.cleaned': {
        set((state) => ({
          activeTeams: state.activeTeams.filter((t) => !teamMatchesEvent(t, event)),
          currentTeam:
            state.currentTeam && teamMatchesEvent(state.currentTeam, event)
              ? null
              : state.currentTeam,
        }));
        break;
      }
      case 'team.state': {
        set((state) => ({
          activeTeams: state.activeTeams.map((t) => {
            if (!teamMatchesEvent(t, event)) return t;
            return { ...t, updatedAt: event.timestamp };
          }),
          currentTeam:
            state.currentTeam && teamMatchesEvent(state.currentTeam, event)
              ? { ...state.currentTeam, updatedAt: event.timestamp }
              : state.currentTeam,
        }));
        void store.refreshCurrentTeam();
        break;
      }
      default: {
        void store.refreshCurrentTeam();
      }
    }
  },

  updateMemberStatus: (teamId, memberId, status, currentTask) => {
    const patchMembers = (members: TeamMember[]) =>
      members.map((m) =>
        memberMatchesKey(m, memberId)
          ? { ...m, status, currentTask: currentTask ?? m.currentTask }
          : m,
      );

    set((state) => ({
      activeTeams: state.activeTeams.map((t) => {
        if (!teamRefMatches(t, teamId)) return t;
        return {
          ...t,
          members: patchMembers(t.members),
          updatedAt: Date.now(),
        };
      }),
      currentTeam:
        state.currentTeam && teamRefMatches(state.currentTeam, teamId)
          ? {
              ...state.currentTeam,
              members: patchMembers(state.currentTeam.members),
              updatedAt: Date.now(),
            }
          : state.currentTeam,
    }));
  },

  updateTask: (teamId, taskId, updates) => {
    const updater = (t: TeamInfo) => ({
      ...t,
      tasks: t.tasks.map((task) =>
        task.id === taskId ? { ...task, ...updates, updatedAt: Date.now() } : task,
      ),
      updatedAt: Date.now(),
    });

    set((state) => ({
      activeTeams: state.activeTeams.map((t) => (
        t.id === teamId || t.name === teamId ? updater(t) : t
      )),
      currentTeam:
        state.currentTeam && (state.currentTeam.id === teamId || state.currentTeam.name === teamId)
          ? updater(state.currentTeam)
          : state.currentTeam,
    }));
  },

  spawnTeam: async (sessionId) => {
    if (spawnPollInFlight === sessionId) return;
    spawnPollInFlight = sessionId;
    try { localStorage.setItem(TEAM_MODE_KEY, 'true'); } catch { /* ignore */ }
    set({ teamModeEnabled: true, selectedMemberId: null });

    try {
      const immediate = await opencodeTeam.fetchTeamBySession(sessionId);
      if (immediate) {
        set((state) => mergeTeamIntoLists(immediate, state));
        void useSessionStore.getState().fetchSubAgents();
        return;
      }

      void useSessionStore.getState().fetchSubAgents();

      for (const delay of TEAM_POLL_DELAYS_MS) {
        await new Promise((r) => setTimeout(r, delay));
        if (spawnPollInFlight !== sessionId) return;
        const team = await opencodeTeam.fetchTeamBySession(sessionId);
        if (team) {
          set((state) => mergeTeamIntoLists(team, state));
          void useSessionStore.getState().fetchSubAgents();
          return;
        }
        void useSessionStore.getState().fetchSubAgents();
      }
    } finally {
      if (spawnPollInFlight === sessionId) spawnPollInFlight = null;
    }
  },

  shutdownTeam: async (teamId) => {
    await opencodeTeam.shutdownTeam(teamId);
    set((state) => ({
      activeTeams: state.activeTeams.filter((t) => t.id !== teamId),
      currentTeam: state.currentTeam?.id === teamId ? null : state.currentTeam,
    }));
  },

  fetchActiveTeams: async () => {
    try {
      const teams = await opencodeTeam.fetchActiveTeams();
      const activeSessionId = useSessionStore.getState().activeSessionId;
      const matchedTeam = activeSessionId
        ? teams.find((team) => team.sessionId === activeSessionId)
        : undefined;
      set((state) => ({
        activeTeams: teams,
        currentTeam: matchedTeam ?? state.currentTeam,
      }));
      await useSessionStore.getState().fetchSubAgents();
      if (get().currentTeam) {
        await get().refreshCurrentTeam();
      }
    } catch (e) {
      console.error('[TeamStore] fetchActiveTeams failed:', e);
    }
  },

  subscribeToEvents: () => {
    const unregisterCrossProject = registerCrossProjectEventHandler((_eventDirectory, event) => {
      const eventType = typeof event.type === 'string' ? event.type : '';
      if (!eventType.startsWith('team.')) return;
      const props = extractEventPayload(event);
      useTeamStore.getState().handleTeamEvent({
        type: eventType as TeamEvent['type'],
        teamId: String(props.teamName ?? props.teamId ?? props.teamID ?? ''),
        data: props,
        timestamp: typeof event.timestamp === 'number' ? event.timestamp : Date.now(),
      });
    });

    const unregisterTeamEvents = opencodeTeam.onTeamEvent((event) => {
      useTeamStore.getState().handleTeamEvent(event);
    });

    return () => {
      unregisterCrossProject();
      unregisterTeamEvents();
    };
  },
}));

/** Display-ready members: API team + team_spawn teammates only. */
export function getDisplayTeamMembers(
  team: TeamInfo | null,
  subAgents: ReturnType<typeof useSessionStore.getState>['subAgents'],
  parentSessionId?: string,
): TeamMember[] {
  if (!team) return [];
  const sessionRunStatus = useSessionStore.getState().sessionRunStatus;
  return resolveTeamMembersForDisplay(
    team,
    subAgents,
    parentSessionId ?? team.sessionId,
    sessionRunStatus,
  );
}

/** Task-tool child sessions only (not team_spawn teammates). */
export function getDisplayTaskSubAgents(
  team: TeamInfo | null,
  subAgents: ReturnType<typeof useSessionStore.getState>['subAgents'],
  parentSessionId?: string,
): ReturnType<typeof useSessionStore.getState>['subAgents'] {
  const leadSessionId = parentSessionId ?? team?.sessionId;
  const runStartedAt = leadSessionId
    ? useSessionStore.getState().sessionRunStartedAt[leadSessionId]
    : undefined;
  return resolveTaskSubAgentsForDisplay(team, subAgents, leadSessionId, runStartedAt);
}
