import type { ToolCall } from '../types';
import type { SessionActivity } from '../stores/message';

export function formatToolLine(name: string, detail?: string): string {
  const labels: Record<string, string> = {
    team_spawn: 'Creating teammate',
    team_create: 'Creating team',
    team_shutdown: 'Shutting down teammate',
    team_cleanup: 'Cleaning up team',
    team_list: 'Listing team',
    team_tasks: 'Updating team tasks',
    bash: 'Running command',
    read: 'Reading file',
    edit: 'Editing file',
    write: 'Writing file',
    grep: 'Searching',
    glob: 'Finding files',
    task: 'Running task',
  };
  const label = labels[name] ?? name;
  return detail ? `${label} · ${detail}` : label;
}

export function activeToolCalls(toolCalls?: ToolCall[]): ToolCall[] {
  if (!toolCalls?.length) return [];
  return toolCalls.filter((tc) => tc.status === 'running' || tc.status === 'pending');
}

export type LiveExecutionState =
  | { kind: 'permission'; label: string; detail?: string }
  | { kind: 'tool'; label: string; detail?: string }
  | { kind: 'thinking'; label: string }
  | null;

export function resolveLiveExecution(
  isStreaming: boolean,
  activity: SessionActivity | null | undefined,
  thinkingActive: boolean | undefined,
  toolCalls?: ToolCall[],
): LiveExecutionState {
  if (!isStreaming) return null;

  if (activity?.kind === 'permission') {
    return { kind: 'permission', label: activity.label, detail: activity.detail };
  }

  const active = activeToolCalls(toolCalls);
  if (active.length > 0) {
    const last = active[active.length - 1];
    let detail: string | undefined;
    if (last.input) {
      try {
        const parsed = JSON.parse(last.input) as Record<string, unknown>;
        if (typeof parsed.name === 'string') detail = parsed.name;
        else if (typeof parsed.command === 'string') detail = parsed.command;
        else if (typeof parsed.path === 'string') detail = parsed.path;
      } catch {
        detail = last.input.length < 80 ? last.input : undefined;
      }
    }
    return {
      kind: 'tool',
      label: formatToolLine(last.name),
      detail,
    };
  }

  if (activity && activity.kind !== 'thinking') {
    return { kind: 'tool', label: activity.label, detail: activity.detail };
  }

  if (thinkingActive || activity?.kind === 'thinking') {
    return { kind: 'thinking', label: 'Thinking' };
  }

  return { kind: 'thinking', label: 'Thinking' };
}
