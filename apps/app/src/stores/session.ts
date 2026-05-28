import { create } from 'zustand';
import type { Session } from '@opencodex/types';
import type { SubAgentItem } from '../types';
import { opencodeSession } from '../services/opencodeAdapter';
import { on, EventType, extractEventPayload, registerCrossProjectEventHandler } from '../sdk/eventRouter';
import { normalizeDirectoryPath } from '../sdk/eventDirectory';
import { useProjectStore } from './project';
import { useTeamStore } from './team';
import { isTopLevelSession, dedupeSessionsById } from '../utils/sessionHierarchy';
import { resyncRunningProjectSessions } from '../services/projectSessionResync';
import { syncSessionRunStatusToMessageStore } from '../services/sessionRunStatusSync';
import { syncTeamMemberStatusFromRunStatus } from '../services/teamMemberRunStatusSync';
import {
  isLeadSessionAwaitingDelegation,
  resolveLeadSessionIdForWorkerSession,
} from '../services/teamLeadSessionStatus';
import { resetLeadSessionForNewRun, isLeadSessionId } from '../services/sessionRunDisplayLifecycle';
import { useMessageStore } from './message';

export type SubAgent = SubAgentItem;
export type SessionRunStatus = 'idle' | 'running' | 'error';

interface ProjectSessionSnapshot {
  sessions: Session[];
  activeSessionId: string | null;
  selectedSubAgentId: string | null;
  sessionRunStatus: Record<string, SessionRunStatus>;
  subAgents: SubAgent[];
}

interface SessionState {
  currentProjectPath: string;
  byProject: Record<string, ProjectSessionSnapshot>;
  sessions: Session[];
  subAgents: SubAgent[];
  activeSessionId: string | null;
  selectedSubAgentId: string | null;
  sessionRunStatus: Record<string, SessionRunStatus>;
  /** Timestamp (ms) when the lead session last started a new run after idle. */
  sessionRunStartedAt: Record<string, number>;
  /** Sidebar team/plan/task artifacts cleared after a fully completed run. */
  runSidebarCleared: Record<string, boolean>;
  loading: boolean;
  error: string | null;

  setSessions: (sessions: Session[]) => void;
  setSessionRunStatus: (sessionId: string, status: SessionRunStatus) => void;
  setActiveSession: (id: string | null) => void;
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedSubAgentId: (id: string | null) => void;
  switchProjectScope: (projectPath: string) => void;
  refreshProjectScopeFromServer: (projectPath: string) => Promise<void>;
  refreshProjectRunStatus: (projectPath: string) => Promise<void>;
  applyCrossProjectSessionEvent: (
    eventDirectory: string,
    event: Record<string, unknown>,
  ) => void;
  prefetchProjectSessions: (projectPath: string) => Promise<void>;
  fetchSessions: () => Promise<void>;
  fetchSubAgents: (parentSessionId?: string) => Promise<void>;
  clearSubAgentsForLeadSession: (leadSessionId: string) => void;
  markRunSidebarCleared: (leadSessionId: string) => void;
  markRunSidebarVisible: (leadSessionId: string) => void;
  subscribeToEvents: () => () => void;
}

function emptySessionSnapshot(): ProjectSessionSnapshot {
  return {
    sessions: [],
    activeSessionId: null,
    selectedSubAgentId: null,
    sessionRunStatus: {},
    subAgents: [],
  };
}

function snapshotFromSessionState(
  state: Pick<
    SessionState,
    'sessions' | 'activeSessionId' | 'selectedSubAgentId' | 'sessionRunStatus' | 'subAgents'
  >,
): ProjectSessionSnapshot {
  return {
    sessions: state.sessions,
    activeSessionId: state.activeSessionId,
    selectedSubAgentId: state.selectedSubAgentId,
    sessionRunStatus: state.sessionRunStatus,
    subAgents: state.subAgents,
  };
}

function resolveCurrentProjectPath(state: SessionState): string {
  const fromStore = state.currentProjectPath.trim();
  if (fromStore) return fromStore;
  return useProjectStore.getState().currentProject.path?.trim() ?? '';
}

function persistProjectSnapshot(
  byProject: Record<string, ProjectSessionSnapshot>,
  projectPath: string,
  snapshot: ProjectSessionSnapshot,
): Record<string, ProjectSessionSnapshot> {
  const path = projectPath.trim();
  if (!path) return byProject;
  return { ...byProject, [path]: snapshot };
}

