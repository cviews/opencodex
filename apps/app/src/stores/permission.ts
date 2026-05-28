import { create } from 'zustand';
import type { PendingPermission, PendingQuestion } from '../types';
import { opencodePermission, opencodeQuestion } from '../services/opencodeAdapter';
import { normalizePermissionRequest, normalizeQuestionRequest, type PermissionMode } from '../services/permissionNormalize';
import { on, EventType, extractEventPayload, registerCrossProjectEventHandler } from '../sdk/eventRouter';
import { resolveProjectDirectoryKey } from '../sdk/eventDirectory';
import {
  emptyDirectoryPendingSnapshot,
  removeDirectoryPermission,
  removeDirectoryQuestion,
  upsertDirectoryPermission,
  upsertDirectoryQuestion,
  type DirectoryPendingSnapshot,
} from '../services/crossProjectPending';
import { useProjectStore } from './project';
import { useMessageStore, type SessionActivity } from './message';
import { useTeamStore } from './team';
import { pipelineMark, debugWarn } from '../utils/debugLog';
import { questionLog, questionWarn } from '../utils/questionDebug';
import { setEventInstanceDirectory } from '../sdk/eventDirectory';

const RECOVER_POLL_MS = 1000;
const RECOVER_INITIAL_DELAY_MS = 5000;
const RECOVER_MAX_MS = 180_000;
const recoveringQuestionSessions = new Set<string>();

