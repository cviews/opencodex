const SERVER_URL_TTL_MS = 30_000;

let cachedServerUrl: string | null = null;
let cachedServerUrlAt = 0;

export function readCachedServerUrl(): string | null {
  const now = Date.now();
  if (cachedServerUrl && now - cachedServerUrlAt < SERVER_URL_TTL_MS) {
    return cachedServerUrl;
  }
  return null;
}

export function writeCachedServerUrl(url: string): void {
  cachedServerUrl = url;
  cachedServerUrlAt = Date.now();
}

export function invalidateOpenCodeServerUrlCache(): void {
  cachedServerUrl = null;
  cachedServerUrlAt = 0;
}
