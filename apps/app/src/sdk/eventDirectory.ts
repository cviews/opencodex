import { useProjectStore } from '../stores/project';

let cachedInstanceDirectory: string | undefined;

/** Sync from GET /path so SSE directory matches permission/question API routes. */
export function setEventInstanceDirectory(directory: string | undefined): void {
  cachedInstanceDirectory = directory?.trim() || undefined;
}

export function getEventInstanceDirectory(): string | undefined {
  return cachedInstanceDirectory;
}

export function getEventSubscribeDirectory(): string | undefined {
  const path = useProjectStore.getState().currentProject.path?.trim();
  return cachedInstanceDirectory || path || undefined;
}

export function normalizeDirectoryPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/$/, '');
}

function directoryMatches(candidate: string | undefined, eventDirectory: string): boolean {
  if (!candidate) return false;
  const normalizedEvent = normalizeDirectoryPath(eventDirectory);
  const normalizedCandidate = normalizeDirectoryPath(candidate);
  if (normalizedEvent === normalizedCandidate) return true;
  return normalizedEvent.toLowerCase() === normalizedCandidate.toLowerCase();
}

export function eventDirectoryMatchesProject(eventDirectory: string | undefined): boolean {
  if (!eventDirectory) return true;
  const projectPath = useProjectStore.getState().currentProject.path?.trim();
  if (!projectPath && !cachedInstanceDirectory) return true;
  if (directoryMatches(projectPath, eventDirectory)) return true;
  if (directoryMatches(cachedInstanceDirectory, eventDirectory)) return true;
  return false;
}