export function clearQuestionRecoverSessions(): void {
  recoveringQuestionSessions.clear();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergePendingQuestions(
  existing: PendingQuestion[],
  incoming: PendingQuestion[],
): PendingQuestion[] {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}

function hasPendingQuestionForSession(
  questions: PendingQuestion[],
  sessionID: string,
): boolean {
  return questions.some((q) => q.sessionId === sessionID);
}

/** Official CLI recoverQuestion: hydrate when tool is running but SSE/list lagged. */
export async function recoverPendingQuestionsForSession(
  sessionID: string,
  reason: string,
): Promise<void> {
  if (recoveringQuestionSessions.has(sessionID)) return;
  recoveringQuestionSessions.add(sessionID);
  try {
    questionLog('recover.start', {
      sessionID: sessionID.slice(0, 16),
      reason,
      initialDelayMs: RECOVER_INITIAL_DELAY_MS,
      maxMs: RECOVER_MAX_MS,
    });
    await sleep(RECOVER_INITIAL_DELAY_MS);
    const deadline = Date.now() + RECOVER_MAX_MS;
    let attempt = 0;
    while (Date.now() < deadline) {
      attempt += 1;
      await usePermissionStore.getState().fetchPendingQuestions({ merge: true, quiet: true });
      const pending = usePermissionStore.getState().pendingQuestions;
      if (hasPendingQuestionForSession(pending, sessionID) || pending.length > 0) {
        questionLog('recover.hit', {
          sessionID: sessionID.slice(0, 16),
          attempt,
          count: pending.length,
        });
        return;
      }
      await sleep(RECOVER_POLL_MS);
    }
    questionWarn('recover.timeout', {
      sessionID: sessionID.slice(0, 16),
      reason,
      attempts: attempt,
      maxMs: RECOVER_MAX_MS,
    });
  } finally {
    recoveringQuestionSessions.delete(sessionID);
  }
}

/** Last directory used for permission API (from GET /path, aligned with OpenCode instance). */
let cachedInstanceDirectory: string | undefined;

async function resolveApiDirectory(): Promise<string | undefined> {
  const project = useProjectStore.getState().currentProject.path?.trim();
  const fromServer = await opencodePermission.fetchInstanceDirectory(project);
  const directory =
    (project && project !== '/' ? project : undefined)
    || (fromServer && fromServer !== '/' ? fromServer : undefined);
  cachedInstanceDirectory = directory;
  setEventInstanceDirectory(directory);
  return cachedInstanceDirectory;
}

function getDirectory(): string | undefined {
  return cachedInstanceDirectory ?? (useProjectStore.getState().currentProject.path?.trim() || undefined);
}

/** Team coordination tools — blocking these breaks team_message / tasks loops. */
const TEAM_COORDINATION_TOOLS = new Set([
  'team_message',
  'team_broadcast',
  'team_list',
  'team_tasks',
  'team_claim',
  'team_approve_plan',
]);

function isReadOnlyExternalAccess(permission: PendingPermission): boolean {
  const filepath = permission.metadata?.filepath ?? permission.metadata?.filePath;
  return typeof filepath === 'string' && filepath.trim().length > 0;
}

function shouldAutoApprove(mode: PermissionMode, permission: PendingPermission): boolean {
  if (mode === 'full-access') return true;
  if (mode === 'auto-review' && permission.kind === 'external_directory') return true;
  if (permission.kind === 'external_directory' && isReadOnlyExternalAccess(permission)) {
    return true;
  }
  if (permission.kind && TEAM_COORDINATION_TOOLS.has(permission.kind) && useTeamStore.getState().teamModeEnabled) {
    return true;
  }
  return false;
}

function permissionIdFromReply(props: Record<string, unknown>): string | undefined {
  if (typeof props.requestID === 'string') return props.requestID;
  if (typeof props.permissionID === 'string') return props.permissionID;
  return undefined;
}

interface PermissionState {
  pendingPermissions: PendingPermission[];
  pendingQuestions: PendingQuestion[];
  pendingByDirectory: Record<string, DirectoryPendingSnapshot>;
  permissionMode: PermissionMode;
  loading: boolean;
  error: string | null;
  setPermissionMode: (mode: PermissionMode) => void;
  approvePermission: (id: string, mode?: 'once' | 'session') => void;
  denyPermission: (id: string) => void;
  answerQuestion: (id: string, answers: string[]) => void;
  rejectQuestion: (id: string) => void;
  addPermission: (permission: PendingPermission) => void;
  addQuestion: (question: PendingQuestion) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchPendingPermissions: () => Promise<void>;
  fetchPendingQuestions: (options?: { merge?: boolean; quiet?: boolean }) => Promise<void>;
  fetchPendingForDirectory: (projectPath: string) => Promise<void>;
  fetchPermissionMode: () => Promise<void>;
  applyCrossProjectPermissionEvent: (
    eventDirectory: string,
    event: Record<string, unknown>,
  ) => void;
  subscribeToEvents: () => () => void;
}

function permissionActivityForSession(sessionID: string, perm: PendingPermission): SessionActivity {
  const teamLabels: Record<string, string> = {
    team_spawn: '需要批准：创建团队成员',
    team_create: '需要批准：创建团队',
    team_message: '需要批准：发送团队消息',
    team_broadcast: '需要批准：广播团队消息',
  };
  return {
    sessionId: sessionID,
    kind: 'permission',
    label: teamLabels[perm.kind] ?? `需要批准：${perm.title}`,
    toolName: perm.kind,
    detail: perm.message,
  };
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  pendingPermissions: [],
  pendingQuestions: [],
  pendingByDirectory: {},
  permissionMode: 'default',
  loading: false,
  error: null,

  setPermissionMode: (mode) => {
    set({ permissionMode: mode });
    void (async () => {
      const directory = await resolveApiDirectory();
      await opencodePermission.setPermissionMode(mode, directory);
      await get().fetchPendingPermissions();
    })();
  },
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  approvePermission: (id, mode = 'once') =>
    set((state) => {
      void opencodePermission.approvePermission(id, mode, getDirectory());
      return { pendingPermissions: state.pendingPermissions.filter((p) => p.id !== id) };
    }),
  denyPermission: (id) =>
    set((state) => {
      void opencodePermission.denyPermission(id, getDirectory());
      return { pendingPermissions: state.pendingPermissions.filter((p) => p.id !== id) };
    }),
  answerQuestion: (id, answers) =>
    set((state) => {
      const question = state.pendingQuestions.find((q) => q.id === id);
      void opencodeQuestion.answerQuestion(id, [answers], getDirectory());
      if (question?.sessionId) {
        const activity = useMessageStore.getState().sessionActivity[question.sessionId];
        if (activity?.kind === 'question') {
          useMessageStore.getState().setSessionActivity(question.sessionId, null);
        }
      }
      return { pendingQuestions: state.pendingQuestions.filter((q) => q.id !== id) };
    }),
  rejectQuestion: (id) =>
    set((state) => {
      const question = state.pendingQuestions.find((q) => q.id === id);
      void opencodeQuestion.rejectQuestion(id, getDirectory());
      if (question?.sessionId) {
        const activity = useMessageStore.getState().sessionActivity[question.sessionId];
        if (activity?.kind === 'question') {
          useMessageStore.getState().setSessionActivity(question.sessionId, null);
        }
      }
      return { pendingQuestions: state.pendingQuestions.filter((q) => q.id !== id) };
    }),
  addPermission: (permission) =>
    set((state) => {
      if (shouldAutoApprove(state.permissionMode, permission)) {
        void opencodePermission.approvePermission(permission.id, 'once', getDirectory());
        return state;
      }
      if (permission.kind === 'external_directory') {
        debugWarn('permission.pending.external_directory', permission.message || permission.scope || permission.id, {
          sessionId: permission.sessionId,
          filepath: permission.metadata?.filepath ?? permission.metadata?.filePath,
        });
      }
      if (state.pendingPermissions.some((item) => item.id === permission.id)) {
        return state;
      }
      return {
        pendingPermissions: [...state.pendingPermissions, permission],
      };
    }),
  addQuestion: (question) =>
    set((state) => {
      if (state.pendingQuestions.some((item) => item.id === question.id)) {
        questionLog('store.add.duplicate', { id: question.id.slice(0, 12) });
        return state;
      }
      questionLog('store.add', {
        id: question.id.slice(0, 12),
        sessionId: question.sessionId?.slice(0, 12),
        title: question.title,
        optionCount: question.options.length,
        pendingTotal: state.pendingQuestions.length + 1,
      });
      return {
        pendingQuestions: [...state.pendingQuestions, question],
      };
    }),

  fetchPendingPermissions: async () => {
    set({ loading: true, error: null });
    try {
      const directory = await resolveApiDirectory();
      const permissions = await opencodePermission.fetchPendingPermissions(directory);
      const mode = get().permissionMode;
      const pending: PendingPermission[] = [];
      await Promise.all(
        permissions.map(async (permission) => {
          if (shouldAutoApprove(mode, permission)) {
            await opencodePermission.approvePermission(permission.id, 'once', directory);
            return;
          }
          pending.push(permission);
        }),
      );
      set({ pendingPermissions: pending, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  fetchPendingQuestions: async (options) => {
    if (!options?.quiet) {
      questionLog('store.fetch.start', { merge: options?.merge ?? false });
    }
    try {
      const directory = await resolveApiDirectory();
      if (!options?.quiet) {
        questionLog('store.fetch.directory', { directory: directory ?? '(none)' });
      }
      const questions = await opencodeQuestion.fetchPendingQuestions(directory, {
        quiet: options?.quiet,
      });
      if (!options?.quiet || questions.length > 0) {
        questionLog('store.fetch.done', {
          count: questions.length,
          ids: questions.map((q) => q.id.slice(0, 12)),
        });
      }
      set((state) => ({
        pendingQuestions: options?.merge
          ? mergePendingQuestions(state.pendingQuestions, questions)
          : questions,
      }));
    } catch (e) {
      questionWarn('store.fetch.error', {
        error: e instanceof Error ? e.message : String(e),
      });
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  fetchPermissionMode: async () => {
    try {
      const directory = await resolveApiDirectory();
      const { mode, permission } = await opencodePermission.fetchPermissionConfig(directory);
      set({ permissionMode: mode });
      // Desktop「默认」= permission: ask；未配置时 OpenCode Agent 内置为 *:allow，不会弹审批条。
      if (mode === 'default' && permission === undefined) {
        await opencodePermission.setPermissionMode('default', directory);
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  fetchPendingForDirectory: async (projectPath) => {
    const path = projectPath.trim();
    if (!path) return;
    try {
      const [permissions, questions] = await Promise.all([
        opencodePermission.fetchPendingPermissions(path),
        opencodeQuestion.fetchPendingQuestions(path, { quiet: true }),
      ]);
      const key = resolveProjectDirectoryKey(path, get().pendingByDirectory);
      set((state) => ({
        pendingByDirectory: {
          ...state.pendingByDirectory,
          [key]: { permissions, questions },
        },
      }));
    } catch (e) {
      questionWarn('store.fetch.directory.error', {
        directory: path,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  applyCrossProjectPermissionEvent: (eventDirectory, event) => {
    const eventType = typeof event.type === 'string' ? event.type : '';
    const props = extractEventPayload(event);
    const key = resolveProjectDirectoryKey(eventDirectory, get().pendingByDirectory);

    if (eventType === EventType.PERMISSION_ASKED || eventType === EventType.PERMISSION_UPDATED) {
      const perm = normalizePermissionRequest(props);
      if (!perm?.id) return;
      set((state) => {
        const previous = state.pendingByDirectory[key] ?? emptyDirectoryPendingSnapshot();
        return {
          pendingByDirectory: {
            ...state.pendingByDirectory,
            [key]: upsertDirectoryPermission(previous, perm),
          },
        };
      });
      const sessionID = perm.sessionId ?? String(props.sessionID ?? props.sessionId ?? '');
      if (sessionID) {
        useMessageStore.getState().setSessionActivity(sessionID, permissionActivityForSession(sessionID, perm));
      }
      return;
    }

    if (eventType === EventType.PERMISSION_REPLIED) {
      const requestID = permissionIdFromReply(props);
      if (!requestID) return;
      set((state) => {
        const previous = state.pendingByDirectory[key] ?? emptyDirectoryPendingSnapshot();
        return {
          pendingByDirectory: {
            ...state.pendingByDirectory,
            [key]: removeDirectoryPermission(previous, requestID),
          },
        };
      });
      const sessionID = String(props.sessionID ?? props.sessionId ?? '');
      if (sessionID) {
        const activity = useMessageStore.getState().sessionActivity[sessionID];
        if (activity?.kind === 'permission') {
          useMessageStore.getState().setSessionActivity(sessionID, null);
        }
      }
      return;
    }

    if (eventType === EventType.QUESTION_ASKED) {
      const question = normalizeQuestionRequest(props);
      if (!question?.id) return;
      set((state) => {
        const previous = state.pendingByDirectory[key] ?? emptyDirectoryPendingSnapshot();
        return {
          pendingByDirectory: {
            ...state.pendingByDirectory,
            [key]: upsertDirectoryQuestion(previous, question),
          },
        };
      });
      const sessionID = question.sessionId ?? String(props.sessionID ?? props.sessionId ?? '');
      if (sessionID) {
        useMessageStore.getState().setSessionActivity(sessionID, {
          sessionId: sessionID,
          kind: 'question',
          label: question.title,
          detail: question.options[0]?.label ?? undefined,
        });
      }
      return;
    }

    if (eventType === EventType.QUESTION_REPLIED || eventType === EventType.QUESTION_REJECTED) {
      const requestID = typeof props.requestID === 'string' ? props.requestID : undefined;
      if (!requestID) return;
      set((state) => {
        const previous = state.pendingByDirectory[key] ?? emptyDirectoryPendingSnapshot();
        return {
          pendingByDirectory: {
            ...state.pendingByDirectory,
            [key]: removeDirectoryQuestion(previous, requestID),
          },
        };
      });
      const sessionID = String(props.sessionID ?? props.sessionId ?? '');
      if (sessionID) {
        const activity = useMessageStore.getState().sessionActivity[sessionID];
        if (activity?.kind === 'question') {
          useMessageStore.getState().setSessionActivity(sessionID, null);
        }
      }
    }
  },

  subscribeToEvents: () => {
    const unregisterCrossProject = registerCrossProjectEventHandler((eventDirectory, event) => {
      get().applyCrossProjectPermissionEvent(eventDirectory, event);
    });

    const unsubscribers: Array<() => void> = [];

    const handlePermissionAsked = (event: Record<string, unknown>) => {
      const props = extractEventPayload(event);
      const perm = normalizePermissionRequest(props);
      if (!perm?.id) {
        debugWarn('permission.sse.unrecognized', JSON.stringify(props).slice(0, 200));
        return;
      }

      const sessionID = perm.sessionId ?? String(props.sessionID ?? props.sessionId ?? '');
      if (sessionID) {
        pipelineMark(sessionID, 'permission:asked', {
          kind: perm.kind,
          id: perm.id.slice(0, 16),
        });
      }
      get().addPermission(perm);
      if (sessionID) {
        useMessageStore.getState().setSessionActivity(sessionID, permissionActivityForSession(sessionID, perm));
      }
    };

    const handleQuestionAsked = (event: Record<string, unknown>) => {
      const eventType = typeof event.type === 'string' ? event.type : '(unknown)';
      const props = extractEventPayload(event);
      questionLog('sse.received', {
        eventType,
        keys: Object.keys(props),
        preview: JSON.stringify(props).slice(0, 500),
      });
      const question = normalizeQuestionRequest(props);
      if (!question?.id) {
        debugWarn('question.sse.unrecognized', JSON.stringify(props).slice(0, 200));
        return;
      }

      questionLog('sse.normalized', {
        id: question.id.slice(0, 12),
        sessionId: question.sessionId?.slice(0, 12),
        title: question.title,
        optionCount: question.options.length,
      });
      get().addQuestion(question);
      const sessionID = question.sessionId ?? String(props.sessionID ?? props.sessionId ?? '');
      if (sessionID) {
        useMessageStore.getState().setSessionActivity(sessionID, {
          sessionId: sessionID,
          kind: 'question',
          label: question.title,
          detail: question.options[0]?.label ?? undefined,
        });
      }
    };

    unsubscribers.push(on(EventType.PERMISSION_ASKED, handlePermissionAsked));
    unsubscribers.push(on(EventType.PERMISSION_UPDATED, handlePermissionAsked));
    unsubscribers.push(
      on('*', (event) => {
        const eventType = typeof event.type === 'string' ? event.type : '';
        if (eventType === EventType.PERMISSION_ASKED || eventType === EventType.PERMISSION_UPDATED) {
          handlePermissionAsked(event);
        }
        if (eventType === EventType.QUESTION_ASKED) {
          handleQuestionAsked(event);
        }
      }),
    );

    unsubscribers.push(
      on(EventType.PERMISSION_REPLIED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const requestID = permissionIdFromReply(props);
        if (requestID) {
          set((state) => ({
            pendingPermissions: state.pendingPermissions.filter((p) => p.id !== requestID),
          }));
          const sessionID = String(props.sessionID ?? props.sessionId ?? '');
          const targetId = sessionID || useMessageStore.getState().activeSessionId;
          if (targetId) {
            const activity = useMessageStore.getState().sessionActivity[targetId];
            if (activity?.kind === 'permission') {
              useMessageStore.getState().setSessionActivity(targetId, null);
            }
          }
        }
      }),
    );

    unsubscribers.push(on(EventType.QUESTION_ASKED, handleQuestionAsked));

    unsubscribers.push(
      on(EventType.QUESTION_REPLIED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const requestID = typeof props.requestID === 'string' ? props.requestID : undefined;
        if (requestID) {
          set((state) => ({
            pendingQuestions: state.pendingQuestions.filter((q) => q.id !== requestID),
          }));
          const sessionID = String(props.sessionID ?? props.sessionId ?? '');
          const targetId = sessionID || useMessageStore.getState().activeSessionId;
          if (targetId) {
            const activity = useMessageStore.getState().sessionActivity[targetId];
            if (activity?.kind === 'question') {
              useMessageStore.getState().setSessionActivity(targetId, null);
            }
          }
        }
      }),
    );

    unsubscribers.push(
      on(EventType.QUESTION_REJECTED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const requestID = typeof props.requestID === 'string' ? props.requestID : undefined;
        if (requestID) {
          set((state) => ({
            pendingQuestions: state.pendingQuestions.filter((q) => q.id !== requestID),
          }));
          const sessionID = String(props.sessionID ?? props.sessionId ?? '');
          const targetId = sessionID || useMessageStore.getState().activeSessionId;
          if (targetId) {
            const activity = useMessageStore.getState().sessionActivity[targetId];
            if (activity?.kind === 'question') {
              useMessageStore.getState().setSessionActivity(targetId, null);
            }
          }
        }
      }),
    );

    return () => {
      unregisterCrossProject();
      unsubscribers.forEach((unsub) => unsub());
    };
  },
}));
