let cachedDefaultModelRef: string | null = null;

export function setCachedDefaultModelRef(modelRef: string | null): void {
  cachedDefaultModelRef = modelRef?.trim() || null;
}

export function getCachedDefaultModelRef(): string | null {
  return cachedDefaultModelRef;
}
