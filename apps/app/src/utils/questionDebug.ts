import { isDebugEnabled } from './debugMode';

const PREFIX = '[zmn-opencodex] question';

export function questionLog(
  phase: string,
  detail?: Record<string, unknown>,
): void {
  if (!isDebugEnabled()) return;
  console.info(`${PREFIX} ${phase}`, detail ?? {});
}

export function questionWarn(
  phase: string,
  detail?: Record<string, unknown>,
): void {
  if (!isDebugEnabled()) return;
  console.warn(`${PREFIX} ${phase}`, detail ?? {});
}
