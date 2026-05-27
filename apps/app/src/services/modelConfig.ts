import { readConfig } from './configService';
import type { ProviderGroup } from '../types';

export interface DefaultModelInfo {
  id: string;
  name: string;
  modelId: string;
}

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

export async function readConfigProviders(): Promise<Map<string, ConfigProviderEntry>> {
  try {
    const config = await readConfig();
    if (!config?.provider) return new Map();
    const entries = new Map<string, ConfigProviderEntry>();
    for (const [id, entry] of Object.entries(config.provider)) {
      if (entry && typeof entry === 'object') {
        entries.set(id, entry as unknown as ConfigProviderEntry);
      }
    }
    return entries;
  } catch {
    return new Map();
  }
}

export function configProvidersToProviderGroups(
  configProviders: Map<string, ConfigProviderEntry>,
): ProviderGroup[] {
  return Array.from(configProviders.entries()).map(([id, entry]) => ({
    id,
    label: entry.name ?? id,
    models: Object.entries(entry.models ?? {}).map(([modelId, model]) => ({
      name: model.name ?? modelId,
      description: model.limit ? `context: ${model.limit.context ?? '?'}, output: ${model.limit.output ?? '?'}` : '',
      source: 'model' as const,
      scope: 'model' as const,
      modelId,
      provider: id,
      providerLabel: entry.name ?? id,
      reasoning: model.reasoning === true,
    })),
  }));
}

/** Resolve default model from opencode.json: explicit `model` field, else first enabled model. */
export function resolveDefaultModelFromConfigData(
  configData: Record<string, unknown> | null,
): DefaultModelInfo | null {
  if (!configData) return null;

  const modelField = configData.model;
  if (typeof modelField === 'string' && modelField.includes('/')) {
    const [providerId, modelId] = modelField.split('/');
    const providers = configData.provider as Record<string, unknown> | undefined;
    const providerEntry = providers?.[providerId] as Record<string, unknown> | undefined;
    const modelsMap = providerEntry?.models as Record<string, Record<string, unknown>> | undefined;
    const modelEntry = modelsMap?.[modelId];
    const displayName = modelEntry?.name as string ?? modelId;
    const providerName = providerEntry?.name as string ?? providerId;
    return { id: modelField, name: `${providerName} - ${displayName}`, modelId };
  }

  if (modelField && typeof modelField === 'object' && !Array.isArray(modelField)) {
    const m = modelField as Record<string, unknown>;
    return {
      id: (m.id as string) ?? '',
      name: (m.name as string) ?? '',
      modelId: (m.modelId as string) ?? (m.id as string) ?? '',
    };
  }

  const providers = configData.provider as Record<string, unknown> | undefined;
  if (providers) {
    for (const [providerId, providerEntry] of Object.entries(providers)) {
      if (!providerEntry || typeof providerEntry !== 'object') continue;
      const p = providerEntry as Record<string, unknown>;
      const modelsMap = p.models as Record<string, Record<string, unknown>> | undefined;
      if (!modelsMap) continue;
      for (const [modelId, modelEntry] of Object.entries(modelsMap)) {
        if (!modelEntry || typeof modelEntry !== 'object') continue;
        if (modelEntry.disable === true) continue;
        const displayName = modelEntry.name as string ?? modelId;
        const providerName = p.name as string ?? providerId;
        return { id: `${providerId}/${modelId}`, name: `${providerName} - ${displayName}`, modelId };
      }
    }
  }

  return null;
}

export async function loadModelProvidersFromConfig(): Promise<ProviderGroup[]> {
  const configProviders = await readConfigProviders();
  return configProvidersToProviderGroups(configProviders);
}

export async function resolveDefaultModelFromConfig(): Promise<DefaultModelInfo | null> {
  const config = await readConfig();
  const fromConfig = resolveDefaultModelFromConfigData(config as Record<string, unknown> | null);
  if (fromConfig) return fromConfig;

  const configProviders = await readConfigProviders();
  if (configProviders.size > 0) {
    const [firstProviderId, firstProviderEntry] = configProviders.entries().next().value!;
    const modelsMap = firstProviderEntry.models;
    if (modelsMap) {
      for (const [modelId, modelEntry] of Object.entries(modelsMap)) {
        if (modelEntry.disable === true) continue;
        return {
          id: `${firstProviderId}/${modelId}`,
          name: `${firstProviderEntry.name ?? firstProviderId} - ${modelEntry.name ?? modelId}`,
          modelId,
        };
      }
    }
  }

  return null;
}
