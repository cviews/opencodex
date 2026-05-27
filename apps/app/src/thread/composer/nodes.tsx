import type { EditorConfig, NodeKey, SerializedLexicalNode, TextModeType } from 'lexical';
import { TextNode } from 'lexical';
import {
  applyReferenceChipDom,
  inferReferenceKindFromPath,
  referenceToken,
  type ReferenceKind,
} from './referenceChip';

type MentionKind = 'agent' | 'file' | 'team';

// ─── SlashCommandNode (used for skills and commands) ────────────

export interface SerializedSlashCommandNode extends SerializedLexicalNode {
  label: string;
  text: string;
  detail: number;
  format: number;
  mode: TextModeType;
  style: string;
}

export class SlashCommandNode extends TextNode {
  __label: string;

  static getType(): string {
    return 'slash-command';
  }

  static clone(node: SlashCommandNode): SlashCommandNode {
    return new SlashCommandNode(node.__label, node.__key);
  }

  static importJSON(serialized: SerializedSlashCommandNode): SlashCommandNode {
    return $createSlashCommandNode(serialized.label);
  }

  constructor(label: string = '', key?: NodeKey) {
    super(`/${label}`, key);
    this.__label = label;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium select-none';
    dom.style.backgroundColor = 'rgba(139, 92, 246, 0.15)';
    dom.style.border = '1px solid rgba(139, 92, 246, 0.35)';
    dom.style.color = 'rgba(109, 40, 217, 0.95)';
    dom.contentEditable = 'false';
    dom.setAttribute('data-lexical-chip', this.__key);
    dom.innerHTML = `<svg viewBox="0 0 1025 1024" style="width:12px;height:12px;flex-shrink:0"><path d="M254 745.6h267.2c11.5 19.4 24.6 37.3 39.4 53.6H254V745.6zm0-84.7h231.3a358 358 0 01-10.1-53.5H254v53.5zm0-138.2h221.9c2.3-18.3 5.7-36.3 10.7-53.5H254v53.5zm431.3 358.7v46.8c0 22.4-16.8 40.6-37.3 40.6H87.5c-20.6 0-37.3-18.2-37.3-40.6V250.1l185.8-167.7v178H138.1v53.5h147.1V53.5H648c20.6 0 37.3 18.2 37.3 40.5v160.1c15.9-5.4 32.4-9 49.4-11.6V94C734.7 42.3 695.8 0 648 0H250L.8 225v703.3c0 51.9 38.9 94.1 86.7 94.1h560.6c47.8 0 86.7-42.2 86.7-94.1v-35.3c-16.9-2.5-33.5-6.1-49.4-11.5h-.1zM187.1 469.3h-63.7v53.5h63.7v-53.5zm-63.7 329.9h63.7v-53.5h-63.7v53.5zm63.7-191.7h-63.7v53.5h63.7v-53.5zm717.7-120.3l-39.2-32.6-99.6 141-89.5-74.5-30.1 42.5 128.7 107 129.7-183.4zM1024.8 567.8c0-149-111.8-270.2-249.2-270.2-137.3 0-249.1 121.2-249.1 270.2S638.3 838.1 775.6 838.1c137.4 0 249.1-121.2 249.1-270.3h.1zm-49.4 0c0 119.5-89.6 216.8-199.8 216.8-110.2 0-199.9-97.3-199.9-216.8 0-119.5 89.6-216.8 199.9-216.8 110.2 0 199.8 97.3 199.8 216.8z" fill="currentColor"/></svg>${this.__label}`;
    return dom;
  }

