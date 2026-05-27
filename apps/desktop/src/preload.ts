import { statSync } from 'fs';
import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  appVersion: () => ipcRenderer.invoke('app:version'),

  // Engine management
  engineStart: (options?: { cwd?: string }) => ipcRenderer.invoke('engine:start', options),
  engineStop: () => ipcRenderer.invoke('engine:stop'),
  engineState: () => ipcRenderer.invoke('engine:state'),
  engineRestartWithDir: (directory: string) => ipcRenderer.invoke('engine:restart-with-dir', { directory }),

  // Server URL for SDK connection
  serverUrl: () => ipcRenderer.invoke('server:url'),

  // Dialog
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),

  // Menu shortcuts for embedded terminal (renderer handles PTY via opencode server)
  onTerminalToggle: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('terminal:toggle', listener);
    return () => ipcRenderer.removeListener('terminal:toggle', listener);
  },
  onTerminalNew: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('terminal:new', listener);
    return () => ipcRenderer.removeListener('terminal:new', listener);
  },

  // Editor management
  editorCheckInstalled: () => ipcRenderer.invoke('editor:checkInstalled'),
  editorOpenFile: (options: { editor: string; filePath: string }) => ipcRenderer.invoke('editor:openFile', options),

  // Config file management
  configReadFile: (options: { path: string }) => ipcRenderer.invoke('config:readFile', options),
  configWriteFile: (options: { path: string; data: any }) => ipcRenderer.invoke('config:writeFile', options),

  // Hot reload
  opencodeReloadConfig: () => ipcRenderer.invoke('opencode:reloadConfig'),

  // Text/markdown file operations (for ~/.opencode/ configs)
  configReadTextFile: (options: { path: string }) => ipcRenderer.invoke('config:readTextFile', options),
  configWriteTextFile: (options: { path: string; content: string }) => ipcRenderer.invoke('config:writeTextFile', options),
  configListFiles: (options: { dirPath: string; pattern?: string }) => ipcRenderer.invoke('config:listFiles', options),
  configDeleteFile: (options: { path: string }) => ipcRenderer.invoke('config:deleteFile', options),
  configFileExists: (options: { path: string }) => ipcRenderer.invoke('config:fileExists', options),

  /** Resolve absolute path for a dropped/selected File (Electron 20+). */
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  /** Classify a local path as file, folder, or image. */
  getPathKind: (filePath: string): 'file' | 'folder' | 'image' | null => {
    try {
      const stat = statSync(filePath);
      if (stat.isDirectory()) return 'folder';
      if (/\.(png|jpe?g|gif|webp|bmp|svg|ico|heic|heif|tiff?)$/i.test(filePath)) return 'image';
      return 'file';
    } catch {
      return null;
    }
  },
});
