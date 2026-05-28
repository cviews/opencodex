import { create } from 'zustand';
import type { Agent, Team } from '../types';
import { opencodeAgent } from '../services/opencodeAdapter';

export type { Agent, Team };

export function getCustomAgents(agents: Agent[]): Agent[] {
  return agents.filter((agent) => agent.sourceType === 'custom');
}

interface AgentState {
  agents: Agent[];
  teams: Team[];
  loading: boolean;
  error: string | null;

  setAgents: (agents: Agent[]) => void;
  addAgent: (agent: Agent) => Promise<void>;
  updateAgent: (id: string, updates: Partial<Agent>) => Promise<void>;
  removeAgent: (id: string) => Promise<void>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchAgents: () => Promise<void>;

  setTeams: (teams: Team[]) => void;
  addTeam: (team: Team) => Promise<void>;
  updateTeam: (id: string, updates: Partial<Team>) => Promise<void>;
  removeTeam: (id: string) => Promise<void>;
  toggleTeamExpanded: (id: string) => void;
  addAgentToTeam: (teamId: string, agentId: string) => void;
  removeAgentFromTeam: (teamId: string, agentId: string) => void;
  fetchTeams: () => Promise<void>;
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  teams: [],
  loading: false,
  error: null,

  setAgents: (agents) => set({ agents, loading: false, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  addAgent: async (agent) => {
    const ok = await opencodeAgent.addAgent(agent);
    if (ok) {
      set((state) => ({ agents: [...state.agents, agent] }));
    } else {
      set({ error: '保存 agent 配置失败' });
    }
  },
  updateAgent: async (id, updates) => {
    const ok = await opencodeAgent.updateAgent(id, updates);
    if (ok) {
      set((state) => ({
        agents: state.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
      }));
    } else {
      set({ error: '更新 agent 配置失败' });
    }
  },
  removeAgent: async (id) => {
    const ok = await opencodeAgent.removeAgent(id);
    if (ok) {
      set((state) => ({
        agents: state.agents.filter((a) => a.id !== id),
        teams: state.teams.map((t) => ({ ...t, agentIds: t.agentIds.filter((aid) => aid !== id) })),
      }));
    } else {
      set({ error: '删除 agent 配置失败' });
    }
  },

  fetchAgents: async () => {
    set({ loading: true, error: null });
    try {
      const agents = await opencodeAgent.fetchAgents();
      set({ agents, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  setTeams: (teams) => set({ teams }),
  addTeam: async (team) => {
    const ok = await opencodeAgent.addTeam(team);
    if (ok) {
      set((state) => ({ teams: [...state.teams, team] }));
    } else {
      set({ error: '保存 team 配置失败' });
    }
  },
  updateTeam: async (id, updates) => {
    const ok = await opencodeAgent.updateTeam(id, updates);
    if (ok) {
      set((state) => ({
        teams: state.teams.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      }));
    } else {
      set({ error: '更新 team 配置失败' });
    }
  },
  removeTeam: async (id) => {
    const ok = await opencodeAgent.removeTeam(id);
    if (ok) {
      set((state) => ({ teams: state.teams.filter((t) => t.id !== id) }));
    } else {
      set({ error: '删除 team 配置失败' });
    }
  },
  toggleTeamExpanded: (id) => set((state) => ({ teams: state.teams.map((t) => t.id === id ? { ...t, expanded: !t.expanded } : t) })),
  addAgentToTeam: (teamId, agentId) => set((state) => ({ teams: state.teams.map((t) => t.id === teamId ? { ...t, agentIds: [...t.agentIds, agentId] } : t) })),
  removeAgentFromTeam: (teamId, agentId) => set((state) => ({ teams: state.teams.map((t) => t.id === teamId ? { ...t, agentIds: t.agentIds.filter((aid) => aid !== agentId) } : t) })),

  fetchTeams: async () => {
    try {
      const teams = await opencodeAgent.fetchTeams();
      set({ teams });
    } catch (e) {
      console.error('[AgentStore] fetchTeams failed:', e);
    }
  },
}));