  updateDOM(_prevNode: SlashCommandNode, dom: HTMLElement): boolean {
    dom.setAttribute('data-lexical-chip', this.__key);
    dom.innerHTML = `<svg viewBox="0 0 1025 1024" style="width:12px;height:12px;flex-shrink:0"><path d="M254 745.6h267.2c11.5 19.4 24.6 37.3 39.4 53.6H254V745.6zm0-84.7h231.3a358 358 0 01-10.1-53.5H254v53.5zm0-138.2h221.9c2.3-18.3 5.7-36.3 10.7-53.5H254v53.5zm431.3 358.7v46.8c0 22.4-16.8 40.6-37.3 40.6H87.5c-20.6 0-37.3-18.2-37.3-40.6V250.1l185.8-167.7v178H138.1v53.5h147.1V53.5H648c20.6 0 37.3 18.2 37.3 40.5v160.1c15.9-5.4 32.4-9 49.4-11.6V94C734.7 42.3 695.8 0 648 0H250L.8 225v703.3c0 51.9 38.9 94.1 86.7 94.1h560.6c47.8 0 86.7-42.2 86.7-94.1v-35.3c-16.9-2.5-33.5-6.1-49.4-11.5h-.1zM187.1 469.3h-63.7v53.5h63.7v-53.5zm-63.7 329.9h63.7v-53.5h-63.7v53.5zm63.7-191.7h-63.7v53.5h63.7v-53.5zm717.7-120.3l-39.2-32.6-99.6 141-89.5-74.5-30.1 42.5 128.7 107 129.7-183.4zM1024.8 567.8c0-149-111.8-270.2-249.2-270.2-137.3 0-249.1 121.2-249.1 270.2S638.3 838.1 775.6 838.1c137.4 0 249.1-121.2 249.1-270.3h.1zm-49.4 0c0 119.5-89.6 216.8-199.8 216.8-110.2 0-199.9-97.3-199.9-216.8 0-119.5 89.6-216.8 199.9-216.8 110.2 0 199.8 97.3 199.8 216.8z" fill="currentColor"/></svg>${this.__label}`;
    return false;
  }

  canInsertTextBefore(): boolean {
    return true;
  }

  canInsertTextAfter(): boolean {
    return true;
  }

  isToken(): boolean {
    return true;
  }

  exportJSON(): SerializedSlashCommandNode {
    return {
      type: 'slash-command',
      label: this.__label,
      text: this.getTextContent(),
      detail: this.__detail,
      format: this.__format,
      mode: this.getMode(),
      style: this.__style,
      version: 1,
    };
  }

  getTextContent(): string {
    return `/${this.__label}`;
  }
}

export function $isSlashCommandNode(node: unknown): node is SlashCommandNode {
  return node instanceof SlashCommandNode;
}

export function $createSlashCommandNode(label: string): SlashCommandNode {
  return new SlashCommandNode(label);
}

// ─── MentionNode ───────────────────────────────────────────────

export interface SerializedMentionNode extends SerializedLexicalNode {
  label: string;
  kind: MentionKind;
  filePath?: string;
  refKind?: ReferenceKind;
  text: string;
  detail: number;
  format: number;
  mode: TextModeType;
  style: string;
}

export class MentionNode extends TextNode {
  __label: string;
  __kind: MentionKind;
  __filePath?: string;
  __refKind?: ReferenceKind;

  static getType(): string {
    return 'mention';
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__label, node.__kind, node.__filePath, node.__refKind, node.__key);
  }

  static importJSON(serialized: SerializedMentionNode): MentionNode {
    return $createMentionNode(serialized.label, serialized.kind, serialized.filePath, serialized.refKind);
  }

  constructor(
    label: string = '',
    kind: MentionKind = 'agent',
    filePath?: string,
    refKind?: ReferenceKind,
    key?: NodeKey,
  ) {
    super(`@${label}`, key);
    this.__label = label;
    this.__kind = kind;
    this.__filePath = filePath;
    this.__refKind = refKind;
  }

createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    if (this.__kind === 'file' && (this.__filePath || this.__refKind)) {
      applyReferenceChipDom(dom, this.__refKind ?? inferReferenceKindFromPath(this.__filePath ?? this.__label), this.__label);
      dom.contentEditable = 'false';
      dom.setAttribute('data-lexical-chip', this.__key);
      return dom;
    }
    const isAgent = this.__kind === 'agent';
    const isTeam = this.__kind === 'team';
    dom.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium select-none';
    if (isAgent) {
      dom.style.backgroundColor = 'rgba(14, 165, 233, 0.15)';
      dom.style.border = '1px solid rgba(14, 165, 233, 0.35)';
      dom.style.color = 'rgba(3, 105, 161, 0.95)';
    } else if (isTeam) {
      dom.style.backgroundColor = 'rgba(20, 184, 166, 0.15)';
      dom.style.border = '1px solid rgba(20, 184, 166, 0.35)';
      dom.style.color = 'rgba(13, 148, 136, 0.95)';
    } else {
      dom.style.backgroundColor = 'rgba(209, 213, 219, 0.5)';
      dom.style.border = '1px solid rgba(156, 163, 175, 0.4)';
      dom.style.color = 'rgba(55, 65, 81, 0.95)';
    }
    dom.contentEditable = 'false';
    dom.setAttribute('data-lexical-chip', this.__key);
