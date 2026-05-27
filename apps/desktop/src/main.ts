import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'path';
import os from 'os';
import { spawn, execSync, type ChildProcess, type SpawnOptions } from 'child_process';
import fs from 'fs';

// Constants
const DEFAULT_HOSTNAME = '127.0.0.1';
const VITE_DEV_URL = 'http://localhost:5173';
const HEALTH_CHECK_TIMEOUT = 30000;

// State
let opencodeProcess: ChildProcess | null = null;
let opencodeProcessGroupId: number | null = null;
let startOpencodeInFlight: Promise<string> | null = null;
let mainWindow: BrowserWindow | null = null;
let serverUrl: string = '';
let currentDirectory: string | undefined;

const OPENCODE_STOP_GRACE_MS = 1500;
const OPENCODE_HEALTH_TIMEOUT_MS = 2000;

let orphanCleanupTimer: ReturnType<typeof setTimeout> | null = null;

function cancelOrphanCleanup(): void {
  if (orphanCleanupTimer) {
    clearTimeout(orphanCleanupTimer);
    orphanCleanupTimer = null;
  }
}

function isOpencodeProcessRunning(): boolean {
  if (!opencodeProcess || !serverUrl) return false;
  if (opencodeProcess.exitCode !== null || opencodeProcess.signalCode !== null) return false;
  return true;
}