function resolveProjectSnapshotKey(
  byProject: Record<string, ProjectSessionSnapshot>,
  directory: string,
): string {
  const normalized = normalizeDirectoryPath(directory);
  if (byProject[normalized]) return normalized;
  for (const key of Object.keys(byProject)) {
    if (normalizeDirectoryPath(key) === normalized) return key;
  }
  for (const project of useProjectStore.getState().projects) {
    const path = project.path.trim();
    if (path && normalizeDirectoryPath(path) === normalized) return path;
  }
  return directory.trim();
}

function mergeSessionRunStatus(
  cached: Record<string, SessionRunStatus>,
  server: Record<string, SessionRunStatus>,
  trustServerIdle = false,
): Record<string, SessionRunStatus> {
  const merged = { ...cached, ...server };
  if (trustServerIdle) return merged;
  for (const [sessionId, cachedStatus] of Object.entries(cached)) {
    if (cachedStatus === 'running' && merged[sessionId] === 'idle') {
      merged[sessionId] = 'running';
    }
  }
  return merged;
}

function parseSessionRunStatusFromEvent(
  event: Record<string, unknown>,
): { sessionId: string; status: SessionRunStatus } | null {
  const props = extractEventPayload(event);
  const sessionId = String(props.sessionID ?? props.sessionId ?? '').trim();
  if (!sessionId) return null;

  const eventType = typeof event.type === 'string' ? event.type : '';
  if (eventType === 'session.idle') {
    return { sessionId, status: 'idle' };
  }
  if (eventType === 'session.error') {
    return { sessionId, status: 'error' };
  }

  const status = props.status as { type?: string } | undefined;
  if (status?.type === 'busy' || status?.type === 'retry') {
    return { sessionId, status: 'running' };
  }
  if (status?.type === 'idle') {
    return { sessionId, status: 'idle' };
  }
  return null;
}

function applyRunStatusToProjectSnapshot(
  state: SessionState,
  projectPath: string,
  sessionId: string,
  status: SessionRunStatus,
): Partial<SessionState> {
  const path = resolveProjectSnapshotKey(state.byProject, projectPath);
  const previous = state.byProject[path] ?? emptySessionSnapshot();
  const sessionRunStatus = { ...previous.sessionRunStatus, [sessionId]: status };
  const byProject = persistProjectSnapshot(state.byProject, path, {
    ...previous,
    sessionRunStatus,
  });
  const isCurrent = resolveCurrentProjectPath(state) === path
    || normalizeDirectoryPath(resolveCurrentProjectPath(state)) === normalizeDirectoryPath(path);

  if (!isCurrent) return { byProject };
  return {
    byProject,
    sessionRunStatus: { ...state.sessionRunStatus, [sessionId]: status },
  };
}

function resolveSubAgentParentSessionId(
  state: Pick<SessionState, 'subAgents' | 'sessions'>,
  sessionID: string,
): string | undefined {
  const fromSubAgent = state.subAgents.find((agent) => agent.sessionId === sessionID);
  if (fromSubAgent?.parentSessionId) return fromSubAgent.parentSessionId;
  const fromSession = state.sessions.find((session) => session.id === sessionID);
  const parentID = fromSession?.parentID?.trim();
  return parentID || undefined;
}

function resolveRunStatusWithTeamLeadGuard(
  sessionId: string,
  status: SessionRunStatus,
  state: Pick<SessionState, 'sessionRunStatus' | 'subAgents'>,
): SessionRunStatus {
  if (status !== 'idle') return status;

  const { teamModeEnabled, currentTeam } = useTeamStore.getState();
  const messageState = useMessageStore.getState();
  if (messageState.isCompactionRunning(sessionId)) {
    return 'running';
  }
  if (
    isLeadSessionAwaitingDelegation(
      sessionId,
      { ...state.sessionRunStatus, [sessionId]: 'idle' },
      messageState.loadingBySession,
      messageState.sessionActivity,
      teamModeEnabled,
      currentTeam,
      state.subAgents,
    )
  ) {
    return 'running';
  }

  return 'idle';
}

