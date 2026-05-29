let cachedDefaultModelRef: string | null = null;
const sessionModelRefs = new Map<string, string>();

export function setCachedDefaultModelRef(modelRef: string | null): void {
  cachedDefaultModelRef = modelRef?.trim() || null;
}

export function getCachedDefaultModelRef(): string | null {
  return cachedDefaultModelRef;
}

export function setSessionModelRef(sessionId: string, modelRef: string | null): void {
  const id = sessionId.trim();
  if (!id) return;
  const ref = modelRef?.trim();
  if (!ref) {
    sessionModelRefs.delete(id);
    return;
  }
  sessionModelRefs.set(id, ref);
}

export function getSessionModelRef(sessionId?: string | null): string | null {
  const id = sessionId?.trim();
  if (!id) return null;
  return sessionModelRefs.get(id) ?? null;
}

export function modelRefFromSessionModel(
  model?: { id?: string; providerID?: string } | null,
): string | null {
  if (!model?.id?.trim() || !model.providerID?.trim()) return null;
  return `${model.providerID.trim()}/${model.id.trim()}`;
}

export function resolveOutgoingModelRef(
  explicitModelId?: string | null,
  sessionId?: string | null,
  sessionModel?: { id?: string; providerID?: string } | null,
): string | null {
  if (explicitModelId?.trim()) return explicitModelId.trim();
  const sessionRef = getSessionModelRef(sessionId);
  if (sessionRef) return sessionRef;
  const fromSession = modelRefFromSessionModel(sessionModel);
  if (fromSession) return fromSession;
  return getCachedDefaultModelRef();
}
