import type { ToolCall } from '../types';

/** OpenCode read tool success envelope — do not treat as failure. */
export function looksLikeSuccessfulReadOutput(text: string): boolean {
  return (
    text.includes('<path>') &&
    text.includes('<type>file</type>') &&
    text.includes('<content>')
  );
}

/** Shared heuristics for tool calls that failed but may still be marked completed. */
export function toolFailureText(toolCall: Pick<ToolCall, 'error' | 'output'>): string {
  return `${toolCall.error ?? ''}\n${toolCall.output ?? ''}`.trim();
}

export function textLooksLikeToolFailure(text: string): boolean {
  if (!text.trim()) return false;
  if (looksLikeSuccessfulReadOutput(text)) return false;
  return (
    text.includes('InstanceRef not provided') ||
    text.includes('Tool execution aborted') ||
    text.includes('Tool execution was interrupted') ||
    text.includes('PermissionRejectedError') ||
    text.includes('PermissionDeniedError') ||
    text.includes('rejected permission') ||
    text.includes('prevents you from using this specific tool call') ||
    text.includes('File not found:') ||
    text.includes('Cannot read binary file:') ||
    text.includes('Read tool failed to read') ||
    /^Error:\s/m.test(text) ||
    /exceeds\s+\d+\s+characters/i.test(text) ||
    /Message text exceeds/i.test(text)
  );
}

export function toolLooksFailed(toolCall: ToolCall): boolean {
  const blob = toolFailureText(toolCall);
  if (toolCall.name === 'read' && looksLikeSuccessfulReadOutput(blob)) {
    return false;
  }
  if (toolCall.status === 'error') return true;
  return textLooksLikeToolFailure(blob);
}

export function readFailureHint(toolCall: ToolCall): string | undefined {
  if (toolCall.name !== 'read') return undefined;
  const blob = toolFailureText(toolCall);
  if (looksLikeSuccessfulReadOutput(blob)) return undefined;
  if (blob.includes('PermissionRejectedError') || blob.includes('rejected permission')) {
    return '读取被拒绝：请在顶部权限条中点击「允许」，或将权限模式切换为「自动审查」/「完全访问」。';
  }
  if (blob.includes('PermissionDeniedError') || blob.includes('prevents you from using')) {
    return '读取被权限规则拒绝：检查 OpenCode 配置中的 permission.external_directory。';
  }
  if (blob.includes('Tool execution aborted') || blob.includes('interrupted')) {
    return '读取被中断：可能是等待外部目录权限时被取消，或会话被停止。';
  }
  const filePath = extractReadPath(toolCall.input);
  if (filePath && !blob && toolCall.status === 'error') {
    return '跨项目读取需要在权限条中批准「外部目录」访问，或使用「自动审查」模式。';
  }
  if (filePath && blob.includes('File not found')) {
    return `文件不存在或路径有误：${filePath}`;
  }
  return undefined;
}

function extractReadPath(input?: string): string | undefined {
  if (!input) return undefined;
  try {
    const parsed = JSON.parse(input) as Record<string, unknown>;
    if (typeof parsed.filePath === 'string') return parsed.filePath;
    if (typeof parsed.path === 'string') return parsed.path;
  } catch {
    const m = input.match(/"filePath"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m?.[1]) return m[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"');
  }
  return undefined;
}
