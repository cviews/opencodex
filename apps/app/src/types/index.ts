export interface ProviderOption {
  id: string;
  label: string;
  providerType?: string;
  apiKey?: string;
  models: { id: string; label: string }[];
}

export interface UsageInfo {
  percentage: number;
  period: string;
  refreshTime: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
}

export interface ConversationItem {
  id: string;
  name: string;
  project: string;
  shortcut?: string;
}

export interface ContextUsageInfo {
  percentage: number;
  usedTokens: number;
  totalTokens: number;
}

export interface SubAgentItem {
  id: string;
  sessionId: string;
  parentSessionId: string;
  name: string;
  icon: string;
  status: 'completed' | 'running' | 'pending';
  title: string;
  /** Child session creation time (ms), used to scope sub-agents to the current run. */
  createdAt?: number;
}

export interface AgentItem {
  name: string;
  kind: 'agent';
  description: string;
  /** Source type: 'builtin' = SDK built-in, 'custom' = user configured in settings, 'plugin' = from plugin */
  sourceType?: 'builtin' | 'custom' | 'plugin';
  /** Display label for the source, e.g. plugin name or '自定义' */
  sourceLabel?: string;
}

export interface FileItem {
  name: string;
  kind: 'file';
  description: string;
}

export interface SlashItem {
  name: string;
  description: string;
  source: 'skill' | 'command' | 'mode';
  scope: 'project' | 'global' | 'command' | 'mode';
  icon?: 'plan' | 'compress';
  enabled?: boolean;
  /** Stable key when the same name exists as both skill and command */
  entryId?: string;
}

export interface PlanData {
  title: string;
  steps: { title: string; status: 'completed' | 'current' | 'pending' }[];
}

export interface SettingsModel {
  id: string;
  name: string;
  modelId: string;
  enabled: boolean;
}

export interface SettingsProvider {
  id: string;
  name: string;
  shortName: string;
  models: SettingsModel[];
  expanded: boolean;
}

export interface ModelItem {
  name: string;
  description: string;
  source: 'model';
  scope: 'model';
  modelId: string;
  provider: string;
  providerLabel: string;
  /** Whether the model emits reasoning/thinking tokens. */
  reasoning?: boolean;
}

export interface ProviderGroup {
  id: string;
  label: string;
  models: ModelItem[];
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  prompt: string;
  mode?: string;
  steps?: number;
  color?: string;
  permission?: Record<string, string>;
  sourceType?: 'builtin' | 'custom' | 'plugin';
  sourceLabel?: string;
}

export interface Team {
  id: string;
  name: string;
  key: string;
  description: string;
  expanded: boolean;
  agentIds: string[];
  members?: string[];
  delegate?: boolean;
  prompt?: string;
  model?: string;
  steps?: number;
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  type: 'session' | 'subprocess';
  itemData: Record<string, string>;
}

export interface ProviderModelEntry {
  id: string;
  name: string;
  enabled: boolean;
}

export interface ProviderEntry {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  tag?: string;
  providerType?: string;
  apiKey?: string;
  models?: ProviderModelEntry[];
  expanded?: boolean;
}

export interface ProviderModelConfig {
  name: string;
  limit?: { context?: number; output?: number };
  modalities?: { input?: string[]; output?: string[] };
  options?: Record<string, unknown>;
  disable?: boolean;
}

export interface ProviderModelConfig {
  name: string;
  limit?: { context?: number; output?: number };
  modalities?: { input?: string[]; output?: string[] };
  options?: Record<string, unknown>;
  disable?: boolean;
}

export interface ProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
    apiKey?: string;
    headers?: Record<string, string>;
  };
  models?: Record<string, ProviderModelConfig>;
  providerType?: string;
}

export interface QuotaLimit {
  type: string;
  unit: number;
  number: number;
  percentage: number;
  nextResetTime?: number;
  usage?: number;
  remaining?: number;
  currentValue?: number;
  usageDetails?: { modelCode: string; usage: number }[];
}

export interface QuotaData {
  limits: QuotaLimit[];
  level?: string;
}

export interface OpenCodeConfig {
  provider?: Record<string, ProviderConfig>;
  [key: string]: unknown;
}

export type CardRenderType = 'file' | 'image' | 'plan' | 'sources' | 'task-summary' | 'skill-result' | 'generic';

export interface MessageCard {
  renderType: CardRenderType;
  title?: string;
  description?: string;
  data?: Record<string, unknown>;
}

export interface ToolCall {
  id?: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  input?: string;
  output?: string;
  error?: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  fullDescription: string;
  icon: string;
  scope: 'project' | 'global';
  kind: 'skill' | 'command';
  installed: boolean;
  isDefault?: boolean;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  installed: boolean;
  config?: Record<string, unknown>;
}

export interface PendingPermission {
  id: string;
  sessionId?: string;
  kind: string;
  title: string;
  message: string;
  scope?: string;
  metadata?: Record<string, string>;
  receivedAt: number;
}

export interface QuestionOptionEntry {
  label: string;
  description?: string;
}

export interface PendingQuestion {
  id: string;
  sessionId?: string;
  title: string;
  options: QuestionOptionEntry[];
  multiSelect?: boolean;
  allowCustom?: boolean;
  step?: number;
  totalSteps?: number;
}

// ============================================================
// Team Runtime Types (Agent Team Mode)
// ============================================================

/** Runtime status of a team member (agent within a team session) */
export type TeamMemberStatus = 'idle' | 'working' | 'waiting' | 'completed' | 'error';

/** A single agent member within an active team */
export interface TeamMember {
  id: string;
  agentId: string;
  name: string;
  role: 'lead' | 'worker';
  status: TeamMemberStatus;
  currentTask?: string;
  model?: string;
  /** The member's independent session ID */
  sessionID: string;
}

/** A single execution step/message from a team member's session */
export interface MemberMessage {
  id: string;
  type: 'tool_call' | 'text' | 'system';
  /** For tool_call: tool name. For text: truncated text content. For system: event description */
  content: string;
  /** Tool call result/output (only for type=tool_call) */
  result?: string;
  status?: 'running' | 'completed' | 'error';
  timestamp: number;
}

/** Task status within the team task board */
export type TeamTaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

/** Priority level for team tasks */
export type TeamTaskPriority = 'high' | 'medium' | 'low';

/** A task item on the team task board */
export interface TeamTask {
  id: string;
  title: string;
  description?: string;
  status: TeamTaskStatus;
  priority: TeamTaskPriority;
  assigneeId?: string;
  parentTaskId?: string;
  createdAt: number;
  updatedAt: number;
}

/** Overall runtime state of an active team session */
export type TeamState = 'initializing' | 'active' | 'paused' | 'completed' | 'error';

/** Runtime info for an active team (bound to a session) */
export interface TeamInfo {
  id: string;
  name: string;
  key: string;
  state: TeamState;
  members: TeamMember[];
  tasks: TeamTask[];
  sessionId: string;
  createdAt: number;
  updatedAt: number;
}

/** SSE event types from the team module */
export type TeamEventType =
  | 'team.created'
  | 'team.member.spawned'
  | 'team.member.status'
  | 'team.member.execution'
  | 'team.task.created'
  | 'team.task.updated'
  | 'team.task.claimed'
  | 'team.message'
  | 'team.state'
  | 'team.cleaned';

/** A team SSE event payload */
export interface TeamEvent {
  type: TeamEventType;
  teamId: string;
  data: Record<string, unknown>;
  timestamp: number;
}


