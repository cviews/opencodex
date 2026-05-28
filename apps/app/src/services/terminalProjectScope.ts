/** When true, EmbeddedTerminal unmount must not call pty.remove (project switch). */
let suppressPtyRemoveDepth = 0;

export function beginTerminalProjectSwitch(): void {
  suppressPtyRemoveDepth += 1;
}

export function endTerminalProjectSwitch(): void {
  suppressPtyRemoveDepth = Math.max(0, suppressPtyRemoveDepth - 1);
}

export function shouldSuppressTerminalPtyRemove(): boolean {
  return suppressPtyRemoveDepth > 0;
}

/** Defer until React unmount from project remount has finished. */
export function finishTerminalProjectSwitch(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      endTerminalProjectSwitch();
    });
  });
}
