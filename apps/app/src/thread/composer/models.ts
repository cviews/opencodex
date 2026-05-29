import { opencodeProvider, opencodeSettings } from '../../services/opencodeAdapter';
import { loadModelProvidersFromConfig, resolveDefaultModelFromConfig } from '../../services/modelConfig';
import { getClient } from '../../sdk/client';
import {
  getCachedDefaultModelRef,
  setCachedDefaultModelRef,
} from './defaultModelRef';
import type { ModelItem, ProviderGroup } from '../../types';

export type { ModelItem, ProviderGroup };
export {
  getCachedDefaultModelRef,
  setCachedDefaultModelRef,
  getSessionModelRef,
  setSessionModelRef,
  modelRefFromSessionModel,
  resolveOutgoingModelRef,
} from './defaultModelRef';

let modelProviders: ProviderGroup[] = [];
let modelById = new Map<string, ModelItem>();
let reasoningByKey = new Map<string, boolean>();
const runtimeReasoningModels = new Set<string>();
let capabilitiesSyncPromise: Promise<void> | null = null;

function modelKeys(providerId: string, modelId: string): string[] {
  const keys = [`${providerId}/${modelId}`, modelId];
  return keys;
}

function markReasoningKeys(providerId: string | undefined, modelId: string): void {
  if (providerId) {
    for (const key of modelKeys(providerId, modelId)) {
      reasoningByKey.set(key, true);
      runtimeReasoningModels.add(key);
    }
    return;
  }
  reasoningByKey.set(modelId, true);
  runtimeReasoningModels.add(modelId);
}

function rebuildModelIndexes(providers: ProviderGroup[]): void {
  modelById = new Map(
    providers.flatMap((p) => p.models.map((m) => [m.modelId, m] as const)),
  );
  reasoningByKey = new Map();
  for (const group of providers) {
    for (const model of group.models) {
      if (model.reasoning !== true) continue;
      markReasoningKeys(group.id, model.modelId);
    }
  }
  for (const key of runtimeReasoningModels) {
    reasoningByKey.set(key, true);
  }
}

rebuildModelIndexes(modelProviders);

export function getModelProviders(): ProviderGroup[] {
  return modelProviders;
}

export const MODEL_PROVIDERS = modelProviders;

export function setModelProviders(providers: ProviderGroup[]): void {
  modelProviders.length = 0;
  modelProviders.push(...providers);
  rebuildModelIndexes(modelProviders);
}

export function registerModelReasoning(
  providerId: string,
  modelId: string,
  reasoning: boolean,
): void {
  for (const key of modelKeys(providerId, modelId)) {
    if (reasoning) {
      reasoningByKey.set(key, true);
      runtimeReasoningModels.add(key);
    } else {
      reasoningByKey.delete(key);
      runtimeReasoningModels.delete(key);
    }
  }
  const existing = modelById.get(modelId);
  if (existing) {
    existing.reasoning = reasoning;
  }
}

/** Confirmed at runtime when reasoning tokens/events arrive. */
export function noteRuntimeModelReasoning(modelRef?: string | null): void {
  const parsed = parseModelRef(modelRef);
  if (!parsed) return;
  markReasoningKeys(parsed.providerId, parsed.modelId);
}

export function parseModelRef(modelRef?: string | null): { providerId?: string; modelId: string } | null {
  const trimmed = modelRef?.trim();
  if (!trimmed) return null;
  if (trimmed.includes('/')) {
    const [providerId, modelId] = trimmed.split('/', 2);
    if (!modelId) return null;
    return { providerId, modelId };
  }
  return { modelId: trimmed };
}

export function modelSupportsReasoning(modelRef?: string | null): boolean {
  const parsed = parseModelRef(modelRef);
  if (!parsed) return false;

  if (parsed.providerId) {
    const fullKey = `${parsed.providerId}/${parsed.modelId}`;
    if (reasoningByKey.get(fullKey)) return true;
    if (runtimeReasoningModels.has(fullKey)) return true;
  }
  if (reasoningByKey.get(parsed.modelId)) return true;
  if (runtimeReasoningModels.has(parsed.modelId)) return true;

  const item = modelById.get(parsed.modelId);
  if (item?.reasoning === true) return true;
  if (item?.reasoning === false) return false;

  // Config/SDK model known but capability not synced yet — default open like OpenCode.
  if (item) return true;

  const cachedDefaultModelRef = getCachedDefaultModelRef();
  if (cachedDefaultModelRef?.endsWith(`/${parsed.modelId}`) || cachedDefaultModelRef === parsed.modelId) {
    return true;
  }

  return false;
}

async function syncReasoningFromSdkModelList(): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;
    const modelResp = await client.v2.model.list();
    const models = (modelResp.data ?? []) as Record<string, unknown>[];
    for (const model of models) {
      const caps = model.capabilities as { reasoning?: boolean } | undefined;
      const providerID = model.providerID as string | undefined;
      const modelId = model.id as string | undefined;
      if (!providerID || !modelId || caps?.reasoning !== true) continue;
      registerModelReasoning(providerID, modelId, true);
    }
  } catch {
    // SDK unavailable — rely on config/provider cache.
  }
}

/** Load model reasoning capabilities before send/render decisions. */
export function ensureModelCapabilitiesReady(): Promise<void> {
  if (!capabilitiesSyncPromise) {
    capabilitiesSyncPromise = (async () => {
      const [configProviders, defaultModel] = await Promise.all([
        loadModelProvidersFromConfig(),
        resolveDefaultModelFromConfig(),
      ]);
      if (configProviders.length > 0) {
        setModelProviders(configProviders);
      }
      if (defaultModel && !getCachedDefaultModelRef()) {
        setCachedDefaultModelRef(defaultModel.id);
      }

      const [providers] = await Promise.all([
        opencodeProvider.fetchModelProviders(),
        opencodeSettings.fetchDefaultModel({ updateCache: false }),
      ]);
      if (providers.length > 0) {
        setModelProviders(providers);
      }
      await syncReasoningFromSdkModelList();
    })().finally(() => {
      capabilitiesSyncPromise = null;
    });
  }
  return capabilitiesSyncPromise;
}

export function getModelLabel(modelId: string): string | null {
  return modelById.get(modelId)?.name ?? null;
}

export function getAllModels(): ModelItem[] {
  return modelProviders.flatMap((p) => p.models);
}

export const MODEL_AT_PATTERN = /@model\s+(\S+)/g;
