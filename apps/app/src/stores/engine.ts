import { create } from 'zustand';

interface EngineState {
  status: 'idle' | 'starting' | 'running' | 'error';
  serverUrl: string | null;
  error: string | null;
  port: number;
  hostname: string;

  setStarting: () => void;
  setRunning: (url: string) => void;
  setError: (error: string) => void;
  setIdle: () => void;
}

export const useEngineStore = create<EngineState>((set) => ({
  status: 'idle',
  serverUrl: null,
  error: null,
  port: 4096,
  hostname: '127.0.0.1',

  setStarting: () => set({ status: 'starting', error: null }),
  setRunning: (url) => set({ status: 'running', serverUrl: url, error: null }),
  setError: (error) => set({ status: 'error', error }),
  setIdle: () => set({ status: 'idle', serverUrl: null, error: null }),
}));
