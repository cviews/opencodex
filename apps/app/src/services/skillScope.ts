import type { SlashItem } from '../types';

/** OpenCode instance path info from GET /path */
export interface SkillPathContext {
  home: string;
  config: string;
  worktree: string;
  directory: string;
}

export type SkillScope = SlashItem['scope'];

export interface SdkSkillRecord {
  name: string;
  description?: string;
  location: string;
  content?: string;
}

export interface SdkCommandRecord {
  name: string;
  description?: string;
  source?: 'command' | 'mcp' | 'skill';
  disabled?: boolean;
  template?: string;
}

/** Normalize filesystem paths and file:// URLs for prefix checks. */
export function normalizeSkillPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('file://')) {
    try {
      return decodeURIComponent(new URL(trimmed).pathname).replace(/\/+$/, '');
    } catch {
      return trimmed.replace(/\/+$/, '');
    }
  }

  return trimmed.replace(/\/+$/, '');
}

export function isPathUnder(child: string, parent: string): boolean {
  const normalizedChild = normalizeSkillPath(child);
  const normalizedParent = normalizeSkillPath(parent);
  if (!normalizedChild || !normalizedParent) return false;
  if (normalizedChild === normalizedParent) return true;
  return normalizedChild.startsWith(`${normalizedParent}/`);
}

/** Known global skill roots (official config dir, not tied to a workspace repo). */
export function isGlobalSkillLocation(location: string, ctx: SkillPathContext): boolean {
  if (!location || location.includes('<')) return true;

  const normalized = normalizeSkillPath(location);
  if (!normalized.startsWith('/')) return true;

  const home = normalizeSkillPath(ctx.home);
  const config = normalizeSkillPath(ctx.config);
  const globalRoots = [
    config ? `${config}/skills` : '',
    home ? `${home}/.claude/skills` : '',
    home ? `${home}/.agents/skills` : '',
    config,
  ].filter(Boolean);

  return globalRoots.some((root) => isPathUnder(normalized, root));
}

/**
 * Classify a skill location as project-scoped or global.
 * Project includes skills under worktree and monorepo-parent `.opencode/skills`.
 */
export function classifySkillScope(location: string, ctx: SkillPathContext): 'project' | 'global' {
  if (isGlobalSkillLocation(location, ctx)) return 'global';

  const normalized = normalizeSkillPath(location);
  if (!normalized.startsWith('/')) return 'global';

  const projectRoot = ctx.worktree?.trim() || ctx.directory?.trim();
  if (projectRoot && isPathUnder(normalized, projectRoot)) {
    return 'project';
  }

  // Monorepo layout: e.g. workspace zmn-tgsp-ios but skills live in ../zmn-tgsp-app/.opencode/skills/
  if (projectRoot && normalized.includes('/.opencode/skills/')) {
    const parent = normalizeSkillPath(projectRoot.replace(/\/[^/]+$/, ''));
    if (parent && isPathUnder(normalized, parent)) {
      return 'project';
    }
  }

  return 'global';
}

/** OpenCode core commands — not exposed with a dedicated scope flag in command.list. */
export const OPENCODE_CORE_COMMAND_NAMES = new Set(['init', 'review']);

/**
 * Classify command scope for slash menu grouping.
 * command.list only returns `source: command | mcp | skill` — no project/global scope.
 * Project commands are identified via `.opencode/commands/*.md` names (see adapter).
 */
export function classifyCommandEntryScope(
  name: string,
  sdkSource: SdkCommandRecord['source'],
  skillByName: Map<string, SdkSkillRecord>,
  ctx: SkillPathContext,
  projectCommandNames: ReadonlySet<string> = new Set(),
): SkillScope {
  if (sdkSource === 'mcp') return 'global';
  if (OPENCODE_CORE_COMMAND_NAMES.has(name)) return 'command';

  const pairedSkill = skillByName.get(name);
  if (pairedSkill) {
    return classifySkillScope(pairedSkill.location, ctx);
  }

  if (projectCommandNames.has(name)) return 'project';

  return 'global';
}

/** Bucket for Skills page grouping — never returns `command`. */
export function catalogDisplayScope(item: SlashItem): 'project' | 'global' {
  if (item.scope === 'project') return 'project';
  return 'global';
}

/** Walk from project path toward root; used to locate monorepo `.opencode` roots. */
export function catalogDirectoryCandidates(projectPath: string): string[] {
  const trimmed = normalizeSkillPath(projectPath);
  if (!trimmed) return [];

  const candidates: string[] = [];
  let current = trimmed;
  while (current && current !== '/') {
    candidates.push(current);
    const parent = current.replace(/\/[^/]+$/, '');
    if (parent === current) break;
    current = parent;
  }
  return candidates;
}

export function buildSkillLocationMap(skills: SdkSkillRecord[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const skill of skills) {
    if (skill.name && skill.location) {
      map.set(skill.name, skill.location);
    }
  }
  return map;
}

