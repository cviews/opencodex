import type { PendingPermission, PendingQuestion } from '../types';
import { questionLog, questionWarn } from '../utils/questionDebug';

export type PermissionMode = 'default' | 'auto-review' | 'full-access';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickMessage(metadata: Record<string, unknown>, patterns: string[], permission: string): string {
  for (const key of ['filepath', 'filePath', 'parentDir', 'description', 'command', 'path', 'file', 'url', 'pattern']) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  if (patterns.length > 0) {
    return patterns.join(', ');
  }
  return permission;
}

function normalizePatterns(raw: Record<string, unknown>): string[] {
  if (Array.isArray(raw.patterns)) {
    return raw.patterns.filter((item): item is string => typeof item === 'string');
  }
  if (typeof raw.pattern === 'string' && raw.pattern.trim()) {
    return [raw.pattern.trim()];
  }
  if (Array.isArray(raw.pattern)) {
    return raw.pattern.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

export function normalizePermissionRequest(raw: Record<string, unknown>): PendingPermission | null {
  const id =
    (typeof raw.id === 'string' && raw.id)
    || (typeof raw.requestID === 'string' && raw.requestID)
    || '';
  if (!id) return null;

  const permission =
    (typeof raw.permission === 'string' && raw.permission) ||
    (typeof raw.type === 'string' && raw.type) ||
    'unknown';
  const patterns = normalizePatterns(raw);
  const metadata = asRecord(raw.metadata);
  const scope = patterns.length > 0 ? patterns.join(', ') : undefined;
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : permission;
  const sessionId =
    (typeof raw.sessionID === 'string' && raw.sessionID)
    || (typeof raw.sessionId === 'string' && raw.sessionId)
    || undefined;

  return {
    id,
    sessionId,
    kind: permission,
    title,
    message: pickMessage(metadata, patterns, permission),
    scope,
    metadata: Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [key, String(value)]),
    ),
    receivedAt: Date.now(),
  };
}

export function normalizeQuestionRequest(raw: Record<string, unknown>): PendingQuestion | null {
  const id =
    (typeof raw.id === 'string' && raw.id)
    || (typeof raw.requestID === 'string' && raw.requestID)
    || '';
  if (!id) {
    questionWarn('normalize.missing-id', {
      keys: Object.keys(raw),
      preview: JSON.stringify(raw).slice(0, 400),
    });
    return null;
  }

  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  if (questions.length === 0) {
    questionWarn('normalize.empty-questions', { id, preview: JSON.stringify(raw).slice(0, 400) });
  }
  const first = asRecord(questions[0]);
  const options = Array.isArray(first.options)
    ? first.options
        .map((option) => {
          if (typeof option === 'string' && option.trim()) {
            return { label: option.trim() };
          }
          const item = asRecord(option);
          const label =
            (typeof item.label === 'string' && item.label.trim())
            || (typeof item.description === 'string' && item.description.trim())
            || '';
          const description =
            typeof item.description === 'string' && item.description.trim() && item.description !== label
              ? item.description.trim()
              : undefined;
          return label ? { label, description } : null;
        })
        .filter((item): item is { label: string; description?: string } => item !== null)
    : [];

  const sessionId =
    (typeof raw.sessionID === 'string' && raw.sessionID)
    || (typeof raw.sessionId === 'string' && raw.sessionId)
    || undefined;

  return {
    id,
    sessionId,
    title:
      (typeof first.question === 'string' && first.question) ||
      (typeof first.header === 'string' && first.header) ||
      '需要你的确认',
    options,
    multiSelect: Boolean(first.multiple),
    allowCustom: first.custom !== false,
    step: questions.length > 1 ? 1 : undefined,
    totalSteps: questions.length > 1 ? questions.length : undefined,
  };
}

export function permissionConfigForMode(mode: string) {
  if (mode === 'full-access') {
    return 'allow' as const;
  }
  if (mode === 'auto-review') {
    return {
      read: 'allow' as const,
      external_directory: 'allow' as const,
      glob: 'allow' as const,
      grep: 'allow' as const,
      list: 'allow' as const,
      edit: 'ask' as const,
      bash: 'ask' as const,
      write: 'ask' as const,
      webfetch: 'ask' as const,
      task: 'ask' as const,
      team_list: 'allow' as const,
      team_tasks: 'allow' as const,
      team_message: 'allow' as const,
      team_broadcast: 'allow' as const,
      team_claim: 'allow' as const,
      team_spawn: 'ask' as const,
      team_create: 'ask' as const,
      team_shutdown: 'ask' as const,
      team_cleanup: 'ask' as const,
    };
  }
  return 'ask' as const;
}

function permissionRecordFromConfig(permission: unknown): Record<string, string> | null {
  if (!permission || typeof permission !== 'object' || Array.isArray(permission)) {
    return null;
  }
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(permission)) {
    if (typeof value === 'string') {
      record[key] = value;
    }
  }
  return Object.keys(record).length > 0 ? record : null;
}

function isWildcardOnly(record: Record<string, string>, action: string): boolean {
  const keys = Object.keys(record);
  return keys.length === 1 && record['*'] === action;
}

function matchesAutoReviewRecord(record: Record<string, string>): boolean {
  const template = permissionConfigForMode('auto-review');
  if (typeof template !== 'object') return false;

  const templateKeys = Object.keys(template) as Array<keyof typeof template>;
  const recordKeys = Object.keys(record);
  if (recordKeys.length !== templateKeys.length) return false;

  return templateKeys.every((key) => record[key] === template[key]);
}

/**
 * Map OpenCode config.permission back to the composer mode selector.
 * OpenCode normalizes shorthand "ask" into { "*": "ask" } — that is "default", not auto-review.
 */
export function inferPermissionModeFromConfig(permission: unknown): PermissionMode {
  if (permission === 'allow') return 'full-access';
  if (permission === 'ask' || permission === 'deny' || permission === undefined) {
    return 'default';
  }

  const record = permissionRecordFromConfig(permission);
  if (!record) return 'default';

  if (isWildcardOnly(record, 'allow')) return 'full-access';
  if (isWildcardOnly(record, 'ask') || isWildcardOnly(record, 'deny')) return 'default';

  if (matchesAutoReviewRecord(record)) return 'auto-review';

  return 'default';
}

const READ_PERMISSION_KEYS = ['read', 'glob', 'grep', 'lsp', 'list'] as const;
const WRITE_PERMISSION_KEYS = ['edit', 'write', 'bash', 'webfetch', 'task'] as const;

export function describeAgentPermission(permission: Record<string, string>): string {
  const entries = Object.entries(permission).filter(([, value]) => value);
  if (entries.length === 0) return '默认权限';

  if (isWildcardOnly(permission, 'ask')) return '默认权限';
  if (isWildcardOnly(permission, 'allow')) return '完全访问';
  if (isWildcardOnly(permission, 'deny')) return '全部禁止';

  const values = entries.map(([, value]) => value);
  if (values.every((value) => value === 'allow')) return '完全访问';
  if (values.every((value) => value === 'deny')) return '全部禁止';

  if (matchesAutoReviewRecord(permission)) return '自动审查';

  return '自定义';
}