async function isOpencodeServerHealthy(): Promise<boolean> {
  if (!isOpencodeProcessRunning()) return false;
  try {
    const resp = await fetch(`${serverUrl}/global/health`, {
      signal: AbortSignal.timeout(OPENCODE_HEALTH_TIMEOUT_MS),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** Kill tracked opencode-team and any other local serve orphans (dev restarts pile these up). */
function killOpencodeProcessTree(proc: ChildProcess | null, pgid?: number | null): void {
  const pid = proc?.pid;
  const groupId = pgid ?? pid ?? null;
  if (!pid && !groupId) return;

  proc?.removeAllListeners();

  try {
    if (process.platform === 'win32') {
      if (pid) {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
      }
    } else if (groupId) {
      try {
        process.kill(-groupId, 'SIGTERM');
      } catch {
        if (pid) proc?.kill('SIGTERM');
      }
    } else if (pid) {
      proc?.kill('SIGTERM');
    }
  } catch {
    try {
      proc?.kill('SIGKILL');
    } catch { /* ignore */ }
  }
}

function listOpencodeServePids(): number[] {
  if (process.platform === 'win32') return [];
  try {
    const out = execSync('pgrep -f "opencode-team serve"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    if (!out) return [];
    return out
      .split('\n')
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isFinite(pid) && pid !== process.pid);
  } catch {
    return [];
  }
}

function killPid(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
    return;
  } catch { /* ignore */ }
  try {
    process.kill(pid, signal);
  } catch { /* ignore */ }
}

function shouldExcludeOpencodePid(pid: number, excludePgid?: number | null): boolean {
  const activePgid = opencodeProcessGroupId ?? excludePgid;
  return activePgid != null && pid === activePgid;
}

/** Dev restarts and crashed quits leave many serve orphans — terminate before starting a fresh one. */
function cleanupOrphanOpencodeTeamServers(excludePgid?: number | null): void {
  if (process.platform === 'win32') {
    try {
      execSync('taskkill /IM opencode-team.exe /F', { stdio: 'ignore' });
    } catch { /* ignore */ }
    return;
  }

  cancelOrphanCleanup();

  const pids = listOpencodeServePids().filter((pid) => !shouldExcludeOpencodePid(pid, excludePgid));
  if (pids.length === 0) return;

  console.log(`[zmn-opencodex] Cleaning ${pids.length} orphan opencode-team serve process(es)`);
  for (const pid of pids) {
    killPid(pid, 'SIGTERM');
  }

  orphanCleanupTimer = setTimeout(() => {
    orphanCleanupTimer = null;
    for (const pid of listOpencodeServePids().filter((p) => !shouldExcludeOpencodePid(p, excludePgid))) {
      killPid(pid, 'SIGKILL');
    }
  }, 400);
}

function forceKillOpencodeAfterGrace(pgid: number | null, pid: number | null): void {
  if (process.platform === 'win32') return;
  const target = pgid ?? pid;
  if (!target) return;
  setTimeout(() => {
    try {
      process.kill(-target, 'SIGKILL');
    } catch {
      if (pid) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch { /* ignore */ }
      }
    }
  }, OPENCODE_STOP_GRACE_MS);
}

// --- Config File for Project Directory ---
function getProjectConfigPath(): string {
  return path.join(app.getPath('userData'), 'current-project.json');
}

function readSavedProjectDirectory(): string | undefined {
  try {
    const configPath = getProjectConfigPath();
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (data.directory && typeof data.directory === 'string' && data.directory.trim() !== '') {
        return data.directory;
      }
    }
  } catch { /* ignore */ }
  return undefined;
}

function writeSavedProjectDirectory(directory: string): void {
  try {
    const configPath = getProjectConfigPath();
    fs.writeFileSync(configPath, JSON.stringify({ directory }), 'utf-8');
  } catch { /* ignore */ }
}

// --- OpenCode Server Management ---
function startOpencodeServer(directory?: string): Promise<string> {
  if (startOpencodeInFlight) {
    return startOpencodeInFlight;
  }

  startOpencodeInFlight = startOpencodeServerInner(directory).finally(() => {
    startOpencodeInFlight = null;
  });
  return startOpencodeInFlight;
}

async function switchOpencodeDirectory(directory: string): Promise<string | null> {
  if (!(await isOpencodeServerHealthy())) return null;
  currentDirectory = directory;
  writeSavedProjectDirectory(directory);
  console.log(`[zmn-opencodex] Switched opencode directory to ${directory} (server kept running)`);
  return serverUrl;
}

function startOpencodeServerInner(directory?: string): Promise<string> {
  stopOpencodeServer();
  cleanupOrphanOpencodeTeamServers();

  return new Promise((resolve, reject) => {
    const hostname = DEFAULT_HOSTNAME;
    const effectiveDirectory = directory ?? readSavedProjectDirectory();

    const args = ['serve', '--hostname', hostname];

    console.log(
      `[zmn-opencodex] Starting opencode serve on ${hostname} (random port)` +
        (effectiveDirectory ? ` cwd=${effectiveDirectory}` : ''),
    );

    currentDirectory = effectiveDirectory;
    serverUrl = '';

    const spawnOpts: SpawnOptions = {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        OPENCODE_EXPERIMENTAL_AGENT_TEAMS: 'true',
        OPENCODE_CLIENT: 'desktop',
        OPENCODE_ENABLE_QUESTION_TOOL: 'true',
      },
      cwd: effectiveDirectory || undefined,
      // Own process group so stop can SIGTERM the whole tree (Bun/MCP children).
      detached: process.platform !== 'win32',
    };

    opencodeProcess = spawn('opencode-team', args, spawnOpts);
    opencodeProcessGroupId = opencodeProcess.pid ?? null;
    cancelOrphanCleanup();

    opencodeProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      console.log(`[opencode stdout] ${output}`);
      // Detect server ready signal
      if (output.includes('opencode server listening on')) {
        const match = output.match(/on\s+(https?:\/\/[^\s]+)/);
        if (match) {
          serverUrl = match[1];
          resolve(serverUrl);
        }
      }
    });

    opencodeProcess.stderr?.on('data', (data: Buffer) => {
      console.log(`[opencode stderr] ${data.toString()}`);
    });

    opencodeProcess.on('error', (err: Error) => {
      console.error(`[zmn-opencodex] opencode process error: ${err.message}`);
      reject(err);
    });

    opencodeProcess.on('exit', (code: number | null) => {
      console.log(`[zmn-opencodex] opencode process exited with code ${code}`);
      opencodeProcess = null;
      opencodeProcessGroupId = null;
    });

    const timer = setTimeout(() => {
      if (!serverUrl) {
        reject(new Error(`opencode server did not start within ${HEALTH_CHECK_TIMEOUT}ms`));
      }
    }, HEALTH_CHECK_TIMEOUT);
  });
}