const icon = isAgent
      ? '<svg viewBox="0 0 1024 1024" style="width:12px;height:12px;flex-shrink:0"><path d="M458 476.6L170.8 332.9c-19.6-9.8-38.6-10.2-53.4-1-14.8 9.2-23 26.2-23 48.1v332.2c0 31.4 21.7 67.7 49.3 82.8l289.1 156.6c10.5 5.7 20.8 8.6 30.6 8.6 8.1 0 15.6-2 22.2-5.9 14.7-8.8 22.9-25.7 22.9-47.6V558.2c0-15.4-5.2-32.2-14.5-47.4-9.4-15.1-22.2-27.3-36-34.2zm-7.3 81.6v337.4L171.2 744.2c-8.9-4.8-19.1-21.9-19.1-32V388.3l280 140c8.7 4.3 18.6 20.2 18.6 29.9zM874.5 300.8c19.3-9.5 29.9-23.1 29.8-38.3 0-15.2-10.6-28.8-29.9-38.3l-302-148c-16.3-8-37.8-12.3-60.5-12.3-22.7 0-44.2 4.4-60.4 12.3l-302 147.9c-19.3 9.5-29.8 23.1-29.8 38.3 0 15.2 10.6 28.8 29.9 38.3l302 148c16.3 8 37.8 12.3 60.5 12.3 22.7 0 44.2-4.4 60.4-12.3l302-147.9zm-671.8-38.4L477 128.1c18-8.8 52-8.8 70.1 0l274.2 134.3L547 396.8c-18 8.8-52 8.8-70.1 0L202.7 262.4zM906.7 332.4c-14.8-8.8-33.6-7.9-52.9 2.6L581 483.3c-27.6 15.1-49.3 51.6-49.3 82.9v340.3c0 22 8.1 38.8 22.8 47.4 6.4 3.7 13.6 5.6 21.4 5.6 10 0 20.4-3.1 31.1-9.1l273.8-154.7c13.3-7.6 25.7-20.3 34.8-35.8 9.1-15.5 14.1-32.5 14.1-47.7V380c-0.1-21.9-8.2-38.8-23-47.6zm-34.9 58.7v321c0 10.4-10.3 28.1-19.4 33.2L589.5 893.9V566.2c0-10.1 10.2-27.2 19.1-32.1l263.2-143z" fill="currentColor"/></svg>'
      : isTeam
      ? '<svg viewBox="0 0 24 24" style="width:12px;height:12px;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>'
      : '<svg viewBox="0 0 1024 1024" style="width:12px;height:12px;flex-shrink:0"><path d="M923.8 133.6c-55.2 0-100.2 44.9-100.2 100.2v623.3c0 5.2 1.2 10.3 3.5 14.9l66.8 133.6a33.4 33.4 0 0059.7 0l66.8-133.6c2.3-4.6 3.5-9.7 3.5-14.9V233.7c0-55.2-44.9-100.2-100.2-100.2zm33.4 715.6l-33.4 66.8-33.4-66.8v-25.5h66.8v25.5zm0-92.3h-66.8V400.7h66.8v356.2zm0-423h-66.8V233.7a33.4 33.4 0 0133.4-33.4 33.4 33.4 0 0133.4 33.4v100.2zM723.5 0a33.4 33.4 0 0133.4 33.4v957.2a33.4 33.4 0 01-33.4 33.4H233.7c-8.9 0-17.4-3.6-23.6-9.8L9.8 813.9A33.7 33.7 0 010 790.3V33.4A33.4 33.4 0 0133.4 0h690.1zM200.3 910v-86.3H114l86.3 86.3zm489.7 47.2V66.8H66.8v690.1h167a33.4 33.4 0 0133.4 33.4v167h422.9zm-233.7-823.6a33.4 33.4 0 010 66.8H300.5a33.4 33.4 0 110-66.8h155.8zm133.6 155.8a33.4 33.4 0 010 66.8H167a33.4 33.4 0 110-66.8h422.9zm0 133.6a33.4 33.4 0 010 66.8H167a33.4 33.4 0 010-66.8h422.9zm0 133.6a33.4 33.4 0 010 66.8H167a33.4 33.4 0 110-66.8h422.9zm0 133.6a33.4 33.4 0 010 66.8H367.3a33.4 33.4 0 110-66.8h222.6zm0 133.6a33.4 33.4 0 010 66.8H367.3a33.4 33.4 0 110-66.8h222.6z" fill="currentColor"/></svg>';