/**
 * True when command.list entry is OpenCode's mirror of an existing SKILL.md
 * (not a separate .opencode/commands/*.md definition).
 */
export function isSkillBackedCommand(
  command: SdkCommandRecord,
  skill?: SdkSkillRecord,
): boolean {
  if (!skill) return false;

  const sdkSource = command.source;
  if (sdkSource === 'skill') return true;

  const template = typeof command.template === 'string' ? command.template.trim() : '';
  const skillBody = (skill.content ?? '').trim();
  if (template.includes('<skill-instruction>')) return true;

  const description = command.description ?? '';
  if (description.includes(' - Skill)')) return true;

  if (template && skillBody) {
    if (template === skillBody) return true;
    const prefix = skillBody.slice(0, Math.min(skillBody.length, 240));
    if (prefix.length >= 80 && template.startsWith(prefix)) return true;
  }

  return false;
}

/**
 * Build slash / skills catalog from OpenCode sources.
 * - Every SKILL.md from app.skills is listed as a skill entry.
 * - command.list command/mcp entries are listed separately when they are real commands.
 * - Skill mirrors in command.list are skipped (incl. when source field is missing).
 */
export function buildSlashCatalog(
  commands: SdkCommandRecord[],
  skills: SdkSkillRecord[],
  ctx: SkillPathContext,
  projectCommandNames: ReadonlySet<string> = new Set(),
): SlashItem[] {
  const skillByName = new Map(skills.filter((s) => s.name).map((s) => [s.name, s]));
  const items: SlashItem[] = [];

  for (const skill of skills) {
    if (!skill.name) continue;
    items.push({
      name: skill.name,
      description: skill.description ?? '',
      source: 'skill',
      scope: classifySkillScope(skill.location, ctx),
      enabled: true,
      entryId: `skill:${skill.name}`,
    });
  }

  for (const command of commands) {
    const name = command.name?.trim();
    if (!name) continue;

    const pairedSkill = skillByName.get(name);
    const sdkSource = command.source ?? 'command';
    if (isSkillBackedCommand(command, pairedSkill)) continue;

    items.push({
      name,
      description: command.description ?? '',
      source: 'command',
      scope: classifyCommandEntryScope(name, sdkSource, skillByName, ctx, projectCommandNames),
      enabled: command.disabled !== true,
      entryId: `command:${name}`,
    });
  }

  return items;
}

export interface CatalogSkillRecord {
  id: string;
  name: string;
  description: string;
  fullDescription: string;
  icon: string;
  kind: 'skill' | 'command';
  scope: 'project' | 'global';
  installed: boolean;
}

export function mapCatalogToSkillRecords(
  items: SlashItem[],
  skills: SdkSkillRecord[],
  commands: SdkCommandRecord[],
): CatalogSkillRecord[] {
  const skillContent = new Map(skills.map((s) => [s.name, s.content ?? s.description ?? '']));
  const commandContent = new Map(
    commands.map((c) => [c.name, typeof c.template === 'string' ? c.template : c.description ?? '']),
  );

  return items.map((item) => ({
    id: item.entryId ?? `${item.source}:${item.name}`,
    name: item.name,
    description: item.description,
    fullDescription:
      item.source === 'skill'
        ? (skillContent.get(item.name) ?? item.description)
        : (commandContent.get(item.name) ?? item.description),
    icon: item.source === 'command' ? '📋' : '⚡',
    kind: item.source === 'skill' ? 'skill' : 'command',
    scope: catalogDisplayScope(item),
    installed: true,
  }));
}

/** @deprecated Use buildSlashCatalog — kept for narrow imports */
export function mapSdkCommandToSlashItem(
  command: SdkCommandRecord,
  ctx: SkillPathContext,
  skillLocations: Map<string, string>,
): SlashItem {
  const skills: SdkSkillRecord[] = [];
  for (const [name, location] of skillLocations) {
    skills.push({ name, location });
  }
  return buildSlashCatalog([command], skills, ctx).find((i) => i.name === command.name) ?? {
    name: command.name,
    description: command.description ?? '',
    source: 'command',
    scope: 'command',
    enabled: command.disabled !== true,
    entryId: `command:${command.name}`,
  };
}

export function mapSdkSkillToSkillRecord(skill: SdkSkillRecord, ctx: SkillPathContext): CatalogSkillRecord {
  return {
    id: `skill:${skill.name}`,
    name: skill.name,
    description: skill.description ?? '',
    fullDescription: skill.content ?? skill.description ?? '',
    icon: '⚡',
    kind: 'skill',
    scope: classifySkillScope(skill.location, ctx),
    installed: true,
  };
}

/** Skills page / sidebar — SKILL.md only, excludes command.list entries. */
export function mapSdkSkillsToSkillRecords(
  skills: SdkSkillRecord[],
  ctx: SkillPathContext,
): CatalogSkillRecord[] {
  return skills
    .filter((skill) => skill.name)
    .map((skill) => mapSdkSkillToSkillRecord(skill, ctx));
}
