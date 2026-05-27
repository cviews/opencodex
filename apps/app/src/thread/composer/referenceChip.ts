export type ReferenceKind = 'file' | 'folder' | 'image';

/** Cursor-style attachment chip colors (composer + sent messages). */
export const REFERENCE_CHIP_STYLE = {
  backgroundColor: 'rgba(43, 143, 255, 0.12)',
  border: '1px solid rgba(43, 143, 255, 0.28)',
  color: '#2563EB',
} as const;

export const REFERENCE_CHIP_CLASS =
  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[13px] font-medium align-middle mx-0.5 bg-[rgba(43,143,255,0.12)] text-[#2563EB] border-[rgba(43,143,255,0.28)]';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|ico|heic|heif|tiff?)$/i;

export function referenceToken(kind: ReferenceKind, label: string): string {
  return `@${kind} ${label}`;
}

export function parseReferenceToken(raw: string): { kind: ReferenceKind; label: string } | null {
  const match = raw.match(/^@(folder|file|image)\s+(\S+)$/);
  if (!match) return null;
  return { kind: match[1] as ReferenceKind, label: match[2] };
}

export function inferReferenceKindFromPath(path: string, mime?: string): ReferenceKind {
  if (mime?.startsWith('image/') || IMAGE_EXT.test(path)) return 'image';
  const kind = window.electronAPI?.getPathKind?.(path);
  if (kind === 'folder' || kind === 'file' || kind === 'image') return kind;
  return 'file';
}

export function referenceIconSvg(kind: ReferenceKind): string {
  if (kind === 'folder') {
    return '<svg viewBox="0 0 24 24" style="width:12px;height:12px;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>';
  }
  if (kind === 'image') {
    return '<svg viewBox="0 0 24 24" style="width:12px;height:12px;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" style="width:12px;height:12px;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>';
}

export function applyReferenceChipDom(dom: HTMLElement, kind: ReferenceKind, label: string): void {
  dom.className = 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-medium select-none';
  dom.style.backgroundColor = REFERENCE_CHIP_STYLE.backgroundColor;
  dom.style.border = REFERENCE_CHIP_STYLE.border;
  dom.style.color = REFERENCE_CHIP_STYLE.color;
  dom.style.borderRadius = '6px';
  dom.innerHTML = `${referenceIconSvg(kind)}${label}`;
}