dom.innerHTML = icon + this.__label;
    return dom;
  }

  updateDOM(_prevNode: MentionNode, dom: HTMLElement): boolean {
    dom.setAttribute('data-lexical-chip', this.__key);
    if (this.__kind === 'file' && (this.__filePath || this.__refKind)) {
      applyReferenceChipDom(dom, this.__refKind ?? inferReferenceKindFromPath(this.__filePath ?? this.__label), this.__label);
      return false;
    }
    const isAgent = this.__kind === 'agent';
    const isTeam = this.__kind === 'team';
    if (isAgent) {
      dom.style.backgroundColor = 'rgba(14, 165, 233, 0.15)';
      dom.style.border = '1px solid rgba(14, 165, 233, 0.35)';
      dom.style.color = 'rgba(3, 105, 161, 0.95)';
    } else if (isTeam) {
      dom.style.backgroundColor = 'rgba(20, 184, 166, 0.15)';
      dom.style.border = '1px solid rgba(20, 184, 166, 0.35)';
      dom.style.color = 'rgba(13, 148, 136, 0.95)';
    } else {
      dom.style.backgroundColor = 'rgba(209, 213, 219, 0.5)';
      dom.style.border = '1px solid rgba(156, 163, 175, 0.4)';
      dom.style.color = 'rgba(55, 65, 81, 0.95)';
    }
    const updateIcon = isAgent
      ? '<svg viewBox="0 0 1024 1024" style="width:12px;height:12px;flex-shrink:0"><path d="M458 476.6L170.8 332.9c-19.6-9.8-38.6-10.2-53.4-1-14.8 9.2-23 26.2-23 48.1v332.2c0 31.4 21.7 67.7 49.3 82.8l289.1 156.6c10.5 5.7 20.8 8.6 30.6 8.6 8.1 0 15.6-2 22.2-5.9 14.7-8.8 22.9-25.7 22.9-47.6V558.2c0-15.4-5.2-32.2-14.5-47.4-9.4-15.1-22.2-27.3-36-34.2zm-7.3 81.6v337.4L171.2 744.2c-8.9-4.8-19.1-21.9-19.1-32V388.3l280 140c8.7 4.3 18.6 20.2 18.6 29.9zM874.5 300.8c19.3-9.5 29.9-23.1 29.8-38.3 0-15.2-10.6-28.8-29.9-38.3l-302-148c-16.3-8-37.8-12.3-60.5-12.3-22.7 0-44.2 4.4-60.4 12.3l-302 147.9c-19.3 9.5-29.8 23.1-29.8 38.3 0 15.2 10.6 28.8 29.9 38.3l302 148c16.3 8 37.8 12.3 60.5 12.3 22.7 0 44.2-4.4 60.4-12.3l302-147.9zm-671.8-38.4L477 128.1c18-8.8 52-8.8 70.1 0l274.2 134.3L547 396.8c-18 8.8-52 8.8-70.1 0L202.7 262.4zM906.7 332.4c-14.8-8.8-33.6-7.9-52.9 2.6L581 483.3c-27.6 15.1-49.3 51.6-49.3 82.9v340.3c0 22 8.1 38.8 22.8 47.4 6.4 3.7 13.6 5.6 21.4 5.6 10 0 20.4-3.1 31.1-9.1l273.8-154.7c13.3-7.6 25.7-20.3 34.8-35.8 9.1-15.5 14.1-32.5 14.1-47.7V380c-0.1-21.9-8.2-38.8-23-47.6zm-34.9 58.7v321c0 10.4-10.3 28.1-19.4 33.2L589.5 893.9V566.2c0-10.1 10.2-27.2 19.1-32.1l263.2-143z" fill="currentColor"/></svg>'
      : isTeam
      ? '<svg viewBox="0 0 24 24" style="width:12px;height:12px;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>'
      : '<svg viewBox="0 0 1024 1024" style="width:12px;height:12px;flex-shrink:0"><path d="M923.8 133.6c-55.2 0-100.2 44.9-100.2 100.2v623.3c0 5.2 1.2 10.3 3.5 14.9l66.8 133.6a33.4 33.4 0 0059.7 0l66.8-133.6c2.3-4.6 3.5-9.7 3.5-14.9V233.7c0-55.2-44.9-100.2-100.2-100.2zm33.4 715.6l-33.4 66.8-33.4-66.8v-25.5h66.8v25.5zm0-92.3h-66.8V400.7h66.8v356.2zm0-423h-66.8V233.7a33.4 33.4 0 0133.4-33.4 33.4 33.4 0 0133.4 33.4v100.2zM723.5 0a33.4 33.4 0 0133.4 33.4v957.2a33.4 33.4 0 01-33.4 33.4H233.7c-8.9 0-17.4-3.6-23.6-9.8L9.8 813.9A33.7 33.7 0 010 790.3V33.4A33.4 33.4 0 0133.4 0h690.1zM200.3 910v-86.3H114l86.3 86.3zm489.7 47.2V66.8H66.8v690.1h167a33.4 33.4 0 0133.4 33.4v167h422.9zm-233.7-823.6a33.4 33.4 0 010 66.8H300.5a33.4 33.4 0 110-66.8h155.8zm133.6 155.8a33.4 33.4 0 010 66.8H167a33.4 33.4 0 110-66.8h422.9zm0 133.6a33.4 33.4 0 010 66.8H167a33.4 33.4 0 010-66.8h422.9zm0 133.6a33.4 33.4 0 010 66.8H167a33.4 33.4 0 110-66.8h422.9zm0 133.6a33.4 33.4 0 010 66.8H367.3a33.4 33.4 0 110-66.8h222.6zm0 133.6a33.4 33.4 0 010 66.8H367.3a33.4 33.4 0 110-66.8h222.6z" fill="currentColor"/></svg>';
    dom.innerHTML = updateIcon + this.__label;
    return false;
  }

  canInsertTextBefore(): boolean {
    return true;
  }

  canInsertTextAfter(): boolean {
    return true;
  }

  isToken(): boolean {
    return true;
  }

  exportJSON(): SerializedMentionNode {
    return {
      type: 'mention',
      kind: this.__kind,
      label: this.__label,
      ...(this.__filePath ? { filePath: this.__filePath } : {}),
      ...(this.__refKind ? { refKind: this.__refKind } : {}),
      text: this.getTextContent(),
      detail: this.__detail,
      format: this.__format,
      mode: this.getMode(),
      style: this.__style,
      version: 1,
    };
  }

  getTextContent(): string {
    if (this.__kind === 'file' && this.__filePath) {
      return referenceToken(this.__refKind ?? 'file', this.__label);
    }
    if (this.__kind === 'team') {
      return `@team ${this.__label}`;
    }
    if (this.__kind === 'agent') {
      return `@agent ${this.__label}`;
    }
    return `@${this.__label}`;
  }
}

