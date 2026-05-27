import { create } from 'zustand';
import type { Message } from '@zmn-codex/types';
import type { ToolCall } from '../types';
import { opencodeMessage, opencodeSession, opencodeTeam } from '../services/opencodeAdapter';
import { handleTeamMessageToolSuccess } from '../services/teamMemberExecution';
import { useTeamStore } from './team';
import { on, EventType, extractEventPayload } from '../sdk/eventRouter';
import { sanitizeUserMessageDisplay } from '../thread/displayContent';
import { enrichMessageFromParts, normalizeToolPart } from '../thread/messageParts';
import { toolLooksFailed } from '../thread/toolFailure';
import { debugError, debugWarn, pipelineMark, pipelineReset } from '../utils/debugLog';
import { isPendingSessionId } from '../utils/pendingSession';
import { useSessionStore } from './session';
import { questionLog } from '../utils/questionDebug';

import type { CompactionActivity } from '../thread/compactionActivity';
import { modelSupportsReasoning, noteRuntimeModelReasoning, parseModelRef, getCachedDefaultModelRef } from '../thread/composer/models';

export type { CompactionActivity };

const messageCache = new Map<string, Message[]>();
const compactionCache = new Map<string, CompactionActivity[]>();
const pendingDisplayBySession = new Map<string, string[]>();
const OPTIMISTIC_USER_PREFIX = 'pending-user-';

function isOptimisticUserMessage(msg: Message): boolean {
  return msg.role === 'user' && msg.id.startsWith(OPTIMISTIC_USER_PREFIX);
}

function withoutOptimisticUsers(messages: Message[]): Message[] {
  return messages.filter((m) => !isOptimisticUserMessage(m));
}

function queuePendingDisplay(sessionId: string, displayContent: string): void {
  const queue = pendingDisplayBySession.get(sessionId) ?? [];
  queue.push(displayContent);
  pendingDisplayBySession.set(sessionId, queue);
}

function takePendingDisplay(sessionId: string): string | undefined {
  const queue = pendingDisplayBySession.get(sessionId);
  if (!queue || queue.length === 0) return undefined;
  const next = queue.shift();
  if (queue.length === 0) {
    pendingDisplayBySession.delete(sessionId);
  } else {
    pendingDisplayBySession.set(sessionId, queue);
  }
  return next;
}

function enrichUserMessageDisplay(msg: Message, sessionId: string, consumePending = false): Message {
  if (msg.role !== 'user') return msg;

  const pending = consumePending ? takePendingDisplay(sessionId) : undefined;
  const displayContent =
    pending ??
    msg.displayContent ??
    (() => {
      const sanitized = sanitizeUserMessageDisplay(msg.content ?? '');
      return sanitized !== (msg.content ?? '') ? sanitized : undefined;
    })();

  if (!displayContent) return msg;
  return { ...msg, displayContent };
}

function getCachedMessages(sessionId: string): Message[] {
  return messageCache.get(sessionId) ?? [];
}

function setCachedMessages(sessionId: string, messages: Message[]): void {
  messageCache.set(sessionId, messages);
}

function getCachedCompactions(sessionId: string): CompactionActivity[] {
  return compactionCache.get(sessionId) ?? [];
}

function setCachedCompactions(sessionId: string, compactions: CompactionActivity[]): void {
  compactionCache.set(sessionId, compactions);
}

function findLastUserMessageId(sessionId: string): string | undefined {
  const messages = getCachedMessages(sessionId);
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && !isOptimisticUserMessage(messages[i])) {
      return messages[i].id;
    }
  }
  return undefined;
}

function findRunningCompaction(sessionId: string): CompactionActivity | undefined {
  return getCachedCompactions(sessionId).find((c) => c.status === 'running');
}

function upsertCachedCompaction(sessionId: string, next: CompactionActivity): void {
  const list = [...getCachedCompactions(sessionId)];
  const idx = list.findIndex((c) => c.id === next.id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...next };
  } else {
    list.push(next);
  }
  list.sort((a, b) => a.startedAt - b.startedAt);
  setCachedCompactions(sessionId, list);
}

function patchCompactionCache(
  sessionId: string,
  updater: (list: CompactionActivity[]) => CompactionActivity[],
): void {
  setCachedCompactions(sessionId, updater(getCachedCompactions(sessionId)));
}

function mergeLoadedCompactions(
  sessionId: string,
  serverCompactions: CompactionActivity[],
): CompactionActivity[] {
  const cachedRunning = findRunningCompaction(sessionId);
  if (cachedRunning && !serverCompactions.some((c) => c.id === cachedRunning.id)) {
    return [...serverCompactions, cachedRunning].sort((a, b) => a.startedAt - b.startedAt);
  }
  return serverCompactions;
}

function attachSummaryToCompaction(
  sessionId: string,
  parentId: string,
  summaryText: string,
  include?: string,
): void {
  patchCompactionCache(sessionId, (list) => {
    let matched = false;
    const updated = list.map((c) => {
      if (c.turnUserMessageId === parentId || c.id === parentId) {
        matched = true;
        return {
          ...c,
          status: 'done' as const,
          summary: summaryText,
          include: include ?? c.include,
          streamText: c.streamText || summaryText,
          endedAt: c.endedAt ?? Date.now(),
        };
      }
      return c;
    });
    return matched ? updated : list;
  });
}

function ensureRunningCompaction(
  sessionId: string,
  id: string,
  reason?: 'auto' | 'manual',
): CompactionActivity {
  const existing = findRunningCompaction(sessionId);
  if (existing) return existing;
  const created: CompactionActivity = {
    id,
    sessionId,
    turnUserMessageId: findLastUserMessageId(sessionId),
    afterMessageId: findLastAssistantMessageId(sessionId),
    reason,
    status: 'running',
    streamText: '',
    startedAt: Date.now(),
  };
  upsertCachedCompaction(sessionId, created);
  return created;
}

function upsertCachedMessage(sessionId: string, msg: Message): void {
  const existing = messageCache.get(sessionId) ?? [];
  const idx = existing.findIndex((m) => m.id === msg.id);
  if (idx !== -1) {
    const prev = existing[idx];
    existing[idx] = {
      ...prev,
      ...msg,
      content: mergeMessageContent(prev.content, msg.content),
      displayContent: msg.displayContent || prev.displayContent,
      reasoningContent: msg.reasoningContent || prev.reasoningContent,
      toolCalls: msg.toolCalls ?? prev.toolCalls,
    };
  } else {
    existing.push(msg);
  }
  messageCache.set(sessionId, existing);
}

function appendDeltaToCachedMessage(sessionId: string, messageId: string, delta: string): void {
  const existing = messageCache.get(sessionId) ?? [];
  const idx = existing.findIndex((m) => m.id === messageId);
  if (idx === -1) {
    existing.push({
      id: messageId,
      sessionID: sessionId,
      sessionId,
      role: 'assistant',
      content: delta,
    });
    messageCache.set(sessionId, existing);
    return;
  }
  existing[idx] = { ...existing[idx], content: (existing[idx].content ?? '') + delta };
  messageCache.set(sessionId, existing);
}

function upsertCachedToolCall(sessionId: string, messageId: string, toolCall: ToolCall): void {
  const existing = messageCache.get(sessionId) ?? [];
  const idx = existing.findIndex((m) => m.id === messageId);
  if (idx === -1) {
    existing.push({
      id: messageId,
      sessionID: sessionId,
      sessionId,
      role: 'assistant',
      toolCalls: [toolCall],
    });
    messageCache.set(sessionId, existing);
    return;
  }

  const prevCalls = existing[idx].toolCalls ?? [];
  const callKey = toolCall.id ?? toolCall.name;
  const callIdx = prevCalls.findIndex((call) => (call.id ?? call.name) === callKey);
  const nextCalls = callIdx === -1
    ? [...prevCalls, toolCall]
    : prevCalls.map((call, i) => (i === callIdx ? { ...call, ...toolCall } : call));

  existing[idx] = { ...existing[idx], toolCalls: nextCalls };
  messageCache.set(sessionId, existing);
}

function updateCachedMessageContent(sessionId: string, messageId: string, content: string): void {
  const existing = messageCache.get(sessionId);
  if (!existing) return;
  const idx = existing.findIndex((m) => m.id === messageId);
  if (idx !== -1) {
    existing[idx] = {
      ...existing[idx],
      content: mergeMessageContent(existing[idx].content, content),
    };
    messageCache.set(sessionId, existing);
  }
}

function findLastAssistantIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return i;
  }
  return -1;
}

