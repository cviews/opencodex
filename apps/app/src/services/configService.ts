import type { OpenCodeConfig } from '../types';
import { getClient } from '../sdk/client';

function getConfigPath(): string {
  try {
    if (typeof process !== 'undefined' && process.env) {
      const home = process.env.HOME || process.env.USERPROFILE;
      if (home) return `${home}/.config/opencode/opencode.json`;
    }
  } catch { /* ignore */ }
  return '~/.config/opencode/opencode.json';
}

const OPENCODE_CONFIG_PATH = getConfigPath();

function getElectronAPI() {
  return (window as unknown as Record<string, unknown>)['electronAPI'] as {
    configReadFile?: (params: { path: string }) => Promise<{ success: boolean; data?: any; error?: string }>;
    configWriteFile?: (params: { path: string; data: any }) => Promise<{ success: boolean; error?: string }>;
    opencodeReloadConfig?: () => Promise<{ success: boolean; error?: string }>;
  } | undefined;
}

export async function readConfig(): Promise<OpenCodeConfig | null> {
  const api = getElectronAPI();
  if (!api?.configReadFile) {
    console.warn('[configService] configReadFile not available');
    return null;
  }

  try {
    const result = await api.configReadFile({ path: OPENCODE_CONFIG_PATH });
    if (!result.success || !result.data) return null;
    return result.data as OpenCodeConfig;
  } catch (err) {
    console.warn('[configService] Failed to read config:', err);
    return null;
  }
}

export async function writeConfig(config: OpenCodeConfig): Promise<boolean> {
  const api = getElectronAPI();
  if (!api?.configWriteFile) {
    console.warn('[configService] configWriteFile not available');
    return false;
  }

  try {
    const result = await api.configWriteFile({ path: OPENCODE_CONFIG_PATH, data: config });
    return result.success;
  } catch (err) {
    console.error('[configService] Failed to write config:', err);
    return false;
  }
}

export async function reloadConfig(): Promise<boolean> {
  const client = getClient();

  if (client) {
    try {
      const config = await readConfig();
      if (config) {
        await client.config.update({ config: config as never });
        return true;
      }
    } catch (err) {
      console.warn('[configService] SDK config.update failed, falling back to IPC:', err);
    }
  }

  const api = getElectronAPI();
  if (!api?.opencodeReloadConfig) {
    console.warn('[configService] opencodeReloadConfig not available');
    return false;
  }

  try {
    const result = await api.opencodeReloadConfig();
    return result.success;
  } catch (err) {
    console.error('[configService] Failed to reload config:', err);
    return false;
  }
}

export async function readPlugins(): Promise<string[]> {
  const config = await readConfig();
  if (!config) return [];
  const plugins = config.plugin;
  if (!Array.isArray(plugins)) return [];
  return plugins.filter((p): p is string => typeof p === 'string');
}

export async function removePlugin(pluginName: string): Promise<boolean> {
  const config = await readConfig();
  if (!config) return false;
  const plugins = config.plugin;
  if (!Array.isArray(plugins)) return false;
  const updated = plugins.filter((p: unknown) => typeof p === 'string' && p !== pluginName);
  config.plugin = updated;
  const ok = await writeConfig(config);
  if (ok) {
    await reloadConfig();
  }
  return ok;
}