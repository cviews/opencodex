import { getClient } from '../sdk/client';
import { on, EventType, extractEventPayload } from '../sdk/eventRouter';
import {
  parseCompactionsFromSessionMessages,
  type SessionMessagesFetchResult,
} from '../thread/compactionActivity';
import { enrichMessageFromParts } from '../thread/messageParts';
import { readConfig, readPlugins } from './configService';
import {
  readConfigProviders,
  configProvidersToProviderGroups,
  resolveDefaultModelFromConfigData,
  resolveDefaultModelFromConfig,
} from './modelConfig';
import { useSessionStore } from '../stores/session';
import { useProjectStore } from '../stores/project';
import { debugWarn, debugError, debugLog } from '../utils/debugLog';
import { questionLog, questionWarn } from '../utils/questionDebug';
import { isPendingSessionId } from '../utils/pendingSession';
import { setCachedDefaultModelRef } from '../thread/composer/defaultModelRef';
import { parseModelRef } from '../thread/composer/models';
import {
  getCachedTeamBySession,
  invalidateTeamBySessionCache,
  writeTeamBySessionCache,
} from './teamSessionCache';
import type {
  ProjectInfo,
  ProviderOption,
  ProviderGroup,
  AgentItem,
  Agent,
  Team,
  FileItem,
  SlashItem,
  PlanData,
  Skill,
  Plugin,
  ProviderEntry,
  SettingsProvider,
  ProviderModelEntry,
  ConversationItem,
  PendingPermission,
  PendingQuestion,
  SubAgentItem,
  TeamInfo,
  TeamTask,
  TeamEvent,
  MemberMessage,
} from '../types';
import type { Session, Message } from '@zmn-codex/types';
import {
  MOCK_PROJECTS,
  MOCK_PROVIDERS,
  MOCK_MODEL_PROVIDERS,
  MOCK_AGENTS,
  MOCK_FILES,
  MOCK_SLASH_COMMANDS,
  MOCK_SESSIONS,
  MOCK_SESSION_PLANS,
  MOCK_SUB_AGENTS,
  MOCK_PROJECT_SKILLS,
  MOCK_GLOBAL_SKILLS,
  MOCK_ALL_PLUGINS,
  MOCK_CONNECTED_PROVIDERS,
  MOCK_SUB_AGENT_PLANS,
  MOCK_PENDING_PERMISSIONS,
  MOCK_PENDING_QUESTIONS,
  MOCK_SETTINGS_PROVIDERS,
  MOCK_DEFAULT_MODELS,
  MOCK_RECENT_CONVERSATIONS,
  MOCK_MESSAGES,
} from '../mock/data';
import { getBuiltinModes } from '../constants/builtin';
import {
  normalizePermissionRequest,
  normalizeQuestionRequest,
  permissionConfigForMode,
  inferPermissionModeFromConfig,
  type PermissionMode,
} from './permissionNormalize';
import { readCachedServerUrl, writeCachedServerUrl } from './serverUrlCache';
import {
  buildSkillLocationMap,
  buildSlashCatalog,
  catalogDirectoryCandidates,
  mapCatalogToSkillRecords,
  mapSdkSkillsToSkillRecords,
  type CatalogSkillRecord,
  type SdkCommandRecord,
  type SdkSkillRecord,
  type SkillPathContext,
} from './skillScope';

// ============================================================
// SDK Connection Check
// ============================================================

function isSDKConnected(): boolean {
  return getClient() !== null;
}

/** OpenCode routes resolve instance via ?directory= — must match the UI project path. */
function queryDirectory(): string | undefined {
  const path = useProjectStore.getState().currentProject.path?.trim();
  return path || undefined;
}

/** Reject bare "/" from path.get() without directory — breaks SSE + question.list routing. */
function normalizeInstanceDirectory(
  directory?: string,
  fallback?: string,
): string | undefined {
  const trimmed = directory?.trim();
  if (trimmed && trimmed !== '/') return trimmed;
  const fb = fallback?.trim();
  return fb && fb !== '/' ? fb : undefined;
}

function instanceQuery(): { directory: string } | undefined {
  const directory = queryDirectory();
  return directory ? { directory } : undefined;
}

async function fetchMergedOpenCodeCatalog(client: NonNullable<ReturnType<typeof getClient>>) {
  const userDirectory = queryDirectory()?.trim() ?? '';
  const catalogDirectory = userDirectory
    ? await resolveCatalogDirectory(userDirectory)
    : '';
  const queryDirs = [...new Set([userDirectory, catalogDirectory].filter(Boolean))];

  const pathQuery = userDirectory ? { directory: userDirectory } : instanceQuery();
  const pathResp = await client.path.get(pathQuery);
  const raw = pathResp.data;
  const paths: SkillPathContext = {
    home: raw?.home ?? '',
    config: raw?.config ?? '',
    worktree: userDirectory || raw?.worktree || catalogDirectory || '',
    directory: userDirectory || raw?.directory || catalogDirectory || '',
  };

  const skillByName = new Map<string, SdkSkillRecord>();
  const commands: SdkCommandRecord[] = [];

  for (const directory of queryDirs) {
    const query = { directory };
    const [skillsResp, commandResp] = await Promise.all([
      client.app.skills(query),
      client.command.list(query),
    ]);
    for (const skill of (skillsResp.data ?? []) as SdkSkillRecord[]) {
      if (skill.name && !skillByName.has(skill.name)) {
        skillByName.set(skill.name, skill);
      }
    }
    commands.push(...((commandResp.data ?? []) as SdkCommandRecord[]));
  }

  const skills = [...skillByName.values()];
  const projectCommandNames = catalogDirectory
    ? await loadProjectCommandNames(catalogDirectory)
    : new Set<string>();

  return {
    paths,
    skills,
    commands,
    skillLocations: buildSkillLocationMap(skills),
    projectCommandNames,
  };
}

async function fetchSkillCatalog(client: NonNullable<ReturnType<typeof getClient>>) {
  const catalog = await fetchMergedOpenCodeCatalog(client);
  return {
    paths: catalog.paths,
    skills: catalog.skills,
    skillLocations: catalog.skillLocations,
  };
}

async function fetchSlashAndSkillCatalog(client: NonNullable<ReturnType<typeof getClient>>) {
  const catalog = await fetchMergedOpenCodeCatalog(client);
  const slashItems = buildSlashCatalog(
    catalog.commands,
    catalog.skills,
    catalog.paths,
    catalog.projectCommandNames,
  );
  const skillRecords = mapCatalogToSkillRecords(slashItems, catalog.skills, catalog.commands);
  return { slashItems, skillRecords, ...catalog };
}

/** OpenCode session todos use `content`, not `title`. */
function todoStepLabel(step: Record<string, unknown>): string {
  const content = typeof step.content === 'string' ? step.content.trim() : '';
  const title = typeof step.title === 'string' ? step.title.trim() : '';
  return content || title || '（未命名步骤）';
}

// ============================================================
// Config-based Provider Parsing (reads opencode.json directly)
// ============================================================

interface ConfigProviderEntry {
  npm: string;
  name: string;
  options: Record<string, unknown>;
  models: Record<string, ConfigModelEntry>;
}

interface ConfigModelEntry {
  name: string;
  limit?: { context?: number; output?: number };
  modalities?: { input?: string[]; output?: string[] };
  options?: Record<string, unknown>;
  disable?: boolean;
  reasoning?: boolean;
}

function resolveProviderType(id: string, entry?: ConfigProviderEntry): string | undefined {
  const storedProviderType = (entry as unknown as Record<string, unknown> | undefined)?.providerType as string | undefined;
  const inferredProviderType = id.includes('zhipuai') ? 'zhipuai-coding' : id.includes('volcengine') ? 'volcengine-coding' : undefined;
  const baseURL = (entry?.options as Record<string, unknown> | undefined)?.baseURL as string | undefined;
  return (
    storedProviderType ??
    inferredProviderType ??
    (baseURL?.includes('bigmodel.cn') ? 'zhipuai-coding' : baseURL?.includes('volces.com') ? 'volcengine-coding' : undefined)
  );
}

function configProvidersToProviderOptions(configProviders: Map<string, ConfigProviderEntry>): ProviderOption[] {
  return Array.from(configProviders.entries()).map(([id, entry]) => ({
    id,
    label: entry.name ?? id,
    providerType: resolveProviderType(id, entry),
    models: Object.entries(entry.models ?? {}).map(([modelId, model]) => ({
      id: modelId,
      label: model.name ?? modelId,
    })),
  }));
}

function configProvidersToConnectedProviders(configProviders: Map<string, ConfigProviderEntry>): ProviderEntry[] {
  return Array.from(configProviders.entries()).map(([id, entry]) => {
    const storedProviderType = (entry as unknown as Record<string, unknown>)?.providerType as string | undefined;
    const inferredProviderType = id.includes('zhipuai') ? 'zhipuai-coding' : id.includes('volcengine') ? 'volcengine-coding' : undefined;
    return {
    id,
    name: entry.name ?? id,
    description: entry.npm ?? '自定义提供商',
    connected: true,
    tag: '配置',
    providerType: storedProviderType ?? inferredProviderType,
    apiKey: (entry.options as Record<string, unknown>)?.apiKey as string | undefined,
    models: Object.entries(entry.models ?? {}).map(([modelId, model]) => ({
      id: modelId,
      name: model.name ?? modelId,
      enabled: model.disable !== true,
    })),
    expanded: false,
  };
  });
}

function configProvidersToSettingsProviders(configProviders: Map<string, ConfigProviderEntry>): SettingsProvider[] {
  return Array.from(configProviders.entries()).map(([id, entry]) => ({
    id,
    name: entry.name ?? id,
    shortName: (entry.name ?? id).substring(0, 10),
    models: Object.entries(entry.models ?? {}).map(([modelId, model]) => ({
      id: modelId,
      name: model.name ?? modelId,
      modelId,
      enabled: model.disable !== true,
    })),
    expanded: false,
  }));
}

/** Merge config-based providers with SDK-based providers, deduplicating by id */
function mergeProviderOptions(config: ProviderOption[], sdk: ProviderOption[]): ProviderOption[] {
  const seen = new Map<string, ProviderOption>();
  for (const p of config) seen.set(p.id, p);
  for (const p of sdk) {
    if (seen.has(p.id)) {
      const existing = seen.get(p.id)!;
      const modelIds = new Set(existing.models.map(m => m.id));
      for (const m of p.models) {
        if (!modelIds.has(m.id)) existing.models.push(m);
      }
      if (!existing.providerType && p.providerType) {
        existing.providerType = p.providerType;
      }
    } else {
      seen.set(p.id, p);
    }
  }
  return Array.from(seen.values());
}

function mergeProviderGroups(config: ProviderGroup[], sdk: ProviderGroup[]): ProviderGroup[] {
  const seen = new Map<string, ProviderGroup>();
  for (const p of config) seen.set(p.id, p);
  for (const p of sdk) {
    if (seen.has(p.id)) {
      const existing = seen.get(p.id)!;
      const sdkModelById = new Map(p.models.map((m) => [m.modelId, m]));
      for (const model of existing.models) {
        const sdkModel = sdkModelById.get(model.modelId);
        if (sdkModel?.reasoning === true) {
          model.reasoning = true;
        }
      }
      const modelIds = new Set(existing.models.map((m) => m.modelId));
      for (const m of p.models) {
        if (!modelIds.has(m.modelId)) existing.models.push(m);
      }
    } else {
      seen.set(p.id, p);
    }
  }
  return Array.from(seen.values());
}

function mergeConnectedProviders(config: ProviderEntry[], sdk: ProviderEntry[]): ProviderEntry[] {
  const seen = new Map<string, ProviderEntry>();
  for (const p of config) seen.set(p.id, p);
  for (const p of sdk) {
    if (!seen.has(p.id)) seen.set(p.id, p);
  }
  return Array.from(seen.values());
}

function mergeSettingsProviders(config: SettingsProvider[], sdk: SettingsProvider[]): SettingsProvider[] {
  const seen = new Map<string, SettingsProvider>();
  for (const p of config) seen.set(p.id, p);
  for (const p of sdk) {
    if (seen.has(p.id)) {
      const existing = seen.get(p.id)!;
      const modelIds = new Set(existing.models.map(m => m.id));
      for (const m of p.models) {
        if (!modelIds.has(m.id)) existing.models.push(m);
      }
    } else {
      seen.set(p.id, p);
    }
  }
  return Array.from(seen.values());
}

// ============================================================
// Transformer Helpers: SDK types → Local app types
// ============================================================

function transformSDKSession(s: Record<string, unknown>): Session {
  const time = (s.time != null && typeof s.time === 'object' ? s.time : {}) as Record<string, number>;
  const created = typeof time.created === 'number' ? time.created : undefined;
  const updated = typeof time.updated === 'number' ? time.updated : undefined;
  return {
    id: s.id as string ?? '',
    slug: s.slug as string | undefined,
    projectID: s.projectID as string | undefined,
    workspaceID: s.workspaceID as string | undefined,
    directory: s.directory as string | undefined,
    path: s.path as string | undefined,
    parentID: s.parentID as string | undefined,
    title: s.title as string ?? '',
    agent: s.agent as string | undefined,
    model: s.model as Session['model'] | undefined,
    version: s.version as string | undefined,
    cost: typeof s.cost === 'number' ? s.cost : undefined,
    tokens: s.tokens as Session['tokens'] | undefined,
    time: s.time as Session['time'] | undefined,
    cwd: (s.directory as string) ?? '',
    createdAt: created ? new Date(created).toISOString() : '',
    updatedAt: updated ? new Date(updated).toISOString() : '',
  };
}

let _messageCounter = 0;

/**
 * Extract displayable text content from an SDK message.
 * SDK messages store text in `parts` array (each part has `type` and `text`).
 * Some messages may also have a top-level `content` string.
 */
function extractContent(m: Record<string, unknown>): string | undefined {
  if (typeof m.content === 'string' && m.content.length > 0) {
    return m.content;
  }

  const parts = m.parts;
  if (Array.isArray(parts) && parts.length > 0) {
    let fullText: string | undefined;
    let accumulatedDelta = '';
    for (const part of parts) {
      if (part && typeof part === 'object') {
        const p = part as Record<string, unknown>;
        if (p.type === 'text' && typeof p.text === 'string') {
          fullText = p.text;
        }
        if (p.type === 'text-delta' && typeof p.text === 'string') {
          accumulatedDelta += p.text;
        }
      }
    }
    if (fullText !== undefined) return fullText;
    if (accumulatedDelta) return accumulatedDelta;
  }

  return undefined;
}