function promoteLeadSessionIfWorkerRunning(
  sessionId: string,
  status: SessionRunStatus,
  subAgents: SubAgent[],
): void {
  if (status !== 'running') return;

  const { teamModeEnabled, currentTeam } = useTeamStore.getState();
  const leadId = resolveLeadSessionIdForWorkerSession(
    sessionId,
    teamModeEnabled,
    currentTeam,
    subAgents,
  );
  if (!leadId || leadId === sessionId) return;
  if (useSessionStore.getState().sessionRunStatus[leadId] === 'running') return;
  useSessionStore.getState().setSessionRunStatus(leadId, 'running');
}

function clearSubAgentsForParent(subAgents: SubAgent[], parentSessionId: string): SubAgent[] {
  return subAgents.filter((agent) => agent.parentSessionId !== parentSessionId);
}

function pruneCompletedSubAgentsForParent(subAgents: SubAgent[], parentSessionId: string): SubAgent[] {
  return subAgents.filter(
    (agent) => agent.parentSessionId !== parentSessionId || agent.status !== 'completed',
  );
}

function resolveSelectedSubAgentAfterPrune(
  selectedSubAgentId: string | null,
  subAgents: SubAgent[],
): string | null {
  if (!selectedSubAgentId) return null;
  return subAgents.some((agent) => agent.id === selectedSubAgentId) ? selectedSubAgentId : null;
}

function applyRunLifecycleToSubAgents(
  subAgents: SubAgent[],
  sessionId: string,
  status: SessionRunStatus,
  previousStatus: SessionRunStatus | undefined,
): SubAgent[] {
  let next = subAgents;
  if (
    status === 'running'
    && (previousStatus === 'idle' || previousStatus === 'error' || previousStatus === undefined)
  ) {
    next = clearSubAgentsForParent(next, sessionId);
  }
  return next;
}

function patchSubAgentStatusFromRunStatus(
  subAgents: SubAgent[],
  sessionId: string,
  status: SessionRunStatus,
): SubAgent[] | undefined {
  const index = subAgents.findIndex((agent) => agent.sessionId === sessionId);
  if (index < 0) return undefined;
  const nextStatus: SubAgent['status'] = status === 'running' ? 'running' : 'completed';
  if (subAgents[index].status === nextStatus) return undefined;
  const next = [...subAgents];
  next[index] = { ...next[index], status: nextStatus };
  return next;
}

const initialSessions: Session[] = [];

