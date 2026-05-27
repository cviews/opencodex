/** Enable: localStorage.setItem('zmn_debug', '1') */
export const DEBUG_STORAGE_KEY = 'zmn_debug';

export function isDebugEnabled(): boolean {
  try {
    return localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
