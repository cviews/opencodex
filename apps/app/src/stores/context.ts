import { create } from 'zustand';

interface ContextUsage {
  percentage: number;
  pinnedCount: number;
  subprocessCount: number;
  model: string | null;
  provider: string | null;
  mode: string | null;
}

interface ContextState {
  usage: ContextUsage;
  sessionId: string | null;
  cwd: string | null;

  setUsage: (usage: ContextUsage) => void;
  setSessionInfo: (sessionId: string | null, cwd: string | null) => void;
}

const defaultUsage: ContextUsage = {
  percentage: 0,
  pinnedCount: 0,
  subprocessCount: 0,
  model: null,
  provider: null,
  mode: null,
};

export const useContextStore = create<ContextState>((set) => ({
  usage: defaultUsage,
  sessionId: null,
  cwd: null,

  setUsage: (usage) => set({ usage }),
  setSessionInfo: (sessionId, cwd) => set({ sessionId, cwd }),
}));
