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