function stopOpencodeServer(): void {
  cancelOrphanCleanup();
  const proc = opencodeProcess;
  const pgid = opencodeProcessGroupId;
  if (proc || pgid) {
    console.log('[zmn-opencodex] Stopping opencode server');
    killOpencodeProcessTree(proc, pgid);
    forceKillOpencodeAfterGrace(pgid, proc?.pid ?? null);
    opencodeProcess = null;
    opencodeProcessGroupId = null;
    serverUrl = '';
  }
  cleanupOrphanOpencodeTeamServers();
}

function resolveTerminalDirectory(directory?: string): string | undefined {
  const dir = directory?.trim() || currentDirectory || readSavedProjectDirectory();
  if (!dir) return undefined;
  if (!fs.existsSync(dir)) return undefined;
  return dir;
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function openTerminalInDirectory(directory?: string): { success: boolean; error?: string } {
  const dir = resolveTerminalDirectory(directory);
  if (!dir) {
    return { success: false, error: 'No project directory selected' };
  }

  try {
    if (process.platform === 'darwin') {
      const escapedDir = escapeAppleScriptString(dir);
      const script = [
        'tell application "Terminal"',
        '  activate',
        `  do script "cd \\"${escapedDir}\\" && clear"`,
        'end tell',
      ].join('\n');
      const child = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
      child.unref();
      return { success: true };
    }

    if (process.platform === 'win32') {
      try {
        execSync('where wt', { stdio: 'pipe' });
        const child = spawn('wt.exe', ['-d', dir], { detached: true, stdio: 'ignore', shell: true });
        child.unref();
        return { success: true };
      } catch {
        const child = spawn(
          'cmd.exe',
          ['/c', 'start', 'cmd.exe', '/K', `cd /d "${dir.replace(/"/g, '""')}"`],
          { detached: true, stdio: 'ignore' },
        );
        child.unref();
        return { success: true };
      }
    }

    const linuxTerminals: Array<{ cmd: string; args: string[] }> = [
      { cmd: 'gnome-terminal', args: [`--working-directory=${dir}`] },
      { cmd: 'konsole', args: ['--workdir', dir] },
      { cmd: 'xfce4-terminal', args: [`--working-directory=${dir}`] },
      { cmd: 'x-terminal-emulator', args: ['-e', `bash -lc "cd '${dir.replace(/'/g, `'\\''`)}' && exec bash"`] },
    ];

    for (const terminal of linuxTerminals) {
      try {
        execSync(`command -v ${terminal.cmd}`, { stdio: 'pipe' });
        const child = spawn(terminal.cmd, terminal.args, { detached: true, stdio: 'ignore' });
        child.unref();
        return { success: true };
      } catch {
        continue;
      }
    }

    return { success: false, error: 'No supported terminal application found' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

function sendTerminalToggle(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal:toggle');
  }
}

function sendTerminalNew(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('terminal:new');
  }
}

function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' as const },
            { type: 'separator' as const },
            { role: 'services' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ],
        }]
      : []),
    {
      label: 'Terminal',
      submenu: [
        {
          label: 'New Terminal',
          accelerator: 'CmdOrCtrl+Shift+`',
          click: () => {
            sendTerminalNew();
          },
        },
        {
          label: 'Toggle Terminal',
          accelerator: 'CmdOrCtrl+J',
          click: () => {
            sendTerminalToggle();
          },
        },
      ],
    },
    ...(isMac
      ? [
          {
            label: 'Edit',
            submenu: [
              { role: 'undo' as const },
              { role: 'redo' as const },
              { type: 'separator' as const },
              { role: 'cut' as const },
              { role: 'copy' as const },
              { role: 'paste' as const },
              { role: 'selectAll' as const },
            ],
          },
          {
            label: 'View',
            submenu: [
              { role: 'reload' as const },
              { role: 'forceReload' as const },
              { role: 'toggleDevTools' as const },
              { type: 'separator' as const },
              { role: 'resetZoom' as const },
              { role: 'zoomIn' as const },
              { role: 'zoomOut' as const },
              { type: 'separator' as const },
              { role: 'togglefullscreen' as const },
            ],
          },
          {
            role: 'window' as const,
            submenu: [
              { role: 'minimize' as const },
              { role: 'zoom' as const },
              { type: 'separator' as const },
              { role: 'front' as const },
            ],
          },
        ]
      : [
          {
            label: 'File',
            submenu: [
              isMac ? { role: 'close' as const } : { role: 'quit' as const },
            ],
          },
          {
            label: 'Edit',
            submenu: [
              { role: 'undo' as const },
              { role: 'redo' as const },
              { type: 'separator' as const },
              { role: 'cut' as const },
              { role: 'copy' as const },
              { role: 'paste' as const },
              { role: 'selectAll' as const },
            ],
          },
          {
            label: 'View',
            submenu: [
              { role: 'reload' as const },
              { role: 'forceReload' as const },
              { role: 'toggleDevTools' as const },
            ],
          },
        ]),
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- IPC Handlers ---
function setupIpc(): void {
  // Engine state
  ipcMain.handle('engine:start', async (_event, options?: { cwd?: string }) => {
    try {
      const url = await startOpencodeServer(options?.cwd);
      if (options?.cwd) {
        writeSavedProjectDirectory(options.cwd);
      }
      return { state: 'running', url, cwd: options?.cwd };
    } catch (err: any) {
      return { state: 'error', error: err.message };
    }
  });

  ipcMain.handle('engine:stop', async () => {
    stopOpencodeServer();
    return { state: 'idle' };
  });

  ipcMain.handle('engine:state', async () => {
    if (opencodeProcess && serverUrl) {
      return { state: 'running', url: serverUrl, cwd: currentDirectory };
    }
    return { state: 'idle' };
  });

  ipcMain.handle('engine:restart-with-dir', async (_event, options: { directory: string }) => {
    try {
      const switchedUrl = await switchOpencodeDirectory(options.directory);
      if (switchedUrl) {
        return { state: 'running', url: switchedUrl, cwd: options.directory, switched: true };
      }

      const url = await startOpencodeServer(options.directory);
      writeSavedProjectDirectory(options.directory);
      return { state: 'running', url, cwd: options.directory, switched: false };
    } catch (err: any) {
      return { state: 'error', error: err.message };
    }
  });

  // Server URL access (for renderer to connect SDK)
  ipcMain.handle('server:url', async () => {
    return serverUrl || null;
  });

  // App info
  ipcMain.handle('app:version', async () => {
    return app.getVersion();
  });

  ipcMain.handle('app:platform', async () => {
    return process.platform;
  });

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // --- Editor Detection ---
  ipcMain.handle('editor:checkInstalled', async () => {
    if (process.platform !== 'darwin') {
      return { vscode: false, finder: false, terminal: false, platform: 'windows' };
    }
    try {
      const hasVscode = (() => {
        try { execSync('which code', { stdio: 'pipe' }); return true; } catch { return false; }
      })();
      return { vscode: hasVscode, finder: true, terminal: true, platform: 'darwin' };
    } catch {
      return { vscode: false, finder: true, terminal: true, platform: 'darwin' };
    }
  });

  // --- Open File with Editor ---
  ipcMain.handle('editor:openFile', async (_event, options: { editor: string; filePath: string }) => {
    const { editor, filePath: rawPath } = options;
    const filePath = rawPath.replace(/^~/, os.homedir());
    try {
      // Ensure config file exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '{}\n', 'utf-8');
      }

      let cmd: string;
      let args: string[] = [];
      switch (editor) {
        case 'vscode':
          cmd = 'code';
          args = [filePath];
          break;
        case 'finder':
          cmd = 'open';
          args = ['-R', filePath];
          break;
        case 'terminal':
          cmd = 'osascript';
          args = ['-e', `tell application "Terminal" to do script "nano '${filePath}'"`];
          break;
        default:
          return { success: false, error: `Unknown editor: ${editor}` };
      }
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
      child.unref();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- Config File Read ---
  ipcMain.handle('config:readFile', async (_event, options: { path: string }) => {
    try {
      const filePath = options.path.replace(/^~/, os.homedir());
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- Config File Write ---
  ipcMain.handle('config:writeFile', async (_event, options: { path: string; data: any }) => {
    try {
      const filePath = options.path.replace(/^~/, os.homedir());
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(options.data, null, 2), 'utf-8');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- OpenCode Hot Reload Config ---
  ipcMain.handle('opencode:reloadConfig', async () => {
    if (!opencodeProcess || !serverUrl) {
      return { success: true };
    }

    try {
      opencodeProcess.kill('SIGHUP');
      return { success: true };
    } catch (err: any) {
      console.warn(`[zmn-opencodex] SIGHUP failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // --- Text File Read (for markdown configs) ---
  ipcMain.handle('config:readTextFile', async (_event, options: { path: string }) => {
    try {
      const filePath = options.path.replace(/^~/, os.homedir());
      if (!fs.existsSync(filePath)) {
        return { success: false, error: `File not found: ${filePath}` };
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- Text File Write (for markdown configs) ---
  ipcMain.handle('config:writeTextFile', async (_event, options: { path: string; content: string }) => {
    try {
      const filePath = options.path.replace(/^~/, os.homedir());
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, options.content, 'utf-8');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- List Config Files in Directory ---
  ipcMain.handle('config:listFiles', async (_event, options: { dirPath: string; pattern?: string }) => {
    try {
      const dir = options.dirPath.replace(/^~/, os.homedir());
      if (!fs.existsSync(dir)) {
        return { success: true, files: [] };
      }
      const pattern = options.pattern || '*';
      const files = fs.readdirSync(dir).filter((f) => {
        if (pattern === '*.md') return f.endsWith('.md');
        if (pattern === '*.json') return f.endsWith('.json');
        return true;
      });
      return { success: true, files };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- Delete Config File ---
  ipcMain.handle('config:deleteFile', async (_event, options: { path: string }) => {
    try {
      const filePath = options.path.replace(/^~/, os.homedir());
      if (!fs.existsSync(filePath)) {
        return { success: false, error: `File not found: ${filePath}` };
      }
      fs.unlinkSync(filePath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- Check if Config File Exists ---
  ipcMain.handle('config:fileExists', async (_event, options: { path: string }) => {
    try {
      const filePath = options.path.replace(/^~/, os.homedir());
      return { success: true, exists: fs.existsSync(filePath) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}

// --- Window Management ---
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#202123',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Needed for preload script access
    },
  });

  // Load renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(VITE_DEV_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../app/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- App Lifecycle ---
app.whenReady().then(async () => {
  setupIpc();
  setupApplicationMenu();
  registerOpencodeShutdownHooks();
  cleanupOrphanOpencodeTeamServers();

  // Try to auto-start opencode server with saved project directory
  // If no saved directory, just create window — frontend will handle project selection
  const savedDir = readSavedProjectDirectory();
  if (savedDir) {
    try {
      console.log(`[zmn-opencodex] Auto-starting opencode server with --dir ${savedDir}...`);
      await startOpencodeServer(savedDir);
      console.log(`[zmn-opencodex] OpenCode server ready at ${serverUrl}`);
    } catch (err: any) {
      console.error(`[zmn-opencodex] Failed to start opencode: ${err.message}`);
    }
  } else {
    console.log('[zmn-opencodex] No saved project directory — waiting for frontend to select project');
  }

  createWindow();
});

app.on('window-all-closed', () => {
  stopOpencodeServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  stopOpencodeServer();
});

function shutdownOpencodeServeSync(): void {
  stopOpencodeServer();
  if (process.platform !== 'win32') {
    for (const pid of listOpencodeServePids()) {
      killPid(pid, 'SIGKILL');
    }
  }
}

function registerOpencodeShutdownHooks(): void {
  process.on('exit', () => {
    if (process.platform === 'win32') {
      try {
        execSync('taskkill /IM opencode-team.exe /F', { stdio: 'ignore' });
      } catch { /* ignore */ }
      return;
    }
    for (const pid of listOpencodeServePids()) {
      killPid(pid, 'SIGKILL');
    }
  });

  if (process.env.NODE_ENV === 'development') {
    process.stdin?.on('end', () => {
      console.log('[zmn-opencodex] stdin closed — stopping opencode serve');
      shutdownOpencodeServeSync();
      app.quit();
    });
    process.stdin?.resume();
  }
}

process.on('SIGINT', () => {
  console.log('[zmn-opencodex] SIGINT — stopping opencode serve');
  shutdownOpencodeServeSync();
  app.quit();
});

process.on('SIGTERM', () => {
  console.log('[zmn-opencodex] SIGTERM — stopping opencode serve');
  shutdownOpencodeServeSync();
  app.quit();
});

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}