type CacheEntry = {
  hash: string;
  html: string;
};

const MAX_ENTRIES = 200;
const cache = new Map<string, CacheEntry>();

export function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function getCachedMarkdownHtml(key: string, hash: string): string | undefined {
  const entry = cache.get(key);
  if (!entry || entry.hash !== hash) return undefined;
  cache.delete(key);
  cache.set(key, entry);
  return entry.html;
}

export function setCachedMarkdownHtml(key: string, hash: string, html: string) {
  cache.delete(key);
  cache.set(key, { hash, html });
  if (cache.size <= MAX_ENTRIES) return;
  const first = cache.keys().next().value;
  if (first) cache.delete(first);
}

export function clearMarkdownCache() {
  cache.clear();
}
