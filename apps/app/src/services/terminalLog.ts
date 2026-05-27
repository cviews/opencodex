import { debugError, debugInfo, debugWarn } from '../utils/debugLog';
import { useTerminalStore } from '../stores/terminal';

function summarize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value && typeof value === 'object') {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }
  return value;
}

export function terminalLogInfo(
  phase: string,
  detail?: unknown,
  extra?: Record<string, unknown>,
): void {
  debugInfo(`terminal.${phase}`, detail ?? '', extra);
}

export function terminalLogWarn(
  phase: string,
  detail: unknown,
  extra?: Record<string, unknown>,
): void {
  debugWarn(`terminal.${phase}`, detail, extra);
}

export function terminalLogError(
  phase: string,
  detail: unknown,
  extra?: Record<string, unknown>,
): void {
  const message =
    detail instanceof Error
      ? detail.message
      : typeof detail === 'string'
        ? detail
        : detail && typeof detail === 'object' && 'message' in detail
          ? String((detail as { message: unknown }).message)
          : String(detail);

  debugError(`terminal.${phase}`, detail, { ...extra, summary: summarize(detail) });
  useTerminalStore.getState().setLastError(`[${phase}] ${message}`);
}

export function terminalClearError(): void {
  useTerminalStore.getState().setLastError(null);
}
