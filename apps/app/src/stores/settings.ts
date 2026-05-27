import { create } from 'zustand';

export type EditorType = 'vscode' | 'finder' | 'terminal';
export type ThemeType = 'system' | 'light' | 'dark';
export type LanguageType = 'zh-CN' | 'en';

interface ElectronEditorAPI {
  editorCheckInstalled: () => Promise<{ vscode: boolean; finder: boolean; terminal: boolean; platform: string }>;
  editorOpenFile: (params: { editor: string; filePath: string }) => Promise<void>;
}

function getElectronAPI(): ElectronEditorAPI | undefined {
  return (window as unknown as Record<string, unknown>)['electronAPI'] as ElectronEditorAPI | undefined;
}

function getConfigPath(): string {
  try {
    if (typeof process !== 'undefined' && process.env) {
      const home = process.env.HOME || process.env.USERPROFILE;
      if (home) return `${home}/.config/opencode/opencode.json`;
    }
  } catch { /* ignore */ }
  return '~/.config/opencode/opencode.json';
}

const CONFIG_PATH = getConfigPath();

function getStoredTheme(): ThemeType {
  try {
    const stored = localStorage.getItem('opencode-theme');
    if (stored === 'system' || stored === 'light' || stored === 'dark') return stored;
  } catch { /* ignore */ }
  return 'system';
}

function getStoredLanguage(): LanguageType {
  try {
    const stored = localStorage.getItem('opencode-language');
    if (stored === 'zh-CN' || stored === 'en') return stored;
  } catch { /* ignore */ }
  return 'zh-CN';
}

interface SettingsState {
  selectedEditor: EditorType;
  availableEditors: { vscode: boolean; finder: boolean; terminal: boolean };
  platform: string;
  isLoaded: boolean;
  theme: ThemeType;
  language: LanguageType;

  setSelectedEditor: (editor: EditorType) => void;
  checkAvailableEditors: () => Promise<void>;
  openConfigFile: () => Promise<void>;
  setTheme: (theme: ThemeType) => void;
  setLanguage: (language: LanguageType) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  selectedEditor: 'vscode',
  availableEditors: { vscode: true, finder: true, terminal: true },
  platform: '',
  isLoaded: false,
  theme: getStoredTheme(),
  language: getStoredLanguage(),

  setSelectedEditor: (editor) => set({ selectedEditor: editor }),

  checkAvailableEditors: async () => {
    const api = getElectronAPI();
    if (!api?.editorCheckInstalled) {
      set({ isLoaded: true, platform: 'unknown' });
      return;
    }
    try {
      const result = await api.editorCheckInstalled();
      const defaultEditor: EditorType = result.vscode ? 'vscode' : result.finder ? 'finder' : result.terminal ? 'terminal' : 'vscode';
      set({
        availableEditors: { vscode: result.vscode, finder: result.finder, terminal: result.terminal },
        platform: result.platform,
        selectedEditor: defaultEditor,
        isLoaded: true,
      });
    } catch {
      set({ isLoaded: true, platform: 'unknown' });
    }
  },

  openConfigFile: async () => {
    const api = getElectronAPI();
    const { selectedEditor } = get();
    if (!api?.editorOpenFile) {
      console.warn('electronAPI.editorOpenFile not available');
      return;
    }
    try {
      await api.editorOpenFile({ editor: selectedEditor, filePath: CONFIG_PATH });
    } catch (err) {
      console.error('Failed to open config file:', err);
    }
  },

  setTheme: (theme) => {
    try { localStorage.setItem('opencode-theme', theme); } catch { /* ignore */ }
    set({ theme });
  },

  setLanguage: (language) => {
    try { localStorage.setItem('opencode-language', language); } catch { /* ignore */ }
    set({ language });
  },
}));

// Auto-init on module load
useSettingsStore.getState().checkAvailableEditors();
