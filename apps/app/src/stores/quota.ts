import { create } from 'zustand';
import { fetchZhipuAIQuota, getFiveHourLimit, getWeeklyLimit } from '../services/quotaService';
import { supportsQuotaApiQuery } from '../services/providerQuota';
import type { QuotaData, QuotaLimit } from '../types';

interface QuotaState {
  quotas: Record<string, QuotaData>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;

  fetchQuota: (providerId: string, apiKey: string, providerType?: string) => Promise<void>;
  getFiveHourQuota: (providerId: string) => QuotaLimit | null;
  getWeeklyQuota: (providerId: string) => QuotaLimit | null;
  clearQuota: (providerId: string) => void;
}

export const useQuotaStore = create<QuotaState>((set, get) => ({
  quotas: {},
  loading: {},
  error: {},

  fetchQuota: async (providerId: string, apiKey: string, providerType?: string) => {
    if (providerType && !supportsQuotaApiQuery(providerType)) {
      return;
    }
    set({ loading: { ...get().loading, [providerId]: true }, error: { ...get().error, [providerId]: null } });
    try {
      const data = await fetchZhipuAIQuota(apiKey);
      if (data) {
        set({ quotas: { ...get().quotas, [providerId]: data }, loading: { ...get().loading, [providerId]: false } });
      } else {
        set({ error: { ...get().error, [providerId]: 'Failed to fetch quota' }, loading: { ...get().loading, [providerId]: false } });
      }
    } catch (err) {
      set({ error: { ...get().error, [providerId]: String(err) }, loading: { ...get().loading, [providerId]: false } });
    }
  },

  getFiveHourQuota: (providerId: string) => {
    const data = get().quotas[providerId];
    if (!data) return null;
    return getFiveHourLimit(data);
  },

  getWeeklyQuota: (providerId: string) => {
    const data = get().quotas[providerId];
    if (!data) return null;
    return getWeeklyLimit(data);
  },

  clearQuota: (providerId: string) => {
    const quotas = { ...get().quotas };
    delete quotas[providerId];
    set({ quotas });
  },
}));