function findLastAssistantMessageId(sessionId: string): string | undefined {
  const cached = messageCache.get(sessionId);
  if (!cached) return undefined;
  const idx = findLastAssistantIndex(cached);
  return idx === -1 ? undefined : cached[idx].id;
}

function updateCachedMessageReasoning(sessionId: string, messageId: string, reasoningContent: string): void {
  const existing = messageCache.get(sessionId) ?? [];
  let idx = existing.findIndex((m) => m.id === messageId);
  if (idx === -1) idx = findLastAssistantIndex(existing);
  if (idx === -1) return;
  existing[idx] = { ...existing[idx], reasoningContent };
  messageCache.set(sessionId, existing);
}

function appendReasoningDelta(sessionId: string, messageId: string, delta: string): string {
  const existing = messageCache.get(sessionId) ?? [];
  let idx = existing.findIndex((m) => m.id === messageId);
  if (idx === -1) idx = findLastAssistantIndex(existing);
  if (idx === -1) return delta;
  const next = `${existing[idx].reasoningContent ?? ''}${delta}`;
  existing[idx] = { ...existing[idx], reasoningContent: next };
  messageCache.set(sessionId, existing);
  return next;
}

function appendDeltaToLastAssistant(sessionId: string, delta: string): string | undefined {
  const existing = messageCache.get(sessionId);
  if (!existing) return undefined;
  const idx = findLastAssistantIndex(existing);
  if (idx === -1) return undefined;
  const messageId = existing[idx].id;
  existing[idx] = { ...existing[idx], content: (existing[idx].content ?? '') + delta };
  messageCache.set(sessionId, existing);
  return messageId;
}

type PendingDelta = {
  sessionId: string;
  messageId: string;
  delta: string;
};

let deltaFlushBuffer: PendingDelta[] = [];
let deltaFlushScheduled = false;
let deltaFlushApplyFn: ((pending: PendingDelta[]) => void) | null = null;

function flushDeltaBufferSync(): void {
  if (deltaFlushBuffer.length === 0) return;
  const pending = coalesceDeltas(deltaFlushBuffer);
  deltaFlushBuffer = [];
  deltaFlushScheduled = false;
  deltaFlushApplyFn?.(pending);
}

