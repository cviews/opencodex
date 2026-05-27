import { create } from 'zustand';
import type { ProviderConfig, OpenCodeConfig } from '../types';
import { readConfig, writeConfig, reloadConfig } from '../services/configService';

function inferProviderType(id: string, entry?: ProviderConfig): string | undefined {
  const stored = entry?.providerType;
  if (stored) return stored;
  if (id.includes('zhipuai') || entry?.options?.baseURL?.includes('bigmodel.cn')) return 'zhipuai-coding';
  if (id.includes('volcengine') || entry?.options?.baseURL?.includes('volces.com')) return 'volcengine-coding';
  return undefined;
}

export function resolveProviderApiKey(
  providers: Record<string, ProviderConfig>,
  providerId: string,
  providerType?: string,
): string | undefined {
  const direct = providers[providerId]?.options?.apiKey;
  if (direct) return direct;

  if (!providerType) return undefined;

  for (const [id, entry] of Object.entries(providers)) {
    const type = inferProviderType(id, entry);
    if (type === providerType && entry.options?.apiKey) {
      return entry.options.apiKey;
    }
  }

  return undefined;
}

interface ProviderState {
  providers: Record<string, ProviderConfig>;
  loading: boolean;
  error: string | null;

  loadProviders: () => Promise<void>;
  addProvider: (id: string, config: ProviderConfig) => Promise<void>;
  removeProvider: (id: string) => Promise<void>;
  updateProvider: (id: string, config: Partial<ProviderConfig>) => Promise<void>;
  reloadServerConfig: () => Promise<boolean>;
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: {},
  loading: false,
  error: null,

  loadProviders: async () => {
    set({ loading: true, error: null });
    try {
      const config = await readConfig();
      if (config?.provider) {
        set({ providers: config.provider, loading: false });
      } else {
        set({ providers: {}, loading: false });
      }
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  addProvider: async (id: string, config: ProviderConfig) => {
    set({ loading: true, error: null });
    try {
      const fullConfig = await readConfig() ?? {};
      if (!fullConfig.provider) {
        fullConfig.provider = {};
      }
      fullConfig.provider[id] = config;
      const ok = await writeConfig(fullConfig as OpenCodeConfig);
      if (ok) {
        set({ providers: { ...get().providers, [id]: config }, loading: false });
      } else {
        set({ error: 'Failed to write config', loading: false });
      }
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  removeProvider: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const fullConfig = await readConfig() ?? {};
      if (fullConfig.provider && id in fullConfig.provider) {
        delete fullConfig.provider[id];
        const ok = await writeConfig(fullConfig as OpenCodeConfig);
        if (ok) {
          const updated = { ...get().providers };
          delete updated[id];
          set({ providers: updated, loading: false });
        } else {
          set({ error: 'Failed to write config', loading: false });
        }
      } else {
        set({ loading: false });
      }
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  updateProvider: async (id: string, config: Partial<ProviderConfig>) => {
    set({ loading: true, error: null });
    try {
      const fullConfig = await readConfig() ?? {};
      if (fullConfig.provider && id in fullConfig.provider) {
        fullConfig.provider[id] = { ...fullConfig.provider[id], ...config };
        const ok = await writeConfig(fullConfig as OpenCodeConfig);
        if (ok) {
          const existing = get().providers[id];
          if (existing) {
            set({
              providers: { ...get().providers, [id]: { ...existing, ...config } },
              loading: false,
            });
          } else {
            set({ loading: false });
          }
        } else {
          set({ error: 'Failed to write config', loading: false });
        }
      } else {
        set({ loading: false });
      }
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  reloadServerConfig: async () => {
    try {
      return await reloadConfig();
    } catch {
      return false;
    }
  },
}));
