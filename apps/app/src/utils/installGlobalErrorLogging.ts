import { debugError } from './debugLog';

let installed = false;

/** Capture uncaught renderer errors so they appear in DevTools with [zmn-opencodex] prefix. */
export function installGlobalErrorLogging(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    debugError('global.error', event.error ?? event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    debugError('global.unhandledrejection', event.reason);
  });
}
