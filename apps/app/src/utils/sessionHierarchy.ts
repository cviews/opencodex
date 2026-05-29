import { normalizeDirectoryPath } from '../sdk/eventDirectory';

/** OpenCode child sessions (team_spawn / task) carry parentID pointing at the lead session. */
export function isTopLevelSession(session: { parentID?: string | null }): boolean {
  const parent = session.parentID?.trim();
  return !parent;
}

export function filterTopLevelSessions<T extends { parentID?: string | null }>(sessions: T[]): T[] {
  return sessions.filter(isTopLevelSession);
}

export function dedupeSessionsById<T extends { id: string }>(sessions: T[]): T[] {
  const seen = new Set<string>();
  return sessions.filter((session) => {
    if (seen.has(session.id)) return false;
    seen.add(session.id);
    return true;
  });
}

/** Keep only sessions that belong to this workspace directory (not project display name). */
export function filterSessionsForProjectPath<T extends {
  directory?: string | null;
  path?: string | null;
  projectID?: string | null;
}>(
  sessions: T[],
  projectPath: string | undefined,
  projectId?: string | undefined,
): T[] {
  const projectNorm = projectPath?.trim() ? normalizeDirectoryPath(projectPath) : '';
  if (!projectNorm) return sessions;

  const id = projectId?.trim();
  return sessions.filter((session) => {
    const dirs = [session.directory, session.path].filter(Boolean) as string[];
    for (const raw of dirs) {
      const norm = normalizeDirectoryPath(raw);
      if (norm === projectNorm || norm.startsWith(`${projectNorm}/`)) {
        return true;
      }
    }
    if (id && session.projectID?.trim() === id) {
      return true;
    }
    return false;
  });
}
