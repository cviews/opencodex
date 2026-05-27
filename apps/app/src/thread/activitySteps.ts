import type { ToolCall } from '../types';
import type { SessionActivity } from '../stores/message';
import type { ChatMessage } from './types';
import {
  compactionToActivityStep,
  type CompactionActivity,
} from './compactionActivity';
import { readFailureHint, toolLooksFailed } from './toolFailure';

export type ActivityStepStatus = 'running' | 'done';

export interface ActivityStep {
  id: string;
  label: string;
  detail?: string;
  /** Full path (or long detail) shown on hover / click via title. */
  detailTitle?: string;
  body?: string;
  status: ActivityStepStatus;
  /** Original tool name for grouping (Read/Grep/…). */
  toolName?: string;
  /** Hide body after step completes until user expands (Thought/Exploring). */
  collapseWhenDone?: boolean;
}

/** Cursor-style short labels (Read, Grepped, Edited, …). */
export function cursorToolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    read: 'Read',
    grep: 'Grepped',
    glob: 'Searched',
    search: 'Searched',
    edit: 'Edited',
    write: 'Edited',
    bash: 'Ran command',
    task: 'Exploring',
    team_spawn: 'Spawned teammate',
    team_create: 'Created team',
    team_shutdown: 'Shut down teammate',
    team_cleanup: 'Cleaned up team',
    team_list: 'Listed team',
    team_tasks: 'Updated tasks',
    team_message: 'Messaged',
    team_broadcast: 'Broadcast',
    webfetch: 'Fetched',
  };
  return labels[toolName] ?? toolName;
}

