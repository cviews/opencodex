import { create } from 'zustand';

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
}

interface TerminalState {
  isOpen: boolean;
  height: number;
  tabs: TerminalTab[];
  activeTabId: string | null;
  lastError: string | null;
  toggle: () => void;
  open: () => void;
  close: () => void;
  newSession: () => void;
  addTab: () => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setHeight: (height: number) => void;
  setLastError: (error: string | null) => void;
}

function createTab(index: number): TerminalTab {
  return {
    id: nextTabId(),
    index,
    sessionKey: Date.now(),
  };
}

export const TERMINAL_MIN_HEIGHT = MIN_HEIGHT;
export const TERMINAL_MAX_HEIGHT = MAX_HEIGHT;

export const useTerminalStore = create<TerminalState>((set, get) => ({
  isOpen: false,
  height: loadHeight(),
  tabs: [],
  activeTabId: null,
  lastError: null,

  toggle: () => {
    const { isOpen } = get();
    if (isOpen) {
      set({ isOpen: false });
      return;
    }
    get().open();
  },

  open: () => {
    const { tabs } = get();
    if (tabs.length === 0) {
      const tab = createTab(1);
      set({ isOpen: true, tabs: [tab], activeTabId: tab.id });
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
        tab.id === active.id ? { ...tab, sessionKey: Date.now() } : tab,
      ),
    });
  },

  addTab: () => {
    const tab = createTab(get().tabs.length + 1);
    set((state) => ({
      isOpen: true,
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
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
}));

export function toggleEmbeddedTerminal(): void {
  useTerminalStore.getState().toggle();
}

export function openEmbeddedTerminal(): void {
  useTerminalStore.getState().open();
}

export function newEmbeddedTerminalSession(): void {
  useTerminalStore.getState().newSession();
}
