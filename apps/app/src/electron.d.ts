export {};

declare global {
  interface ElectronAPI {
    platform: string;
    userHome: () => Promise<string>;
    appVersion: () => Promise<string>;
    engineStart: (options?: { cwd?: string }) => Promise<{ state: string; url?: string; cwd?: string; error?: string }>;
    engineStop: () => Promise<{ state: string }>;
    engineState: () => Promise<{ state: string; url?: string; cwd?: string }>;
    engineRestartWithDir: (directory: string) => Promise<{
      state: string;
      url?: string;
      cwd?: string;
      switched?: boolean;
      error?: string;
    }>;
    engineClearSavedDirectory: () => Promise<{ ok: boolean }>;
    serverUrl: () => Promise<string>;
    openFolderDialog: () => Promise<string | null>;
    onTerminalToggle: (callback: () => void) => () => void;
    onTerminalNew: (callback: () => void) => () => void;
    editorCheckInstalled: () => Promise<boolean>;
    editorOpenFile: (options: { editor: string; filePath: string }) => Promise<void>;
    configReadFile: (options: { path: string }) => Promise<any>;
    configWriteFile: (options: { path: string; data: any }) => Promise<void>;
    opencodeReloadConfig: () => Promise<void>;
    configReadTextFile: (options: { path: string }) => Promise<{ success: boolean; content?: string; error?: string }>;
    configWriteTextFile: (options: { path: string; content: string }) => Promise<{ success: boolean; error?: string }>;
    configListFiles: (options: { dirPath: string; pattern?: string }) => Promise<{ success: boolean; files?: string[]; error?: string }>;
    configDeleteFile: (options: { path: string }) => Promise<{ success: boolean; error?: string }>;
    configFileExists: (options: { path: string }) => Promise<{ success: boolean; exists?: boolean; error?: string }>;
    getPathForFile: (file: File) => string;
    getPathKind: (filePath: string) => 'file' | 'folder' | 'image' | null;
  }

  interface Window {
    electronAPI: ElectronAPI;
  }
}
