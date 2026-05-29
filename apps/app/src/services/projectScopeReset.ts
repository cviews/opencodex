import type { ProjectInfo } from '../types';
import { setEventInstanceDirectory } from '../sdk/eventDirectory';
import { clearQuestionRecoverSessions } from '../stores/permission';
import { useMessageStore } from '../stores/message';
import { usePermissionStore } from '../stores/permission';
import { useProjectStore } from '../stores/project';
import { useSessionStore } from '../stores/session';
import { useTeamStore } from '../stores/team';
import {
  beginTerminalProjectSwitch,
  finishTerminalProjectSwitch,
} from '../services/terminalProjectScope';
import { syncTerminalProjectScope } from '../stores/terminal';
import { resyncRunningProjectSessions } from './projectSessionResync';

/**
 * Reset all runtime UI state when switching OpenCode project directory.
 * Backend sessions keep running; we only drop client caches and subscriptions context.
 */
function getElectronAPI():
  | {
    engineClearSavedDirectory?: () => Promise<{ ok: boolean }>;
    engineStop?: () => Promise<{ state: string }>;
  }
  | undefined {
  return (window as unknown as Record<string, unknown>)['electronAPI'] as {
    engineClearSavedDirectory?: () => Promise<{ ok: boolean }>;
    engineStop?: () => Promise<{ state: string }>;
  } | undefined;
}

/** Drop desktop saved cwd and stop engine so a removed project path cannot keep routing API calls. */
export async function clearEngineProjectDirectory(): Promise<void> {
  const api = getElectronAPI();
  await api?.engineClearSavedDirectory?.();
  await api?.engineStop?.();
}

/**
 * Switch UI + OpenCode instance to a project directory (by path, not display name).
 * Always restarts/switches the engine cwd before refreshing sessions.
 */
export async function activateProjectWorkspace(
  project: ProjectInfo,
  restartWithDir: (directory: string) => Promise<{ url: string | null; error?: string }>,
): Promise<{ ok: boolean; error?: string }> {
  const path = project.path?.trim();
  if (!path) {
    return { ok: false, error: '项目路径无效' };
  }

  resetProjectScope(path);
  useProjectStore.getState().setProject(project);
  setEventInstanceDirectory(path);

  const { url, error } = await restartWithDir(path);
  if (!url) {
    return { ok: false, error: error || '启动 opencode 服务失败' };
  }

  await useSessionStore.getState().refreshProjectScopeFromServer(path);
  scheduleProjectSessionResync();
  return { ok: true };
}

/** Clear active session selection so the next message targets the new workspace. */
export function prepareNewChatUI(): void {
  useSessionStore.getState().setActiveSession(null);
  useSessionStore.getState().setSelectedSubAgentId(null);
  useTeamStore.getState().setSelectedMemberId(null);
  useMessageStore.getState().setActiveSession(null);
}

/**
 * Add (or upsert by path) a project, switch the engine cwd, refresh sessions, and prepare a new chat.
 * Same display name with different paths are separate projects; matching is always by path.
 */
export async function registerNewProject(
  project: ProjectInfo,
  restartWithDir: (directory: string) => Promise<{ url: string | null; error?: string }>,
  options?: { prepareNewChat?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  useProjectStore.getState().addProject(project);
  const result = await activateProjectWorkspace(project, restartWithDir);
  if (result.ok && options?.prepareNewChat !== false) {
    prepareNewChatUI();
  }
  return result;
}

export function resetProjectScope(nextProjectPath?: string): void {
  const trimmed = nextProjectPath?.trim();
  beginTerminalProjectSwitch();
  try {
    syncTerminalProjectScope(trimmed && trimmed !== '/' ? trimmed : '');

    useSessionStore.getState().switchProjectScope(trimmed && trimmed !== '/' ? trimmed : '');
    useMessageStore.getState().switchProjectScope(trimmed && trimmed !== '/' ? trimmed : '');

    clearQuestionRecoverSessions();
    usePermissionStore.setState({
      pendingPermissions: [],
      pendingQuestions: [],
      loading: false,
      error: null,
    });

    useTeamStore.getState().setSelectedMemberId(null);
    useTeamStore.setState({ currentTeam: null, activeTeams: [] });

    setEventInstanceDirectory(trimmed && trimmed !== '/' ? trimmed : undefined);
  } finally {
    finishTerminalProjectSwitch();
  }

  if (trimmed && trimmed !== '/') {
    void useSessionStore.getState().refreshProjectRunStatus(trimmed);
    void useSessionStore.getState().refreshProjectScopeFromServer(trimmed);
  }
}

/** After fetchSessions hydrates server run status, reload in-flight session messages. */
export function scheduleProjectSessionResync(): void {
  void resyncRunningProjectSessions();
}

/** Build remount key: one OpenCode server origin + one project directory. */
export function projectScopeKey(serverUrl: string | null | undefined, projectPath: string | undefined): string {
  const origin = serverUrl?.trim() || 'no-server';
  const directory = projectPath?.trim() || 'no-project';
  return `${origin}::${directory}`;
}
