import { isAbsoluteFilesystemPath, pathBasename } from './composer/promptParts';
import type { ReferenceKind } from './composer/referenceChip';
import { referenceToken } from './composer/referenceChip';
import {
  buildDisplayTokenCatalog,
  isKnownAgentName,
  isKnownModelLabel,
  isKnownSlashName,
  isKnownTeamLabel,
  type DisplayTokenCatalog,
} from './displayTokenCatalog';

export type DisplaySegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string; kind: 'agent' | 'model' | 'skill' | 'team' }
  | { type: 'reference'; value: string; kind: ReferenceKind };

/** Slash / bare @ only at line start or after whitespace (matches composer autocomplete). */
const DISPLAY_TOKEN_BOUNDARY = '(?:^|(?<=[\\s\\u00a0\\n]))';

export const DISPLAY_TOKEN_PATTERN = new RegExp(
  [
    '@team\\s+\\S+',
    '@(?:agent|model|skill|folder|file|image)\\s+\\S+',
    `${DISPLAY_TOKEN_BOUNDARY}\\/[^\\s]+`,
    `${DISPLAY_TOKEN_BOUNDARY}@[a-zA-Z][\\w.-]+`,
    '\\[图片: [^\\]]+\\]',
  ].join('|'),
  'g',
);

function resolveDisplayToken(raw: string, catalog: DisplayTokenCatalog): DisplaySegment | null {
  if (raw.startsWith('[图片: ') && raw.endsWith(']')) {
    return { type: 'reference', kind: 'image', value: raw.slice(5, -1) };
  }

  if (raw.startsWith('/')) {
    if (isAbsoluteFilesystemPath(raw)) {
      return { type: 'text', value: raw };
    }
    const name = raw.slice(1);
    if (!isKnownSlashName(name, catalog)) return null;
    return { type: 'mention', kind: 'skill', value: name };
  }

  if (raw.startsWith('@team ')) {
    const label = raw.slice(6);
    if (!isKnownTeamLabel(label, catalog)) return null;
    return { type: 'mention', kind: 'team', value: label };
  }

  if (raw.startsWith('@model ')) {
    const label = raw.slice(7);
    if (!isKnownModelLabel(label, catalog)) return null;
    return { type: 'mention', kind: 'model', value: label };
  }

  if (raw.startsWith('@agent ')) {
    const label = raw.slice(7);
    if (!isKnownAgentName(label, catalog)) return null;
    return { type: 'mention', kind: 'agent', value: label };
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
    const label = raw.slice(7);
    if (!isKnownSlashName(label, catalog)) return null;
    return { type: 'mention', kind: 'skill', value: label };
  }

  const bare = raw.slice(1);
  if (isKnownTeamLabel(bare, catalog)) {
    return { type: 'mention', kind: 'team', value: bare };
  }
  if (isKnownAgentName(bare, catalog)) {
    return { type: 'mention', kind: 'agent', value: bare };
  }

  return null;
}

export function parseDisplaySegments(
  content: string,
  catalog: DisplayTokenCatalog = buildDisplayTokenCatalog(),
): DisplaySegment[] {
  if (!content) return [{ type: 'text', value: '' }];

  const segments: DisplaySegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(DISPLAY_TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    const segment = resolveDisplayToken(match[0], catalog);
    if (!segment) continue;

    if (index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, index) });
    }
    segments.push(segment);
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
  const catalog = buildDisplayTokenCatalog();
  DISPLAY_TOKEN_PATTERN.lastIndex = 0;
  for (const match of content.matchAll(DISPLAY_TOKEN_PATTERN)) {
    if (resolveDisplayToken(match[0], catalog)) return true;
  }
  return false;
}

/** True when pasted text includes file/folder/image references worth parsing into chips. */
export function containsReferenceTokens(content: string): boolean {
  return /(?:@(?:folder|file|image)\s+\S+|\[图片: [^\]]+\])/.test(content);
}

function contentHasKnownSlashOrMention(content: string, catalog: DisplayTokenCatalog): boolean {
  DISPLAY_TOKEN_PATTERN.lastIndex = 0;
  for (const match of content.matchAll(DISPLAY_TOKEN_PATTERN)) {
    const raw = match[0];
    if (raw.startsWith('@folder ') || raw.startsWith('@file ') || raw.startsWith('@image ')) {
      return true;
    }
    if (resolveDisplayToken(raw, catalog)) return true;
  }
  return false;
}

export function containsPastableDisplayContent(content: string): boolean {
  if (containsReferenceTokens(content)) return true;
  return contentHasKnownSlashOrMention(content, buildDisplayTokenCatalog());
}