function parseToolInput(input?: string): Record<string, unknown> | null {
  if (!input) return null;
  try {
    return JSON.parse(input) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractFilePathFromRaw(input?: string): string | undefined {
  if (!input) return undefined;
  const parsed = parseToolInput(input);
  if (typeof parsed?.filePath === 'string') return parsed.filePath;
  if (typeof parsed?.path === 'string') return parsed.path;
  const m = input.match(/"filePath"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m?.[1]) return m[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"');
  return undefined;
}

export function basenameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || filePath;
}

function looksLikePath(value: string): boolean {
  return value.includes('/') || value.includes('\\');
}

const PATH_DETAIL_TOOLS = new Set(['read', 'edit', 'write']);

/** Show basename in the rail; keep full path for hover / click title. */
function formatPathDetail(
  detail: string | undefined,
  toolName: string,
): { detail?: string; detailTitle?: string } {
  if (!detail) return {};
  if (toolName === 'read' || (PATH_DETAIL_TOOLS.has(toolName) && looksLikePath(detail))) {
    return { detail: basenameFromPath(detail), detailTitle: detail };
  }
  return { detail };
}

function isEmptyJsonInput(input?: string): boolean {
  const trimmed = input?.trim();
  return trimmed === '{}' || trimmed === '[]' || trimmed === '';
}

export function extractToolDetail(toolCall: Pick<ToolCall, 'name' | 'input' | 'output'>): string | undefined {
  const filePath = extractFilePathFromRaw(toolCall.input);
  if (filePath) return filePath;

  const parsed = parseToolInput(toolCall.input);
  if (toolCall.name === 'team_spawn' && parsed) {
    if (typeof parsed.name === 'string' && parsed.name.trim()) return parsed.name;
    if (typeof parsed.agent === 'string' && parsed.agent.trim()) return parsed.agent;
  }
  if (toolCall.name === 'team_message' || toolCall.name === 'team_broadcast') {
    if (typeof parsed?.to === 'string' && parsed.to.trim()) return parsed.to;
  }
  if (parsed) {
    if (typeof parsed.filePath === 'string') return parsed.filePath;
    if (typeof parsed.filepath === 'string') return parsed.filepath;
    if (typeof parsed.path === 'string') return parsed.path;
    if (typeof parsed.file === 'string') return parsed.file;
    if (typeof parsed.target === 'string') return parsed.target;
    if (typeof parsed.pattern === 'string') return parsed.pattern;
    if (typeof parsed.command === 'string') return parsed.command;
    if (typeof parsed.name === 'string' && toolCall.name.startsWith('team_')) return parsed.name;
    if (typeof parsed.agent === 'string') return parsed.agent;
    if (typeof parsed.query === 'string') return parsed.query;
    if (typeof parsed.url === 'string') return parsed.url;
  }
  if (toolCall.input && toolCall.input.length < 120 && !isEmptyJsonInput(toolCall.input)) {
    return toolCall.input.trim();
  }
  if (toolCall.name === 'read' && toolCall.output) {
    const firstLine = toolCall.output.split('\n')[0]?.trim();
    if (firstLine && firstLine.length < 200) return firstLine;
  }
  return undefined;
}

function toolStatusToStepStatus(
  status: ToolCall['status'],
): ActivityStepStatus {
  if (status === 'running' || status === 'pending') return 'running';
  return 'done';
}

const TEAM_STEP_DEDUPE = new Set(['team_create', 'team_spawn', 'team_cleanup']);

function toolCallStepId(toolCall: ToolCall, index: number): string {
  const parsed = parseToolInput(toolCall.input);
  const teamName =
    typeof parsed?.name === 'string' && parsed.name.trim()
      ? parsed.name.trim()
      : undefined;
  if (teamName && TEAM_STEP_DEDUPE.has(toolCall.name)) {
    return `${toolCall.name}:${teamName}`;
  }
  return toolCall.id ?? `tool-${toolCall.name}-${index}`;
}

function buildFailedToolBody(toolCall: ToolCall, detail?: string): string {
  const parts: string[] = [];
  if (toolCall.error?.trim()) parts.push(toolCall.error.trim());
  if (toolCall.output?.trim()) parts.push(toolCall.output.trim());

  const blob = parts.join('\n\n');
  const charLimitHit =
    /exceeds\s+\d+\s+characters/i.test(blob) || /Message text exceeds/i.test(blob);

  if (charLimitHit && toolCall.input) {
    const parsed = parseToolInput(toolCall.input);
    const msgText =
      typeof parsed?.message === 'string'
        ? parsed.message
        : typeof parsed?.text === 'string'
          ? parsed.text
          : undefined;
    const to = typeof parsed?.to === 'string' ? parsed.to : undefined;
    if (msgText) {
      parts.push(
        `发送至 ${to ?? '?'} 的消息过长（${msgText.length} 字符，限制 10240）\n\n${msgText.slice(0, 400)}${msgText.length > 400 ? '…' : ''}`,
      );
    } else if (toolCall.input.length > 200) {
      parts.push(
        `消息内容过长（约 ${toolCall.input.length} 字符，限制 10240）\n\n${toolCall.input.slice(0, 400)}…`,
      );
    }
  } else if (!parts.length && toolCall.input && toolCall.input.length <= 800) {
    parts.push(toolCall.input);
  } else if (!parts.length && detail) {
    parts.push(detail);
  }

  if (!parts.length) {
    const hint = readFailureHint(toolCall);
    parts.push(hint ?? '工具执行失败');
  } else {
    const hint = readFailureHint(toolCall);
    if (hint && !parts.some((p) => p.includes(hint.slice(0, 20)))) {
      parts.push(hint);
    }
  }
  return parts.join('\n\n');
}

function toolCallToStep(toolCall: ToolCall, index: number): ActivityStep {
  const id = toolCallStepId(toolCall, index);
  const isError = toolLooksFailed(toolCall);
  let detail = extractToolDetail(toolCall);
  let body: string | undefined;
  if (isError) {
    body = buildFailedToolBody(toolCall, detail);
  } else {
    const bodyParts: string[] = [];
    if (toolCall.output) bodyParts.push(toolCall.output);
    if (toolCall.input) bodyParts.push(toolCall.input);
    if (toolCall.error) bodyParts.push(toolCall.error);
    body = bodyParts.length > 0 ? bodyParts.join('\n\n') : undefined;
    if (!body?.trim() && detail) body = detail;
    if (!body?.trim() && toolCall.input && toolCall.input.length <= 800) {
      body = toolCall.input;
    }
  }

  const pathParts = formatPathDetail(detail, toolCall.name);

  return {
    id,
    label: isError ? `${cursorToolLabel(toolCall.name)} failed` : cursorToolLabel(toolCall.name),
    detail: pathParts.detail,
    detailTitle: pathParts.detailTitle,
    body: body && body.trim().length > 0 ? body : undefined,
    status: isError ? 'done' : toolStatusToStepStatus(toolCall.status),
    toolName: toolCall.name,
  };
}

function permissionStep(activity: SessionActivity): ActivityStep {
  return {
    id: 'permission-live',
    label: activity.label || 'Waiting for approval',
    detail: activity.detail,
    status: 'running',
  };
}

function liveActivityToStep(activity: SessionActivity): ActivityStep | null {
  if (activity.kind === 'permission') return permissionStep(activity);
  if (activity.kind === 'thinking') {
    const label =
      activity.label === 'Preparing next step'
        ? 'Preparing next step'
        : COGNITION_WAIT_LABELS.has(activity.label)
          ? 'Thinking'
          : activity.label || 'Thinking';
    return { id: 'cognition-live', label, status: 'running' };
  }
  const toolName = activity.toolName ?? '';
  const pathParts = formatPathDetail(activity.detail, toolName);
  return {
    id: `live-${toolName || activity.kind}`,
    label: toolName ? cursorToolLabel(toolName) : activity.label,
    detail: pathParts.detail,
    detailTitle: pathParts.detailTitle,
    status: 'running',
    toolName: toolName || undefined,
  };
}

export type CognitionRailLabel = 'Thinking' | 'Thought' | 'Preparing next step';

/** Store labels that still mean the UI is in the initial Thinking phase. */
export const COGNITION_WAIT_LABELS = new Set([
  'Thinking',
  'Waiting for model…',
  'Model response is slow…',
  'Responding…',
]);

/** Reasoning length before the rail promotes Thinking → Thought. */
export const THOUGHT_PROMOTE_MIN_CHARS = 72;

export function shouldPromoteReasoningToThought(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length >= THOUGHT_PROMOTE_MIN_CHARS) return true;
  if (trimmed.includes('\n\n')) return true;
  if (trimmed.split('\n').length >= 3) return true;
  return false;
}

export function resolveCognitionLabel(options: {
  reasoningText?: string;
  reasoningDone?: boolean;
  liveActivity?: SessionActivity | null;
  modelSupportsReasoning?: boolean;
}): CognitionRailLabel {
  const { reasoningText, reasoningDone, liveActivity, modelSupportsReasoning = false } = options;

  if (liveActivity?.label === 'Preparing next step') return 'Preparing next step';

  const trimmed = reasoningText?.trim();
  if (modelSupportsReasoning && trimmed) {
    if (reasoningDone || shouldPromoteReasoningToThought(trimmed)) return 'Thought';
    return 'Thinking';
  }

  return 'Thinking';
}

export function cognitionStep(
  id: string,
  body: string | undefined,
  status: ActivityStepStatus,
  label: CognitionRailLabel,
): ActivityStep {
  return {
    id,
    label,
    body: body?.trim() || undefined,
    status,
    collapseWhenDone: true,
  };
}

export interface BuildActivityStepsOptions {
  message?: ChatMessage;
  thinkingActive?: boolean;
  reasoningText?: string;
  reasoningDone?: boolean;
  liveActivity?: SessionActivity | null;
  isStreaming?: boolean;
  modelSupportsReasoning?: boolean;
}

function upsertCognitionStep(
  steps: ActivityStep[],
  id: string,
  body: string | undefined,
  status: ActivityStepStatus,
  label: CognitionRailLabel,
): void {
  const liveIdx = steps.findIndex((s) => s.id === 'cognition-live');
  const next = cognitionStep(id, body, status, label);

  if (id === 'cognition-done' && liveIdx >= 0) {
    steps[liveIdx] = next;
    return;
  }
  if (id === 'cognition-live' && liveIdx >= 0) {
    steps[liveIdx] = next;
    return;
  }
  if (!steps.some((s) => s.id === id)) {
    steps.push(next);
  }
}

export function buildActivitySteps(options: BuildActivityStepsOptions): ActivityStep[] {
  const {
    message,
    thinkingActive,
    reasoningText,
    reasoningDone = false,
    liveActivity,
    isStreaming,
    modelSupportsReasoning = false,
  } = options;

  const steps: ActivityStep[] = [];
  const toolCalls = message?.toolCalls ?? [];
  const hasRunningTool = toolCalls.some(
    (tc) => tc.status === 'running' || tc.status === 'pending',
  );
  const hasAnyTools = toolCalls.length > 0;

  const persistedReasoning = modelSupportsReasoning ? message?.reasoningContent?.trim() : undefined;
  const liveReasoning = modelSupportsReasoning ? reasoningText?.trim() : undefined;
  const reasoning = liveReasoning || persistedReasoning;

  const cognitionWaiting =
    liveActivity?.kind === 'thinking' &&
    (COGNITION_WAIT_LABELS.has(liveActivity.label) ||
      liveActivity.label === 'Preparing next step');

  const showLiveCognition =
    isStreaming &&
    !hasRunningTool &&
    (thinkingActive || cognitionWaiting) &&
    liveActivity?.label !== 'Compressing';

  const reasoningStreamingLive =
    showLiveCognition && !!liveReasoning && !reasoningDone;

  if (reasoning && hasAnyTools && !reasoningStreamingLive) {
    upsertCognitionStep(steps, 'cognition-done', reasoning, 'done', 'Thought');
  } else if (showLiveCognition) {
    if (liveActivity?.label === 'Preparing next step' && !liveReasoning) {
      upsertCognitionStep(steps, 'cognition-live', undefined, 'running', 'Preparing next step');
    } else {
      const label = resolveCognitionLabel({
        reasoningText: reasoning,
        reasoningDone,
        liveActivity,
        modelSupportsReasoning,
      });
      upsertCognitionStep(steps, 'cognition-live', reasoning, 'running', label);
    }
  } else if (persistedReasoning && !isStreaming) {
    upsertCognitionStep(steps, 'cognition-done', persistedReasoning, 'done', 'Thought');
  }

  for (let i = 0; i < toolCalls.length; i += 1) {
    steps.push(toolCallToStep(toolCalls[i], i));
  }

  if (!isStreaming || !liveActivity) return steps;

  if (liveActivity.kind === 'permission') {
    if (!steps.some((s) => s.id === 'permission-live')) {
      steps.push(permissionStep(liveActivity));
    }
    return steps;
  }

  if (liveActivity.kind === 'thinking') {
    return steps;
  }

  if (hasRunningTool) return steps;

  const live = liveActivityToStep(liveActivity);
  if (!live) return steps;

  const liveToolName = liveActivity.toolName ?? '';
  const liveStableId =
    liveToolName && TEAM_STEP_DEDUPE.has(liveToolName)
      ? `${liveToolName}:${live.detail ?? ''}`
      : null;
  const duplicate = steps.some((s) => {
    if (s.id === 'cognition-live') return false;
    if (liveStableId && s.id === liveStableId) return true;
    return (
      s.label === live.label &&
      (s.detail === live.detail || (!s.detail && !live.detail))
    );
  });
  if (!duplicate) steps.push(live);

  return steps;
}

export const COGNITION_LABELS = new Set(['Thought', 'Exploring', 'Thinking', 'Preparing next step']);

export interface BuildTurnActivityStepsOptions {
  assistants: ChatMessage[];
  lastAssistantId?: string;
  thinkingActive?: boolean;
  reasoningText?: string;
  reasoningDone?: boolean;
  liveActivity?: SessionActivity | null;
  isStreaming?: boolean;
  compactionActivities?: CompactionActivity[];
  /** Hide Exploring/Thought draft while compressing. */
  hideStreamDraft?: boolean;
  modelSupportsReasoning?: boolean;
}

/** One activity rail per user turn (Cursor-style), merged across assistant message parts. */
export function buildTurnActivitySteps(options: BuildTurnActivityStepsOptions): ActivityStep[] {
  const {
    assistants,
    lastAssistantId,
    thinkingActive,
    reasoningText,
    reasoningDone = false,
    liveActivity,
    isStreaming,
    compactionActivities = [],
    hideStreamDraft = false,
    modelSupportsReasoning = false,
  } = options;

  const merged: ActivityStep[] = [];
  const indexById = new Map<string, number>();

  const upsert = (step: ActivityStep) => {
    const idx = indexById.get(step.id);
    if (idx === undefined) {
      indexById.set(step.id, merged.length);
      merged.push(step);
      return;
    }
    const prev = merged[idx];
    if (prev.status === 'running' && step.status === 'done') {
      merged[idx] = { ...step, body: step.body ?? prev.body };
      return;
    }
    merged[idx] = {
      ...prev,
      ...step,
      detail: step.detail ?? prev.detail,
      detailTitle: step.detailTitle ?? prev.detailTitle,
      body: step.body ?? prev.body,
      status: step.status === 'running' || prev.status === 'running' ? 'running' : step.status,
    };
  };

  const sortedCompactions = [...compactionActivities].sort((a, b) => a.startedAt - b.startedAt);
  const compactionsByAnchor = new Map<string, CompactionActivity[]>();
  for (const compaction of sortedCompactions) {
    const key = compaction.afterMessageId ?? '__end__';
    const bucket = compactionsByAnchor.get(key) ?? [];
    bucket.push(compaction);
    compactionsByAnchor.set(key, bucket);
  }

  for (const msg of assistants) {
    const isLast = msg.id === lastAssistantId;
    const steps = buildActivitySteps({
      message: msg,
      thinkingActive: isStreaming && isLast ? thinkingActive : false,
      reasoningText: isStreaming && isLast ? reasoningText : undefined,
      reasoningDone: isStreaming && isLast ? reasoningDone : false,
      liveActivity: isStreaming && isLast ? liveActivity ?? null : null,
      isStreaming: isStreaming && isLast,
      modelSupportsReasoning,
    });
    for (const step of steps) upsert(step);
    const anchored = compactionsByAnchor.get(msg.id) ?? [];
    for (const compaction of anchored) {
      upsert(compactionToActivityStep(compaction));
    }
  }

  const tailCompactions = compactionsByAnchor.get('__end__') ?? [];
  for (const compaction of tailCompactions) {
    upsert(compactionToActivityStep(compaction));
  }

  if (
    isStreaming &&
    thinkingActive &&
    !hideStreamDraft &&
    !merged.some((s) => s.id === 'cognition-live')
  ) {
    const reasoning = modelSupportsReasoning ? reasoningText?.trim() : undefined;
    const label = resolveCognitionLabel({
      reasoningText: reasoning,
      reasoningDone,
      liveActivity,
      modelSupportsReasoning,
    });
    upsert(cognitionStep('cognition-live', reasoning, 'running', label));
  }

  return merged;
}

export function turnHasToolActivity(steps: ActivityStep[]): boolean {
  return steps.some((s) => !COGNITION_LABELS.has(s.label));
}
