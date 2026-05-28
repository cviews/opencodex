import { setEventInstanceDirectory } from '../sdk/eventDirectory';
import { clearQuestionRecoverSessions } from '../stores/permission';
import { useMessageStore } from '../stores/message';
import { usePermissionStore } from '../stores/permission';
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
