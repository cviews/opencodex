let cachedUserHome: string | null = null;

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

function normalizeHomeDir(home: string): string {
  return normalizeSlashes(home).replace(/\/+$/, '');
}

/** Remember OpenCode / Electron home for tilde display. */
export function setCachedUserHome(home: string | null | undefined): void {
  const trimmed = home?.trim();
  cachedUserHome = trimmed ? normalizeHomeDir(trimmed) : null;
}

/** Infer macOS/Linux/Windows user profile directory from an absolute path. */
export function inferUserHomeFromPath(path: string): string | null {
  const normalized = normalizeSlashes(path.trim());
  if (!normalized) return null;

  const macOrLinux = normalized.match(/^(\/(?:Users|home)\/[^/]+)/);
  if (macOrLinux) return macOrLinux[1];

  const windows = normalized.match(/^([A-Za-z]:\/Users\/[^/]+)/);
  if (windows) return windows[1];

  return null;
}

export function resolveUserHome(hintPath?: string): string | null {
  if (cachedUserHome) return cachedUserHome;
  if (hintPath) return inferUserHomeFromPath(hintPath);
  return null;
}

export async function ensureUserHome(hintPath?: string): Promise<string | null> {
  if (cachedUserHome) return cachedUserHome;

  const api = typeof window !== 'undefined'
    ? (window as Window & { electronAPI?: { userHome?: () => Promise<string> } }).electronAPI
    : undefined;

  if (api?.userHome) {
    try {
      const home = await api.userHome();
      if (home?.trim()) {
        setCachedUserHome(home);
        return cachedUserHome;
      }
    } catch {
      // fall through to inference
    }
  }

  const inferred = hintPath ? inferUserHomeFromPath(hintPath) : null;
  if (inferred) {
    setCachedUserHome(inferred);
    return cachedUserHome;
  }

  return null;
}

/**
 * Format an absolute path for UI (Cursor-style): `/Users/me/code` → `~/code`.
 * Leaves non-home paths and existing `~/…` values unchanged.
 */
export function formatDisplayPath(path: string, home?: string | null): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('~/') || trimmed === '~') return trimmed;

  const normalizedPath = normalizeSlashes(trimmed);
  const homeDir = home ? normalizeHomeDir(home) : resolveUserHome(normalizedPath);
  if (!homeDir) return trimmed;

  if (normalizedPath === homeDir) return '~';
  const prefix = `${homeDir}/`;
  if (normalizedPath.startsWith(prefix)) {
    return `~${normalizedPath.slice(homeDir.length)}`;
  }

  return trimmed;
}