function extractReasoningContent(m: Record<string, unknown>, parts?: unknown[]): string | undefined {
  const sourceParts = parts ?? m.parts;
  if (!Array.isArray(sourceParts)) return undefined;
  const texts: string[] = [];
  for (const part of sourceParts) {
    if (part && typeof part === 'object') {
      const p = part as Record<string, unknown>;
      if (p.type === 'reasoning' && typeof p.text === 'string' && p.text.length > 0) {
        texts.push(p.text);
      }
    }
  }
  return texts.length > 0 ? texts.join('\n\n') : undefined;
}

function transformSDKMessage(m: Record<string, unknown>): Message {
  const roleStr = m.role as string;
  const role: Message['role'] = roleStr === 'user' ? 'user' : roleStr === 'assistant' ? 'assistant' : roleStr === 'system' ? 'system' : 'tool';
  const rawId = m.id as string | undefined;
  const id = rawId && rawId.length > 0 ? rawId : `msg_${Date.now()}_${++_messageCounter}`;
  const sessionID = m.sessionID as string ?? '';

  const msg: Message = {
    id,
    sessionID,
    role,
    parentID: m.parentID as string | undefined,
    sessionId: sessionID,
  };

  const content = extractContent(m);
  if (content !== undefined) {
    (msg as Record<string, unknown>).content = content;
  }

  const reasoningContent = extractReasoningContent(m);
  if (reasoningContent !== undefined) {
    msg.reasoningContent = reasoningContent;
  }

  if (role === 'assistant') {
    msg.modelID = m.modelID as string | undefined;
    msg.providerID = m.providerID as string | undefined;
    msg.mode = m.mode as string | undefined;
    msg.agent = m.agent as string | undefined;
    msg.cost = m.cost as number | undefined;
    msg.tokens = m.tokens as Message['tokens'] | undefined;
    msg.finish = m.finish as string | undefined;
    msg.time = m.time as Message['time'] | undefined;
  }
  if (role === 'user') {
    msg.agent = m.agent as string | undefined;
  }
  if (role === 'assistant' && m.summary === true) {
    (msg as Message & { compactionSummary?: boolean }).compactionSummary = true;
  }
  return msg;
}

/** Parse display name from spawn title: `req-analyst (@req-analyst teammate, ...)`. */
function parseTeammateDisplayName(child: Record<string, unknown>): string {
  const title = String(child.title ?? '');
  const fromTitle = title.match(/^(.+?)\s+\(@/)?.[1]?.trim();
  if (fromTitle) return fromTitle;
  const agent = String(child.agent ?? '').trim();
  if (agent && agent !== 'agent') return agent;
  return 'Teammate';
}

function transformChildrenToSubAgents(children: Record<string, unknown>[], parentSessionId: string): SubAgentItem[] {
  const runStatus = useSessionStore.getState().sessionRunStatus;
  return children.map((child) => {
    const sessionId = String(child.id ?? '');
    const time = (child.time ?? {}) as Record<string, number>;
    const displayName = parseTeammateDisplayName(child);
    const sessionRun = runStatus[sessionId];
    let status: SubAgentItem['status'];
    if (sessionRun === 'running') {
      status = 'running';
    } else if (time.archived) {
      status = 'completed';
    } else if (sessionRun === 'error') {
      status = 'completed';
    } else {
      status = 'pending';
    }
    const sessionTitle = String(child.title ?? '');
    return {
      id: child.id as string ?? '',
      sessionId: child.id as string ?? '',
      parentSessionId,
      name: displayName,
      icon: displayName.charAt(0).toUpperCase(),
      status,
      /** Keep full session title for teammate vs task-subagent classification. */
      title: sessionTitle || displayName,
    };
  });
}

async function sdkCall<T>(fn: () => Promise<T>, mockFallback: T): Promise<T> {
  if (!isSDKConnected()) {
    debugWarn('opencodeAdapter.sdk-not-connected', 'returning mock fallback');
    return mockFallback;
  }
  try {
    return await fn();
  } catch (err) {
    debugWarn('opencodeAdapter.sdk-call-failed', err, { fallback: 'mock' });
    return mockFallback;
  }
}

type FrontmatterValue = string | number | boolean | string[] | Record<string, string>;
type FrontmatterData = Record<string, FrontmatterValue>;

function parseFrontmatterValue(value: string): string | number | boolean {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseMarkdownFrontmatter(markdown: string): { frontmatter: FrontmatterData; body: string } {
  const normalized = markdown.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { frontmatter: {}, body: normalized };

  const lines = normalized.split('\n');
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closingIndex < 0) return { frontmatter: {}, body: normalized };

  const frontmatter: FrontmatterData = {};
  let currentKey: string | null = null;

  for (const line of lines.slice(1, closingIndex)) {
    if (!line.trim()) continue;

    const arrayMatch = line.match(/^\s+-\s+(.+)$/);
    if (arrayMatch && currentKey) {
      const existing = frontmatter[currentKey];
      const items = Array.isArray(existing) ? existing : [];
      items.push(String(parseFrontmatterValue(arrayMatch[1])));
      frontmatter[currentKey] = items;
      continue;
    }

    const nestedMatch = line.match(/^\s+([\w-]+):\s*(.*)$/);
    if (nestedMatch && currentKey) {
      const existing = frontmatter[currentKey];
      const record = existing && !Array.isArray(existing) && typeof existing === 'object' ? existing : {};
      record[nestedMatch[1]] = String(parseFrontmatterValue(nestedMatch[2]));
      frontmatter[currentKey] = record;
      continue;
    }

    const keyMatch = line.match(/^([\w-]+):\s*(.*)$/);
    if (keyMatch) {
      const key = keyMatch[1];
      const rawValue = keyMatch[2];
      currentKey = key;
      frontmatter[key] = rawValue.trim() ? parseFrontmatterValue(rawValue) : {};
    }
  }

  return { frontmatter, body: lines.slice(closingIndex + 1).join('\n').trimStart() };
}

function serializeFrontmatterValue(value: string | number | boolean): string {
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

function serializeMarkdownFrontmatter(frontmatter: FrontmatterData, body: string): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      value.forEach((item) => lines.push(`  - ${item}`));
    } else if (typeof value === 'object') {
      lines.push(`${key}:`);
      Object.entries(value).forEach(([nestedKey, nestedValue]) => {
        lines.push(`  ${nestedKey}: ${nestedValue}`);
      });
    } else {
      lines.push(`${key}: ${serializeFrontmatterValue(value)}`);
    }
  }
  lines.push('---', '', body);
  return lines.join('\n');
}

function getElectronConfigApi(): ElectronAPI | null {
  if (typeof window !== 'undefined' && window.electronAPI) return window.electronAPI;
  return null;
}

/** Resolve the nearest directory that owns project `.opencode` / opencode.json(c). */
async function resolveCatalogDirectory(projectPath: string): Promise<string> {
  const trimmed = projectPath.trim();
  if (!trimmed) return trimmed;

  const electronApi = getElectronConfigApi();
  if (!electronApi?.configFileExists) return trimmed;

  for (const candidate of catalogDirectoryCandidates(trimmed)) {
    const opencodeDir = `${candidate}/.opencode`;
    const jsonc = `${candidate}/opencode.jsonc`;
    const json = `${candidate}/opencode.json`;
    const [dirResp, jsoncResp, jsonResp] = await Promise.all([
      electronApi.configFileExists({ path: opencodeDir }),
      electronApi.configFileExists({ path: jsonc }),
      electronApi.configFileExists({ path: json }),
    ]);
    if (dirResp.exists || jsoncResp.exists || jsonResp.exists) {
      return candidate;
    }
  }

  return trimmed;
}

/** Names from `{catalog}/.opencode/commands/*.md` — the only project-local command files. */
async function loadProjectCommandNames(catalogDirectory: string): Promise<Set<string>> {
  const names = new Set<string>();
  const root = catalogDirectory.trim();
  if (!root) return names;

  const electronApi = getElectronConfigApi();
  if (!electronApi?.configListFiles) return names;

  for (const subdir of ['commands', 'command'] as const) {
    const dirPath = `${root}/.opencode/${subdir}`;
    const dirExists = await electronApi.configFileExists({ path: dirPath });
    if (!dirExists.exists) continue;

    const listed = await electronApi.configListFiles({ dirPath, pattern: '*.md' });
    if (!listed.success || !listed.files) continue;

    for (const file of listed.files) {
      const base = file.split('/').pop() ?? file;
      if (base.endsWith('.md')) {
        names.add(base.slice(0, -3));
      }
    }
  }

  return names;
}

async function readPluginAgentRegistry(): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const electronApi = getElectronConfigApi();
  if (!electronApi) return result;

  const pluginConfigs = [
    { dirPath: '~/.config/opencode', pluginId: 'oh-my-openagent' },
    { dirPath: '~/.config/opencodeprod', pluginId: 'oh-my-openagent' },
  ];

  for (const { dirPath, pluginId } of pluginConfigs) {
    try {
      const readResult = await electronApi.configReadTextFile({ path: `${dirPath}/${pluginId}.json` });
      if (!readResult.success || readResult.content === undefined) continue;
      const json = JSON.parse(readResult.content) as Record<string, unknown>;
      const agents = json.agents as Record<string, unknown> | undefined;
      if (agents) {
        for (const agentName of Object.keys(agents)) {
          result.set(agentName, pluginId);
        }
      }
    } catch { /* ignore */ }
  }
  return result;
}

function findPluginForAgent(pluginAgentMap: Map<string, string>, id: string, name: string): string | undefined {
  const idLower = id.toLowerCase();
  const nameLower = name.toLowerCase();
  for (const [agentName, pluginId] of pluginAgentMap) {
    const agentNameLower = agentName.toLowerCase();
    if (idLower === agentNameLower || nameLower === agentNameLower || nameLower.startsWith(agentNameLower)) {
      return pluginId;
    }
  }
  return undefined;
}

async function fetchInstalledPluginNames(): Promise<string[]> {
  try {
    const rawNames = await readPlugins();
    return rawNames.map(p => {
      const base = p.replace(/@latest$/, '').replace(/@[\d.]+$/, '');
      const segments = base.split('/');
      return segments.length > 1 && segments[0].startsWith('@') ? segments[segments.length - 1] : base;
    });
  } catch {
    return [];
  }
}

const HIDDEN_AGENT_IDS = new Set([
  'build', 'plan',
  'opencode-builder', 'OpenCode-Builder',
]);

function isHiddenAgent(id: string, name: string): boolean {
  return HIDDEN_AGENT_IDS.has(id) || HIDDEN_AGENT_IDS.has(name);
}

function markdownConfigId(filePath: string): string {
  const fileName = filePath.split('/').pop() ?? filePath;
  return fileName.replace(/\.md$/, '');
}

async function readOpenCodeMarkdownConfigs(kind: 'agent' | 'team'): Promise<Array<{ id: string; frontmatter: FrontmatterData; body: string }>> {
  const electronApi = getElectronConfigApi();
  if (!electronApi) return [];

  const dirPath = `~/.opencode/${kind}`;
  const listed = await electronApi.configListFiles({ dirPath, pattern: '*.md' });
  if (!listed.success || !listed.files) return [];

  const configs: Array<{ id: string; frontmatter: FrontmatterData; body: string }> = [];
  for (const file of listed.files) {
    const path = file.includes('/') ? file : `${dirPath}/${file}`;
    const readResult = await electronApi.configReadTextFile({ path });
    if (!readResult.success || readResult.content === undefined) continue;
    const parsed = parseMarkdownFrontmatter(readResult.content);
    configs.push({ id: markdownConfigId(file), frontmatter: parsed.frontmatter, body: parsed.body });
  }
  return configs;
}