export const useSessionStore = create<SessionState>((set, get) => ({
  currentProjectPath: '',
  byProject: {},
  sessions: initialSessions,
  subAgents: [],
  activeSessionId: null,
  selectedSubAgentId: null,
  sessionRunStatus: {},
  sessionRunStartedAt: {},
  runSidebarCleared: {},
  loading: false,
  error: null,

  switchProjectScope: (projectPath) => {
    const nextPath = projectPath.trim();
    const state = get();
    const currentPath = resolveCurrentProjectPath(state);

    let byProject = { ...state.byProject };
    if (currentPath && currentPath !== nextPath) {
      byProject = persistProjectSnapshot(
        byProject,
        currentPath,
        snapshotFromSessionState(state),
      );
    }

    const restored = nextPath ? (byProject[nextPath] ?? emptySessionSnapshot()) : emptySessionSnapshot();
    if (nextPath && !byProject[nextPath]) {
      byProject = persistProjectSnapshot(byProject, nextPath, restored);
    }

    set({
      currentProjectPath: nextPath,
      byProject,
      sessions: restored.sessions,
      subAgents: restored.subAgents,
      activeSessionId: restored.activeSessionId,
      selectedSubAgentId: restored.selectedSubAgentId,
      sessionRunStatus: restored.sessionRunStatus,
      sessionRunStartedAt: {},
      runSidebarCleared: {},
      loading: false,
      error: null,
    });
  },

  refreshProjectScopeFromServer: async (projectPath) => {
    const path = projectPath.trim();
    if (!path) return;
    try {
      const [sessions, serverRunStatus] = await Promise.all([
        opencodeSession.fetchSessions(path),
        opencodeSession.fetchSessionRunStatus(path),
      ]);
      const topLevel = dedupeSessionsById((sessions as Session[]).filter(isTopLevelSession));
      set((state) => {
        const snapshotKey = resolveProjectSnapshotKey(state.byProject, path);
        const previous = state.byProject[snapshotKey] ?? emptySessionSnapshot();
        const sessionRunStatus = mergeSessionRunStatus(
          previous.sessionRunStatus,
          serverRunStatus,
          true,
        );
        const snapshot: ProjectSessionSnapshot = {
          ...previous,
          sessions: topLevel,
          sessionRunStatus,
        };
        const byProject = persistProjectSnapshot(state.byProject, snapshotKey, snapshot);
        const isCurrent =
          resolveCurrentProjectPath(state) === snapshotKey
          || normalizeDirectoryPath(resolveCurrentProjectPath(state)) === normalizeDirectoryPath(snapshotKey);

        if (!isCurrent) return { byProject };

        return {
          byProject,
          sessions: topLevel,
          sessionRunStatus,
          loading: false,
          error: null,
        };
      });
      await resyncRunningProjectSessions();
    } catch (e) {
      console.error('[SessionStore] refreshProjectScopeFromServer failed:', e);
    }
  },

  refreshProjectRunStatus: async (projectPath) => {
    const path = projectPath.trim();
    if (!path) return;
    try {
      const serverRunStatus = await opencodeSession.fetchSessionRunStatus(path);
      const previousCurrentRunStatus = get().sessionRunStatus;
      set((state) => {
        const snapshotKey = resolveProjectSnapshotKey(state.byProject, path);
        const previous = state.byProject[snapshotKey] ?? emptySessionSnapshot();
        const sessionRunStatus = mergeSessionRunStatus(
          previous.sessionRunStatus,
          serverRunStatus,
          true,
        );
        const byProject = persistProjectSnapshot(state.byProject, snapshotKey, {
          ...previous,
          sessionRunStatus,
        });
        const isCurrent =
          resolveCurrentProjectPath(state) === snapshotKey
          || normalizeDirectoryPath(resolveCurrentProjectPath(state)) === normalizeDirectoryPath(snapshotKey);

        if (!isCurrent) return { byProject };

        return {
          byProject,
          sessionRunStatus: mergeSessionRunStatus(state.sessionRunStatus, sessionRunStatus, true),
        };
      });

      const isCurrent =
        resolveCurrentProjectPath(get()) === resolveProjectSnapshotKey(get().byProject, path)
        || normalizeDirectoryPath(resolveCurrentProjectPath(get()))
          === normalizeDirectoryPath(resolveProjectSnapshotKey(get().byProject, path));
      if (isCurrent) {
        for (const [sessionId, status] of Object.entries(get().sessionRunStatus)) {
          if (previousCurrentRunStatus[sessionId] !== status) {
            syncSessionRunStatusToMessageStore(sessionId, status);
            syncTeamMemberStatusFromRunStatus(sessionId, status);
          }
        }
      }
    } catch (e) {
      console.error('[SessionStore] refreshProjectRunStatus failed:', e);
    }
  },

  applyCrossProjectSessionEvent: (eventDirectory, event) => {
    const parsed = parseSessionRunStatusFromEvent(event);
    if (!parsed) return;
    set((state) =>
      applyRunStatusToProjectSnapshot(state, eventDirectory, parsed.sessionId, parsed.status),
    );
  },

  setSessions: (sessions) =>
    set({
      sessions: dedupeSessionsById(sessions),
      loading: false,
      error: null,
    }),
  setSessionRunStatus: (sessionId, status) => {
    const previous = get();
    const previousStatus = previous.sessionRunStatus[sessionId];
    const resolvedStatus = resolveRunStatusWithTeamLeadGuard(sessionId, status, previous);

    set((state) => {
      const previousStatus = state.sessionRunStatus[sessionId];
      let sessionRunStartedAt = state.sessionRunStartedAt;
      let subAgents = applyRunLifecycleToSubAgents(
        state.subAgents,
        sessionId,
        resolvedStatus,
        previousStatus,
      );

      if (
        resolvedStatus === 'running'
        && (previousStatus === 'idle' || previousStatus === 'error' || previousStatus === undefined)
      ) {
        sessionRunStartedAt = { ...sessionRunStartedAt, [sessionId]: Date.now() };
      } else if (resolvedStatus === 'idle' || resolvedStatus === 'error') {
        const { [sessionId]: _removed, ...rest } = sessionRunStartedAt;
        sessionRunStartedAt = rest;
      }

      const sessionRunStatus = { ...state.sessionRunStatus, [sessionId]: resolvedStatus };
      const patchedSubAgents = patchSubAgentStatusFromRunStatus(subAgents, sessionId, resolvedStatus);
      subAgents = patchedSubAgents ?? subAgents;
      const selectedSubAgentId = resolveSelectedSubAgentAfterPrune(state.selectedSubAgentId, subAgents);
      const currentPath = resolveCurrentProjectPath(state);
      if (!currentPath) {
        return {
          sessionRunStatus,
          sessionRunStartedAt,
          subAgents,
          selectedSubAgentId,
        };
      }
      const previous = state.byProject[currentPath] ?? emptySessionSnapshot();
      return {
        sessionRunStatus,
        sessionRunStartedAt,
        subAgents,
        selectedSubAgentId,
        byProject: persistProjectSnapshot(state.byProject, currentPath, {
          ...previous,
          sessionRunStatus,
          subAgents,
          selectedSubAgentId,
        }),
      };
    });
    syncSessionRunStatusToMessageStore(sessionId, resolvedStatus);
    syncTeamMemberStatusFromRunStatus(sessionId, resolvedStatus);
    promoteLeadSessionIfWorkerRunning(sessionId, resolvedStatus, get().subAgents);
    if (
      resolvedStatus === 'running'
      && (previousStatus === 'idle' || previousStatus === 'error' || previousStatus === undefined)
      && isLeadSessionId(sessionId)
    ) {
      resetLeadSessionForNewRun(sessionId);
    }
  },
  setActiveSession: (id) => {
    useTeamStore.getState().setSelectedMemberId(null);
    set((state) => {
      const next = { activeSessionId: id, selectedSubAgentId: null };
      const currentPath = resolveCurrentProjectPath(state);
      if (!currentPath) return next;
      const previous = state.byProject[currentPath] ?? emptySessionSnapshot();
      return {
        ...next,
        byProject: persistProjectSnapshot(state.byProject, currentPath, {
          ...previous,
          activeSessionId: id,
          selectedSubAgentId: null,
        }),
      };
    });
  },
  addSession: (session) =>
    set((state) => {
      if (state.sessions.some((s) => s.id === session.id)) return state;
      const sessions = dedupeSessionsById([session, ...state.sessions]);
      const currentPath = resolveCurrentProjectPath(state);
      if (!currentPath) return { sessions };
      const previous = state.byProject[currentPath] ?? emptySessionSnapshot();
      return {
        sessions,
        byProject: persistProjectSnapshot(state.byProject, currentPath, {
          ...previous,
          ...snapshotFromSessionState({ ...state, sessions }),
        }),
      };
    }),
  removeSession: (id) =>
    set((state) => {
      const { [id]: _removed, ...sessionRunStatus } = state.sessionRunStatus;
      const sessions = state.sessions.filter((s) => s.id !== id);
      const subAgents = state.subAgents.filter((a) => a.parentSessionId !== id && a.id !== id);
      const activeSessionId = state.activeSessionId === id ? null : state.activeSessionId;
      const selectedSubAgentId =
        state.selectedSubAgentId === id ||
        state.subAgents.some(
          (a) => a.id === state.selectedSubAgentId && a.parentSessionId === id,
        )
          ? null
          : state.selectedSubAgentId;
      const next = {
        sessions,
        subAgents,
        sessionRunStatus,
        activeSessionId,
        selectedSubAgentId,
      };
      const currentPath = resolveCurrentProjectPath(state);
      if (!currentPath) return next;
      const previous = state.byProject[currentPath] ?? emptySessionSnapshot();
      return {
        ...next,
        byProject: persistProjectSnapshot(state.byProject, currentPath, {
          ...previous,
          sessions,
          sessionRunStatus,
          activeSessionId,
          selectedSubAgentId,
          subAgents,
        }),
      };
    }),
  updateSession: (id, updates) =>
    set((state) => {
      const sessions = state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s));
      const currentPath = resolveCurrentProjectPath(state);
      if (!currentPath) return { sessions };
      const previous = state.byProject[currentPath] ?? emptySessionSnapshot();
      return {
        sessions,
        byProject: persistProjectSnapshot(state.byProject, currentPath, {
          ...previous,
          sessions,
        }),
      };
    }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSelectedSubAgentId: (id) => set({ selectedSubAgentId: id }),

  fetchSessions: async () => {
    set({ loading: true });
    try {
      const directory = useProjectStore.getState().currentProject.path || undefined;
      const [sessions, serverRunStatus] = await Promise.all([
        opencodeSession.fetchSessions(directory),
        opencodeSession.fetchSessionRunStatus(directory),
      ]);
      const topLevel = dedupeSessionsById((sessions as Session[]).filter(isTopLevelSession));
      set((state) => {
        const currentPath = resolveCurrentProjectPath(state);
        const sessionRunStatus = mergeSessionRunStatus(state.sessionRunStatus, serverRunStatus, true);
        const nextState = {
          sessions: topLevel,
          sessionRunStatus,
          loading: false,
          error: null,
        };
        if (!currentPath) return nextState;
        const previous = state.byProject[currentPath] ?? emptySessionSnapshot();
        return {
          ...nextState,
          byProject: persistProjectSnapshot(state.byProject, currentPath, {
            ...previous,
            sessions: topLevel,
            sessionRunStatus,
            activeSessionId: state.activeSessionId,
            selectedSubAgentId: state.selectedSubAgentId,
            subAgents: state.subAgents,
          }),
        };
      });
      await resyncRunningProjectSessions();
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  prefetchProjectSessions: async (projectPath) => {
    const path = projectPath.trim();
    if (!path) return;
    try {
      const [sessions, serverRunStatus] = await Promise.all([
        opencodeSession.fetchSessions(path),
        opencodeSession.fetchSessionRunStatus(path),
      ]);
      const topLevel = dedupeSessionsById((sessions as Session[]).filter(isTopLevelSession));
      set((state) => {
        const previous = state.byProject[path] ?? emptySessionSnapshot();
        return {
          byProject: persistProjectSnapshot(state.byProject, path, {
            ...previous,
            sessions: topLevel,
            sessionRunStatus: mergeSessionRunStatus(previous.sessionRunStatus, serverRunStatus, true),
          }),
        };
      });
    } catch (e) {
      console.error('[SessionStore] prefetchProjectSessions failed:', e);
    }
  },

  fetchSubAgents: async (parentOverride?: string) => {
    const parentSessionId = parentOverride ?? get().activeSessionId;
    if (!parentSessionId) {
      set({ subAgents: [] });
      return;
    }
    try {
      const directory = useProjectStore.getState().currentProject.path || undefined;
      const fresh = await opencodeSession.fetchSubAgents(directory, [parentSessionId]);
      const runStartedAt = get().sessionRunStartedAt[parentSessionId];
      const runStatus = get().sessionRunStatus[parentSessionId];
      const sidebarHidden =
        !!get().runSidebarCleared[parentSessionId]
        && (runStatus === 'idle' || runStatus === 'error');
      if (sidebarHidden) return;
      const filtered = runStartedAt
        ? fresh.filter((agent) => {
            if (agent.status !== 'completed') return true;
            return agent.createdAt != null && agent.createdAt >= runStartedAt;
          })
        : fresh;
      set((state) => ({
        subAgents: [
          ...state.subAgents.filter((a) => a.parentSessionId !== parentSessionId),
          ...filtered,
        ],
      }));
    } catch (e) {
      console.error('[SessionStore] fetchSubAgents failed:', e);
    }
  },

  clearSubAgentsForLeadSession: (leadSessionId) => {
    if (!leadSessionId) return;
    set((state) => {
      const subAgents = clearSubAgentsForParent(state.subAgents, leadSessionId);
      const selectedSubAgentId = resolveSelectedSubAgentAfterPrune(state.selectedSubAgentId, subAgents);
      const currentPath = resolveCurrentProjectPath(state);
      if (!currentPath) {
        return { subAgents, selectedSubAgentId };
      }
      const previous = state.byProject[currentPath] ?? emptySessionSnapshot();
      return {
        subAgents,
        selectedSubAgentId,
        byProject: persistProjectSnapshot(state.byProject, currentPath, {
          ...previous,
          subAgents,
          selectedSubAgentId,
        }),
      };
    });
  },

  markRunSidebarCleared: (leadSessionId) => {
    if (!leadSessionId) return;
    set((state) => ({
      runSidebarCleared: { ...state.runSidebarCleared, [leadSessionId]: true },
    }));
  },

  markRunSidebarVisible: (leadSessionId) => {
    if (!leadSessionId) return;
    set((state) => {
      if (!state.runSidebarCleared[leadSessionId]) return state;
      const { [leadSessionId]: _removed, ...runSidebarCleared } = state.runSidebarCleared;
      return { runSidebarCleared };
    });
  },

  subscribeToEvents: () => {
    const unregisterCrossProject = registerCrossProjectEventHandler((eventDirectory, event) => {
      get().applyCrossProjectSessionEvent(eventDirectory, event);
    });

    const unsubscribers: Array<() => void> = [];

    unsubscribers.push(
      on(EventType.SESSION_CREATED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const info = (props.info ?? props) as Record<string, unknown> | undefined;
        if (info?.id) {
          const session = { ...info } as unknown as Session;
          const parentID = session.parentID?.trim();
          if (parentID) {
            void get().fetchSubAgents(parentID);
            return;
          }
          const exists = get().sessions.some((s) => s.id === info.id);
          if (!exists && isTopLevelSession(session)) {
            set((state) => {
              const sessions = dedupeSessionsById([session, ...state.sessions]);
              const currentPath = resolveCurrentProjectPath(state);
              if (!currentPath) return { sessions };
              const previous = state.byProject[currentPath] ?? emptySessionSnapshot();
              return {
                sessions,
                byProject: persistProjectSnapshot(state.byProject, currentPath, {
                  ...previous,
                  sessions,
                }),
              };
            });
          }
          void get().fetchSubAgents();
        }
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_UPDATED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const info = (props.info ?? props) as Record<string, unknown> | undefined;
        if (info?.id) {
          const session = { ...info } as unknown as Session;
          const parentID = session.parentID?.trim();
          if (parentID) {
            void get().fetchSubAgents(parentID);
            set((state) => ({
              sessions: state.sessions.filter((s) => s.id !== session.id),
            }));
            return;
          }
          if (!isTopLevelSession(session)) return;
          set((state) => {
            const exists = state.sessions.some((s) => s.id === session.id);
            const sessions = exists
              ? state.sessions.map((s) => (s.id === session.id ? { ...s, ...session } : s))
              : dedupeSessionsById([session, ...state.sessions]);
            const currentPath = resolveCurrentProjectPath(state);
            if (!currentPath) return { sessions };
            const previous = state.byProject[currentPath] ?? emptySessionSnapshot();
            return {
              sessions,
              byProject: persistProjectSnapshot(state.byProject, currentPath, {
                ...previous,
                sessions,
              }),
            };
          });
        }
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_DELETED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = props.sessionID as string | undefined;
        const info = props.info as Record<string, unknown> | undefined;
        const id = sessionID ?? info?.id;
        if (id) {
          get().removeSession(id as string);
        }
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_STATUS, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = String(props.sessionID ?? props.sessionId ?? '');
        const status = props.status as { type?: string } | undefined;
        if (!sessionID || !status?.type) return;
        if (status.type === 'busy' || status.type === 'retry') {
          get().setSessionRunStatus(sessionID, 'running');
        } else if (status.type === 'idle') {
          if (useMessageStore.getState().isCompactionRunning(sessionID)) return;
          get().setSessionRunStatus(sessionID, 'idle');
        }
        const parentID = resolveSubAgentParentSessionId(get(), sessionID);
        if (parentID) void get().fetchSubAgents(parentID);
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_IDLE, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = String(props.sessionID ?? props.sessionId ?? '');
        if (sessionID) {
          if (useMessageStore.getState().isCompactionRunning(sessionID)) return;
          get().setSessionRunStatus(sessionID, 'idle');
        }
        const parentID = sessionID ? resolveSubAgentParentSessionId(get(), sessionID) : undefined;
        if (parentID) {
          void get().fetchSubAgents(parentID);
        } else {
          void get().fetchSubAgents();
        }
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_ERROR, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = String(props.sessionID ?? props.sessionId ?? '');
        if (!sessionID) return;
        get().setSessionRunStatus(sessionID, 'error');
        const parentID = resolveSubAgentParentSessionId(get(), sessionID);
        if (parentID) void get().fetchSubAgents(parentID);
      }),
    );

    return () => {
      unregisterCrossProject();
      unsubscribers.forEach((unsub) => unsub());
    };
  },
}));