export function $isMentionNode(node: unknown): node is MentionNode {
  return node instanceof MentionNode;
}

export function $createMentionNode(
  label: string,
  kind: MentionKind,
  filePath?: string,
  refKind?: ReferenceKind,
): MentionNode {
  return new MentionNode(label, kind, filePath, refKind);
}

export function $createFileReferenceNode(fullPath: string, refKind?: ReferenceKind): MentionNode {
  const normalized = fullPath.trim();
  const label = normalized.replace(/\\/g, '/').split('/').pop() || normalized;
  const kind = refKind ?? inferReferenceKindFromPath(normalized);
  return new MentionNode(label, 'file', normalized, kind);
}

// ─── SkillChipNode (legacy, kept for compatibility) ────────────

export interface SerializedSkillChipNode extends SerializedLexicalNode {
  label: string;
  icon: string;
  text: string;
  detail: number;
  format: number;
  mode: TextModeType;
  style: string;
}

export class SkillChipNode extends TextNode {
  __label: string;
  __icon: string;

  static getType(): string {
    return 'skill-chip';
  }

  static clone(node: SkillChipNode): SkillChipNode {
    return new SkillChipNode(node.__label, node.__icon, node.__key);
  }

  static importJSON(serialized: SerializedSkillChipNode): SkillChipNode {
    return $createSkillChipNode(serialized.label, serialized.icon);
  }

