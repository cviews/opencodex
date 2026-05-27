import type { ActivityStep, ActivityStepStatus } from './activitySteps';
import { COGNITION_LABELS } from './activitySteps';

/** Cursor compact-all-grouped default */
export const MIN_EXPLORATION_GROUP_SIZE = 2;

/** Read/LS-only buffers need 3 steps before merging (Cursor Zrr). */
export const MIN_READ_LS_GROUP_SIZE = 3;

const EXPLORATION_TOOLS = new Set([
  'read',
  'grep',
  'glob',
  'search',
  'ls',
  'webfetch',
  'websearch',
  'semsearch',
  'fetch',
  'task',
]);

const SHELL_TOOLS = new Set(['bash']);

export type ActivityRailItem =
  | { kind: 'single'; step: ActivityStep }
  | {
      kind: 'group';
      id: string;
      loadingLabel: string;
      completedLabel: string;
      detail?: string;
      steps: ActivityStep[];
      status: ActivityStepStatus;
      isLoading: boolean;
    };

function isExplorationTool(toolName?: string): boolean {
  return !!toolName && EXPLORATION_TOOLS.has(toolName);
}

function isShellTool(toolName?: string): boolean {
  return !!toolName && SHELL_TOOLS.has(toolName);
}

function isGroupableToolStep(step: ActivityStep): boolean {
  if (COGNITION_LABELS.has(step.label)) return false;
  if (step.label.endsWith(' failed')) return false;
  if (!step.toolName) return false;
  if (step.toolName.startsWith('team_')) return false;
  if (step.toolName === 'edit' || step.toolName === 'write') return false;
  return isExplorationTool(step.toolName) || isShellTool(step.toolName);
}

function groupStatus(steps: ActivityStep[]): ActivityStepStatus {
  return steps.some((s) => s.status === 'running') ? 'running' : 'done';
}

function buildExploredDetail(steps: ActivityStep[]): string {
  const files = new Set<string>();
  let searches = 0;
  let fetches = 0;

  for (const step of steps) {
    const tool = step.toolName;
    if (!tool) continue;
    if (tool === 'read' || tool === 'edit' || tool === 'write' || tool === 'ls') {
      const path = step.detailTitle ?? step.detail;
      if (path) files.add(path);
    } else if (tool === 'grep' || tool === 'glob' || tool === 'search') {
      searches += 1;
    } else if (tool === 'webfetch' || tool === 'fetch') {
      fetches += 1;
    }
  }

  const parts: string[] = [];
  if (files.size > 0) {
    parts.push(`${files.size} file${files.size === 1 ? '' : 's'}`);
  }
  if (searches > 0) {
    parts.push(`${searches} search${searches === 1 ? '' : 'es'}`);
  }
  if (fetches > 0) {
    parts.push(`${fetches} fetch${fetches === 1 ? '' : 'es'}`);
  }
  if (parts.length === 0) {
    return `${steps.length} step${steps.length === 1 ? '' : 's'}`;
  }
  return parts.join(', ');
}

function shellGroupLabels(steps: ActivityStep[]): { loading: string; completed: string; detail: string } {
  const count = steps.length;
  const noun = count === 1 ? 'command' : 'commands';
  return {
    loading: 'Running',
    completed: 'Ran',
    detail: `${count} ${noun}`,
  };
}

function explorationGroupLabels(steps: ActivityStep[]): { loading: string; completed: string; detail: string } {
  return {
    loading: 'Exploring',
    completed: 'Explored',
    detail: buildExploredDetail(steps),
  };
}

function groupLabels(steps: ActivityStep[]): { loading: string; completed: string; detail: string } {
  if (steps.length > 0 && steps.every((s) => isShellTool(s.toolName))) {
    return shellGroupLabels(steps);
  }
  return explorationGroupLabels(steps);
}

function minGroupSizeForBuffer(steps: ActivityStep[]): number {
  const hasThinking = steps.some((s) => COGNITION_LABELS.has(s.label));
  if (hasThinking) return steps.length;

  const onlyReadLs = steps.every(
    (s) => !s.toolName || s.toolName === 'read' || s.toolName === 'ls',
  );
  if (onlyReadLs) return MIN_READ_LS_GROUP_SIZE;

  return MIN_EXPLORATION_GROUP_SIZE;
}

function flushBuffer(
  buffer: ActivityStep[],
  items: ActivityRailItem[],
): void {
  if (buffer.length === 0) return;

  const minSize = minGroupSizeForBuffer(buffer);
  const toolCount = buffer.filter((s) => s.toolName).length;
  const threshold = buffer.some((s) => COGNITION_LABELS.has(s.label))
    ? buffer.length
    : toolCount;

  if (threshold < minSize) {
    for (const step of buffer) {
      items.push({ kind: 'single', step });
    }
    buffer.length = 0;
    return;
  }

  const labels = groupLabels(buffer);
  const status = groupStatus(buffer);
  items.push({
    kind: 'group',
    id: `group-${buffer[0]?.id ?? 'steps'}-${buffer.length}`,
    loadingLabel: labels.loading,
    completedLabel: labels.completed,
    detail: labels.detail,
    steps: [...buffer],
    status,
    isLoading: status === 'running',
  });
  buffer.length = 0;
}

export function groupActivityStepsForRail(
  steps: ActivityStep[],
  _options: { isStreaming?: boolean } = {},
): ActivityRailItem[] {
  const items: ActivityRailItem[] = [];
  const buffer: ActivityStep[] = [];

  for (const step of steps) {
    if (isGroupableToolStep(step)) {
      buffer.push(step);
      continue;
    }
    flushBuffer(buffer, items);
    items.push({ kind: 'single', step });
  }

  flushBuffer(buffer, items);

  return items;
}

export function buildGroupPreviewContent(
  steps: ActivityStep[],
  streamDraft?: string,
): string {
  const lines: string[] = [];
  for (const step of steps) {
    const head = step.detail ? `${step.label}  ${step.detail}` : step.label;
    lines.push(head);
    if (step.body?.trim() && step.status === 'running') {
      lines.push(step.body.trim());
    }
  }
  const draft = streamDraft?.trim();
  if (draft) lines.push(draft);
  return lines.join('\n');
}
