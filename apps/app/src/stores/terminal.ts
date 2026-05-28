import { create } from 'zustand';
import { useProjectStore } from './project';

const STORAGE_KEY = 'codex-terminal-height-v1';
const DEFAULT_HEIGHT = 220;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 320;

let tabCounter = 0;

function nextTabId(): string {
  tabCounter += 1;
  return `terminal-tab-${tabCounter}`;
}

function loadHeight(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_HEIGHT;
    const value = Number.parseInt(saved, 10);
    if (!Number.isFinite(value)) return DEFAULT_HEIGHT;
    return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, value));
  } catch {
    return DEFAULT_HEIGHT;
  }
}

export interface TerminalTab {
  id: string;
  index: number;
  sessionKey: number;
  projectPath: string;
  ptyId?: string;
}

interface ProjectTerminalSnapshot {
  isOpen: boolean;
  tabs: TerminalTab[];
  activeTabId: string | null;
  lastError: string | null;
}

interface TerminalState {
  currentProjectPath: string;
  isOpen: boolean;
  height: number;
  tabs: TerminalTab[];
  activeTabId: string | null;
  lastError: string | null;
  byProject: Record<string, ProjectTerminalSnapshot>;
  toggle: () => void;
  open: () => void;
  close: () => void;
  newSession: () => void;
  addTab: () => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setHeight: (height: number) => void;
  setLastError: (error: string | null) => void;
  setTabPtyId: (tabId: string, ptyId: string | undefined) => void;
  resetTerminalPtyBindings: () => void;
  switchProject: (projectPath: string) => void;
}

function emptySnapshot(): ProjectTerminalSnapshot {
  return { isOpen: false, tabs: [], activeTabId: null, lastError: null };
}

function snapshotFromState(state: Pick<TerminalState, 'isOpen' | 'tabs' | 'activeTabId' | 'lastError'>): ProjectTerminalSnapshot {
  return {
    isOpen: state.isOpen,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    lastError: state.lastError,
  };
}

function createTab(index: number, projectPath: string): TerminalTab {
  return {
    id: nextTabId(),
    index,
    sessionKey: Date.now(),
    projectPath,
  };
}

export const TERMINAL_MIN_HEIGHT = MIN_HEIGHT;
export const TERMINAL_MAX_HEIGHT = MAX_HEIGHT;

export const useTerminalStore = create<TerminalState>((set, get) => ({
  currentProjectPath: '',
  isOpen: false,
  height: loadHeight(),
  tabs: [],
  activeTabId: null,
  lastError: null,
  byProject: {},

  switchProject: (projectPath) => {
    const nextPath = projectPath.trim();
    const state = get();
    const currentPath = state.currentProjectPath.trim();

    const byProject = { ...state.byProject };
    if (currentPath && currentPath !== nextPath) {
      byProject[currentPath] = snapshotFromState(state);
    }

    const restored = nextPath ? (byProject[nextPath] ?? emptySnapshot()) : emptySnapshot();
    if (nextPath && !byProject[nextPath]) {
      byProject[nextPath] = restored;
    }

    set({
      currentProjectPath: nextPath,
      byProject,
      isOpen: restored.isOpen,
      tabs: restored.tabs,
      activeTabId: restored.activeTabId,
      lastError: restored.lastError,
    });
  },

  toggle: () => {
    const { isOpen } = get();
    if (isOpen) {
      set({ isOpen: false });
      return;
    }
    get().open();
  },

  open: () => {
    const projectPath = get().currentProjectPath.trim();
    const { tabs } = get();
    if (tabs.length === 0) {
      if (!projectPath) {
        set({ isOpen: true });
        return;
      }
      const tab = createTab(1, projectPath);
      set({ isOpen: true, tabs: [tab], activeTabId: tab.id, lastError: null });
      return;
    }
    set({ isOpen: true });
  },

  close: () => {
    set({ isOpen: false, tabs: [], activeTabId: null, lastError: null });
  },

  newSession: () => {
    const { tabs } = get();
    if (tabs.length === 0) {
      get().open();
      return;
    }
    const active = tabs.find((tab) => tab.id === get().activeTabId) ?? tabs[0];
    set({
      isOpen: true,
      tabs: tabs.map((tab) =>
        tab.id === active.id
          ? { ...tab, sessionKey: Date.now(), ptyId: undefined }
          : tab,
      ),
    });
  },

  addTab: () => {
    const projectPath = get().currentProjectPath.trim();
    if (!projectPath) return;
    const tab = createTab(get().tabs.length + 1, projectPath);
    set((state) => ({
      isOpen: true,
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
      lastError: null,
    }));
  },

  closeTab: (tabId) => {
    const { tabs } = get();
    if (tabs.length <= 1) {
      get().close();
      return;
    }
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    const activeTabId = get().activeTabId === tabId
      ? nextTabs[nextTabs.length - 1]?.id ?? null
      : get().activeTabId;
    set({ tabs: nextTabs, activeTabId });
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  setHeight: (height) => {
    const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height));
    localStorage.setItem(STORAGE_KEY, String(clamped));
    set({ height: clamped });
  },

  setLastError: (error) => {
    set({ lastError: error });
  },

  setTabPtyId: (tabId, ptyId) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, ptyId } : tab)),
    }));
  },

  resetTerminalPtyBindings: () => {
    const bumpTabs = (tabs: TerminalTab[]) =>
      tabs.map((tab) => ({ ...tab, ptyId: undefined, sessionKey: Date.now() }));

    set((state) => ({
      tabs: bumpTabs(state.tabs),
      byProject: Object.fromEntries(
        Object.entries(state.byProject).map(([key, snapshot]) => [
          key,
          { ...snapshot, tabs: bumpTabs(snapshot.tabs) },
        ]),
      ),
    }));
  },
}));

export function toggleEmbeddedTerminal(): void {
  syncTerminalProjectScope(useProjectStore.getState().currentProject.path);
  useTerminalStore.getState().toggle();
}

export function openEmbeddedTerminal(): void {
  syncTerminalProjectScope(useProjectStore.getState().currentProject.path);
  useTerminalStore.getState().open();
}

export function newEmbeddedTerminalSession(): void {
  syncTerminalProjectScope(useProjectStore.getState().currentProject.path);
  useTerminalStore.getState().newSession();
}

/** Keep terminal store aligned with the active OpenCode project directory. */
export function syncTerminalProjectScope(projectPath: string | undefined): void {
  const path = projectPath?.trim() ?? '';
  if (path === useTerminalStore.getState().currentProjectPath) return;
  useTerminalStore.getState().switchProject(path);
}

/** Drop cached PTY ids after opencode server restarts (dev reload / new port). */
export function resetTerminalPtyBindings(): void {
  useTerminalStore.getState().resetTerminalPtyBindings();
}