  constructor(label: string = '', icon: string = '✏️', key?: NodeKey) {
    super(`${icon}${label}`, key);
    this.__label = label;
    this.__icon = icon;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.className = 'inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full text-xs font-medium select-none';
    dom.style.backgroundColor = 'rgba(139, 92, 246, 0.15)';
    dom.style.border = '1px solid rgba(139, 92, 246, 0.35)';
    dom.style.color = 'rgba(109, 40, 217, 0.95)';
    dom.contentEditable = 'false';
    dom.setAttribute('data-lexical-chip', this.__key);
    return dom;
  }

  updateDOM(_prevNode: SkillChipNode, dom: HTMLElement): boolean {
    dom.textContent = `${this.__icon}${this.__label}`;
    dom.setAttribute('data-lexical-chip', this.__key);
    return false;
  }

  canInsertTextBefore(): boolean {
    return true;
  }

  canInsertTextAfter(): boolean {
    return true;
  }

  isToken(): boolean {
    return true;
  }

  exportJSON(): SerializedSkillChipNode {
    return {
      type: 'skill-chip',
      label: this.__label,
      icon: this.__icon,
      text: this.getTextContent(),
      detail: this.__detail,
      format: this.__format,
      mode: this.getMode(),
      style: this.__style,
      version: 1,
    };
  }

  getTextContent(): string {
    return `@skill:${this.__label}`;
  }
}

export function $isSkillChipNode(node: unknown): node is SkillChipNode {
  return node instanceof SkillChipNode;
}

export function $createSkillChipNode(label: string, icon: string): SkillChipNode {
  return new SkillChipNode(label, icon);
}

// ─── ModelChipNode (model selection via / in prompt) ────────────

export interface SerializedModelChipNode extends SerializedLexicalNode {
  modelId: string;
  label: string;
  text: string;
  detail: number;
  format: number;
  mode: TextModeType;
  style: string;
}

export class ModelChipNode extends TextNode {
  __modelId: string;
  __label: string;

  static getType(): string {
    return 'model-chip';
  }

  static clone(node: ModelChipNode): ModelChipNode {
    return new ModelChipNode(node.__modelId, node.__label, node.__key);
  }

  static importJSON(serialized: SerializedModelChipNode): ModelChipNode {
    return $createModelChipNode(serialized.modelId, serialized.label);
  }

  constructor(modelId: string = '', label: string = '', key?: NodeKey) {
    super(`@model ${modelId}`, key);
    this.__modelId = modelId;
    this.__label = label;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium select-none';
    dom.style.backgroundColor = 'rgba(14, 165, 233, 0.15)';
    dom.style.border = '1px solid rgba(14, 165, 233, 0.35)';
    dom.style.color = 'rgba(3, 105, 161, 0.95)';
    dom.contentEditable = 'false';
    dom.setAttribute('data-lexical-chip', this.__key);
    dom.innerHTML = `<svg viewBox="0 0 24 24" style="width:12px;height:12px;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>${this.__label}`;
    return dom;
  }

  updateDOM(_prevNode: ModelChipNode, dom: HTMLElement): boolean {
    dom.setAttribute('data-lexical-chip', this.__key);
    dom.innerHTML = `<svg viewBox="0 0 24 24" style="width:12px;height:12px;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>${this.__label}`;
    return false;
  }

  canInsertTextBefore(): boolean {
    return true;
  }

  canInsertTextAfter(): boolean {
    return true;
  }

  isToken(): boolean {
    return true;
  }

  exportJSON(): SerializedModelChipNode {
    return {
      type: 'model-chip',
      modelId: this.__modelId,
      label: this.__label,
      text: this.getTextContent(),
      detail: this.__detail,
      format: this.__format,
      mode: this.getMode(),
      style: this.__style,
      version: 1,
    };
  }

  getTextContent(): string {
    return `@model ${this.__modelId}`;
  }
}

export function $isModelChipNode(node: unknown): node is ModelChipNode {
  return node instanceof ModelChipNode;
}

export function $createModelChipNode(modelId: string, label: string): ModelChipNode {
  return new ModelChipNode(modelId, label);
}

// ─── Helpers ───────────────────────────────────────────────────

export type ChipNode = SlashCommandNode | MentionNode | SkillChipNode | ModelChipNode;

export function $isChipNode(node: unknown): node is ChipNode {
  return $isSlashCommandNode(node) || $isMentionNode(node) || $isSkillChipNode(node) || $isModelChipNode(node);
}