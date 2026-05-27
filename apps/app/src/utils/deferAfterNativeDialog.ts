/** Give macOS/Electron time to fully dismiss the native folder picker before heavy work. */
export function deferAfterNativeDialog(ms = 120): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, ms);
    });
  });
}
