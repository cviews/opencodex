import { isAbsoluteFilesystemPath, pathBasename } from './composer/promptParts';
import type { ReferenceKind } from './composer/referenceChip';
import { referenceToken } from './composer/referenceChip';

export type DisplaySegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string; kind: 'agent' | 'model' | 'skill' | 'team' }
  | { type: 'reference'; value: string; kind: ReferenceKind };

export const DISPLAY_TOKEN_PATTERN =
  /(@team\s+\S+|@(?:agent|model|skill|folder|file|image)\s+\S+|\/[^\s]+|@\S+|\[图片: [^\]]+\])/g;

function classifyDisplayToken(raw: string): DisplaySegment {
  if (raw.startsWith('[图片: ') && raw.endsWith(']')) {
    return { type: 'reference', kind: 'image', value: raw.slice(5, -1) };
  }
  if (raw.startsWith('/')) {
    if (isAbsoluteFilesystemPath(raw)) {
      return { type: 'text', value: raw };
    }
    return { type: 'mention', kind: 'skill', value: raw.slice(1) };
  }
  if (raw.startsWith('@team ')) {
    return { type: 'mention', kind: 'team', value: raw.slice(6) };
  }
  if (raw.startsWith('@model ')) {
    return { type: 'mention', kind: 'model', value: raw.slice(7) };
  }
  if (raw.startsWith('@agent ')) {
    return { type: 'mention', kind: 'agent', value: raw.slice(7) };
  }
  if (raw.startsWith('@folder ')) {
    return { type: 'reference', kind: 'folder', value: raw.slice(8) };
  }
  if (raw.startsWith('@file ')) {
    return { type: 'reference', kind: 'file', value: raw.slice(6) };
  }
  if (raw.startsWith('@image ')) {
    return { type: 'reference', kind: 'image', value: raw.slice(7) };
  }
  if (raw.startsWith('@skill ')) {
    return { type: 'mention', kind: 'skill', value: raw.slice(7) };
  }
  return { type: 'mention', kind: 'agent', value: raw.slice(1) };
}

export function parseDisplaySegments(content: string): DisplaySegment[] {
  if (!content) return [{ type: 'text', value: '' }];

  const segments: DisplaySegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(DISPLAY_TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, index) });
    }
    segments.push(classifyDisplayToken(match[0]));
    lastIndex = index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: content }];
}

/** Clipboard text — keeps @folder/@file/@image tokens (with full paths when available). */
export function serializeDisplayContentForCopy(content: string, filePaths: string[] = []): string {
  const pathByLabel = new Map<string, string>();
  for (const path of filePaths) {
    pathByLabel.set(pathBasename(path), path);
  }

  const segments = parseDisplaySegments(content);
  return segments
    .map((seg) => {
      if (seg.type === 'text') return seg.value;
      if (seg.type === 'reference') {
        const fullPath = isAbsoluteFilesystemPath(seg.value)
          ? seg.value
          : pathByLabel.get(seg.value);
        return referenceToken(seg.kind, fullPath ?? seg.value);
      }
      if (seg.kind === 'skill') return `/${seg.value}`;
      if (seg.kind === 'team') return `@team ${seg.value}`;
      if (seg.kind === 'model') return `@model ${seg.value}`;
      if (seg.kind === 'agent') return `@agent ${seg.value}`;
      return seg.value;
    })
    .join('')
    .replace(/\u00a0/g, ' ');
}

export function containsDisplayTokens(content: string): boolean {
  DISPLAY_TOKEN_PATTERN.lastIndex = 0;
  return DISPLAY_TOKEN_PATTERN.test(content);
}

/** True when pasted text includes file/folder/image references worth parsing into chips. */
export function containsReferenceTokens(content: string): boolean {
  return /(?:@(?:folder|file|image)\s+\S+|\[图片: [^\]]+\])/.test(content);
}

export function containsPastableDisplayContent(content: string): boolean {
  if (containsReferenceTokens(content)) return true;
  return /(?:@team\s+\S+|@(?:agent|model|skill)\s+\S+|\/[^\s/]\S*)/.test(content);
}