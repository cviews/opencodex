import type { FilePartInput, TextPartInput } from '@opencode-ai/sdk/v2/client';
import { inferReferenceKindFromPath, referenceToken } from './referenceChip';

export type PromptAttachmentInput = {
  images: File[];
  filePaths: string[];
};

type PromptPart = TextPartInput | FilePartInput;

function basename(filepath: string): string {
  const normalized = filepath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || filepath;
}

function absolutePath(directory: string, filepath: string): string {
  if (filepath.startsWith('/')) return filepath;
  if (/^[A-Za-z]:[\\/]/.test(filepath) || /^[A-Za-z]:$/.test(filepath)) return filepath;
  if (filepath.startsWith('\\\\') || filepath.startsWith('//')) return filepath;
  return `${directory.replace(/[\\/]+$/, '')}/${filepath.replace(/^[\\/]+/, '')}`;
}

export function encodeFilePath(filepath: string): string {
  let normalized = filepath.replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(normalized)) {
    normalized = `/${normalized}`;
  }
  return normalized
    .split('/')
    .map((segment, index) => {
      if (index === 1 && /^[A-Za-z]:$/.test(segment)) return segment;
      return encodeURIComponent(segment);
    })
    .join('/');
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('error', () => reject(new Error(`Failed to read ${file.name}`)));
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`Failed to read ${file.name}`));
        return;
      }
      resolve(reader.result);
    });
    reader.readAsDataURL(file);
  });
}

export function buildOutgoingDisplayContent(
  text: string,
  images: Array<{ name: string }>,
): string {
  if (images.length === 0) return text;
  const imageTokens = images.map((image) => referenceToken('image', image.name)).join(' ');
  if (!text.trim()) return imageTokens;
  // Attachments render above the editor — show them before the typed text in chat too.
  return `${imageTokens} ${text.trim()}`.trim();
}

/** Collect absolute file paths embedded in composer text (drag-drop / @ file). */
export function extractAbsolutePathsFromText(text: string): string[] {
  const seen = new Set<string>();
  for (const token of text.split(/\s+/)) {
    const trimmed = token.replace(/[,\uFF0C;；]+$/g, '').trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('/') && trimmed.length > 1) {
      seen.add(trimmed);
      continue;
    }
    if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
      seen.add(trimmed);
    }
  }
  return [...seen];
}

export function decodeFilePartUrl(url: string): string | null {
  if (!url.startsWith('file://')) return null;
  try {
    let path = url.slice('file://'.length).split('?')[0] ?? '';
    if (/^\/[A-Za-z]:/.test(path)) {
      path = path.slice(1);
    }
    return path
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
  } catch {
    return null;
  }
}

export function isAbsoluteFilesystemPath(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/') && trimmed.includes('/', 1)) return true;
  return /^[A-Za-z]:[\\/]/.test(trimmed);
}

export function pathBasename(filepath: string): string {
  return basename(filepath);
}

export function buildUserMessageDisplayText(text: string, filePaths: string[]): string {
  const normalizedText = text.trim();
  const extras = filePaths
    .map((path) => ({ path, name: basename(path) }))
    .filter(({ name }) => name && !normalizedText.includes(name));
  if (!normalizedText && extras.length === 0) return '';
  if (extras.length === 0) return normalizedText;
  const extraTokens = extras
    .map(({ path, name }) => referenceToken(inferReferenceKindFromPath(path), name))
    .join(' ');
  if (!normalizedText) return extraTokens;
  return `${extraTokens} ${normalizedText}`.trim();
}

export function extractFilePathsFromParts(parts: unknown[] | undefined): string[] {
  if (!Array.isArray(parts)) return [];
  const paths: string[] = [];
  for (const raw of parts) {
    if (!raw || typeof raw !== 'object') continue;
    const part = raw as Record<string, unknown>;
    if (part.type !== 'file' || typeof part.url !== 'string') continue;
    const path = decodeFilePartUrl(part.url);
    if (path) paths.push(path);
  }
  return paths;
}

export async function buildPromptParts(input: {
  text: string;
  attachments: PromptAttachmentInput;
  directory: string;
}): Promise<PromptPart[]> {
  const parts: PromptPart[] = [{ type: 'text', text: input.text }];

  const seenPaths = new Set<string>();
  for (const rawPath of input.attachments.filePaths) {
    const path = absolutePath(input.directory, rawPath);
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);
    parts.push({
      type: 'file',
      mime: 'text/plain',
      url: `file://${encodeFilePath(path)}`,
      filename: basename(path),
    });
  }

  for (const file of input.attachments.images) {
    const mime = file.type || 'application/octet-stream';
    parts.push({
      type: 'file',
      mime,
      url: await fileToDataUrl(file),
      filename: file.name,
    });
  }

  return parts;
}

export function parseDropFilePath(event: DragEvent): string | null {
  const plain = event.dataTransfer?.getData('text/plain');
  if (plain?.startsWith('file:')) {
    return plain.slice('file:'.length);
  }

  const uriList = event.dataTransfer?.getData('text/uri-list');
  if (uriList) {
    const line = uriList.split('\n').find((entry) => entry && !entry.startsWith('#'));
    if (line?.startsWith('file://')) {
      try {
        const withoutScheme = line.slice('file://'.length);
        const decoded = decodeURIComponent(withoutScheme);
        if (/^\/[A-Za-z]:/.test(decoded)) {
          return decoded.slice(1);
        }
        return decoded.startsWith('/') ? decoded : `/${decoded}`;
      } catch {
        return line.slice('file://'.length);
      }
    }
  }

  return null;
}

export function readClipboardFiles(event: ClipboardEvent): File[] {
  const clipboard = event.clipboardData;
  if (!clipboard) return [];

  const fromItems = Array.from(clipboard.items).flatMap((item) => {
    if (item.kind !== 'file') return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
  if (fromItems.length > 0) return fromItems;

  return Array.from(clipboard.files);
}

export type ElectronFile = File & { path?: string };

export function resolveLocalFilePath(file: File): string | null {
  const api = window.electronAPI;
  if (api?.getPathForFile) {
    try {
      const resolved = api.getPathForFile(file);
      if (resolved) return resolved;
    } catch {
      // fall through
    }
  }
  const legacyPath = (file as ElectronFile).path;
  return legacyPath?.trim() || null;
}