function coalesceDeltas(items: PendingDelta[]): PendingDelta[] {
  if (items.length < 2) return items;
  const ordered: PendingDelta[] = [];
  const byKey = new Map<string, PendingDelta>();
  for (const item of items) {
    const key = `${item.sessionId}\0${item.messageId}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.delta += item.delta;
      continue;
    }
    byKey.set(key, { ...item });
    ordered.push({ ...item });
  }
  return ordered;
}

/** Batch text deltas to one paint per frame (not N characters — every SSE chunk is buffered until rAF). */
function scheduleDeltaFlush() {
  if (deltaFlushScheduled) return;
  deltaFlushScheduled = true;
  const run = () => {
    deltaFlushScheduled = false;
    if (deltaFlushBuffer.length === 0) return;
    const pending = coalesceDeltas(deltaFlushBuffer);
    deltaFlushBuffer = [];
    deltaFlushApplyFn?.(pending);
  };
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(run);
  } else {
    queueMicrotask(run);
  }
}

const MODEL_WAIT_SLOW_MS = 8_000;
const MODEL_WAIT_VERY_SLOW_MS = 20_000;

interface ModelWaitTimers {
  slow?: ReturnType<typeof setTimeout>;
  verySlow?: ReturnType<typeof setTimeout>;
  startedAt: number;
}

const modelWaitTimers = new Map<string, ModelWaitTimers>();
const turnFirstTokenSeen = new Set<string>();

type ThinkingActivityPatcher = (sessionId: string, label: string) => void;
let patchThinkingActivityImpl: ThinkingActivityPatcher = () => {};
let readMessageState: () => MessageState = () => ({} as MessageState);

function clearModelWaitTimers(sessionId: string): void {
  const timers = modelWaitTimers.get(sessionId);
  if (!timers) return;
  if (timers.slow) clearTimeout(timers.slow);
  if (timers.verySlow) clearTimeout(timers.verySlow);
  modelWaitTimers.delete(sessionId);
}

function resetTurnWaitState(sessionId: string): void {
  turnFirstTokenSeen.delete(sessionId);
  clearModelWaitTimers(sessionId);
}

function patchThinkingActivity(sessionId: string, label: string): void {
  patchThinkingActivityImpl(sessionId, label);
}

function startModelWaitWatch(sessionId: string): void {
  clearModelWaitTimers(sessionId);
  const startedAt = Date.now();
  const slow = setTimeout(() => {
    if (!readMessageState().loadingBySession[sessionId]) return;
    if (turnFirstTokenSeen.has(sessionId)) return;
    pipelineMark(sessionId, 'llm:wait.slow', { waitedMs: Date.now() - startedAt });
    patchThinkingActivity(sessionId, 'Thinking');
  }, MODEL_WAIT_SLOW_MS);
  const verySlow = setTimeout(() => {
    if (!readMessageState().loadingBySession[sessionId]) return;
    if (turnFirstTokenSeen.has(sessionId)) return;
    pipelineMark(sessionId, 'llm:wait.very_slow', { waitedMs: Date.now() - startedAt });
    patchThinkingActivity(sessionId, 'Thinking');
  }, MODEL_WAIT_VERY_SLOW_MS);
  modelWaitTimers.set(sessionId, { slow, verySlow, startedAt });
}

function markLlmFirstToken(sessionId: string): void {
  if (turnFirstTokenSeen.has(sessionId)) return;
  turnFirstTokenSeen.add(sessionId);
  clearModelWaitTimers(sessionId);
  pipelineMark(sessionId, 'llm:first-token', {});
  patchThinkingActivity(sessionId, 'Thinking');
}

function extractTextFromParts(raw: Record<string, unknown>): string {
  if (typeof raw.content === 'string' && raw.content.length > 0) return raw.content;
  const parts = raw.parts;
  if (!Array.isArray(parts)) return '';
  let fullText = '';
  let accumulatedDelta = '';
  for (const p of parts) {
    if (p && typeof p === 'object') {
      const part = p as Record<string, unknown>;
      if (part.type === 'text' && typeof part.text === 'string') {
        fullText = part.text;
      }
      if (part.type === 'text-delta' && typeof part.text === 'string') {
        accumulatedDelta += part.text;
      }
    }
  }
  return fullText || accumulatedDelta;
}

function dedupeMessagesById(messages: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const msg of messages) {
    const prev = byId.get(msg.id);
    if (!prev) {
      byId.set(msg.id, msg);
      continue;
    }
    byId.set(msg.id, {
      ...prev,
      ...msg,
      content: mergeMessageContent(prev.content, msg.content),
      displayContent: msg.displayContent || prev.displayContent,
      toolCalls: (msg.toolCalls?.length ?? 0) >= (prev.toolCalls?.length ?? 0)
        ? msg.toolCalls
        : prev.toolCalls,
      reasoningContent: (msg.reasoningContent?.length ?? 0) >= (prev.reasoningContent?.length ?? 0)
        ? msg.reasoningContent
        : prev.reasoningContent,
    });
  }
  return Array.from(byId.values());
}

function mergeMessageContent(existing: string | undefined, incoming: string | undefined): string | undefined {
  const prev = existing ?? '';
  const next = incoming ?? '';
  if (!next) return prev || undefined;
  if (!prev) return next;
  if (next.startsWith(prev)) return next;
  if (prev.startsWith(next)) return prev;
  return next.length >= prev.length ? next : prev;
}

interface ReasoningPart {
  id: string;
  messageID: string;
  sessionID: string;
  text: string;
  done: boolean;
}

interface ThinkingState {
  active: boolean;
  agent?: string;
  model?: string;
  reasoningText?: string;
  /** Reasoning part finished but the turn is still running (before tools / next step). */
  reasoningDone?: boolean;
}

export type SessionActivityKind = 'thinking' | 'tool-input' | 'tool-running' | 'permission' | 'question';

export interface SessionActivity {
  sessionId: string;
  kind: SessionActivityKind;
  label: string;
  toolName?: string;
  detail?: string;
}

function formatToolActivityLabel(
  toolName: string,
  inputRaw?: string,
): { label: string; detail?: string } {
  const labels: Record<string, string> = {
    team_spawn: '创建团队成员',
    team_create: '创建团队',
    team_shutdown: '关闭团队成员',
    team_cleanup: '清理团队',
    team_list: '查询团队',
    team_message: '发送团队消息',
    team_broadcast: '广播团队消息',
    bash: '执行命令',
    read: '读取文件',
    edit: '编辑文件',
    write: '写入文件',
    grep: '搜索代码',
    glob: '查找文件',
    task: '运行子任务',
  };
  let detail: string | undefined;
  if (inputRaw) {
    try {
      const parsed = JSON.parse(inputRaw) as Record<string, unknown>;
      if (toolName === 'team_spawn') {
        if (typeof parsed.name === 'string' && parsed.name.trim()) detail = parsed.name;
        else if (typeof parsed.agent === 'string' && parsed.agent.trim()) detail = parsed.agent;
      } else if (typeof parsed.filePath === 'string') detail = parsed.filePath;
      else if (typeof parsed.path === 'string') detail = parsed.path;
      else if (typeof parsed.file === 'string') detail = parsed.file;
      else if (typeof parsed.name === 'string') detail = parsed.name;
      else if (typeof parsed.command === 'string') detail = parsed.command;
      else if (typeof parsed.agent === 'string') detail = parsed.agent;
    } catch {
      const trimmed = inputRaw.trim();
      if (trimmed.length < 120 && trimmed !== '{}' && trimmed !== '[]') detail = trimmed;
    }
  }
  return { label: labels[toolName] ?? `调用 ${toolName}`, detail };
}

function patchSessionActivity(
  map: Record<string, SessionActivity>,
  sessionId: string,
  activity: SessionActivity | null,
): Record<string, SessionActivity> {
  if (!activity) {
    const { [sessionId]: _removed, ...rest } = map;
    return rest;
  }
  return { ...map, [sessionId]: activity };
}

function syncActiveLoading(
  activeSessionId: string | null,
  loadingBySession: Record<string, boolean>,
): boolean {
  return activeSessionId ? !!loadingBySession[activeSessionId] : false;
}

function migrateOutgoingSessionState(fromId: string, toId: string): void {
  const messages = messageCache.get(fromId);
  if (messages) {
    messageCache.set(
      toId,
      messages.map((m) => ({ ...m, sessionID: toId, sessionId: toId })),
    );
    messageCache.delete(fromId);
  }

  const compactions = compactionCache.get(fromId);
  if (compactions) {
    compactionCache.set(
      toId,
      compactions.map((c) => ({ ...c, sessionId: toId })),
    );
    compactionCache.delete(fromId);
  }

  const pending = pendingDisplayBySession.get(fromId);
  if (pending) {
    pendingDisplayBySession.set(toId, pending);
    pendingDisplayBySession.delete(fromId);
  }

  const timers = modelWaitTimers.get(fromId);
  if (timers) {
    modelWaitTimers.set(toId, timers);
    modelWaitTimers.delete(fromId);
  }
  if (turnFirstTokenSeen.has(fromId)) {
    turnFirstTokenSeen.delete(fromId);
    turnFirstTokenSeen.add(toId);
  }

  const runStatus = useSessionStore.getState().sessionRunStatus[fromId];
  if (runStatus) {
    useSessionStore.getState().setSessionRunStatus(toId, runStatus);
  }
}

interface MessageState {
  activeSessionId: string | null;
  messages: Message[];
  compactionsBySession: Record<string, CompactionActivity[]>;
  loading: boolean;
  loadingBySession: Record<string, boolean>;
  sessionActivity: Record<string, SessionActivity>;
  thinking: ThinkingState;
  error: string | null;
  setSessionActivity: (sessionId: string, activity: SessionActivity | null) => void;
  getCompactionsForSession: (sessionId: string) => CompactionActivity[];
  startManualCompaction: (sessionId: string) => void;
  finishManualCompaction: (sessionId: string, error?: string) => void;

  setActiveSession: (sessionId: string | null) => void;
  loadMessages: (sessionId: string) => Promise<void>;
  getSessionMessagesSnapshot: (sessionId: string) => Message[];
  beginOutgoingMessage: (sessionId: string, options?: { displayContent?: string; modelRef?: string }) => void;
  dispatchOutgoingMessage: (
    sessionId: string,
    content: string,
    options?: {
      agent?: string;
      displayContent?: string;
      modelRef?: string;
      promptAttachments?: { images: File[]; filePaths: string[] };
    },
  ) => Promise<void>;
  cancelOutgoingMessage: (sessionId: string) => void;
  migrateOutgoingSession: (fromSessionId: string, toSessionId: string) => void;
  sendMessage: (
    sessionId: string,
    content: string,
    options?: {
      agent?: string;
      displayContent?: string;
      modelRef?: string;
      promptAttachments?: { images: File[]; filePaths: string[] };
    },
  ) => Promise<void>;
  abortSession: (sessionId: string) => Promise<void>;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  subscribeToEvents: () => () => void;
}

const activeReasoningParts = new Map<string, ReasoningPart>();

function computeThinkingFromParts(sessionID?: string): ThinkingState {
  const entries = Array.from(activeReasoningParts.values());
  const relevant = sessionID
    ? entries.filter((entry) => entry.sessionID === sessionID)
    : entries;

  const activePart = relevant.find((part) => !part.done);
  if (activePart) {
    return { active: true, reasoningText: activePart.text || undefined };
  }

  const doneWithText = relevant.filter((part) => part.done && part.text.trim());
  const latestDone = doneWithText[doneWithText.length - 1];
  const sessionLoading = sessionID ? !!readMessageState().loadingBySession[sessionID] : false;
  if (latestDone && sessionLoading) {
    return {
      active: true,
      reasoningText: latestDone.text,
      reasoningDone: true,
    };
  }

  return { active: false };
}

function cognitionActivityForModel(modelRef?: string | null): {
  label: 'Thinking';
  thinkingActive: boolean;
  modelId?: string;
} {
  const parsed = parseModelRef(modelRef);
  return {
    label: 'Thinking',
    thinkingActive: true,
    modelId: parsed?.modelId,
  };
}

function modelRefFromMessage(message?: Message): string | undefined {
  if (!message?.modelID) return undefined;
  return message.providerID ? `${message.providerID}/${message.modelID}` : message.modelID;
}

function noteReasoningModelForSession(sessionID: string, messageID?: string): void {
  const messages = getCachedMessages(sessionID);
  const target = messageID
    ? messages.find((m) => m.id === messageID)
    : [...messages].reverse().find((m) => m.role === 'assistant');
  const modelRef =
    modelRefFromMessage(target) ??
    readMessageState().thinking.model ??
    getCachedDefaultModelRef() ??
    undefined;
  noteRuntimeModelReasoning(modelRef);
}

export const useMessageStore = create<MessageState>((set, get) => {
  readMessageState = get;
  patchThinkingActivityImpl = (sessionId, label) => {
    get().setSessionActivity(sessionId, { sessionId, kind: 'thinking', label });
  };

  return {
  activeSessionId: null,
  messages: [],
  compactionsBySession: {},
  loading: false,
  loadingBySession: {},
  sessionActivity: {},
  thinking: { active: false },
  error: null,

  getCompactionsForSession: (sessionId) => getCachedCompactions(sessionId),

  startManualCompaction: (sessionId) => {
    if (findRunningCompaction(sessionId)) return;
    ensureRunningCompaction(sessionId, `compaction-manual-${Date.now()}`, 'manual');
    useSessionStore.getState().setSessionRunStatus(sessionId, 'running');
    set((state) => {
      const loadingBySession = { ...state.loadingBySession, [sessionId]: true };
      const compactions = getCachedCompactions(sessionId);
      return {
        loadingBySession,
        loading: syncActiveLoading(state.activeSessionId, loadingBySession),
        sessionActivity: patchSessionActivity(state.sessionActivity, sessionId, {
          sessionId,
          kind: 'thinking',
          label: 'Compressing',
        }),
        thinking:
          state.activeSessionId === sessionId ? { active: true } : state.thinking,
        compactionsBySession: {
          ...state.compactionsBySession,
          [sessionId]: compactions,
        },
      };
    });
  },

  finishManualCompaction: (sessionId, error) => {
    const running = findRunningCompaction(sessionId);
    if (!running || running.reason !== 'manual') return;
    if (error) {
      debugError('compaction.manual.failed', error, { sessionId, compactionId: running.id });
    }
    patchCompactionCache(sessionId, (list) =>
      list.map((c) =>
        c.id === running.id
          ? {
              ...c,
              status: 'done' as const,
              streamText: error ? `Error: ${error}` : c.streamText,
              endedAt: Date.now(),
            }
          : c,
      ),
    );
    useSessionStore.getState().setSessionRunStatus(sessionId, 'idle');
    set((state) => {
      const { [sessionId]: _removed, ...loadingBySession } = state.loadingBySession;
      return {
        loadingBySession,
        loading: syncActiveLoading(state.activeSessionId, loadingBySession),
        sessionActivity: patchSessionActivity(state.sessionActivity, sessionId, null),
        thinking: state.activeSessionId === sessionId ? { active: false } : state.thinking,
        compactionsBySession: {
          ...state.compactionsBySession,
          [sessionId]: getCachedCompactions(sessionId),
        },
      };
    });
  },

  setSessionActivity: (sessionId, activity) => {
    set((state) => ({
      sessionActivity: patchSessionActivity(state.sessionActivity, sessionId, activity),
    }));
  },

  setActiveSession: (sessionId: string | null) => {
    const current = get().activeSessionId;
    if (current === sessionId) return;
    const state = get();
    const loading = syncActiveLoading(sessionId, state.loadingBySession);
    const activity = sessionId ? state.sessionActivity[sessionId] : undefined;
    set({
      activeSessionId: sessionId,
      loading,
      thinking: loading
        ? {
            active: true,
            reasoningText: activity?.kind === 'thinking' ? undefined : state.thinking.reasoningText,
          }
        : { active: false },
      messages: sessionId ? getCachedMessages(sessionId) : [],
      compactionsBySession: sessionId
        ? {
            ...state.compactionsBySession,
            [sessionId]: getCachedCompactions(sessionId),
          }
        : state.compactionsBySession,
    });
  },

  loadMessages: async (sessionId: string) => {
    if (isPendingSessionId(sessionId)) {
      if (get().activeSessionId === sessionId) {
        set({ messages: dedupeMessagesById(getCachedMessages(sessionId)) });
      }
      return;
    }
    try {
      const { messages: serverMsgs, compactions: serverCompactions } =
        await opencodeMessage.fetchSessionMessages(sessionId);
      setCachedCompactions(sessionId, mergeLoadedCompactions(sessionId, serverCompactions));
      const serverById = new Map<string, Message>(serverMsgs.map((m) => [m.id, m]));
      const currentCache = messageCache.get(sessionId) ?? [];
      for (const msg of currentCache) {
        if (isOptimisticUserMessage(msg)) {
          if (!serverById.has(msg.id)) {
            serverById.set(msg.id, msg);
          }
          continue;
        }
        if (!serverById.has(msg.id)) {
          serverById.set(msg.id, msg);
        } else {
          const server = serverById.get(msg.id)!;
          serverById.set(msg.id, {
            ...server,
            ...msg,
            content: mergeMessageContent(server.content, msg.content),
            displayContent: msg.displayContent || server.displayContent,
            toolCalls: msg.toolCalls?.length ? msg.toolCalls : server.toolCalls,
            reasoningContent:
              (msg.reasoningContent?.length ?? 0) >= (server.reasoningContent?.length ?? 0)
                ? msg.reasoningContent
                : server.reasoningContent,
          });
        }
      }
      const merged = dedupeMessagesById(
        Array.from(serverById.values()).map((m) => enrichUserMessageDisplay(m, sessionId)),
      );
      setCachedMessages(sessionId, merged);
      if (get().activeSessionId === sessionId) {
        set({
          messages: [...merged],
          compactionsBySession: {
            ...get().compactionsBySession,
            [sessionId]: getCachedCompactions(sessionId),
          },
        });
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  getSessionMessagesSnapshot: (sessionId: string) => getCachedMessages(sessionId),

  sendMessage: async (sessionId: string, content: string, options?: { agent?: string; displayContent?: string }) => {
    get().beginOutgoingMessage(sessionId, { displayContent: options?.displayContent ?? content });
    await get().dispatchOutgoingMessage(sessionId, content, options);
  },

  beginOutgoingMessage: (sessionId: string, options?: { displayContent?: string; modelRef?: string }) => {
    if (get().activeSessionId !== sessionId) {
      get().setActiveSession(sessionId);
    }

    const displayContent = options?.displayContent ?? '';
    const optimisticId = `${OPTIMISTIC_USER_PREFIX}${Date.now()}`;
    const optimisticUser = enrichUserMessageDisplay(
      {
        id: optimisticId,
        sessionID: sessionId,
        sessionId,
        role: 'user',
        content: displayContent,
        displayContent,
      },
      sessionId,
      false,
    );

    if (displayContent) {
      queuePendingDisplay(sessionId, displayContent);
    }

    const cachedWithOptimistic = dedupeMessagesById([...getCachedMessages(sessionId), optimisticUser]);
    setCachedMessages(sessionId, cachedWithOptimistic);

    useSessionStore.getState().setSessionRunStatus(sessionId, 'running');
    resetTurnWaitState(sessionId);
    pipelineReset(sessionId, 'user.send');

    const cognition = cognitionActivityForModel(options?.modelRef);

    set((state) => {
      const loadingBySession = { ...state.loadingBySession, [sessionId]: true };
      return {
        loadingBySession,
        loading: syncActiveLoading(state.activeSessionId, loadingBySession),
        sessionActivity: patchSessionActivity(state.sessionActivity, sessionId, {
          sessionId,
          kind: 'thinking',
          label: cognition.label,
        }),
        thinking: cognition.thinkingActive
          ? { active: true, model: cognition.modelId }
          : { active: false },
        messages:
          state.activeSessionId === sessionId
            ? dedupeMessagesById([...state.messages, optimisticUser])
            : state.messages,
      };
    });
    startModelWaitWatch(sessionId);
  },

  dispatchOutgoingMessage: async (
    sessionId: string,
    content: string,
    options?: {
      agent?: string;
      displayContent?: string;
      modelRef?: string;
      promptAttachments?: { images: File[]; filePaths: string[] };
    },
  ) => {
    try {
      await opencodeMessage.sendMessage(sessionId, content, options);
      pipelineMark(sessionId, 'dispatch.done', {});
    } catch (e) {
      pipelineMark(sessionId, 'dispatch.error', {
        message: e instanceof Error ? e.message.slice(0, 200) : String(e),
      });
      get().cancelOutgoingMessage(sessionId);
      set((state) => {
        const { [sessionId]: _removed, ...loadingBySession } = state.loadingBySession;
        return {
          loadingBySession,
          loading: syncActiveLoading(state.activeSessionId, loadingBySession),
          sessionActivity: patchSessionActivity(state.sessionActivity, sessionId, null),
          thinking: { active: false },
          error: e instanceof Error ? e.message : String(e),
        };
      });
      throw e;
    }
  },

  cancelOutgoingMessage: (sessionId: string) => {
    resetTurnWaitState(sessionId);
    const queue = pendingDisplayBySession.get(sessionId);
    if (queue?.length) {
      queue.pop();
      if (queue.length === 0) pendingDisplayBySession.delete(sessionId);
    }
    const cleaned = withoutOptimisticUsers(getCachedMessages(sessionId));
    setCachedMessages(sessionId, cleaned);
    set((state) => {
      const { [sessionId]: _removed, ...loadingBySession } = state.loadingBySession;
      return {
        loadingBySession,
        loading: syncActiveLoading(state.activeSessionId, loadingBySession),
        sessionActivity: patchSessionActivity(state.sessionActivity, sessionId, null),
        thinking: { active: false },
        messages: state.activeSessionId === sessionId ? cleaned : state.messages,
      };
    });
  },

  migrateOutgoingSession: (fromSessionId, toSessionId) => {
    migrateOutgoingSessionState(fromSessionId, toSessionId);
    set((state) => {
      const loadingBySession = { ...state.loadingBySession };
      if (loadingBySession[fromSessionId]) {
        loadingBySession[toSessionId] = loadingBySession[fromSessionId];
        delete loadingBySession[fromSessionId];
      }

      const sessionActivity = { ...state.sessionActivity };
      const fromActivity = sessionActivity[fromSessionId];
      if (fromActivity) {
        sessionActivity[toSessionId] = { ...fromActivity, sessionId: toSessionId };
        delete sessionActivity[fromSessionId];
      }

      const compactionsBySession = { ...state.compactionsBySession };
      if (compactionsBySession[fromSessionId]) {
        compactionsBySession[toSessionId] = compactionsBySession[fromSessionId];
        delete compactionsBySession[fromSessionId];
      }

      const activeSessionId =
        state.activeSessionId === fromSessionId ? toSessionId : state.activeSessionId;
      const messages =
        activeSessionId === toSessionId
          ? dedupeMessagesById(getCachedMessages(toSessionId))
          : state.messages;

      return {
        activeSessionId,
        loadingBySession,
        loading: syncActiveLoading(activeSessionId, loadingBySession),
        sessionActivity,
        compactionsBySession,
        messages,
      };
    });
  },

  abortSession: async (sessionId: string) => {
    try {
      await opencodeSession.abortSession(sessionId);
      const { teamModeEnabled, currentTeam } = useTeamStore.getState();
      if (teamModeEnabled && currentTeam?.name && currentTeam.sessionId === sessionId) {
        await opencodeTeam.shutdownTeam(currentTeam.name).catch(() => {});
      }
      set((state) => {
        const { [sessionId]: _removed, ...loadingBySession } = state.loadingBySession;
        return {
          loadingBySession,
          loading: syncActiveLoading(state.activeSessionId, loadingBySession),
          sessionActivity: patchSessionActivity(state.sessionActivity, sessionId, null),
        };
      });
    } catch (e) {
      set((state) => {
        const { [sessionId]: _removed, ...loadingBySession } = state.loadingBySession;
        return {
          loadingBySession,
          loading: syncActiveLoading(state.activeSessionId, loadingBySession),
          error: e instanceof Error ? e.message : String(e),
        };
      });
    }
  },

  clearMessages: () => set({ messages: [], compactionsBySession: {} }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  subscribeToEvents: () => {
    const unsubscribers: Array<() => void> = [];

    deltaFlushApplyFn = (pending) => {
      const bySession = new Map<string, PendingDelta[]>();
      for (const item of pending) {
        let arr = bySession.get(item.sessionId);
        if (!arr) {
          arr = [];
          bySession.set(item.sessionId, arr);
        }
        arr.push(item);
      }

      for (const [sessId, deltas] of bySession) {
        for (const item of deltas) {
          appendDeltaToCachedMessage(sessId, item.messageId, item.delta);
        }
      }

      const activeSession = get().activeSessionId;
      if (activeSession && bySession.has(activeSession)) {
        set({ messages: dedupeMessagesById(getCachedMessages(activeSession)) });
      }
    };

    const syncCompactionsToStore = (sessionID: string) => {
      if (get().activeSessionId !== sessionID) return;
      set((state) => ({
        compactionsBySession: {
          ...state.compactionsBySession,
          [sessionID]: getCachedCompactions(sessionID),
        },
      }));
    };

    const markSessionBusy = (sessionID: string) => {
      useSessionStore.getState().setSessionRunStatus(sessionID, 'running');
      set((state) => {
        const loadingBySession = { ...state.loadingBySession, [sessionID]: true };
        return {
          loadingBySession,
          loading: syncActiveLoading(state.activeSessionId, loadingBySession),
        };
      });
    };

    const clearSessionBusy = (sessionID: string) => {
      resetTurnWaitState(sessionID);
      useSessionStore.getState().setSessionRunStatus(sessionID, 'idle');
      set((state) => {
        const { [sessionID]: _removed, ...loadingBySession } = state.loadingBySession;
        return {
          loadingBySession,
          loading: syncActiveLoading(state.activeSessionId, loadingBySession),
          sessionActivity: patchSessionActivity(state.sessionActivity, sessionID, null),
          thinking: state.activeSessionId === sessionID ? { active: false } : state.thinking,
        };
      });
    };

    const setToolActivity = (
      sessionID: string,
      toolName: string,
      kind: SessionActivityKind,
      input?: string,
      detail?: string,
    ) => {
      const { label, detail: parsedDetail } = formatToolActivityLabel(toolName, input);
      markSessionBusy(sessionID);
      set((state) => ({
        sessionActivity: patchSessionActivity(state.sessionActivity, sessionID, {
          sessionId: sessionID,
          kind,
          label,
          toolName,
          detail: detail ?? parsedDetail,
        }),
      }));
    };

    unsubscribers.push(
      on(EventType.MESSAGE_UPDATED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const info = (props.info ?? props) as Record<string, unknown>;
        const id = info.id as string | undefined;
        if (!id) return;

        const sessionID = (info.sessionID as string) ?? '';
        const role = info.role as string | undefined;
        const parts = (props.parts ?? info.parts) as unknown[] | undefined;
        const content = extractTextFromParts(info);

        const baseMsg: Message & { compactionSummary?: boolean } = {
          id,
          sessionID,
          role: (role as Message['role']) ?? 'assistant',
          sessionId: sessionID,
          content,
        };
        if (info.agent) baseMsg.agent = info.agent as string;
        if (info.modelID) baseMsg.modelID = info.modelID as string;
        if (role === 'assistant' && info.summary === true) {
          baseMsg.compactionSummary = true;
        }

        let msg = baseMsg;
        if (parts?.length) {
          msg = enrichMessageFromParts(msg, parts);
        }
        if (role === 'user') {
          msg = enrichUserMessageDisplay(msg, sessionID, true);
        }

        if (role === 'assistant' && info.summary === true && typeof info.parentID === 'string') {
          const summaryText = extractTextFromParts(info);
          if (summaryText) {
            attachSummaryToCompaction(sessionID, info.parentID as string, summaryText);
            syncCompactionsToStore(sessionID);
          }
        }

        if (role === 'assistant' && sessionID && id) {
          const cached = messageCache.get(sessionID) ?? [];
          if (!cached.some((m) => m.id === id)) {
            pipelineMark(sessionID, 'assistant:new', {
              messageId: id.slice(0, 16),
              agent: info.agent,
              modelID: info.modelID,
            });
            if (!turnFirstTokenSeen.has(sessionID)) {
              patchThinkingActivity(sessionID, 'Thinking');
            }
          }
        }

        flushDeltaBufferSync();
        upsertCachedMessage(sessionID, msg);

        if (get().activeSessionId === sessionID) {
          if (role === 'user') {
            const enriched = enrichUserMessageDisplay(msg, sessionID, true);
            const withoutOptimistic = withoutOptimisticUsers(getCachedMessages(sessionID));
            setCachedMessages(sessionID, withoutOptimistic);
            upsertCachedMessage(sessionID, enriched);
            set({
              messages: dedupeMessagesById([...withoutOptimisticUsers(get().messages), enriched]),
            });
          } else {
            set((state) => {
              const existing = state.messages.find((m) => m.id === id);
              if (existing) {
                const merged = {
                  ...existing,
                  ...msg,
                  content: mergeMessageContent(existing.content, msg.content),
                  displayContent: msg.displayContent || existing.displayContent,
                };
                return {
                  messages: dedupeMessagesById(
                    state.messages.map((m) => (m.id === id ? merged : m)),
                  ),
                };
              }
              return { messages: dedupeMessagesById([...state.messages, msg]) };
            });

            if (!content) {
              set((state) => ({
                thinking: {
                  active: true,
                  agent: msg.agent ?? state.thinking.agent,
                  model: msg.modelID ?? state.thinking.model,
                  reasoningText: state.thinking.reasoningText,
                },
              }));
            }
          }
        } else if (role === 'user') {
          const enriched = enrichUserMessageDisplay(msg, sessionID, true);
          const withoutOptimistic = withoutOptimisticUsers(getCachedMessages(sessionID));
          setCachedMessages(sessionID, withoutOptimistic);
          upsertCachedMessage(sessionID, enriched);
        }
      }),
    );

    unsubscribers.push(
      on(EventType.MESSAGE_REMOVED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = props.sessionID as string | undefined;
        const messageID = props.messageID as string | undefined;
        if (!messageID) return;

        if (sessionID) {
          const cached = messageCache.get(sessionID);
          if (cached) {
            messageCache.set(sessionID, cached.filter((m) => m.id !== messageID));
          }
        }

        if (get().activeSessionId === sessionID) {
          set((state) => ({
            messages: state.messages.filter((m) => m.id !== messageID),
          }));
        }
      }),
    );

    unsubscribers.push(
      on(EventType.MESSAGE_PART_UPDATED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const part = (props.part ?? props) as Record<string, unknown>;
        const messageID = part.messageID as string | undefined;
        if (!messageID) return;

        const sessionID = (part.sessionID as string) ?? '';
        const partType = part.type as string;
        const partID = part.id as string | undefined;
        const partText = (part.text as string) ?? '';
        const timeObj = part.time as Record<string, unknown> | undefined;
        const isDone = timeObj?.end != null;

        if (partType === 'reasoning' && partID) {
          noteReasoningModelForSession(sessionID, messageID);
          get().setSessionActivity(sessionID, {
            sessionId: sessionID,
            kind: 'thinking',
            label: 'Thinking',
          });
          const prev = activeReasoningParts.get(partID);
          if (!prev) {
            pipelineMark(sessionID, 'reasoning:start', { partID: partID.slice(0, 12), messageID });
          }
          activeReasoningParts.set(partID, {
            id: partID,
            messageID,
            sessionID,
            text: partText,
            done: isDone,
          });
          if (isDone && !prev?.done) {
            pipelineMark(sessionID, 'reasoning:end', {
              partID: partID.slice(0, 12),
              messageID,
              chars: partText.length,
            });
          }
          if (partText) {
            updateCachedMessageReasoning(sessionID, messageID, partText);
          }
          if (get().activeSessionId === sessionID) {
            set({
              thinking: computeThinkingFromParts(sessionID),
              messages: dedupeMessagesById(getCachedMessages(sessionID)),
            });
          }
          return;
        }

        if (partType === 'tool') {
          const toolCall = normalizeToolPart(part);
          if (toolCall) {
            pipelineMark(sessionID, `tool:${toolCall.name}:${toolCall.status}`, {
              tool: toolCall.name,
              status: toolCall.status,
              messageID,
              partID: partID?.slice(0, 12),
            });
            if (toolLooksFailed(toolCall)) {
              debugError('tool.part.error', toolCall.error ?? toolCall.output ?? 'unknown', {
                sessionID,
                messageID,
                tool: toolCall.name,
                input: toolCall.input?.slice(0, 500),
              });
            }
            upsertCachedToolCall(sessionID, messageID, toolCall);
            if (toolCall.name === 'question') {
              let optionCount: number | undefined;
              try {
                const parsed = JSON.parse(toolCall.input ?? '{}') as { questions?: Array<{ options?: unknown[] }> };
                optionCount = parsed.questions?.[0]?.options?.length;
              } catch {
                // input may be partial while streaming
              }
              if (optionCount !== undefined || toolCall.status === 'error') {
                questionLog('tool.part.detail', {
                  sessionID: sessionID.slice(0, 16),
                  status: toolCall.status,
                  optionCount: optionCount ?? '(unknown)',
                  inputLen: toolCall.input?.length ?? 0,
                });
              }
            }
            if (
              toolCall.name === 'question'
              && toolCall.status !== 'completed'
              && toolCall.status !== 'error'
            ) {
              questionLog('tool.part', {
                sessionID: sessionID.slice(0, 16),
                status: toolCall.status,
                messageID: messageID.slice(0, 16),
              });
              void import('./permission').then(({ recoverPendingQuestionsForSession }) => {
                void recoverPendingQuestionsForSession(sessionID, 'message.part.tool-question');
              });
            }
            const toolFinished =
              toolCall.status === 'completed' || toolCall.status === 'error';
            const { label, detail } = formatToolActivityLabel(toolCall.name, toolCall.input);
            const activityKind: SessionActivityKind =
              toolCall.status === 'pending' ? 'tool-input'
              : toolCall.status === 'running' ? 'tool-running'
              : 'tool-input';
            set((state) => {
              const loadingBySession = { ...state.loadingBySession, [sessionID]: true };
              const existing = state.sessionActivity[sessionID];
            const keepPermission = existing?.kind === 'permission';
            const keepQuestion = existing?.kind === 'question';
            const isQuestionTool =
              toolCall.name === 'question'
              && toolCall.status !== 'completed'
              && toolCall.status !== 'error';
            const nextActivity = keepPermission || keepQuestion
              ? state.sessionActivity
              : toolFinished
                ? patchSessionActivity(state.sessionActivity, sessionID, {
                    sessionId: sessionID,
                    kind: 'thinking',
                    label: 'Preparing next step',
                  })
                : patchSessionActivity(state.sessionActivity, sessionID, {
                    sessionId: sessionID,
                    kind: isQuestionTool ? 'question' : activityKind,
                    label: isQuestionTool
                      ? '请选择模拟器'
                      : toolCall.status === 'pending'
                        ? `${label}（准备中）`
                        : label,
                    toolName: toolCall.name,
                    detail,
                  });
              return {
                loadingBySession,
                loading: syncActiveLoading(state.activeSessionId, loadingBySession),
                sessionActivity: nextActivity,
                messages:
                  state.activeSessionId === sessionID
                    ? dedupeMessagesById(getCachedMessages(sessionID))
                    : state.messages,
              };
            });
            useSessionStore.getState().setSessionRunStatus(sessionID, 'running');
          }
          return;
        }

        if (partType === 'compaction' && partID) {
          const auto = part.auto === true;
          upsertCachedCompaction(sessionID, {
            id: partID,
            sessionId: sessionID,
            turnUserMessageId: findLastUserMessageId(sessionID),
            afterMessageId: findLastAssistantMessageId(sessionID),
            reason: auto ? 'auto' : 'manual',
            status: isDone ? 'done' : 'running',
            streamText: '',
            startedAt: typeof timeObj?.created === 'number' ? timeObj.created : Date.now(),
            endedAt: typeof timeObj?.compacted === 'number' ? timeObj.compacted : undefined,
          });
          markSessionBusy(sessionID);
          syncCompactionsToStore(sessionID);
          return;
        }

        if (partType === 'text') {
          for (const [key, rp] of activeReasoningParts) {
            if (rp.messageID === messageID) {
              rp.done = true;
              activeReasoningParts.set(key, rp);
            }
          }
          if (get().activeSessionId === sessionID) {
            set({ thinking: computeThinkingFromParts(sessionID) });
          }
        }

        if (partType === 'text' && partText && part.synthetic !== true) {
          markLlmFirstToken(sessionID);
          const meta = part.metadata as Record<string, unknown> | undefined;
          if (meta?.teammateBootstrap === true) {
            return;
          }
          flushDeltaBufferSync();
          updateCachedMessageContent(sessionID, messageID, partText);

          if (get().activeSessionId === sessionID) {
            set((state) => {
              const msgIndex = state.messages.findIndex((m) => m.id === messageID);
              if (msgIndex === -1) {
                const stub: Message = {
                  id: messageID,
                  sessionID,
                  role: 'assistant',
                  sessionId: sessionID,
                  content: partText,
                };
                upsertCachedMessage(sessionID, stub);
                return { messages: dedupeMessagesById([...state.messages, stub]) };
              }
              const messages = state.messages.slice();
              messages[msgIndex] = {
                ...messages[msgIndex],
                content: mergeMessageContent(messages[msgIndex].content, partText),
              };
              return { messages: dedupeMessagesById(messages) };
            });
          }
        }
      }),
    );

    unsubscribers.push(
      on(EventType.MESSAGE_PART_DELTA, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = props.sessionID as string | undefined;
        const messageID = props.messageID as string | undefined;
        const partID = props.partID as string | undefined;
        const delta = props.delta as string | undefined;
        const field = props.field as string | undefined;
        if (!sessionID || !messageID || !partID || !delta) return;

        const isReasoningDelta = activeReasoningParts.has(partID);
        const isReasoningField =
          field === 'reasoning_content' ||
          field === 'reasoning_details' ||
          field === 'reasoning';

        if (isReasoningField) {
          noteReasoningModelForSession(sessionID, messageID);
          get().setSessionActivity(sessionID, {
            sessionId: sessionID,
            kind: 'thinking',
            label: 'Thinking',
          });
          if (!activeReasoningParts.has(partID)) {
            activeReasoningParts.set(partID, {
              id: partID,
              messageID,
              sessionID,
              text: '',
              done: false,
            });
          }
          const rp = activeReasoningParts.get(partID)!;
          if (!rp.done) {
            rp.text += delta;
            activeReasoningParts.set(partID, rp);
            appendReasoningDelta(sessionID, messageID, delta);
            if (get().activeSessionId === sessionID) {
              set({
                thinking: computeThinkingFromParts(sessionID),
                messages: dedupeMessagesById(getCachedMessages(sessionID)),
              });
            }
          }
          return;
        }

        if (isReasoningDelta) {
          noteReasoningModelForSession(sessionID, messageID);
          get().setSessionActivity(sessionID, {
            sessionId: sessionID,
            kind: 'thinking',
            label: 'Thinking',
          });
          const rp = activeReasoningParts.get(partID)!;
          if (!rp.done) {
            rp.text += delta;
            activeReasoningParts.set(partID, rp);
            appendReasoningDelta(sessionID, rp.messageID, delta);
            if (get().activeSessionId === sessionID) {
              set({
                thinking: computeThinkingFromParts(sessionID),
                messages: dedupeMessagesById(getCachedMessages(sessionID)),
              });
            }
          }
          return;
        }

        if (field === 'text' || field === undefined) {
          markLlmFirstToken(sessionID);
          deltaFlushBuffer.push({ sessionId: sessionID, messageId: messageID, delta });
          scheduleDeltaFlush();
        }
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_NEXT_REASONING_STARTED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = props.sessionID as string | undefined;
        const reasoningID = props.reasoningID as string | undefined;
        if (!sessionID || !reasoningID) return;

        noteReasoningModelForSession(sessionID);
        get().setSessionActivity(sessionID, {
          sessionId: sessionID,
          kind: 'thinking',
          label: 'Thinking',
        });

        const messageID = findLastAssistantMessageId(sessionID) ?? reasoningID;
        activeReasoningParts.set(reasoningID, {
          id: reasoningID,
          messageID,
          sessionID,
          text: '',
          done: false,
        });
        if (sessionID) markSessionBusy(sessionID);
        if (get().activeSessionId === sessionID) {
          set((state) => ({
            thinking: computeThinkingFromParts(sessionID),
            loading: syncActiveLoading(state.activeSessionId, state.loadingBySession),
          }));
        }
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_NEXT_REASONING_DELTA, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = props.sessionID as string | undefined;
        const reasoningID = props.reasoningID as string | undefined;
        const delta = props.delta as string | undefined;
        if (!sessionID || !reasoningID || !delta) return;

        if (!activeReasoningParts.has(reasoningID)) {
          const messageID = findLastAssistantMessageId(sessionID) ?? reasoningID;
          activeReasoningParts.set(reasoningID, {
            id: reasoningID,
            messageID,
            sessionID,
            text: '',
            done: false,
          });
        }

        const rp = activeReasoningParts.get(reasoningID)!;
        if (!rp.done) {
          rp.text += delta;
          activeReasoningParts.set(reasoningID, rp);
          appendReasoningDelta(sessionID, rp.messageID, delta);
          if (sessionID) markSessionBusy(sessionID);
          if (get().activeSessionId === sessionID) {
            set((state) => ({
              thinking: computeThinkingFromParts(sessionID),
              loading: syncActiveLoading(state.activeSessionId, state.loadingBySession),
              messages: dedupeMessagesById(getCachedMessages(sessionID)),
            }));
          }
        }
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_NEXT_REASONING_ENDED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = props.sessionID as string | undefined;
        const reasoningID = props.reasoningID as string | undefined;
        const text = props.text as string | undefined;
        if (!sessionID || !reasoningID) return;

        const rp = activeReasoningParts.get(reasoningID);
        if (rp) {
          rp.done = true;
          if (text) rp.text = text;
          activeReasoningParts.set(reasoningID, rp);
          if (rp.text) {
            updateCachedMessageReasoning(sessionID, rp.messageID, rp.text);
          }
        } else if (text) {
          const messageID = findLastAssistantMessageId(sessionID);
          if (messageID) updateCachedMessageReasoning(sessionID, messageID, text);
        }

        if (get().activeSessionId === sessionID) {
          set({
            thinking: computeThinkingFromParts(sessionID),
            messages: dedupeMessagesById(getCachedMessages(sessionID)),
          });
        }
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_NEXT_TEXT_DELTA, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = props.sessionID as string | undefined;
        const delta = props.delta as string | undefined;
        if (!sessionID || !delta) return;

        markLlmFirstToken(sessionID);
        markSessionBusy(sessionID);
        const messageID = findLastAssistantMessageId(sessionID);
        if (messageID) {
          deltaFlushBuffer.push({ sessionId: sessionID, messageId: messageID, delta });
          scheduleDeltaFlush();
        } else {
          appendDeltaToLastAssistant(sessionID, delta);
        }
        if (get().activeSessionId === sessionID) {
          set((state) => ({
            loading: syncActiveLoading(state.activeSessionId, state.loadingBySession),
            messages: dedupeMessagesById(getCachedMessages(sessionID)),
          }));
        }
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_NEXT_TEXT_ENDED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = props.sessionID as string | undefined;
        const text = props.text as string | undefined;
        if (!sessionID || !text) return;

        flushDeltaBufferSync();
        const cached = messageCache.get(sessionID);
        if (cached) {
          const idx = findLastAssistantIndex(cached);
          if (idx !== -1) {
            cached[idx] = {
              ...cached[idx],
              content: mergeMessageContent(cached[idx].content, text),
            };
            messageCache.set(sessionID, cached);
          }
        }

        if (get().activeSessionId === sessionID) {
          set({ messages: dedupeMessagesById(getCachedMessages(sessionID)) });
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
          pipelineMark(sessionID, 'session:busy', { status: status.type });
          markSessionBusy(sessionID);
        } else if (status.type === 'idle') {
          pipelineMark(sessionID, 'session:idle', { status: status.type });
          if (!findRunningCompaction(sessionID)) {
            clearSessionBusy(sessionID);
          }
        }
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_IDLE, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = String(props.sessionID ?? props.sessionId ?? '');
        activeReasoningParts.clear();
        if (sessionID) {
          flushDeltaBufferSync();
          pipelineMark(sessionID, 'session:idle', { source: 'SESSION_IDLE' });
          if (!findRunningCompaction(sessionID)) {
            clearSessionBusy(sessionID);
          }
          return;
        }
        set((state) => ({
          loadingBySession: {},
          loading: false,
          sessionActivity: {},
          thinking: { active: false },
        }));
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_ERROR, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = String(props.sessionID ?? props.sessionId ?? '');
        activeReasoningParts.clear();
        const errObj = props.error as Record<string, unknown> | undefined;
        const errMsg =
          typeof props.error === 'string'
            ? props.error
            : typeof errObj?.message === 'string'
              ? String(errObj.message)
              : typeof (errObj?.data as Record<string, unknown> | undefined)?.message === 'string'
                ? String((errObj?.data as Record<string, unknown>).message)
                : JSON.stringify(props.error ?? props);
        const sessionNotFound = /Session not found/i.test(errMsg);
        const sessionKnown = useSessionStore.getState().sessions.some((s) => s.id === sessionID);
        if (sessionNotFound && !sessionKnown) {
          debugWarn('session.error.stale', errMsg, { sessionID, event: EventType.SESSION_ERROR });
          return;
        }
        debugError('session.error', errMsg, { sessionID, event: EventType.SESSION_ERROR });
        if (sessionID) {
          useSessionStore.getState().setSessionRunStatus(sessionID, 'error');
          set((state) => {
            const { [sessionID]: _removed, ...loadingBySession } = state.loadingBySession;
            return {
              loadingBySession,
              loading: syncActiveLoading(state.activeSessionId, loadingBySession),
              sessionActivity: patchSessionActivity(state.sessionActivity, sessionID, null),
              thinking: state.activeSessionId === sessionID ? { active: false } : state.thinking,
            };
          });
          return;
        }
        set({ loading: false, loadingBySession: {}, thinking: { active: false } });
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_NEXT_TOOL_INPUT_STARTED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = String(props.sessionID ?? props.sessionId ?? '');
        const toolName = String(props.name ?? 'tool');
        if (!sessionID) return;
        pipelineMark(sessionID, 'v2:tool.input.started', { tool: toolName });
        setToolActivity(sessionID, toolName, 'tool-input');
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_NEXT_TOOL_CALLED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = String(props.sessionID ?? props.sessionId ?? '');
        const toolName = String(props.name ?? 'tool');
        const input = typeof props.input === 'string'
          ? props.input
          : props.input
            ? JSON.stringify(props.input, null, 2)
            : undefined;
        if (!sessionID) return;
        pipelineMark(sessionID, 'v2:tool.called', { tool: toolName, hasInput: !!input });
        if (toolName === 'question') {
          void import('./permission').then(({ recoverPendingQuestionsForSession }) => {
            void recoverPendingQuestionsForSession(sessionID, 'session.next.tool-called');
          });
        }
        setToolActivity(sessionID, toolName, 'tool-running', input);
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_NEXT_TOOL_PROGRESS, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = String(props.sessionID ?? props.sessionId ?? '');
        const toolName = String(props.name ?? get().sessionActivity[sessionID]?.toolName ?? 'tool');
        const content = Array.isArray(props.content)
          ? props.content
              .map((item) => {
                const row = item as Record<string, unknown>;
                return typeof row.text === 'string' ? row.text : '';
              })
              .filter(Boolean)
              .join('\n')
              .trim()
          : '';
        if (!sessionID) return;
        setToolActivity(sessionID, toolName, 'tool-running', undefined, content.slice(0, 200) || undefined);
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_NEXT_TOOL_SUCCESS, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = String(props.sessionID ?? props.sessionId ?? '');
        const toolName = String(props.name ?? get().sessionActivity[sessionID]?.toolName ?? 'tool');
        if (!sessionID) return;
        pipelineMark(sessionID, 'v2:tool.success', { tool: toolName });
        if (toolName === 'team_message') {
          handleTeamMessageToolSuccess(sessionID, props.input);
        }
        const { label } = formatToolActivityLabel(toolName);
        set((state) => ({
          sessionActivity: patchSessionActivity(state.sessionActivity, sessionID, {
            sessionId: sessionID,
            kind: 'tool-running',
            label: `${label}完成`,
            toolName,
          }),
        }));
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_NEXT_TOOL_FAILED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = String(props.sessionID ?? props.sessionId ?? '');
        const toolName = String(props.name ?? 'tool');
        const messageID = String(props.messageID ?? props.messageId ?? '');
        const error = typeof props.error === 'string' ? props.error : undefined;
        if (!sessionID) return;
        pipelineMark(sessionID, 'v2:tool.failed', { tool: toolName, error: error?.slice(0, 120) });
        debugError('tool.event.failed', error ?? 'Tool failed', {
          sessionID,
          messageID: String(props.messageID ?? props.messageId ?? ''),
          tool: toolName,
          event: EventType.SESSION_NEXT_TOOL_FAILED,
        });
        if (messageID) {
          upsertCachedToolCall(sessionID, messageID, {
            id: String(props.callID ?? props.callId ?? `${toolName}-failed`),
            name: toolName,
            status: 'error',
            error: error ?? 'Tool failed',
            output: error,
          });
        }
        const { label } = formatToolActivityLabel(toolName);
        set((state) => ({
          sessionActivity: patchSessionActivity(state.sessionActivity, sessionID, {
            sessionId: sessionID,
            kind: 'tool-running',
            label: `${label}失败`,
            toolName,
            detail: error,
          }),
          messages:
            state.activeSessionId === sessionID
              ? dedupeMessagesById(getCachedMessages(sessionID))
              : state.messages,
        }));
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_NEXT_STEP_STARTED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = String(props.sessionID ?? props.sessionId ?? '');
        const modelObj = props.model as { id?: string; providerID?: string } | undefined;
        const modelRef =
          modelObj?.providerID && modelObj?.id
            ? `${modelObj.providerID}/${modelObj.id}`
            : modelObj?.id;
        const cognition = cognitionActivityForModel(modelRef);
        if (sessionID) {
          markSessionBusy(sessionID);
          set((state) => ({
            sessionActivity: patchSessionActivity(state.sessionActivity, sessionID, {
              sessionId: sessionID,
              kind: 'thinking',
              label: cognition.label,
            }),
          }));
        }
        if (cognition.thinkingActive && (get().activeSessionId === sessionID || !sessionID)) {
          set({
            thinking: {
              active: true,
              agent: props.agent as string | undefined,
              model: cognition.modelId ?? modelObj?.id,
            },
          });
        }
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_NEXT_STEP_ENDED, () => {
        if (activeReasoningParts.size === 0) {
          set((state) => ({
            thinking: state.loading
              ? {
                  active: true,
                  agent: state.thinking.agent,
                  model: state.thinking.model,
                  reasoningText: state.thinking.reasoningText,
                }
              : { active: false },
          }));
        }
      }),
    );

    unsubscribers.push(
      on(EventType.SESSION_NEXT_STEP_FAILED, () => {
        if (activeReasoningParts.size === 0) {
          set((state) => ({
            thinking: state.loading
              ? {
                  active: true,
                  agent: state.thinking.agent,
                  model: state.thinking.model,
                  reasoningText: state.thinking.reasoningText,
                }
              : { active: false },
          }));
        }
      }),
    );

    const handleCompactionStarted = (event: Record<string, unknown>) => {
      const props = extractEventPayload(event);
      const sessionID = String(props.sessionID ?? props.sessionId ?? '');
      if (!sessionID) return;
      const id = String(event.id ?? props.id ?? `compaction-${Date.now()}`);
      const reason =
        props.reason === 'manual' || props.auto === false
          ? 'manual'
          : props.reason === 'auto' || props.auto === true
            ? 'auto'
            : findRunningCompaction(sessionID)?.reason;
      markSessionBusy(sessionID);
      upsertCachedCompaction(sessionID, {
        id,
        sessionId: sessionID,
        turnUserMessageId: findLastUserMessageId(sessionID),
        afterMessageId: findLastAssistantMessageId(sessionID),
        reason,
        status: 'running',
        streamText: '',
        startedAt: typeof props.timestamp === 'number' ? props.timestamp : Date.now(),
      });
      syncCompactionsToStore(sessionID);
    };

    const handleCompactionDelta = (event: Record<string, unknown>) => {
      const props = extractEventPayload(event);
      const sessionID = String(props.sessionID ?? props.sessionId ?? '');
      const text = typeof props.text === 'string' ? props.text : '';
      if (!sessionID || !text) return;
      const eventId = String(event.id ?? props.id ?? `compaction-${Date.now()}`);
      markSessionBusy(sessionID);
      ensureRunningCompaction(sessionID, eventId);
      patchCompactionCache(sessionID, (list) => {
        const running = list.find((c) => c.status === 'running');
        if (!running) return list;
        return list.map((c) =>
          c.id === running.id ? { ...c, streamText: c.streamText + text } : c,
        );
      });
      syncCompactionsToStore(sessionID);
    };

    const handleCompactionEnded = (event: Record<string, unknown>) => {
      const props = extractEventPayload(event);
      const sessionID = String(props.sessionID ?? props.sessionId ?? '');
      if (!sessionID) return;
      const summary = typeof props.text === 'string' ? props.text : '';
      const include = typeof props.include === 'string' ? props.include : undefined;
      const eventId = String(event.id ?? props.id ?? '');
      patchCompactionCache(sessionID, (list) => {
        let running = list.find((c) => c.status === 'running');
        if (!running && eventId) {
          running = list.find((c) => c.id === eventId);
        }
        if (!running) return list;
        return list.map((c) =>
          c.id === running!.id
            ? {
                ...c,
                status: 'done' as const,
                streamText: c.streamText || summary,
                summary: summary || c.summary,
                include,
                endedAt: typeof props.timestamp === 'number' ? props.timestamp : Date.now(),
              }
            : c,
        );
      });
      syncCompactionsToStore(sessionID);
    };

    const handleSessionCompacted = (event: Record<string, unknown>) => {
      const props = extractEventPayload(event);
      const sessionID = String(props.sessionID ?? props.sessionId ?? '');
      if (!sessionID) return;
      patchCompactionCache(sessionID, (list) =>
        list.map((c) =>
          c.status === 'running'
            ? { ...c, status: 'done' as const, endedAt: Date.now() }
            : c,
        ),
      );
      syncCompactionsToStore(sessionID);
    };

    const compactionStartedTypes = [
      EventType.SESSION_NEXT_COMPACTION_STARTED,
      'session.next.compaction.started.1',
    ];
    const compactionDeltaTypes = [
      EventType.SESSION_NEXT_COMPACTION_DELTA,
      'session.next.compaction.delta.1',
    ];
    const compactionEndedTypes = [
      EventType.SESSION_NEXT_COMPACTION_ENDED,
      'session.next.compaction.ended.1',
    ];

    for (const type of compactionStartedTypes) {
      unsubscribers.push(on(type, handleCompactionStarted));
    }
    for (const type of compactionDeltaTypes) {
      unsubscribers.push(on(type, handleCompactionDelta));
    }
    for (const type of compactionEndedTypes) {
      unsubscribers.push(on(type, handleCompactionEnded));
    }
    unsubscribers.push(on(EventType.SESSION_COMPACTED, handleSessionCompacted));

    unsubscribers.push(
      on(EventType.SESSION_UPDATED, (event) => {
        const props = extractEventPayload(event);
        const info = (props.info ?? props) as Record<string, unknown>;
        const sessionID = typeof info.id === 'string' ? info.id : '';
        if (!sessionID) return;
        const time = info.time as Record<string, unknown> | undefined;
        const compactingAt = time?.compacting;
        if (typeof compactingAt !== 'number') return;
        if (findRunningCompaction(sessionID)) return;
        markSessionBusy(sessionID);
        upsertCachedCompaction(sessionID, {
          id: `compaction-${compactingAt}`,
          sessionId: sessionID,
          turnUserMessageId: findLastUserMessageId(sessionID),
          afterMessageId: findLastAssistantMessageId(sessionID),
          reason: 'auto',
          status: 'running',
          streamText: '',
          startedAt: compactingAt,
        });
        syncCompactionsToStore(sessionID);
      }),
    );

    return () => {
      flushDeltaBufferSync();
      unsubscribers.forEach((unsub) => unsub());
      deltaFlushBuffer = [];
      deltaFlushScheduled = false;
      deltaFlushApplyFn = null;
    };
  },
};
});