function frontmatterString(value: FrontmatterValue | undefined, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function frontmatterNumber(value: FrontmatterValue | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function frontmatterBoolean(value: FrontmatterValue | undefined, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function frontmatterStringArray(value: FrontmatterValue | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

function frontmatterRecord(value: FrontmatterValue | undefined): Record<string, string> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, string>;
  }
  return undefined;
}

const TEAM_HTTP_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  timeoutMs = TEAM_HTTP_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getOpenCodeServerUrl(): Promise<string | null> {
  if (!getClient()) return null;

  const cached = readCachedServerUrl();
  if (cached) return cached;

  const electronApi = getElectronConfigApi();
  if (!electronApi?.serverUrl) return null;
  try {
    const url = await electronApi.serverUrl();
    if (url) writeCachedServerUrl(url);
    return url;
  } catch {
    return readCachedServerUrl();
  }
}

// ============================================================
// 1. Project Management
// ============================================================

const PROJECTS_STORAGE_KEY = 'codex-projects';
const CURRENT_PROJECT_KEY = 'codex-current-project';

export const opencodeProject = {
  getProjects: (): ProjectInfo[] => {
    try {
      const saved = localStorage.getItem(PROJECTS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return MOCK_PROJECTS.map(p => ({ ...p }));
  },

  fetchProjects: async (): Promise<ProjectInfo[]> => {
    return sdkCall(async () => {
      const resp = await getClient()!.project.list();
      const projects = (resp.data ?? []) as Record<string, unknown>[];
      return projects.map(p => ({
        id: p.id as string ?? '',
        name: p.name as string ?? p.path as string ?? '',
        path: p.path as string ?? p.directory as string ?? '',
      }));
    }, MOCK_PROJECTS.map(p => ({ ...p })));
  },

  fetchCurrentProject: async (): Promise<ProjectInfo | null> => {
    return sdkCall(async () => {
      const resp = await getClient()!.project.current();
      const project = resp.data as Record<string, unknown> | null;
      if (!project) return null;
      return {
        id: project.id as string ?? '',
        name: project.name as string ?? project.path as string ?? '',
        path: project.path as string ?? project.directory as string ?? '',
      };
    }, null);
  },

  saveProjects: (projects: ProjectInfo[]): void => {
    try { localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects)); } catch { /* ignore */ }
  },

  getCurrentProject: (): ProjectInfo => {
    try {
      const saved = localStorage.getItem(CURRENT_PROJECT_KEY);
      if (saved) {
        const project = JSON.parse(saved) as ProjectInfo;
        if (project && project.path && project.path.trim() !== '') return project;
      }
    } catch { /* ignore */ }
    return { id: '', name: '', path: '' };
  },

  saveCurrentProject: (project: ProjectInfo): void => {
    try { localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify(project)); } catch { /* ignore */ }
  },

  addProject: async (project: ProjectInfo): Promise<boolean> => {
    return sdkCall(async () => {
      await getClient()!.project.update({ projectID: project.id, name: project.name, directory: project.path });
      return true;
    }, true);
  },

  removeProject: async (projectId: string): Promise<boolean> => {
    return sdkCall(async () => {
      await getClient()!.experimental.workspace.remove({ id: projectId });
      return true;
    }, true);
  },
};

async function resolveCompressModel(
  sessionId: string,
): Promise<{ providerID: string; modelID: string }> {
  const client = getClient();
  if (client) {
    try {
      const resp = await client.session.get({ sessionID: sessionId });
      const model = (resp.data as Record<string, unknown> | undefined)?.model as
        | { id?: string; providerID?: string }
        | undefined;
      if (model?.id && model.providerID) {
        return { providerID: model.providerID, modelID: model.id };
      }
    } catch {
      /* fall through */
    }
  }

  const cached = useSessionStore.getState().sessions.find((s) => s.id === sessionId);
  if (cached?.model?.id && cached.model.providerID) {
    return { providerID: cached.model.providerID, modelID: cached.model.id };
  }

  const defaultModel = await opencodeSettings.fetchDefaultModel();
  if (defaultModel?.id.includes('/')) {
    const [providerID, modelID] = defaultModel.id.split('/');
    if (providerID && modelID) {
      return { providerID, modelID };
    }
  }

  throw new Error('无法确定压缩使用的模型，请先在会话中选择模型');
}

// ============================================================
// 2. Slash Commands
// ============================================================

function slashEntryKey(item: SlashItem): string {
  return item.entryId ?? `${item.source}:${item.name}`;
}

function combineBuiltinAndCatalog(catalog: SlashItem[]): SlashItem[] {
  const builtin = getBuiltinModes();
  const builtinNames = new Set(builtin.map((b) => b.name));
  return [...builtin, ...catalog.filter((c) => !builtinNames.has(c.name))];
}

/** API / mock entries win over disk when the same entryId exists. */
function mergeCatalogEntries(primary: SlashItem[], secondary: SlashItem[]): SlashItem[] {
  const map = new Map<string, SlashItem>();
  for (const item of secondary) map.set(slashEntryKey(item), item);
  for (const item of primary) map.set(slashEntryKey(item), item);
  return [...map.values()];
}

/**
 * Read project + global skills/commands from `.opencode` on disk.
 * Project: `{catalogDir}/.opencode/{skills,commands}`
 * Global: `~/.opencode/{skills,commands}`
 */
async function buildSlashCatalogFromDisk(projectPath: string): Promise<SlashItem[]> {
  const electronApi = getElectronConfigApi();
  if (!electronApi?.configListFiles || !electronApi.configReadTextFile || !electronApi.configFileExists) {
    return [];
  }
  const configApi = electronApi;

  const catalogDirectory = projectPath.trim()
    ? await resolveCatalogDirectory(projectPath.trim())
    : '';
  const items: SlashItem[] = [];
  const seen = new Set<string>();

  function pushItem(item: SlashItem) {
    const key = slashEntryKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  }

  async function readSkillDir(skillsRoot: string, scope: 'project' | 'global') {
    const dirExists = await configApi.configFileExists({ path: skillsRoot });
    if (!dirExists.exists) return;

    const listed = await configApi.configListFiles({ dirPath: skillsRoot, pattern: '*' });
    if (!listed.success || !listed.files) return;

    for (const entry of listed.files) {
      if (entry.endsWith('.md')) continue;
      const skillPath = `${skillsRoot}/${entry}/SKILL.md`;
      const exists = await configApi.configFileExists({ path: skillPath });
      if (!exists.exists) continue;

      const read = await configApi.configReadTextFile({ path: skillPath });
      if (!read.success || read.content === undefined) continue;

      const { frontmatter } = parseMarkdownFrontmatter(read.content);
      const name = String(frontmatter.name ?? entry).trim();
      if (!name) continue;

      pushItem({
        name,
        description: String(frontmatter.description ?? '').trim(),
        source: 'skill',
        scope,
        enabled: true,
        entryId: `skill:${name}`,
      });
    }
  }

  async function readCommandDir(commandsRoot: string, scope: 'project' | 'global') {
    const dirExists = await configApi.configFileExists({ path: commandsRoot });
    if (!dirExists.exists) return;

    const listed = await configApi.configListFiles({ dirPath: commandsRoot, pattern: '*.md' });
    if (!listed.success || !listed.files) return;

    for (const file of listed.files) {
      const base = file.split('/').pop() ?? file;
      if (!base.endsWith('.md')) continue;
      const filePath = `${commandsRoot}/${base}`;
      const read = await configApi.configReadTextFile({ path: filePath });

      let name = base.slice(0, -3);
      let description = '';
      if (read.success && read.content !== undefined) {
        const { frontmatter } = parseMarkdownFrontmatter(read.content);
        if (frontmatter.name) name = String(frontmatter.name).trim();
        if (frontmatter.description) description = String(frontmatter.description).trim();
      }
      if (!name) continue;

      pushItem({
        name,
        description,
        source: 'command',
        scope,
        enabled: true,
        entryId: `command:${name}`,
      });
    }
  }

  if (catalogDirectory) {
    await readSkillDir(`${catalogDirectory}/.opencode/skills`, 'project');
    for (const subdir of ['commands', 'command'] as const) {
      await readCommandDir(`${catalogDirectory}/.opencode/${subdir}`, 'project');
    }
  }

  await readSkillDir('~/.opencode/skills', 'global');
  for (const subdir of ['commands', 'command'] as const) {
    await readCommandDir(`~/.opencode/${subdir}`, 'global');
  }

  return items;
}

function mergeSkillRecords(api: CatalogSkillRecord[], disk: CatalogSkillRecord[]): CatalogSkillRecord[] {
  const map = new Map<string, CatalogSkillRecord>();
  for (const record of disk) map.set(record.id, record);
  for (const record of api) {
    const existing = map.get(record.id);
    map.set(record.id, existing
      ? {
          ...record,
          fullDescription: record.fullDescription || existing.fullDescription,
          description: record.description || existing.description,
        }
      : record);
  }
  return [...map.values()];
}

/** Read SKILL.md from project + ~/.opencode for the skills sidebar (includes full body). */
async function readSkillRecordsFromDisk(projectPath: string): Promise<CatalogSkillRecord[]> {
  const electronApi = getElectronConfigApi();
  if (!electronApi?.configListFiles || !electronApi.configReadTextFile || !electronApi.configFileExists) {
    return [];
  }
  const configApi = electronApi;

  const catalogDirectory = projectPath.trim()
    ? await resolveCatalogDirectory(projectPath.trim())
    : '';
  const records: CatalogSkillRecord[] = [];
  const seen = new Set<string>();

  async function readSkillDir(skillsRoot: string, scope: 'project' | 'global') {
    const dirExists = await configApi.configFileExists({ path: skillsRoot });
    if (!dirExists.exists) return;

    const listed = await configApi.configListFiles({ dirPath: skillsRoot, pattern: '*' });
    if (!listed.success || !listed.files) return;

    for (const entry of listed.files) {
      if (entry.endsWith('.md')) continue;
      const skillPath = `${skillsRoot}/${entry}/SKILL.md`;
      const exists = await configApi.configFileExists({ path: skillPath });
      if (!exists.exists) continue;

      const read = await configApi.configReadTextFile({ path: skillPath });
      if (!read.success || read.content === undefined) continue;

      const { frontmatter, body } = parseMarkdownFrontmatter(read.content);
      const name = String(frontmatter.name ?? entry).trim();
      if (!name) continue;

      const id = `skill:${name}`;
      if (seen.has(id)) continue;
      seen.add(id);

      records.push({
        id,
        name,
        description: String(frontmatter.description ?? '').trim(),
        fullDescription: body.trim() || String(frontmatter.description ?? '').trim(),
        icon: '⚡',
        kind: 'skill',
        scope,
        installed: true,
      });
    }
  }

  if (catalogDirectory) {
    await readSkillDir(`${catalogDirectory}/.opencode/skills`, 'project');
  }
  await readSkillDir('~/.opencode/skills', 'global');

  return records;
}

async function fetchAllSkillRecords(): Promise<CatalogSkillRecord[]> {
  const projectPath = queryDirectory()?.trim() ?? '';
  const diskRecords = await readSkillRecordsFromDisk(projectPath);

  if (!isSDKConnected()) {
    return diskRecords;
  }

  try {
    const apiRecords = await fetchSkillPageRecords(getClient()!);
    return mergeSkillRecords(apiRecords, diskRecords);
  } catch (err) {
    debugWarn('[opencodeSkills] API skill fetch failed, using disk snapshot:', err);
    return diskRecords;
  }
}

let slashCatalogCache: { projectPath: string; items: SlashItem[] } | null = null;
let slashCatalogRefreshPromise: Promise<SlashItem[]> | null = null;

function updateSlashCatalogCache(projectPath: string, items: SlashItem[]) {
  slashCatalogCache = { projectPath, items };
}

async function refreshSlashCatalog(): Promise<SlashItem[]> {
  if (slashCatalogRefreshPromise) return slashCatalogRefreshPromise;

  slashCatalogRefreshPromise = (async () => {
    const projectPath = queryDirectory()?.trim() ?? '';

    const diskItems = await buildSlashCatalogFromDisk(projectPath);
    updateSlashCatalogCache(projectPath, diskItems);

    if (isSDKConnected()) {
      try {
        const { slashItems } = await fetchSlashAndSkillCatalog(getClient()!);
        const merged = mergeCatalogEntries(slashItems, diskItems);
        updateSlashCatalogCache(projectPath, merged);
        return combineBuiltinAndCatalog(merged);
      } catch (err) {
        debugWarn('[opencodeSlash] API catalog failed, using disk snapshot:', err);
        return combineBuiltinAndCatalog(diskItems);
      }
    }

    const mockItems = MOCK_SLASH_COMMANDS.filter((c) => c.enabled !== false);
    const merged = mergeCatalogEntries(mockItems, diskItems);
    updateSlashCatalogCache(projectPath, merged);
    return combineBuiltinAndCatalog(merged);
  })().finally(() => {
    slashCatalogRefreshPromise = null;
  });

  return slashCatalogRefreshPromise;
}

export const opencodeSlash = {
  getSlashCommands: (): SlashItem[] => {
    const projectPath = queryDirectory()?.trim() ?? '';
    const cached = slashCatalogCache?.projectPath === projectPath ? slashCatalogCache.items : [];
    return combineBuiltinAndCatalog(cached);
  },

  /** Cached catalog (disk and/or last API merge), plus built-in modes. */
  getCachedSlashCommands: (): SlashItem[] => {
    const projectPath = queryDirectory()?.trim() ?? '';
    const cached = slashCatalogCache?.projectPath === projectPath ? slashCatalogCache.items : [];
    return combineBuiltinAndCatalog(cached);
  },

  /** Warm catalog from disk immediately, then merge OpenCode API in the background. */
  prefetchSlashCatalog: (): void => {
    void refreshSlashCatalog();
  },

  fetchSlashCommands: async (): Promise<SlashItem[]> => {
    return refreshSlashCatalog();
  },

  setPlanMode: async (_enabled: boolean): Promise<boolean> => {
    return true;
  },

  compressContext: async (sessionId?: string): Promise<boolean> => {
    if (!isSDKConnected()) {
      throw new Error('未连接到 OpenCode 服务');
    }
    const id = sessionId ?? useSessionStore.getState().activeSessionId;
    if (!id) {
      throw new Error('没有可压缩的会话');
    }
    try {
      const { providerID, modelID } = await resolveCompressModel(id);
      const resp = await getClient()!.session.summarize({
        sessionID: id,
        providerID,
        modelID,
        directory: queryDirectory(),
      });
      const respError = resp.error as Record<string, unknown> | undefined;
      if (respError) {
        const data = respError.data as Record<string, unknown> | undefined;
        const msg = (data?.message as string | undefined) ?? (respError.message as string | undefined) ?? '未知错误';
        throw new Error(msg);
      }
      return true;
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown> | null | undefined;
      const tag = errObj?._tag as string | undefined;
      const msg = (err instanceof Error ? err.message : (errObj?.message as string | undefined)) ?? String(err);
      if (tag === 'ServiceUnavailableError' || msg.includes('not available') || msg.includes('503') || msg.includes('ServiceUnavailable')) {
        throw new Error('压缩功能暂未开放，请稍后再试');
      }
      if (msg.includes('Missing key') && msg.includes('providerID')) {
        throw new Error('无法确定压缩使用的模型，请先在会话中选择模型');
      }
      throw new Error(`压缩失败：${msg}`);
    }
  },
};

// ============================================================
// 3. Provider & Model Selection
// ============================================================

export const opencodeProvider = {
  getProviders: (): ProviderOption[] => MOCK_PROVIDERS,

  fetchProviders: async (): Promise<ProviderOption[]> => {
    const configProviders = await readConfigProviders();
    const configOptions = configProvidersToProviderOptions(configProviders);
    return sdkCall(async () => {
      const client = getClient()!;
      const provResp = await client.v2.provider.list();
      const providers = (provResp.data ?? []) as Record<string, unknown>[];
      const sdkOptions = providers.map((p) => {
        const id = p.id as string ?? '';
        const configEntry = configProviders.get(id);
        return {
          id,
          label: p.name as string ?? '',
          providerType: resolveProviderType(id, configEntry) ??
            ((id.includes('zhipuai') ? 'zhipuai-coding' : id.includes('volcengine') ? 'volcengine-coding' : undefined)),
          models: ((p.models ?? []) as Record<string, unknown>[]).map((m) => ({
            id: m.id as string ?? '',
            label: m.name as string ?? '',
          })),
        };
      });
      return mergeProviderOptions(configOptions, sdkOptions);
    }, mergeProviderOptions(configOptions, MOCK_PROVIDERS));
  },

  setModel: async (providerId: string, modelId: string): Promise<boolean> => {
    return sdkCall(async () => {
      await getClient()!.config.update({ config: { model: `${providerId}/${modelId}` } as never });
      return true;
    }, true);
  },

  getModelProviders: (): ProviderGroup[] => MOCK_MODEL_PROVIDERS,

  fetchModelProviders: async (): Promise<ProviderGroup[]> => {
    const configProviders = await readConfigProviders();
    const configGroups = configProvidersToProviderGroups(configProviders);
    return sdkCall(async () => {
      const client = getClient()!;
      const provResp = await client.v2.provider.list();
      const modelResp = await client.v2.model.list();
      const providers = (provResp.data ?? []) as Record<string, unknown>[];
      const models = (modelResp.data ?? []) as Record<string, unknown>[];
      const sdkGroups = providers.map(p => ({
        id: p.id as string ?? '',
        label: p.name as string ?? '',
        models: models
          .filter(m => m.providerID as string === p.id as string)
          .map(m => {
            const caps = m.capabilities as { reasoning?: boolean } | undefined;
            return {
              name: m.name as string ?? '',
              description: m.description as string ?? '',
              source: 'model' as const,
              scope: 'model' as const,
              modelId: m.id as string ?? '',
              provider: p.id as string ?? '',
              providerLabel: p.name as string ?? '',
              reasoning: caps?.reasoning === true,
            };
          }),
      }));
      return mergeProviderGroups(configGroups, sdkGroups);
    }, mergeProviderGroups(configGroups, MOCK_MODEL_PROVIDERS));
  },

  getConnectedProviders: (): ProviderEntry[] => MOCK_CONNECTED_PROVIDERS,

  fetchConnectedProviders: async (): Promise<ProviderEntry[]> => {
    const configProviders = await readConfigProviders();
    const configEntries: ProviderEntry[] = configProvidersToConnectedProviders(configProviders);

    let sdkEntries: ProviderEntry[] = [];
    try {
      if (isSDKConnected()) {
        const provResp = await getClient()!.v2.provider.list();
        const providers = (provResp.data ?? []) as Record<string, unknown>[];
        sdkEntries = providers.map(p => ({
          id: p.id as string ?? '',
          name: p.name as string ?? '',
          description: p.description as string ?? '',
          connected: (p.enabled as Record<string, unknown>) != null,
        }));
      }
    } catch { /* ignore */ }

    const merged = new Map<string, ProviderEntry>();
    configEntries.forEach(e => merged.set(e.id, e));
    sdkEntries.forEach(e => {
      if (!merged.has(e.id)) merged.set(e.id, e);
    });

    return Array.from(merged.values());
  },

  connectProvider: async (_providerId: string, _config: Record<string, unknown>): Promise<boolean> => {
    return sdkCall(async () => {
      await getClient()!.auth.set({ providerID: _providerId, auth: _config as never });
      return true;
    }, true);
  },

  disconnectProvider: async (_providerId: string): Promise<boolean> => {
    return sdkCall(async () => {
      await getClient()!.auth.remove({ providerID: _providerId });
      return true;
    }, true);
  },
};

// ============================================================
// 4. @ Reference (Mentions)
// ============================================================

export const opencodeReference = {
  getProjectFiles: (_cwd?: string): FileItem[] => MOCK_FILES,

  fetchProjectFiles: async (cwd?: string): Promise<FileItem[]> => {
    return sdkCall(async () => {
      const resp = await getClient()!.file.list({ path: cwd ?? '/' });
      const files = (resp.data ?? []) as Record<string, unknown>[];
      return files.map(f => ({
        name: f.name as string ?? '',
        kind: 'file' as const,
        description: f.path as string ?? '',
      }));
    }, MOCK_FILES);
  },

  getAgents: (): AgentItem[] => MOCK_AGENTS,

  fetchAgents: async (): Promise<AgentItem[]> => {
    const localAgentIds = new Set<string>();
    try {
      const configs = await readOpenCodeMarkdownConfigs('agent');
      configs.forEach(cfg => localAgentIds.add(cfg.id));
    } catch { /* ignore */ }

    const pluginAgentMap = await readPluginAgentRegistry();
    const pluginNames = await fetchInstalledPluginNames();

    return sdkCall(async () => {
      const resp = await getClient()!.app.agents();
      const agents = (resp.data ?? []) as Record<string, unknown>[];

      return agents.map(a => {
        const id = String(a.id ?? a.name ?? '');
        const name = String(a.name ?? '');
        const desc = a.description as string ?? '';
        const mode = typeof a.mode === 'string' ? a.mode : undefined;

        if (localAgentIds.has(id)) {
          return { name, kind: 'agent' as const, description: desc, sourceType: 'custom' as const, sourceLabel: '自定义' };
        }

        if (isHiddenAgent(id, name)) {
          return null;
        }

        const matchedPluginId = findPluginForAgent(pluginAgentMap, id, name) || pluginNames[0] || '插件';
        return { name, kind: 'agent' as const, description: desc, sourceType: 'plugin' as const, sourceLabel: matchedPluginId };
      }).filter((item): item is NonNullable<typeof item> => item !== null);
    }, MOCK_AGENTS);
  },

  getCurrentCwd: (): string | null => null,

  fetchCurrentCwd: async (): Promise<string | null> => {
    return sdkCall(async () => {
      const resp = await getClient()!.path.get();
      const data = resp.data as Record<string, unknown> | null;
      return data?.directory as string ?? null;
    }, null);
  },
};

// ============================================================
// 5. Permission Management
// ============================================================

export const opencodePermission = {
  getPermissionModes: () => [
    {
      id: 'default',
      label: '默认',
      description: '敏感操作需确认（写入全局 permission: ask）',
    },
    { id: 'auto-review', label: '自动审查', description: '读操作自动通过，写/命令需确认' },
    { id: 'full-access', label: '完全访问权限', description: '自动批准所有操作' },
  ],

  setPermissionMode: async (mode: string, directory?: string): Promise<boolean> => {
    return sdkCall(async () => {
      await getClient()!.config.update({
        directory,
        config: { permission: permissionConfigForMode(mode) },
      });
      return true;
    }, true);
  },

  fetchPermissionConfig: async (
    directory?: string,
  ): Promise<{ mode: PermissionMode; permission: unknown }> => {
    return sdkCall(async () => {
      const resp = await getClient()!.config.get({ directory });
      const config = resp.data as Record<string, unknown> | null;
      const permission = config?.permission;
      return {
        permission,
        mode: inferPermissionModeFromConfig(permission),
      };
    }, { mode: 'default', permission: undefined });
  },

  fetchPermissionMode: async (directory?: string): Promise<PermissionMode> => {
    const { mode } = await opencodePermission.fetchPermissionConfig(directory);
    return mode;
  },

  /** Instance directory from GET /path — must match ?directory= on permission routes. */
  fetchInstanceDirectory: async (preferred?: string): Promise<string | undefined> => {
    return sdkCall(async () => {
      const project = preferred?.trim() || queryDirectory()?.trim();
      const resp = await getClient()!.path.get(project ? { directory: project } : undefined);
      const data = resp.data as Record<string, unknown> | null;
      const directory = typeof data?.directory === 'string' ? data.directory.trim() : '';
      return normalizeInstanceDirectory(directory, project);
    }, undefined);
  },

  getPendingPermissions: (): PendingPermission[] => MOCK_PENDING_PERMISSIONS,

  fetchPendingPermissions: async (directory?: string): Promise<PendingPermission[]> => {
    if (!isSDKConnected()) {
      debugWarn('opencodePermission.sdk-not-connected', 'cannot list pending permissions');
      return [];
    }
    try {
      const resp = await getClient()!.permission.list({ directory });
      const permissions = (resp.data ?? []) as Record<string, unknown>[];
      const normalized = permissions
        .map((item) => normalizePermissionRequest(item))
        .filter((item): item is PendingPermission => item !== null);
      debugLog('opencodePermission.list', {
        directory: directory ?? '(none)',
        rawCount: permissions.length,
        normalizedCount: normalized.length,
      });
      return normalized;
    } catch (err) {
      debugError('opencodePermission.list-failed', err, { directory: directory ?? '(none)' });
      return [];
    }
  },

  approvePermission: async (
    id: string,
    mode: 'once' | 'session' = 'once',
    directory?: string,
  ): Promise<boolean> => {
    return sdkCall(async () => {
      await getClient()!.permission.reply({
        requestID: id,
        directory,
        reply: mode === 'session' ? 'always' : 'once',
      });
      return true;
    }, true);
  },

  denyPermission: async (id: string, directory?: string): Promise<boolean> => {
    return sdkCall(async () => {
      await getClient()!.permission.reply({ requestID: id, directory, reply: 'reject' });
      return true;
    }, true);
  },
};

export const opencodeQuestion = {
  resolveListDirectories: async (preferred?: string): Promise<string[]> => {
    const ordered: string[] = [];
    const seen = new Set<string>();
    const add = (value?: string) => {
      const trimmed = value?.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      ordered.push(trimmed);
    };

    add(preferred);
    add(queryDirectory());

    if (!isSDKConnected()) return ordered;

    const client = getClient()!;
    const seed = [...ordered];
    for (const dir of seed) {
      try {
        const resp = await client.path.get({ directory: dir });
        const data = resp.data as Record<string, unknown> | undefined;
        add(typeof data?.directory === 'string' ? data.directory : undefined);
        add(typeof data?.worktree === 'string' ? data.worktree : undefined);
      } catch {
        // try next seed directory
      }
    }

    const project = queryDirectory()?.trim();
    if (project) {
      try {
        add(await resolveCatalogDirectory(project));
      } catch {
        // ignore catalog resolution errors
      }
    }

    return ordered;
  },

  logToolAvailability: async (directory?: string, context?: string): Promise<void> => {
    if (!isSDKConnected()) return;
    try {
      const resp = await getClient()!.tool.ids({ directory });
      const ids = (resp.data ?? []) as string[];
      questionLog('tools.ids', {
        context: context ?? '(none)',
        directory: directory ?? '(none)',
        count: ids.length,
        hasQuestion: ids.includes('question'),
        preview: ids.slice(0, 20),
      });
    } catch (err) {
      questionWarn('tools.ids.failed', {
        context: context ?? '(none)',
        directory: directory ?? '(none)',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  logAgentQuestionAccess: async (
    agentName: string,
    directory?: string,
    context?: string,
  ): Promise<void> => {
    if (!isSDKConnected()) return;
    try {
      const resp = await getClient()!.app.agents(directory ? { directory } : undefined);
      const agents = (resp.data ?? []) as Array<Record<string, unknown>>;
      const match = agents.find((item) => {
        const name = typeof item.name === 'string' ? item.name : '';
        const id = typeof item.id === 'string' ? item.id : '';
        return name === agentName || id === agentName;
      });
      const permission =
        match?.permission && typeof match.permission === 'object' && !Array.isArray(match.permission)
          ? (match.permission as Record<string, unknown>)
          : undefined;
      const questionPerm = permission?.question;
      const taskPerm = permission?.task;
      questionLog('agent.question-access', {
        context: context ?? '(none)',
        agent: agentName,
        mode: typeof match?.mode === 'string' ? match.mode : undefined,
        questionPermission: questionPerm ?? '(unset)',
        taskPermission: taskPerm ?? '(unset)',
        hasAgent: Boolean(match),
      });
      if (questionPerm !== 'allow') {
        questionWarn('agent.question-blocked', {
          agent: agentName,
          mode: typeof match?.mode === 'string' ? match.mode : undefined,
          questionPermission: questionPerm ?? '(unset — defaults to deny)',
          hint: 'add agents.OpenCode-Builder.permission.question=allow in oh-my-openagent.json',
        });
      }
    } catch (err) {
      questionWarn('agent.question-access.failed', {
        agent: agentName,
        context: context ?? '(none)',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  fetchPendingQuestions: async (
    directory?: string,
    options?: { quiet?: boolean },
  ): Promise<PendingQuestion[]> => {
    if (!isSDKConnected()) {
      questionWarn('list.skipped', { reason: 'sdk-not-connected', directory: directory ?? '(none)' });
      return [];
    }
    const quiet = options?.quiet ?? false;
    const directories = await opencodeQuestion.resolveListDirectories(directory);
    const merged: PendingQuestion[] = [];
    const seenIds = new Set<string>();

    const ingestRaw = (dir: string | undefined, raw: Record<string, unknown>[]) => {
      if (!quiet || raw.length > 0) {
        questionLog('list.response', {
          directory: dir ?? '(default)',
          rawCount: raw.length,
          rawPreview: raw.length > 0 ? JSON.stringify(raw[0]).slice(0, 500) : '(empty)',
        });
      }
      const dropped: Array<{ index: number; keys: string[] }> = [];
      raw.forEach((item, index) => {
        const q = normalizeQuestionRequest(item);
        if (q && !seenIds.has(q.id)) {
          seenIds.add(q.id);
          merged.push(q);
        } else if (!q) {
          dropped.push({ index, keys: Object.keys(item) });
        }
      });
      if (dropped.length > 0) {
        questionWarn('list.normalize-dropped', {
          directory: dir ?? '(default)',
          dropped,
          rawCount: raw.length,
        });
      }
    };

    // Official CLI/TUI: question.list() without directory uses server default instance (spawn cwd).
    try {
      const defaultResp = await getClient()!.question.list();
      ingestRaw(undefined, (defaultResp.data ?? []) as Record<string, unknown>[]);
    } catch (err) {
      questionWarn('list.failed', {
        directory: '(default)',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    for (const dir of directories) {
      try {
        const resp = await getClient()!.question.list({ directory: dir });
        ingestRaw(dir, (resp.data ?? []) as Record<string, unknown>[]);
      } catch (err) {
        questionWarn('list.failed', {
          directory: dir,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!quiet || merged.length > 0) {
      questionLog('list.normalized', {
        directories,
        count: merged.length,
        items: merged.map((q) => ({
          id: q.id.slice(0, 12),
          sessionId: q.sessionId?.slice(0, 12),
          title: q.title,
          optionCount: q.options.length,
        })),
      });
    }
    return merged;
  },

  answerQuestion: async (id: string, answers: string[][], directory?: string): Promise<boolean> => {
    questionLog('reply.request', { id: id.slice(0, 12), directory: directory ?? '(none)', answers });
    return sdkCall(async () => {
      await getClient()!.question.reply({ requestID: id, directory, answers });
      questionLog('reply.ok', { id: id.slice(0, 12) });
      return true;
    }, true);
  },

  rejectQuestion: async (id: string, directory?: string): Promise<boolean> => {
    questionLog('reject.request', { id: id.slice(0, 12), directory: directory ?? '(none)' });
    return sdkCall(async () => {
      await getClient()!.question.reject({ requestID: id, directory });
      questionLog('reject.ok', { id: id.slice(0, 12) });
      return true;
    }, true);
  },
};

// ============================================================
// 6. Session Management
// ============================================================

export const opencodeSession = {
  getSessions: (): Session[] => MOCK_SESSIONS as unknown as Session[],

  fetchSessions: async (directory?: string): Promise<Session[]> => {
    return sdkCall(async () => {
      const resp = await getClient()!.session.list({ directory, scope: 'project' });
      const sessions = (resp.data ?? []) as Record<string, unknown>[];
      return sessions
        .map(transformSDKSession)
        .filter((s) => !s.parentID?.trim());
    }, MOCK_SESSIONS as unknown as Session[]);
  },

  createSession: async (_cwd?: string): Promise<Session | null> => {
    return sdkCall(async () => {
      const resp = await getClient()!.session.create({});
      return transformSDKSession(resp.data as Record<string, unknown>);
    }, null);
  },

  deleteSession: async (id: string): Promise<boolean> => {
    return sdkCall(async () => {
      const team = await opencodeTeam.fetchTeamBySession(id);
      if (team?.name) {
        await opencodeTeam.releaseTeamForSession(id, team.name);
      }
      await getClient()!.session.delete({ sessionID: id });
      return true;
    }, true);
  },

  getSessionPlans: (): Record<string, PlanData> => MOCK_SESSION_PLANS,

  fetchSessionPlans: async (
    directory?: string,
    sessionIds?: string[],
  ): Promise<Record<string, PlanData>> => {
    return sdkCall(async () => {
      const client = getClient()!;
      const ids = sessionIds?.filter(Boolean) ?? [];
      if (ids.length === 0) return {};

      const plans: Record<string, PlanData> = {};
      for (const sessionID of ids) {
        try {
          const todoData = ((await client.session.todo({ sessionID, directory })).data ?? []) as Record<string, unknown>[];
          if (todoData.length) {
            plans[sessionID] = {
              title: sessionID,
              steps: todoData.map((step) => ({
                title: todoStepLabel(step),
                status: step.status as string === 'completed' ? 'completed' : step.status as string === 'in_progress' ? 'current' : 'pending',
              })),
            };
          }
        } catch { /* skip sessions with no plans */ }
      }
      return plans;
    }, MOCK_SESSION_PLANS);
  },

  getSubAgents: (): SubAgentItem[] => MOCK_SUB_AGENTS,

  /** Only fetch children for given parent sessions (avoids N×children storm on every poll). */
  fetchSubAgents: async (
    directory?: string,
    parentSessionIds?: string[],
  ): Promise<SubAgentItem[]> => {
    return sdkCall(async () => {
      const ids = parentSessionIds?.filter(Boolean) ?? [];
      if (ids.length === 0) return [];

      const allSubAgents: SubAgentItem[] = [];
      for (const parentID of ids) {
        const children = await fetchSessionChildrenSafe(parentID);
        if (children.length > 0) {
          allSubAgents.push(...transformChildrenToSubAgents(children, parentID));
        }
      }
      return allSubAgents;
    }, MOCK_SUB_AGENTS);
  },

  getSubAgentPlans: (): Record<string, PlanData> => MOCK_SUB_AGENT_PLANS,

  fetchSubAgentPlans: async (
    directory?: string,
    parentSessionIds?: string[],
  ): Promise<Record<string, PlanData>> => {
    return sdkCall(async () => {
      const client = getClient()!;
      const ids = parentSessionIds?.filter(Boolean) ?? [];
      if (ids.length === 0) return {};

      const plans: Record<string, PlanData> = {};
      for (const parentID of ids) {
        const children = await fetchSessionChildrenSafe(parentID);
        for (const child of children) {
          try {
            const todoData = ((await client.session.todo({
              sessionID: child.id as string,
              directory,
            })).data ?? []) as Record<string, unknown>[];
            if (todoData.length) {
              plans[child.id as string] = {
                title: child.title as string ?? child.agent as string ?? 'Plan',
                steps: todoData.map((step) => ({
                  title: todoStepLabel(step),
                  status: step.status as string === 'completed' ? 'completed' : step.status as string === 'in_progress' ? 'current' : 'pending',
                })),
              };
            }
          } catch { /* skip */ }
        }
      }
      return plans;
    }, MOCK_SUB_AGENT_PLANS);
  },

  abortSession: async (sessionId: string): Promise<boolean> => {
    return sdkCall(async () => {
      await getClient()!.session.abort({ sessionID: sessionId });
      return true;
    }, true);
  },
};

// ============================================================
// 7. Skills & Plugins
// ============================================================

async function fetchSkillPageRecords(client: NonNullable<ReturnType<typeof getClient>>) {
  const catalog = await fetchSkillCatalog(client);
  return mapSdkSkillsToSkillRecords(catalog.skills, catalog.paths);
}

export const opencodeSkills = {
  getProjectSkills: (): Skill[] => MOCK_PROJECT_SKILLS,

  fetchProjectSkills: async (): Promise<Skill[]> => {
    return sdkCall(async () => {
      const records = await fetchSkillPageRecords(getClient()!);
      return records.filter((skill) => skill.scope === 'project') as Skill[];
    }, MOCK_PROJECT_SKILLS);
  },

  getGlobalSkills: (): Skill[] => MOCK_GLOBAL_SKILLS,

  fetchGlobalSkills: async (): Promise<Skill[]> => {
    return sdkCall(async () => {
      const records = await fetchSkillPageRecords(getClient()!);
      return records.filter((skill) => skill.scope === 'global') as Skill[];
    }, MOCK_GLOBAL_SKILLS);
  },

  /** Sidebar skills page — SKILL.md only; merges disk scan + OpenCode API. */
  fetchAllSkills: async (): Promise<Skill[]> => {
    const records = await fetchAllSkillRecords();
    if (records.length > 0) {
      return records as Skill[];
    }
    return sdkCall(async () => {
      return (await fetchAllSkillRecords()) as Skill[];
    }, [...MOCK_PROJECT_SKILLS, ...MOCK_GLOBAL_SKILLS]);
  },

  /** Re-read ~/.opencode/skills from disk and refresh OpenCode skill list. */
  refreshAllSkills: async (): Promise<Skill[]> => {
    void refreshSlashCatalog();
    return (await fetchAllSkillRecords()) as Skill[];
  },
};

export const opencodePlugins = {
  getPlugins: (): Plugin[] => MOCK_ALL_PLUGINS,

  fetchPlugins: async (): Promise<Plugin[]> => {
    return sdkCall(async () => {
      const resp = await getClient()!.mcp.status();
      const servers = (resp.data ?? {}) as Record<string, Record<string, unknown>>;
      return Object.entries(servers).map(([name, info]) => ({
        id: name,
        name: info.name as string ?? name,
        description: info.description as string ?? '',
        installed: true,
        config: info as Record<string, unknown>,
      }));
    }, MOCK_ALL_PLUGINS);
  },
};

// ============================================================
// 8. Settings - General Config
// ============================================================

export const opencodeSettings = {
  getDefaultModel: (): { id: string; name: string; modelId: string } | null => null,

  fetchDefaultModel: async (): Promise<{ id: string; name: string; modelId: string } | null> => {
    const resolveAndCache = (result: { id: string; name: string; modelId: string } | null) => {
      setCachedDefaultModelRef(result?.id ?? null);
      return result;
    };

    // Try SDK first
    if (isSDKConnected()) {
      try {
        const resp = await getClient()!.config.get();
        const sdkResult = resolveDefaultModelFromConfigData(resp.data as Record<string, unknown> | null);
        if (sdkResult) return resolveAndCache(sdkResult);
      } catch { /* fall through to local config */ }
    }

    return resolveAndCache(await resolveDefaultModelFromConfig());
  },

  setDefaultModel: async (_modelId: string): Promise<boolean> => {
    setCachedDefaultModelRef(_modelId);
    return sdkCall(async () => {
      await getClient()!.config.update({ config: { model: _modelId } as never });
      return true;
    }, true);
  },

  getAutoCompact: (): boolean => true,

  fetchAutoCompact: async (): Promise<boolean> => {
    return sdkCall(async () => {
      const resp = await getClient()!.config.get();
      const config = resp.data as Record<string, unknown> | null;
      const agent = config?.agent as Record<string, unknown> | undefined;
      const compaction = agent?.compaction as Record<string, unknown> | undefined;
      // compaction.disable=true means auto compact OFF; undefined/false means ON
      const disabled = compaction?.disable as boolean | undefined;
      return disabled !== true;
    }, true);
  },

  setAutoCompact: async (enabled: boolean): Promise<boolean> => {
    return sdkCall(async () => {
      await getClient()!.config.update({
        config: {
          agent: {
            compaction: { disable: !enabled },
          },
        } as never,
      });
      return true;
    }, true);
  },

  getShowReasoning: (): boolean => true,

  fetchShowReasoning: async (): Promise<boolean> => {
    return sdkCall(async () => {
      const resp = await getClient()!.config.get();
      const config = resp.data as Record<string, unknown> | null;
      // Check for explicit showReasoning/reasoning config field
      // OpenCode config may have reasoning display preference at top level or under agent
      const showReasoning = config?.showReasoning as boolean | undefined;
      if (showReasoning !== undefined) return showReasoning;
      const reasoning = config?.reasoning as boolean | undefined;
      if (reasoning !== undefined) return reasoning;
      // Default: show reasoning is enabled
      return true;
    }, true);
  },

  setShowReasoning: async (enabled: boolean): Promise<boolean> => {
    return sdkCall(async () => {
      await getClient()!.config.update({
        config: {
          showReasoning: enabled,
        } as never,
      });
      return true;
    }, true);
  },
};

// ============================================================
// 9. Engine Status
// ============================================================

export const opencodeEngine = {
  getStatus: (): { connected: boolean; version: string; url: string | null } => {
    if (isSDKConnected()) {
      return { connected: true, version: 'unknown', url: null };
    }
    return { connected: false, version: 'unknown', url: null };
  },

  fetchStatus: async (): Promise<{ connected: boolean; version: string; url: string | null }> => {
    const fallback: { connected: boolean; version: string; url: string | null } = { connected: false, version: 'unknown', url: null };
    return sdkCall(async (): Promise<{ connected: boolean; version: string; url: string | null }> => {
      const client = getClient()!;
      const healthResp = await client.global.health();
      const health = healthResp.data as Record<string, unknown> | null;
      let serverUrl: string | null = null;
      if (typeof window !== 'undefined' && window.electronAPI?.serverUrl) {
        serverUrl = await window.electronAPI.serverUrl();
      }
      return {
        connected: true as boolean,
        version: (health?.version as string) ?? 'unknown',
        url: serverUrl,
      };
    }, fallback);
  },

  restart: async (): Promise<boolean> => true,

  
  getAppVersion: async (): Promise<string> => {
    if (typeof window !== 'undefined' && window.electronAPI?.appVersion) {
      return window.electronAPI.appVersion();
    }
    return '未知';
  },
};

// ============================================================
// 10. Agent & Team Management
// ============================================================

export const opencodeAgent = {
  getAgents: (): Agent[] => [],

  fetchAgents: async (): Promise<Agent[]> => {
    const localAgentIds = new Set<string>();
    const localAgents = (await readOpenCodeMarkdownConfigs('agent')).map((cfg): Agent => {
      localAgentIds.add(cfg.id);
      return {
        id: cfg.id,
        name: frontmatterString(cfg.frontmatter.name, cfg.id),
        description: frontmatterString(cfg.frontmatter.description),
        model: frontmatterString(cfg.frontmatter.model, 'default'),
        prompt: cfg.body,
        mode: frontmatterString(cfg.frontmatter.mode) || undefined,
        steps: frontmatterNumber(cfg.frontmatter.steps),
        color: frontmatterString(cfg.frontmatter.color) || undefined,
        permission: frontmatterRecord(cfg.frontmatter.permission),
      };
    });

    const pluginAgentMap = await readPluginAgentRegistry();
    const pluginNames = await fetchInstalledPluginNames();

    const sdkAgents = await sdkCall(async (): Promise<Agent[]> => {
      const resp = await getClient()!.app.agents();
      const agents = (resp.data ?? []) as Record<string, unknown>[];
      const mapped = agents.map((agent): Agent => {
        const id = String(agent.id ?? agent.name ?? '');
        const rawModel = agent.model;
        let model: string;
        if (typeof rawModel === 'string' && rawModel) {
          model = rawModel;
        } else if (rawModel && typeof rawModel === 'object') {
          const m = rawModel as Record<string, unknown>;
          const providerId = typeof m.providerID === 'string' ? m.providerID : typeof m.provider === 'string' ? m.provider : '';
          const modelId = typeof m.modelID === 'string' ? m.modelID : typeof m.id === 'string' ? m.id : '';
          model = providerId && modelId ? `${providerId}/${modelId}` : modelId || 'default';
        } else {
          model = 'default';
        }
        return {
          id,
          name: String(agent.name ?? id),
          description: String(agent.description ?? ''),
          model,
          prompt: String(agent.prompt ?? ''),
          mode: typeof agent.mode === 'string' ? agent.mode : undefined,
          steps: typeof agent.steps === 'number' ? agent.steps : typeof agent.maxSteps === 'number' ? agent.maxSteps : undefined,
          color: typeof agent.color === 'string' ? agent.color : undefined,
          permission: typeof agent.permission === 'object' && agent.permission !== null && !Array.isArray(agent.permission) ? agent.permission as Record<string, string> : undefined,
        };
      });
      return mapped;
    }, []);

    const merged = new Map<string, Agent>();
    sdkAgents.forEach((agent) => merged.set(agent.id, agent));
    localAgents.forEach((local) => {
      const sdk = merged.get(local.id);
      if (sdk) {
        merged.set(local.id, { ...sdk, ...local });
      } else {
        merged.set(local.id, local);
      }
    });

    for (const [id, agent] of merged) {
      const isLocal = localAgentIds.has(id);
      if (isLocal) {
        agent.sourceType = 'custom';
        agent.sourceLabel = '自定义';
      }
    }

    for (const [id, agent] of merged) {
      const isLocal = localAgentIds.has(id);
      if (isLocal) {
        agent.sourceType = 'custom';
        agent.sourceLabel = '自定义';
        continue;
      }

      if (isHiddenAgent(id, agent.name)) continue;

      const nameLower = agent.name.toLowerCase();
      const idLower = id.toLowerCase();
      let matchedPluginId: string | undefined;
      for (const [agentName, pid] of pluginAgentMap) {
        const agentNameLower = agentName.toLowerCase();
        if (idLower === agentNameLower || nameLower === agentNameLower || nameLower.startsWith(agentNameLower)) {
          matchedPluginId = pid;
          break;
        }
      }

      if (!matchedPluginId) {
        for (const pluginId of pluginNames) {
          if (idLower.includes(pluginId.toLowerCase()) || nameLower.includes(pluginId.toLowerCase())) {
            matchedPluginId = pluginId;
            break;
          }
        }
      }

      agent.sourceType = matchedPluginId ? 'plugin' : 'plugin';
      agent.sourceLabel = matchedPluginId || pluginNames[0] || '插件';
    }

    const result = Array.from(merged.values()).filter(a => !isHiddenAgent(a.id, a.name));
    return result;
  },

  getTeams: (): Team[] => [],

  fetchTeams: async (): Promise<Team[]> => {
    return (await readOpenCodeMarkdownConfigs('team')).map((cfg): Team => {
      const members = frontmatterStringArray(cfg.frontmatter.members);
      return {
        id: cfg.id,
        name: frontmatterString(cfg.frontmatter.name, cfg.id),
        key: cfg.id,
        description: frontmatterString(cfg.frontmatter.description),
        expanded: false,
        agentIds: members,
        members,
        delegate: frontmatterBoolean(cfg.frontmatter.delegate),
        prompt: cfg.body,
        model: frontmatterString(cfg.frontmatter.model) || undefined,
        steps: frontmatterNumber(cfg.frontmatter.steps),
      };
    });
  },

  addAgent: async (agent: { id?: string; name: string; description: string; model: string; prompt: string; mode?: string; steps?: number; color?: string; permission?: Record<string, string> }): Promise<boolean> => {
    const electronApi = getElectronConfigApi();
    if (!electronApi) return false;
    const frontmatter: FrontmatterData = {
      mode: agent.mode ?? 'subagent',
      model: agent.model,
      description: agent.description,
    };
    if (agent.steps !== undefined) frontmatter.steps = agent.steps;
    if (agent.color !== undefined) frontmatter.color = agent.color;
    if (agent.permission !== undefined) frontmatter.permission = agent.permission;
    const result = await electronApi.configWriteTextFile({
      path: `~/.opencode/agent/${agent.id ?? agent.name}.md`,
      content: serializeMarkdownFrontmatter(frontmatter, agent.prompt),
    });
    return result.success;
  },

  updateAgent: async (id: string, updates: Partial<Agent>): Promise<boolean> => {
    const electronApi = getElectronConfigApi();
    if (!electronApi) return false;
    const path = `~/.opencode/agent/${id}.md`;
    const readResult = await electronApi.configReadTextFile({ path });
    if (!readResult.success || readResult.content === undefined) return false;

    const parsed = parseMarkdownFrontmatter(readResult.content);
    const frontmatter: FrontmatterData = { ...parsed.frontmatter };
    if (updates.name !== undefined) frontmatter.name = updates.name;
    if (updates.description !== undefined) frontmatter.description = updates.description;
    if (updates.model !== undefined) frontmatter.model = updates.model;
    if (updates.mode !== undefined) frontmatter.mode = updates.mode;
    if (updates.steps !== undefined) frontmatter.steps = updates.steps;
    if (updates.color !== undefined) frontmatter.color = updates.color;
    if (updates.permission !== undefined) frontmatter.permission = updates.permission;

    const writeResult = await electronApi.configWriteTextFile({
      path,
      content: serializeMarkdownFrontmatter(frontmatter, updates.prompt ?? parsed.body),
    });
    return writeResult.success;
  },

  removeAgent: async (id: string): Promise<boolean> => {
    const electronApi = getElectronConfigApi();
    if (!electronApi) return false;
    const result = await electronApi.configDeleteFile({ path: `~/.opencode/agent/${id}.md` });
    return result.success;
  },

  addTeam: async (team: { name: string; key: string; description: string; agentIds: string[]; delegate?: boolean; prompt?: string }): Promise<boolean> => {
    const electronApi = getElectronConfigApi();
    if (!electronApi) return false;
    const frontmatter: FrontmatterData = {
      members: team.agentIds,
      delegate: team.delegate ?? false,
      description: team.description,
    };
    const result = await electronApi.configWriteTextFile({
      path: `~/.opencode/team/${team.key}.md`,
      content: serializeMarkdownFrontmatter(frontmatter, team.prompt ?? ''),
    });
    return result.success;
  },

  updateTeam: async (id: string, updates: Partial<Team>): Promise<boolean> => {
    const electronApi = getElectronConfigApi();
    if (!electronApi) return false;
    const path = `~/.opencode/team/${id}.md`;
    const readResult = await electronApi.configReadTextFile({ path });
    if (!readResult.success || readResult.content === undefined) return false;

    const parsed = parseMarkdownFrontmatter(readResult.content);
    const frontmatter: FrontmatterData = { ...parsed.frontmatter };
    if (updates.name !== undefined) frontmatter.name = updates.name;
    if (updates.description !== undefined) frontmatter.description = updates.description;
    if (updates.agentIds !== undefined) frontmatter.members = updates.agentIds;
    if (updates.members !== undefined) frontmatter.members = updates.members;
    if (updates.delegate !== undefined) frontmatter.delegate = updates.delegate;
    if (updates.model !== undefined) frontmatter.model = updates.model;
    if (updates.steps !== undefined) frontmatter.steps = updates.steps;

    const writeResult = await electronApi.configWriteTextFile({
      path,
      content: serializeMarkdownFrontmatter(frontmatter, updates.prompt ?? parsed.body),
    });
    return writeResult.success;
  },

  removeTeam: async (id: string): Promise<boolean> => {
    const electronApi = getElectronConfigApi();
    if (!electronApi) return false;
    const result = await electronApi.configDeleteFile({ path: `~/.opencode/team/${id}.md` });
    return result.success;
  },
};

// ============================================================
// 11. Chat Messages
// ============================================================

const REGISTERED_COMMAND_CACHE_MS = 30_000;
let registeredCommandCache: { directory: string; names: Set<string>; at: number } | null = null;

/** oh-my default_builder_enabled replaces native build with OpenCode-Builder in the UI. */
const DEFAULT_BUILD_AGENT = 'OpenCode-Builder';

/** Parse `/cmd args` — same rules as official OpenCode TUI prompt submit. */
function parseSlashCommandInput(text: string): { command: string; arguments: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;

  const firstLineEnd = trimmed.indexOf('\n');
  const firstLine = firstLineEnd === -1 ? trimmed : trimmed.slice(0, firstLineEnd);
  const tokenMatch = firstLine.match(/^\/(\S+)/);
  if (!tokenMatch) return null;

  const command = tokenMatch[1];
  const restOfFirstLine = firstLine.slice(tokenMatch[0].length).trimStart();
  const restOfInput = firstLineEnd === -1 ? '' : trimmed.slice(firstLineEnd + 1);
  const args = [restOfFirstLine, restOfInput].filter(Boolean).join(firstLineEnd === -1 ? ' ' : '\n');

  return { command, arguments: args };
}

async function getRegisteredCommandNames(): Promise<Set<string>> {
  const directory = queryDirectory()?.trim() ?? '';
  if (
    registeredCommandCache
    && registeredCommandCache.directory === directory
    && Date.now() - registeredCommandCache.at < REGISTERED_COMMAND_CACHE_MS
  ) {
    return registeredCommandCache.names;
  }
  const resp = await getClient()!.command.list({ directory: directory || undefined });
  const names = new Set(
    ((resp.data ?? []) as SdkCommandRecord[])
      .map((item) => item.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0),
  );
  registeredCommandCache = { directory, names, at: Date.now() };
  return names;
}

export const opencodeMessage = {
  getMessages: (sessionId: string): Message[] => MOCK_MESSAGES.filter((m) => m.sessionId === sessionId) as Message[],

  fetchMessages: async (sessionId: string): Promise<Message[]> => {
    const result = await opencodeMessage.fetchSessionMessages(sessionId);
    return result.messages;
  },

  fetchSessionMessages: async (sessionId: string): Promise<SessionMessagesFetchResult> => {
    if (isPendingSessionId(sessionId)) {
      return { messages: [], compactions: [], raw: [] };
    }
    return sdkCall(async () => {
      const resp = await getClient()!.session.messages({
        sessionID: sessionId,
        directory: queryDirectory(),
      });
      const raw = (resp.data ?? []) as Array<{ info?: Record<string, unknown>; parts?: unknown[] }>;
      const messages = raw.map((item) => {
        const record = item as { info?: Record<string, unknown>; parts?: unknown[] };
        const info = record.info ?? record;
        const parts = record.parts ?? (info as Record<string, unknown>).parts as unknown[] | undefined;
        const base = transformSDKMessage({
          ...info,
          parts,
        });
        return enrichMessageFromParts(base, parts);
      });
      const compactions = parseCompactionsFromSessionMessages(raw, sessionId);
      return { messages, compactions, raw };
    }, {
      messages: MOCK_MESSAGES.filter((m) => m.sessionId === sessionId) as Message[],
      compactions: [],
      raw: [],
    });
  },

  sendMessage: async (
    sessionId: string,
    content: string,
    options?: {
      agent?: string;
      displayContent?: string;
      modelRef?: string;
      promptAttachments?: { images: File[]; filePaths: string[] };
    },
  ): Promise<boolean> => {
    if (!isSDKConnected()) {
      throw new Error('未连接到 OpenCode 服务，无法发送消息');
    }
    if (!(await sessionExists(sessionId))) {
      throw new Error('会话已失效（可能服务已重启），请新建会话后重试');
    }
    const { pipelineMark } = await import('../utils/pipelineTiming');
    try {
      const client = getClient()!;
      const directory = queryDirectory();
      const slash = parseSlashCommandInput(content);
      if (slash) {
        const registered = await getRegisteredCommandNames();
        if (registered.has(slash.command)) {
          const commandAgent = options?.agent ?? DEFAULT_BUILD_AGENT;
          pipelineMark(sessionId, 'adapter.command.request', {
            command: slash.command,
            agent: commandAgent,
            argsLen: slash.arguments.length,
          });
          questionLog('dispatch.command', {
            sessionId: sessionId.slice(0, 16),
            command: slash.command,
            agent: commandAgent,
            argsLen: slash.arguments.length,
          });
          void opencodeQuestion.logToolAvailability(directory, `command:${slash.command}`);
          void opencodeQuestion.logAgentQuestionAccess(
            commandAgent,
            directory,
            `command:${slash.command}`,
          );
          // Official TUI uses session.command (skill template expansion), not plain prompt text.
          void client.session.command({
            sessionID: sessionId,
            directory,
            command: slash.command,
            arguments: slash.arguments,
            agent: commandAgent,
          }).then((result) => {
            if (result.error) {
              const msg =
                typeof result.error === 'object' && result.error !== null && 'message' in result.error
                  ? String((result.error as { message: unknown }).message)
                  : String(result.error);
              pipelineMark(sessionId, 'adapter.command.error', { message: msg.slice(0, 200) });
              debugError('opencodeAdapter.session.command-failed', result.error);
              return;
            }
            pipelineMark(sessionId, 'adapter.command.done', { command: slash.command });
          }).catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            pipelineMark(sessionId, 'adapter.command.error', { message: message.slice(0, 200) });
            debugError('opencodeAdapter.session.command-failed', err);
          });
          pipelineMark(sessionId, 'adapter.command.accepted', { command: slash.command });
          void import('../stores/permission').then(({ recoverPendingQuestionsForSession }) => {
            void recoverPendingQuestionsForSession(sessionId, 'adapter.command.accepted');
          });
          return true;
        }
        questionWarn('dispatch.command.miss', {
          command: slash.command,
          registeredCount: registered.size,
          sample: [...registered].slice(0, 8),
          contentPreview: content.slice(0, 80),
        });
        pipelineMark(sessionId, 'adapter.command.miss', {
          command: slash.command,
          registeredCount: registered.size,
        });
      }

      const { buildPromptParts } = await import('../thread/composer/promptParts');
      const promptParts = await buildPromptParts({
        text: content,
        attachments: {
          images: options?.promptAttachments?.images ?? [],
          filePaths: options?.promptAttachments?.filePaths ?? [],
        },
        directory: directory ?? '',
      });

      const promptArgs: {
        sessionID: string;
        directory?: string;
        parts: Awaited<ReturnType<typeof buildPromptParts>>;
        agent?: string;
        model?: { providerID: string; modelID: string };
      } = {
        sessionID: sessionId,
        directory,
        parts: promptParts,
      };
      if (options?.agent) {
        promptArgs.agent = options.agent;
      }
      const parsedModel = parseModelRef(options?.modelRef);
      if (parsedModel?.providerId && parsedModel.modelId) {
        promptArgs.model = {
          providerID: parsedModel.providerId,
          modelID: parsedModel.modelId,
        };
      }
      pipelineMark(sessionId, 'adapter.prompt.request', {
        agent: options?.agent,
        model: promptArgs.model ? `${promptArgs.model.providerID}/${promptArgs.model.modelID}` : undefined,
        textLen: content.length,
        attachmentCount: (options?.promptAttachments?.images.length ?? 0)
          + (options?.promptAttachments?.filePaths.length ?? 0),
        mode: 'async',
      });
      const result = await client.session.promptAsync(promptArgs);
      if (result.error) {
        const msg =
          typeof result.error === 'object' && result.error !== null && 'message' in result.error
            ? String((result.error as { message: unknown }).message)
            : String(result.error);
        pipelineMark(sessionId, 'adapter.prompt.error', { message: msg.slice(0, 200) });
        throw new Error(msg || 'session.prompt_async 失败');
      }
      pipelineMark(sessionId, 'adapter.prompt.accepted', { mode: 'async' });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pipelineMark(sessionId, 'adapter.prompt.error', { message: message.slice(0, 200) });
      debugError('opencodeAdapter.sendMessage-failed', err);
      throw err;
    }
  },

  resumeMemberSession: async (sessionId: string, agentId?: string): Promise<boolean> => {
    if (!isSDKConnected()) {
      throw new Error('未连接到 OpenCode 服务，无法恢复成员执行');
    }
    if (!(await sessionExists(sessionId))) {
      throw new Error('成员会话已失效，请重新 spawn 团队成员');
    }
    const { pipelineMark } = await import('../utils/pipelineTiming');
    try {
      const client = getClient()!;
      const promptArgs: {
        sessionID: string;
        directory?: string;
        parts: Array<{ type: 'text'; text: string }>;
        agent?: string;
      } = {
        sessionID: sessionId,
        directory: queryDirectory(),
        parts: [{ type: 'text', text: '请继续执行上面分配的任务。' }],
      };
      if (agentId) {
        promptArgs.agent = agentId;
      }
      pipelineMark(sessionId, 'adapter.prompt.resume', { agent: agentId, mode: 'async' });
      const result = await client.session.promptAsync(promptArgs);
      if (result.error) {
        const msg =
          typeof result.error === 'object' && result.error !== null && 'message' in result.error
            ? String((result.error as { message: unknown }).message)
            : String(result.error);
        pipelineMark(sessionId, 'adapter.prompt.error', { message: msg.slice(0, 200) });
        throw new Error(msg || 'session.prompt_async 失败');
      }
      pipelineMark(sessionId, 'adapter.prompt.accepted', { mode: 'async-resume' });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pipelineMark(sessionId, 'adapter.prompt.error', { message: message.slice(0, 200) });
      debugError('opencodeAdapter.resumeMemberSession-failed', err);
      throw err;
    }
  },

  onMessage: (callback: (message: Message) => void): (() => void) => {
    return on(EventType.MESSAGE_UPDATED, (event) => {
      const props = extractEventPayload(event as Record<string, unknown>);
      const info = (props.info ?? props) as Record<string, unknown>;
      if (info?.id) {
        callback(transformSDKMessage(info));
      }
    });
  },
};

// ============================================================
// 12. Settings Providers & Model Config
// ============================================================

export const opencodeSettingsProvider = {
  getSettingsProviders: (): SettingsProvider[] => MOCK_SETTINGS_PROVIDERS,

  fetchSettingsProviders: async (): Promise<SettingsProvider[]> => {
    const configProviders = await readConfigProviders();
    const configSettings = configProvidersToSettingsProviders(configProviders);
    return sdkCall(async () => {
      const resp = await getClient()!.config.providers();
      const providers = (resp.data ?? []) as Record<string, unknown>[];
      const sdkSettings = providers.map(p => ({
        id: p.id as string ?? '',
        name: p.name as string ?? '',
        shortName: (p.name as string ?? p.id as string ?? '').substring(0, 10),
        models: ((p.models ?? []) as Record<string, unknown>[]).map(m => ({
          id: m.id as string ?? '',
          name: m.name as string ?? '',
          modelId: m.modelId as string ?? m.id as string ?? '',
          enabled: m.enabled as boolean ?? true,
        })),
        expanded: false,
      }));
      return mergeSettingsProviders(configSettings, sdkSettings);
    }, mergeSettingsProviders(configSettings, MOCK_SETTINGS_PROVIDERS));
  },

  getDefaultModels: (): ProviderModelEntry[] => MOCK_DEFAULT_MODELS,

fetchDefaultModels: async (): Promise<ProviderModelEntry[]> => {
    const configProviders = await readConfigProviders();
    const configModels: ProviderModelEntry[] = [];
    for (const [, entry] of configProviders.entries()) {
      for (const [modelId, model] of Object.entries(entry.models ?? {})) {
        configModels.push({
          id: modelId,
          name: model.name ?? modelId,
          enabled: !model.disable,
        });
      }
    }
    return sdkCall(async () => {
      const resp = await getClient()!.v2.model.list();
      const models = (resp.data ?? []) as Record<string, unknown>[];
      const sdkModels = models.map(m => ({
        id: m.id as string ?? '',
        name: m.name as string ?? '',
        enabled: true,
      }));
      const seen = new Set(configModels.map(m => m.id));
      const merged = [...configModels, ...sdkModels.filter(m => !seen.has(m.id))];
      return merged;
    }, configModels.length > 0 ? configModels : MOCK_DEFAULT_MODELS);
  },

  toggleModel: async (providerId: string, modelId: string, enabled: boolean): Promise<boolean> => {
    return sdkCall(async () => {
      const resp = await getClient()!.config.get();
      const config = resp.data as Record<string, unknown> | null;
      const providers = config?.provider as Record<string, unknown> | undefined;
      const providerConfig = providers?.[providerId] as Record<string, unknown> | undefined;
      const models = providerConfig?.models as Record<string, Record<string, unknown>> | undefined;

      const updatedModels = { ...(models ?? {}) };
      if (enabled) {
        const existing = updatedModels[modelId] ?? {};
        updatedModels[modelId] = { ...existing, disable: false };
      } else {
        const existing = updatedModels[modelId] ?? {};
        updatedModels[modelId] = { ...existing, disable: true };
      }

      await getClient()!.config.update({
        config: {
          provider: {
            [providerId]: {
              ...providerConfig,
              models: updatedModels,
            },
          },
        } as never,
      });
      return true;
    }, true);
  },
};

// ============================================================
// 13. Search / Recent Conversations
// ============================================================

export const opencodeSearch = {
  getRecentConversations: (): ConversationItem[] => MOCK_RECENT_CONVERSATIONS,

  fetchRecentConversations: async (): Promise<ConversationItem[]> => {
    return sdkCall(async () => {
      const resp = await getClient()!.session.list({ limit: 20 });
      const sessions = (resp.data ?? []) as Record<string, unknown>[];
      return sessions.map(s => ({
        id: s.id as string ?? '',
        name: s.title as string ?? 'Untitled',
        project: s.directory as string ?? '',
      }));
    }, MOCK_RECENT_CONVERSATIONS);
  },

  searchConversations: (_query: string): ConversationItem[] => MOCK_RECENT_CONVERSATIONS,

  fetchSearchConversations: async (query: string): Promise<ConversationItem[]> => {
    return sdkCall(async () => {
      const resp = await getClient()!.session.list({ search: query, limit: 20 });
      const sessions = (resp.data ?? []) as Record<string, unknown>[];
      return sessions.map(s => ({
        id: s.id as string ?? '',
        name: s.title as string ?? 'Untitled',
        project: s.directory as string ?? '',
      }));
    }, MOCK_RECENT_CONVERSATIONS);
  },
};

// ============================================================
// 14. Team Runtime
// ============================================================

const DEFAULT_TEAM_SPAWN_MODEL = 'zmn/glm-5.1';

function resolveMemberSpawnModel(
  member: string,
  agents?: Pick<Agent, 'id' | 'model'>[],
  teamDefaultModel?: string,
): string {
  const fromAgent = agents?.find((a) => a.id === member)?.model?.trim();
  const fromTeam = teamDefaultModel?.trim();
  return fromAgent || fromTeam || DEFAULT_TEAM_SPAWN_MODEL;
}

export type TeamLaunchMode = 'create' | 'reuse' | 'reclaim';

export type TeamLaunchDecision = {
  mode: TeamLaunchMode;
  runtimeTeamName?: string;
  templateKey?: string;
};

/** OpenCode team name pattern: ^[a-z0-9][a-z0-9-]{0,63}$ */
export function buildSessionScopedTeamName(teamKey: string, sessionId: string): string {
  const suffix = sessionId
    .replace(/^ses_/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(-12);
  const safeSuffix = suffix || 'session';
  let scoped = `${teamKey}-${safeSuffix}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!/^[a-z0-9]/.test(scoped)) scoped = `t-${scoped}`;
  return scoped.slice(0, 64);
}

function deriveTemplateKey(runtimeName: string, sessionId: string): string {
  const suffix = sessionId
    .replace(/^ses_/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(-12);
  if (suffix && runtimeName.endsWith(`-${suffix}`)) {
    return runtimeName.slice(0, -(suffix.length + 1));
  }
  return runtimeName;
}

async function sessionExists(sessionId: string): Promise<boolean> {
  if (isPendingSessionId(sessionId)) return false;
  if (!isSDKConnected()) return false;
  try {
    const resp = await getClient()!.session.get({ sessionID: sessionId });
    if (resp.error) return false;
    const data = resp.data as Record<string, unknown> | undefined;
    return typeof data?.id === 'string' && data.id.length > 0;
  } catch {
    return false;
  }
}

async function forceResetTeam(teamName: string): Promise<boolean> {
  const baseUrl = await getOpenCodeServerUrl();
  if (!baseUrl) return false;
  try {
    const response = await fetchWithTimeout(`${baseUrl}/team/${encodeURIComponent(teamName)}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (response.ok) invalidateTeamListCache();
    return response.ok;
  } catch {
    return false;
  }
}

/** Desktop-side prep: reset orphan teams and downgrade create→reuse when team already exists. */
export async function ensureTeamReady(
  decision: TeamLaunchDecision,
  sessionId: string,
): Promise<TeamLaunchDecision> {
  const teamName = decision.runtimeTeamName;
  if (!teamName) return decision;

  if (decision.mode === 'reclaim') {
    await forceResetTeam(teamName);
    return decision;
  }

  if (decision.mode !== 'create') return decision;

  const existing = await fetchTeamByName(teamName);
  if (!existing) return decision;
  if (existing.leadSessionID === sessionId) {
    return {
      mode: 'reuse',
      runtimeTeamName: teamName,
      templateKey: decision.templateKey ?? deriveTemplateKey(teamName, sessionId),
    };
  }
  if (!(await sessionExists(existing.leadSessionID))) {
    await forceResetTeam(teamName);
    return decision;
  }

  return decision;
}

type TeamBrief = { name: string; leadSessionID: string };

let teamListCache: { at: number; teams: TeamBrief[] } | null = null;
const TEAM_LIST_CACHE_MS = 1500;

export function invalidateTeamListCache(): void {
  teamListCache = null;
}

async function fetchAllTeamsBrief(): Promise<TeamBrief[]> {
  const baseUrl = await getOpenCodeServerUrl();
  if (!baseUrl) return [];
  const now = Date.now();
  if (teamListCache && now - teamListCache.at < TEAM_LIST_CACHE_MS) {
    return teamListCache.teams;
  }
  try {
    const response = await fetchWithTimeout(`${baseUrl}/team`);
    if (!response.ok) return [];
    const data = await response.json() as unknown;
    if (!Array.isArray(data)) return [];
    const teams = data
      .map((item) => {
        const row = item as Record<string, unknown>;
        const leadSessionID = String(row.leadSessionID ?? '');
        const name = String(row.name ?? '');
        if (!name || !leadSessionID) return null;
        return { name, leadSessionID };
      })
      .filter((row): row is TeamBrief => row !== null);
    teamListCache = { at: now, teams };
    return teams;
  } catch (err) {
    debugWarn('team.list.timeout', err, { baseUrl });
    return [];
  }
}

async function fetchTeamByName(teamKey: string): Promise<TeamBrief | null> {
  const teams = await fetchAllTeamsBrief();
  return teams.find((team) => team.name === teamKey) ?? null;
}

async function decideRuntimeTeamName(
  teamKey: string,
  sessionId: string,
  runtimeName: string,
  existing: { name: string; leadSessionID: string } | null,
): Promise<TeamLaunchDecision | null> {
  if (!existing) {
    return { mode: 'create', runtimeTeamName: runtimeName, templateKey: teamKey };
  }
  if (existing.leadSessionID === sessionId) {
    return { mode: 'reuse', runtimeTeamName: runtimeName, templateKey: teamKey };
  }
  if (!(await sessionExists(existing.leadSessionID))) {
    return { mode: 'reclaim', runtimeTeamName: runtimeName, templateKey: teamKey };
  }
  return null;
}

export function buildTeamLaunchPrompt(
  teamKey: string,
  userText: string,
  team?: Team | null,
  agents?: Pick<Agent, 'id' | 'model'>[],
  mode: TeamLaunchMode = 'create',
  runtimeTeamName?: string,
): string {
  const cleaned = userText.replace(new RegExp(`@${teamKey}\\s*`, 'g'), '').trim();
  const delegate = team?.delegate ?? false;
  const teamModel = team?.model ?? DEFAULT_TEAM_SPAWN_MODEL;
  const effectiveTeamName = runtimeTeamName ?? teamKey;

  const antiLoopRules = [
    '禁止 team_cleanup / team_reset 除非用户明确要求解散团队',
    '禁止「cleanup 后再 create」循环；若 team_list 已有成员，只补 spawn 缺失成员',
    '禁止对已 shutdown 的成员重复 team_spawn；若 spawn 返回 already exists / 成员已在列表，视为成功，直接 team_message，禁止再次 spawn 同名成员',
    '禁止因 team_create / team_spawn 失败就放弃团队模式改为 Lead 独自 read/grep 包办（除非用户明确要求 solo）',
    'team_spawn 与 team_message 禁止同一轮并行：必须等 spawn completed 且成员出现在 team_list 后，再对该成员 team_message',
    'team_message 报 Member not found 时：先 team_list 确认；成员已存在则等待 2–5 秒后重试 team_message；禁止立刻 team_spawn 同名成员',
    'team_message 部分失败时：只补发失败目标，禁止对已 completed 的成员重复发送相同正文（同一 to + 同一 task id 只发一次）',
    'team_message / team_broadcast 单条消息不得超过 10240 字符；长报告写入 task 结果或拆成多条短消息，禁止一次发送整份 Markdown 文档',
    'Lead 等待成员执行时，用户可继续发消息；对进度类询问用 team_message 向成员索要 1-3 句简要状态，禁止要求成员发送长报告',
    '成员收到进度/状态询问时仅用简短文字回复当前阶段与预计完成点，完整结果待任务完成后再发送',
  ];

  const delegateRules = delegate
    ? [
        'DELEGATE 模式：Lead 禁止 bash/edit/write，只能协调；分析、读代码、改代码都必须 team_spawn 成员执行',
        'Lead 可用 read/glob/grep 做轻量查看，但不得替代成员完成本应由 req-analyst 等角色承担的任务',
      ]
    : [];

  const memberNames = team?.agentIds ?? team?.members ?? [];
  const memberHint = memberNames.length > 0
    ? `可 spawn / team_message 的成员名（精确匹配）：${memberNames.join(', ')}`
    : '成员名以 team_list 返回为准';

  const registryIds = (agents ?? []).map((a) => a.id).filter(Boolean);
  const spawnAgentHint =
    registryIds.length > 0
      ? `team_spawn 的 agent 字段必须是以下已注册 id 之一（不可用 display name / 自造 id）：${registryIds.join(', ')}`
      : 'spawn 前请确认 agent id 与 ~/.config/opencode 中配置一致';

  const spawnOnceRule = [
    `建队后先 team_list；仅对列表中不存在的成员执行 team_spawn（必须同时带 name、agent、model；agent 与 name 通常相同）`,
    `示例：team_spawn({ name: "req-analyst", agent: "req-analyst", model: "${teamModel}", prompt: "..." })`,
    spawnAgentHint,
    '若返回 InstanceRef not provided：说明后端未启用团队实验特性，请重启桌面端（需 OPENCODE_EXPERIMENTAL_AGENT_TEAMS）并更新 opencode-team 后再试；不要反复换方式 spawn',
    '若返回 agent/model 不存在：只用上面列出的 agent id 与 /models 中可见的 model，禁止自造名称',
    `成员配置见 ~/.opencode/team/${teamKey}.md；不要一次性盲目 spawn 全部成员多遍`,
    '用 team_tasks 维护任务并委派成员执行用户请求（add 时 tasks 只需 id、content、priority；status 可省略，默认 pending）',
    `team_message / team_broadcast 必须使用运行时团队名 "${effectiveTeamName}" 对应的 team_list 成员名；发给 Lead 用 to: "lead"`,
    memberHint,
    '禁止因 team_message 失败就放弃团队模式；先 team_list 核对 to 字段是否为已 spawn 的成员名',
  ];

  const lines: string[] = mode === 'reuse'
    ? [
        `[Agent Team: ${effectiveTeamName}] 当前会话已有团队，请直接复用（禁止 team_create / team_cleanup）：`,
        '1. 先用 team_list 确认成员；仅当成员缺失时才 team_spawn，不要重复 spawn 已有成员',
        '2. 用 team_tasks 创建/更新任务（add: { action:"add", tasks:[{ id, content, priority }] }），委派成员并行执行',
        '3. 你是 Lead，负责协调与汇总，不要独自完成本应由成员执行的工作',
        ...delegateRules,
        ...antiLoopRules,
      ]
    : mode === 'reclaim'
      ? [
          `[Agent Team: ${teamKey}] 桌面端已重置孤儿团队 "${effectiveTeamName}"，请绑定当前 Lead 并执行任务：`,
          `1. 执行 team_create({ name: "${effectiveTeamName}", delegate: ${delegate} })（不要先 team_cleanup）`,
          `2. 模板 ${teamKey}，运行时团队名 ${effectiveTeamName}`,
          ...spawnOnceRule,
          ...delegateRules,
          ...antiLoopRules,
        ]
      : [
          `[Agent Team: ${teamKey}] 请在本 Lead 会话建立团队（团队与当前会话绑定，不要只回复文字说明）：`,
          '0. 若 team_list / by-session 显示本 session 已绑定团队，直接复用，禁止 team_create / team_cleanup',
          `1. 仅当尚无团队时，执行 team_create({ name: "${effectiveTeamName}", delegate: ${delegate} })`,
          `   运行时团队名 ${effectiveTeamName}（模板 ${teamKey}，按会话隔离，勿用裸名 "${teamKey}"）`,
          '2. 禁止 team_cleanup 其他活跃会话的团队',
          ...spawnOnceRule,
          ...delegateRules,
          ...antiLoopRules,
        ];

  if (team?.description) {
    lines.push('', `团队简介：${team.description}`);
  }

  const rules = team?.prompt?.trim();
  if (rules) {
    lines.push('', '--- 团队协调规则 ---', rules.slice(0, 3000));
  }

  const instruction = lines.join('\n');
  return cleaned ? `${cleaned}\n\n${instruction}` : instruction;
}

function normalizeMemberStatus(raw: unknown): TeamInfo['members'][number]['status'] {
  switch (raw) {
    case 'running':
    case 'starting':
    case 'working':
    case 'busy':
      return 'working';
    case 'waiting':
    case 'shutdown_requested':
      return 'waiting';
    case 'completed':
    case 'shutdown':
      return 'completed';
    case 'error':
      return 'error';
    case 'ready':
    case 'idle':
    default:
      return 'idle';
  }
}

function normalizeTeamMember(
  item: Record<string, unknown>,
  leadSessionID?: string,
): TeamInfo['members'][number] {
  const sessionID = String(item.sessionID ?? item.sessionId ?? '');
  const name = String(item.name ?? item.agentId ?? item.agent ?? item.id ?? '');
  const isLead =
    item.role === 'lead'
    || (leadSessionID && sessionID && sessionID === leadSessionID);
  return {
    id: String(item.id ?? name),
    agentId: String(item.agentId ?? item.agent ?? name),
    name: name || 'member',
    role: isLead ? 'lead' : 'worker',
    status: normalizeMemberStatus(item.status),
    currentTask: typeof item.currentTask === 'string' ? item.currentTask : undefined,
    model: typeof item.model === 'string' ? item.model : undefined,
    sessionID,
  };
}

function normalizeTeamTask(task: Record<string, unknown>): TeamTask {
  const status = task.status === 'in_progress' || task.status === 'completed' || task.status === 'blocked' ? task.status : 'pending';
  const priority = task.priority === 'high' || task.priority === 'low' ? task.priority : 'medium';
  return {
    id: String(task.id ?? ''),
    title: String(task.title ?? task.content ?? ''),
    description: typeof task.description === 'string' ? task.description : undefined,
    status,
    priority,
    assigneeId: typeof task.assigneeId === 'string'
      ? task.assigneeId
      : typeof task.assignee === 'string'
        ? task.assignee
        : undefined,
    parentTaskId: typeof task.parentTaskId === 'string' ? task.parentTaskId : undefined,
    createdAt: typeof task.createdAt === 'number' ? task.createdAt : Date.now(),
    updatedAt: typeof task.updatedAt === 'number' ? task.updatedAt : Date.now(),
  };
}

function normalizeTeamInfo(team: Record<string, unknown>): TeamInfo {
  const state = team.state === 'initializing' || team.state === 'paused' || team.state === 'completed' || team.state === 'error' ? team.state : 'active';
  const leadSessionID = String(team.leadSessionID ?? team.sessionId ?? team.sessionID ?? '');
  const rawMembers = Array.isArray(team.members)
    ? team.members
    : Array.isArray(team.teammates)
      ? team.teammates
      : Array.isArray(team.workers)
        ? team.workers
        : Array.isArray(team.agents)
          ? team.agents
          : [];
  const rawTasks = Array.isArray(team.tasks) ? team.tasks : [];
  const name = String(team.name ?? team.key ?? team.id ?? '');

  const members = rawMembers.map((member) =>
    normalizeTeamMember(member as Record<string, unknown>, leadSessionID),
  );

  if (leadSessionID && !members.some((member) => member.role === 'lead')) {
    members.unshift({
      id: 'lead',
      agentId: 'lead',
      name: 'Lead',
      role: 'lead',
      status: 'idle',
      sessionID: leadSessionID,
    });
  }

  const templateKey = deriveTemplateKey(name, leadSessionID);

  return {
    id: String(team.id ?? name),
    name,
    key: String(team.key ?? templateKey),
    state,
    members,
    tasks: rawTasks.map((task) => normalizeTeamTask(task as Record<string, unknown>)),
    sessionId: leadSessionID,
    createdAt: typeof team.createdAt === 'number' ? team.createdAt : typeof team.created === 'number' ? team.created : Date.now(),
    updatedAt: typeof team.updatedAt === 'number' ? team.updatedAt : Date.now(),
  };
}

function parseTeamBySessionResponse(data: unknown): TeamInfo | null {
  if (!data || typeof data !== 'object') return null;
  const wrapper = data as Record<string, unknown>;
  if (wrapper.team && typeof wrapper.team === 'object') {
    const teamRecord = wrapper.team as Record<string, unknown>;
    const tasks = Array.isArray(wrapper.tasks) ? wrapper.tasks : [];
    return normalizeTeamInfo({ ...teamRecord, tasks });
  }
  return normalizeTeamInfo(wrapper);
}

function childStatusToMemberStatus(child: Record<string, unknown>): TeamInfo['members'][number]['status'] {
  const sessionId = String(child.id ?? '');
  const sessionRun = sessionId ? useSessionStore.getState().sessionRunStatus[sessionId] : undefined;
  if (sessionRun === 'running') return 'working';
  if (sessionRun === 'error') return 'error';
  const time = (child.time ?? {}) as Record<string, number>;
  if (time.compacting) return 'working';
  if (time.archived) return 'completed';
  return 'idle';
}

function isHttpNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const record = err as Record<string, unknown>;
  if (record.status === 404 || record.statusCode === 404) return true;
  const response = record.response as Record<string, unknown> | undefined;
  if (response?.status === 404) return true;
  const message = String(record.message ?? '');
  return message.includes('404') || message.includes('Not Found');
}

/** Child sessions for a lead; 404 = stale/other-project session (skip quietly). */
async function fetchSessionChildrenSafe(sessionID: string): Promise<Record<string, unknown>[]> {
  if (!sessionID || !isSDKConnected()) return [];
  const directory = queryDirectory();
  try {
    const client = getClient()!;
    const resp = await client.session.children({ sessionID, directory });
    return (resp.data ?? []) as Record<string, unknown>[];
  } catch (err) {
    if (isHttpNotFound(err)) return [];
    debugWarn('session.children.failed', err, { sessionID, directory });
    return [];
  }
}

async function enrichTeamWithSessionChildren(team: TeamInfo): Promise<TeamInfo> {
  const leadSessionId = team.sessionId;
  if (!leadSessionId || !isSDKConnected()) return team;

  try {
    const children = await fetchSessionChildrenSafe(leadSessionId);
    if (children.length === 0) return team;

    const members = [...team.members];
    for (const child of children) {
      const sessionID = String(child.id ?? '');
      if (!sessionID || sessionID === leadSessionId) continue;

      const name = parseTeammateDisplayName(child);
      const status = childStatusToMemberStatus(child);
      const existingIdx = members.findIndex(
        (member) =>
          member.sessionID === sessionID
          || member.id === name
          || member.agentId === name
          || member.name === name,
      );

      if (existingIdx >= 0) {
        const existing = members[existingIdx];
        members[existingIdx] = {
          ...existing,
          sessionID: existing.sessionID || sessionID,
          name: existing.name || name,
          agentId: existing.agentId || name,
          status: status === 'idle' && existing.status !== 'idle' ? existing.status : status,
        };
      } else {
        members.push({
          id: name,
          agentId: name,
          name,
          role: 'worker',
          status,
          sessionID,
        });
      }
    }

    return { ...team, members };
  } catch {
    return team;
  }
}

export { invalidateTeamBySessionCache } from './teamSessionCache';

const teamBySessionPrefetchInFlight = new Map<string, Promise<TeamInfo | null>>();

export const opencodeTeam = {
  getActiveTeams: (): TeamInfo[] => [],

  fetchActiveTeams: async (): Promise<TeamInfo[]> => {
    const baseUrl = await getOpenCodeServerUrl();
    if (!baseUrl) return [];
    try {
      const response = await fetch(`${baseUrl}/team`);
      if (!response.ok) return [];
      const data = await response.json() as unknown;
      const normalized = Array.isArray(data)
        ? data.map((team) => normalizeTeamInfo(team as Record<string, unknown>))
        : [];
      const activeSessionId = useSessionStore.getState().activeSessionId;
      const teams = await Promise.all(
        normalized.map((team) =>
          activeSessionId && team.sessionId === activeSessionId
            ? enrichTeamWithSessionChildren(team)
            : team,
        ),
      );
      teamListCache = {
        at: Date.now(),
        teams: teams
          .filter((team) => team.name && team.sessionId)
          .map((team) => ({ name: team.name, leadSessionID: team.sessionId })),
      };
      return teams;
    } catch {
      return [];
    }
  },

  getTeamBySession: (_sessionId: string): TeamInfo | null => null,

  fetchTeamBySession: async (
    sessionId: string,
    options?: { enrich?: boolean; skipCache?: boolean },
  ): Promise<TeamInfo | null> => {
    const enrich = options?.enrich !== false;
    if (!options?.skipCache) {
      const cached = getCachedTeamBySession(sessionId);
      if (cached !== undefined) {
        if (cached && enrich) {
          return enrichTeamWithSessionChildren(cached);
        }
        return cached;
      }
    }

    const baseUrl = await getOpenCodeServerUrl();
    if (!baseUrl) return null;
    try {
      const response = await fetchWithTimeout(
        `${baseUrl}/team/by-session/${encodeURIComponent(sessionId)}`,
      );
      if (!response.ok) {
        debugWarn('team.by-session.failed', { sessionId, status: response.status });
        writeTeamBySessionCache(sessionId, null);
        return null;
      }
      const data = await response.json() as unknown;
      if (data === null) {
        writeTeamBySessionCache(sessionId, null);
        return null;
      }
      const team = parseTeamBySessionResponse(data);
      if (!team) {
        writeTeamBySessionCache(sessionId, null);
        return null;
      }
      writeTeamBySessionCache(sessionId, team);
      return enrich ? enrichTeamWithSessionChildren(team) : team;
    } catch {
      return null;
    }
  },

  prefetchTeamBySession: (sessionId: string): Promise<TeamInfo | null> => {
    const cached = getCachedTeamBySession(sessionId);
    if (cached !== undefined) return Promise.resolve(cached);

    let inflight = teamBySessionPrefetchInFlight.get(sessionId);
    if (!inflight) {
      inflight = opencodeTeam.fetchTeamBySession(sessionId, { enrich: true });
      teamBySessionPrefetchInFlight.set(sessionId, inflight);
      void inflight.finally(() => {
        teamBySessionPrefetchInFlight.delete(sessionId);
      });
    }
    return inflight;
  },

  fetchTeamByName: async (teamName: string): Promise<TeamInfo | null> => {
    const baseUrl = await getOpenCodeServerUrl();
    if (!baseUrl || !teamName) return null;
    try {
      const response = await fetch(`${baseUrl}/team/${encodeURIComponent(teamName)}`);
      if (!response.ok) return null;
      const data = await response.json() as unknown;
      if (!data || typeof data !== 'object') return null;
      const team = normalizeTeamInfo(data as Record<string, unknown>);
      return enrichTeamWithSessionChildren(team);
    } catch {
      return null;
    }
  },

  getTeamTasks: (_teamId: string): TeamTask[] => [],

  fetchTeamTasks: async (teamName: string): Promise<TeamTask[]> => {
    const baseUrl = await getOpenCodeServerUrl();
    if (!baseUrl) return [];
    const exists = (await fetchAllTeamsBrief()).some((team) => team.name === teamName);
    if (!exists) return [];
    try {
      const response = await fetch(`${baseUrl}/team/${encodeURIComponent(teamName)}/tasks`);
      if (!response.ok) return [];
      const data = await response.json() as unknown;
      return Array.isArray(data) ? data.map((task) => normalizeTeamTask(task as Record<string, unknown>)) : [];
    } catch {
      return [];
    }
  },

  

  shutdownTeam: async (teamId: string): Promise<boolean> => {
    const baseUrl = await getOpenCodeServerUrl();
    if (!baseUrl) return false;
    try {
      const response = await fetch(`${baseUrl}/team/${encodeURIComponent(teamId)}/cancel`, { method: 'POST' });
      return response.ok;
    } catch {
      return false;
    }
  },

  releaseTeamForSession: async (_sessionId: string, teamName: string): Promise<void> => {
    const baseUrl = await getOpenCodeServerUrl();
    if (baseUrl) {
      try {
        await fetch(`${baseUrl}/team/${encodeURIComponent(teamName)}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
      } catch { /* ignore */ }
    }
    // Reset team server-side; do not promptAsync here — deleteSession removes the session
    // immediately after, and a late prompt loop raises "Session not found".
    await forceResetTeam(teamName);
  },

  prepareTeamLaunch: async (
    teamKey: string,
    sessionId: string,
    options?: { sessionTeam?: TeamInfo | null },
  ): Promise<TeamLaunchDecision> => {
    const sessionTeam = options && 'sessionTeam' in options
      ? (options.sessionTeam ?? null)
      : await opencodeTeam.fetchTeamBySession(sessionId);
    if (sessionTeam) {
      return {
        mode: 'reuse',
        runtimeTeamName: sessionTeam.name || sessionTeam.key,
        templateKey: teamKey,
      };
    }

    const scopedName = buildSessionScopedTeamName(teamKey, sessionId);
    const allTeams = await fetchAllTeamsBrief();
    const scopedTeam = allTeams.find((team) => team.name === scopedName) ?? null;
    const canonicalTeam = allTeams.find((team) => team.name === teamKey) ?? null;

    const scopedDecision = await decideRuntimeTeamName(teamKey, sessionId, scopedName, scopedTeam);
    if (scopedDecision) return scopedDecision;

    if (canonicalTeam?.leadSessionID === sessionId) {
      return { mode: 'reuse', runtimeTeamName: teamKey, templateKey: teamKey };
    }

    return { mode: 'create', runtimeTeamName: scopedName, templateKey: teamKey };
  },

  ensureTeamReady,

  onTeamEvent: (callback: (event: TeamEvent) => void): (() => void) => {
    return on('*', (event) => {
      const eventType = typeof event.type === 'string' ? event.type : '';
      if (!eventType.startsWith('team.')) return;
      const props = extractEventPayload(event as Record<string, unknown>);
      callback({
        type: eventType as TeamEvent['type'],
        teamId: String(props.teamName ?? props.teamId ?? props.teamID ?? ''),
        data: props,
        timestamp: typeof event.timestamp === 'number' ? event.timestamp : Date.now(),
      });
    });
  },

  getMemberMessages: (_memberId: string): MemberMessage[] => [],
};