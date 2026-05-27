export {};

declare global {
  interface ElectronAPI {
    platform: string;
    appVersion: () => Promise<string>;
    engineStart: (options?: { cwd?: string }) => Promise<void>;
    engineStop: () => Promise<void>;
    engineState: () => Promise<string>;
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
  }

  interface Window {
    electronAPI: ElectronAPI;
  }
}
