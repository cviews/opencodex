import { isDebugEnabled } from './debugMode';

const PREFIX = '[zmn-opencodex]';

export { DEBUG_STORAGE_KEY, isDebugEnabled } from './debugMode';

function formatDetail(detail: unknown): { message: string; stack?: string } {
  if (detail instanceof Error) {
    return { message: detail.message, stack: detail.stack };
  }
  if (detail && typeof detail === 'object' && 'message' in detail) {
    const msg = String((detail as { message: unknown }).message);
    const stack =
      'stack' in detail && typeof (detail as { stack?: unknown }).stack === 'string'
        ? (detail as { stack: string }).stack
        : undefined;
    return { message: msg, stack };
  }
  return { message: String(detail) };
}

export function debugLog(
  tag: string,
  detail?: unknown,
  extra?: Record<string, unknown>,
): void {
  if (!isDebugEnabled()) return;
  console.info(`${PREFIX} ${tag}`, detail ?? '', extra ?? {});
}

export function debugError(
  tag: string,
  detail: unknown,
  extra?: Record<string, unknown>,
): void {
  if (!isDebugEnabled()) return;
  const { message, stack } = formatDetail(detail);
  console.error(`${PREFIX} ${tag}`, message, { ...extra, stack });
}

export function debugWarn(
  tag: string,
  detail: unknown,
  extra?: Record<string, unknown>,
): void {
  if (!isDebugEnabled()) return;
  const { message, stack } = formatDetail(detail);
  console.warn(`${PREFIX} ${tag}`, message, { ...extra, stack });
}

export function debugInfo(tag: string, detail: unknown, extra?: Record<string, unknown>): void {
  if (!isDebugEnabled()) return;
  console.info(`${PREFIX} ${tag}`, detail, extra ?? {});
}

export { pipelineMark, pipelineReset, pipelineMarkFromSse, isPipelineTimingEnabled } from './pipelineTiming';
