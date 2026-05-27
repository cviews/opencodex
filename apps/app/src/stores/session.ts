import { create } from 'zustand';
import type { Session } from '@zmn-codex/types';
import type { SubAgentItem } from '../types';
import { opencodeSession } from '../services/opencodeAdapter';
import { on, EventType, extractEventPayload } from '../sdk/eventRouter';
import { useProjectStore } from './project';
import { useTeamStore } from './team';
import { isTopLevelSession, dedupeSessionsById } from '../utils/sessionHierarchy';

export type SubAgent = SubAgentItem;
export type SessionRunStatus = 'idle' | 'running' | 'error';

interface SessionState {
  sessions: Session[];
  subAgents: SubAgent[];
  activeSessionId: string | null;
  selectedSubAgentId: string | null;
  sessionRunStatus: Record<string, SessionRunStatus>;
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
  fetchSessions: () => Promise<void>;
  fetchSubAgents: (parentSessionId?: string) => Promise<void>;
  subscribeToEvents: () => () => void;
}

const initialSessions: Session[] = [];

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: initialSessions,
  subAgents: [],
  activeSessionId: null,
  selectedSubAgentId: null,
  sessionRunStatus: {},
  loading: false,
  error: null,

  setSessions: (sessions) =>
    set({
      sessions: dedupeSessionsById(sessions),
      loading: false,
      error: null,
    }),
  setSessionRunStatus: (sessionId, status) =>
    set((state) => ({
      sessionRunStatus: { ...state.sessionRunStatus, [sessionId]: status },
    })),
  setActiveSession: (id) => {
    useTeamStore.getState().setSelectedMemberId(null);
    set({ activeSessionId: id, selectedSubAgentId: null });
  },
  addSession: (session) =>
    set((state) => {
      if (state.sessions.some((s) => s.id === session.id)) return state;
      return { sessions: [session, ...state.sessions] };
    }),
  removeSession: (id) =>
    set((state) => {
      const { [id]: _removed, ...sessionRunStatus } = state.sessionRunStatus;
      return {
      sessions: state.sessions.filter((s) => s.id !== id),
      subAgents: state.subAgents.filter((a) => a.parentSessionId !== id && a.id !== id),
      sessionRunStatus,
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      selectedSubAgentId:
        state.selectedSubAgentId === id ||
        state.subAgents.some(
          (a) => a.id === state.selectedSubAgentId && a.parentSessionId === id,
        )
          ? null
          : state.selectedSubAgentId,
    };
    }),
  updateSession: (id, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSelectedSubAgentId: (id) => set({ selectedSubAgentId: id }),

  fetchSessions: async () => {
    set({ loading: true });
    try {
      const directory = useProjectStore.getState().currentProject.path || undefined;
      const sessions = await opencodeSession.fetchSessions(directory);
      set({
        sessions: dedupeSessionsById((sessions as Session[]).filter(isTopLevelSession)),
        loading: false,
        error: null,
      });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
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
      set((state) => ({
        subAgents: [
          ...state.subAgents.filter((a) => a.parentSessionId !== parentSessionId),
          ...fresh,
        ],
      }));
    } catch (e) {
      console.error('[SessionStore] fetchSubAgents failed:', e);
    }
  },

  subscribeToEvents: () => {
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
            set((state) => ({
              sessions: dedupeSessionsById([session, ...state.sessions]),
            }));
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
            if (!exists) {
              return { sessions: dedupeSessionsById([session, ...state.sessions]) };
            }
            return {
              sessions: state.sessions.map((s) => (s.id === session.id ? { ...s, ...session } : s)),
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
          get().setSessionRunStatus(sessionID, 'idle');
        }
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_IDLE, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = String(props.sessionID ?? props.sessionId ?? '');
        if (sessionID) get().setSessionRunStatus(sessionID, 'idle');
        get().fetchSessions();
        get().fetchSubAgents();
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_ERROR, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = String(props.sessionID ?? props.sessionId ?? '');
        if (!sessionID) return;
        const known =
          get().sessions.some((s) => s.id === sessionID) ||
          get().subAgents.some((a) => a.id === sessionID || a.sessionID === sessionID);
        if (known) get().setSessionRunStatus(sessionID, 'error');
      }),
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  },
}));
