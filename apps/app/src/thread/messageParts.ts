import type { Message } from '@opencodex/types';
import type { ToolCall } from '../types';
import { isTeammateBootstrapContent } from './displayContent';
import { buildUserMessageDisplayText, extractFilePathsFromParts } from './composer/promptParts';
import { debugError } from '../utils/debugLog';
import { looksLikeSuccessfulReadOutput, textLooksLikeToolFailure, toolFailureText } from './toolFailure';

function formatToolInput(state: Record<string, unknown>): string | undefined {
  if (typeof state.raw === 'string' && state.raw.trim()) return state.raw;
  if (state.input && typeof state.input === 'object') {
    try {
      return JSON.stringify(state.input, null, 2);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function normalizeToolPart(part: Record<string, unknown>): ToolCall | null {
  const partId = typeof part.id === 'string' ? part.id : undefined;
  const name = typeof part.tool === 'string' ? part.tool : undefined;
  const state = part.state as Record<string, unknown> | undefined;
  if (!name || !state || typeof state.status !== 'string') return null;

  const output = typeof state.output === 'string' ? state.output : undefined;
  const error = typeof state.error === 'string' ? state.error : undefined;
  let status: ToolCall['status'] = 'running';
  if (state.status === 'completed') status = 'completed';
  else if (state.status === 'error') status = 'error';
  else if (state.status === 'pending') status = 'pending';

  const failureText = toolFailureText({ error, output });
  if (status === 'completed' && textLooksLikeToolFailure(failureText)) {
    status = 'error';
    debugError('tool.part.completed-as-error', failureText.trim(), { tool: name });
  }
  if (status === 'error' && name === 'read' && looksLikeSuccessfulReadOutput(failureText)) {
    status = 'completed';
  }

  return {
    id: partId ?? (typeof part.callID === 'string' ? part.callID : undefined),
    name,
    status,
    input: formatToolInput(state),
    output,
    error: error ?? (status === 'error' && output && !looksLikeSuccessfulReadOutput(output) ? output : undefined),
  };
}

export function extractToolCallsFromParts(parts: unknown[] | undefined): ToolCall[] {
  if (!Array.isArray(parts)) return [];
  const calls: ToolCall[] = [];
  for (const raw of parts) {
    if (!raw || typeof raw !== 'object') continue;
    const toolCall = normalizeToolPart(raw as Record<string, unknown>);
    if (toolCall) calls.push(toolCall);
  }
  return calls;
}

export function extractReasoningFromParts(parts: unknown[] | undefined): string | undefined {
  if (!Array.isArray(parts)) return undefined;
  const texts: string[] = [];
  for (const raw of parts) {
    if (!raw || typeof raw !== 'object') continue;
    const part = raw as Record<string, unknown>;
    if (part.type === 'reasoning' && typeof part.text === 'string' && part.text.length > 0) {
      texts.push(part.text);
    }
  }
  return texts.length > 0 ? texts.join('\n\n') : undefined;
}

function mergeToolCalls(existing: ToolCall[] | undefined, incoming: ToolCall[]): ToolCall[] {
  if (!incoming.length) return existing ?? [];
  const merged = [...(existing ?? [])];
  for (const call of incoming) {
    const key = call.id ?? call.name;
    const idx = merged.findIndex((c) => (c.id ?? c.name) === key);
    if (idx === -1) merged.push(call);
    else merged[idx] = { ...merged[idx], ...call };
  }
  return merged;
}

function extractVisibleTextFromParts(parts: unknown[] | undefined): string | undefined {
  if (!Array.isArray(parts)) return undefined;
  const texts: string[] = [];
  for (const raw of parts) {
    if (!raw || typeof raw !== 'object') continue;
    const part = raw as Record<string, unknown>;
    if (part.type !== 'text' || typeof part.text !== 'string') continue;
    if (part.synthetic === true) continue;
    const meta = part.metadata as Record<string, unknown> | undefined;
    if (meta?.teammateBootstrap === true) continue;
    texts.push(part.text);
  }
  return texts.length > 0 ? texts.join('\n\n') : undefined;
}

/** Attach tool/reasoning fields from SDK message parts (same shape as live MESSAGE_PART_UPDATED). */
export function enrichMessageFromParts(msg: Message, parts?: unknown[]): Message {
  if (!parts?.length) return msg;
  const toolCalls = mergeToolCalls(msg.toolCalls, extractToolCallsFromParts(parts));
  const reasoningContent = extractReasoningFromParts(parts) ?? msg.reasoningContent;
  const visibleText = extractVisibleTextFromParts(parts);
  const next: Message = {
    ...msg,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(reasoningContent ? { reasoningContent } : {}),
  };
  if (visibleText !== undefined) {
    next.content = visibleText;
    if (msg.role === 'user' && !msg.displayContent) {
      const filePaths = extractFilePathsFromParts(parts);
      const display = buildUserMessageDisplayText(visibleText, filePaths);
      if (display) {
        next.displayContent = display;
        next.content = display;
      }
    }
    if (msg.role === 'user' && (!visibleText.trim() || isTeammateBootstrapContent(visibleText))) {
      next.content = '';
      next.displayContent = '';
    }
  } else if (msg.role === 'user') {
    const filePaths = extractFilePathsFromParts(parts);
    if (filePaths.length > 0 && !msg.displayContent) {
      const display = buildUserMessageDisplayText(msg.content ?? '', filePaths);
      if (display) {
        next.displayContent = display;
        next.content = display;
      }
    }
    if (msg.content && isTeammateBootstrapContent(msg.content)) {
      next.content = '';
      next.displayContent = '';
    }
  }
  return next;
}
