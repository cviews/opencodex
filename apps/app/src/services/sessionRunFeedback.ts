export type SessionRunNoticeSeverity = 'warning' | 'error';

export interface SessionRunNotice {
  message: string;
  severity: SessionRunNoticeSeverity;
}

const RETRYABLE_PROVIDER_ERROR =
  /rate limit|quota|qps|429|too many requests|resource_exhausted|overloaded|capacity|throttl/i;

export function isRetryableProviderError(message: string): boolean {
  return RETRYABLE_PROVIDER_ERROR.test(message);
}

export function formatProviderErrorNotice(message: string): SessionRunNotice {
  const trimmed = message.trim();
  if (/rate limit|429|qps|throttl/i.test(trimmed)) {
    return { message: '提供商限流，OpenCode 正在自动重试…', severity: 'warning' };
  }
  if (/quota/i.test(trimmed)) {
    return { message: '提供商配额不足，OpenCode 正在自动重试…', severity: 'warning' };
  }
  return { message: trimmed || '提供商错误，OpenCode 正在自动重试…', severity: 'warning' };
}

export function formatRetryStatusNotice(
  status: Record<string, unknown> | undefined,
  props: Record<string, unknown>,
): SessionRunNotice {
  const attempt =
    typeof status?.attempt === 'number'
      ? status.attempt
      : typeof props.attempt === 'number'
        ? props.attempt
        : undefined;
  const rawMessage =
    typeof status?.message === 'string'
      ? status.message
      : typeof props.message === 'string'
        ? props.message
        : '';
  const base = rawMessage.trim() || '提供商繁忙，正在重试…';
  const message = attempt != null ? `${base}（第 ${attempt} 次）` : base;
  return { message, severity: 'warning' };
}
