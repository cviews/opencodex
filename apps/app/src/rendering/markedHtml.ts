import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { splitMarkdownStream } from './markdown-stream';
import { getCachedMarkdownHtml, hashString, setCachedMarkdownHtml } from './markdown-cache';

marked.setOptions({
  gfm: true,
  breaks: false,
});

const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'script'],
  FORBID_CONTENTS: ['style', 'script'],
  ADD_ATTR: ['target', 'rel'],
};

function sanitize(html: string) {
  if (typeof window === 'undefined' || !DOMPurify.isSupported) {
    return escapeHtml(html);
  }
  return String(DOMPurify.sanitize(html, SANITIZE_CONFIG));
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fallbackPlain(text: string) {
  return escapeHtml(text).replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
}

async function parseBlock(src: string): Promise<string> {
  const parsed = await marked.parse(src);
  return sanitize(typeof parsed === 'string' ? parsed : String(parsed));
}

export async function renderMarkdownHtml(
  text: string,
  options: { cacheKey?: string; streaming?: boolean },
): Promise<string> {
  if (!text) return '';

  const blocks = splitMarkdownStream(text, !!options.streaming);
  const base = options.cacheKey ?? hashString(text);

  const htmlParts = await Promise.all(
    blocks.map(async (block, index) => {
      const hash = hashString(block.raw);
      const key = `${base}:${index}:${block.mode}`;
      const cached = getCachedMarkdownHtml(key, hash);
      if (cached !== undefined) return cached;

      try {
        const html = await parseBlock(block.src);
        setCachedMarkdownHtml(key, hash, html);
        return html;
      } catch {
        return fallbackPlain(block.raw);
      }
    }),
  );

  return htmlParts.join('');
}
