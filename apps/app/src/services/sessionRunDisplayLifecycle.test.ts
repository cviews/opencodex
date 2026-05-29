import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubAgentItem, TeamInfo, TeamMember } from '../types';
import {
  evaluateLeadRunArtifacts,
  isLeadRunDisplayFullyCompleted,
  maybeClearCompletedRunArtifacts,
} from './sessionRunDisplayLifecycle';
import { useSessionStore } from '../stores/session';
import { useTeamStore } from '../stores/team';
import {
  resolveTaskSubAgentsForDisplay,
  resolveTeamMembersForDisplay,
} from './teamDisplay';

vi.mock('../stores/session', () => ({
  useSessionStore: { getState: vi.fn() },
}));

vi.mock('../stores/team', () => ({
  useTeamStore: { getState: vi.fn() },
}));

vi.mock('./teamDisplay', () => ({
  resolveTeamMembersForDisplay: vi.fn(),
  resolveTaskSubAgentsForDisplay: vi.fn(),
}));

vi.mock('./executionView', () => ({
  clearExecutionView: vi.fn(),
}));

const leadId = 'lead-session';

function mockStores({
  subAgents = [] as SubAgentItem[],
  sessionRunStatus = { [leadId]: 'idle' as const },
  runArtifactsCleared = {},
  teamModeEnabled = false,
  currentTeam = null as TeamInfo | null,
}: {
  subAgents?: SubAgentItem[];
  sessionRunStatus?: Record<string, 'idle' | 'running' | 'error'>;
  runArtifactsCleared?: Record<string, Partial<Record<'plan' | 'taskSubAgents' | 'team', boolean>>>;
  teamModeEnabled?: boolean;
  currentTeam?: TeamInfo | null;
}) {
  vi.mocked(useSessionStore.getState).mockReturnValue({
    sessions: [{ id: leadId, title: 'Lead' }],
    subAgents,
    sessionRunStatus,
    leadRunExcludedChildSessionIds: {},
    runArtifactsCleared,
    markRunArtifactCleared: vi.fn(),
    clearSubAgentsForLeadSession: vi.fn(),
    clearLeadRunExcludedChildren: vi.fn(),
  } as ReturnType<typeof useSessionStore.getState>);
  vi.mocked(useTeamStore.getState).mockReturnValue({
    teamModeEnabled,
    currentTeam,
    clearTeamRunScope: vi.fn(),
    deactivateSessionTeam: vi.fn(),
  } as ReturnType<typeof useTeamStore.getState>);
  vi.mocked(resolveTeamMembersForDisplay).mockReturnValue(
    currentTeam?.members ?? [],
  );
  vi.mocked(resolveTaskSubAgentsForDisplay).mockReturnValue(subAgents);
}

describe('evaluateLeadRunArtifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires plan steps to be marked completed, not merely current', () => {
    mockStores({});

    const snapshot = evaluateLeadRunArtifacts(leadId, {
      sessionPlans: {
        [leadId]: {
          title: 'Plan',
          steps: [
            { title: 'Step 1', status: 'completed' },
            { title: 'Step 2', status: 'current' },
          ],
        },
      },
      subAgentPlans: {},
    });

    expect(snapshot.hasPlan).toBe(true);
    expect(snapshot.planMarkedCompleted).toBe(false);
  });

  it('marks task sub-agents complete only when every agent status is completed', () => {
    const agents: SubAgentItem[] = [
      {
        id: 'a1',
        sessionId: 'c1',
        parentSessionId: leadId,
        title: 'Task (@explore subagent)',
        name: 'explore',
        status: 'completed',
      },
      {
        id: 'a2',
        sessionId: 'c2',
        parentSessionId: leadId,
        title: 'Task 2 (@explore subagent)',
        name: 'explore',
        status: 'running',
      },
    ];
    mockStores({ subAgents: agents });
    vi.mocked(resolveTaskSubAgentsForDisplay).mockReturnValue(agents);

    const snapshot = evaluateLeadRunArtifacts(leadId);
    expect(snapshot.hasTaskSubAgents).toBe(true);
    expect(snapshot.taskSubAgentsMarkedCompleted).toBe(false);
  });

  it('marks team complete when workers and tasks show completed', () => {
    const members: TeamMember[] = [
      {
        id: 'lead',
        agentId: 'lead',
        name: 'Lead',
        role: 'lead',
        status: 'idle',
        sessionID: leadId,
      },
      {
        id: 'w1',
        agentId: 'worker',
        name: 'Worker',
        role: 'worker',
        status: 'completed',
        sessionID: 'worker-1',
      },
    ];
    mockStores({
      teamModeEnabled: true,
      currentTeam: {
        id: 'team-1',
        name: 'Team',
        sessionId: leadId,
        state: 'active',
        tasks: [{ id: 't1', title: 'T1', status: 'completed', priority: 'medium' }],
        members,
      },
    });
    vi.mocked(resolveTeamMembersForDisplay).mockReturnValue(members);

    const snapshot = evaluateLeadRunArtifacts(leadId);
    expect(snapshot.hasTeam).toBe(true);
    expect(snapshot.teamMarkedCompleted).toBe(true);
  });
});

describe('maybeClearCompletedRunArtifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears only the plan artifact when plan is completed but sub-agents are not', () => {
    const markRunArtifactCleared = vi.fn();
    const agents: SubAgentItem[] = [
      {
        id: 'a1',
        sessionId: 'c1',
        parentSessionId: leadId,
        title: 'Task (@explore subagent)',
        name: 'explore',
        status: 'running',
      },
    ];
    mockStores({ subAgents: agents, runArtifactsCleared: {} });
    vi.mocked(useSessionStore.getState).mockReturnValue({
      sessions: [{ id: leadId, title: 'Lead' }],
      subAgents: agents,
      sessionRunStatus: { [leadId]: 'idle' },
      leadRunExcludedChildSessionIds: {},
      runArtifactsCleared: {},
      markRunArtifactCleared,
      clearSubAgentsForLeadSession: vi.fn(),
      clearLeadRunExcludedChildren: vi.fn(),
    } as ReturnType<typeof useSessionStore.getState>);
    vi.mocked(resolveTaskSubAgentsForDisplay).mockReturnValue(agents);

    const cleared = maybeClearCompletedRunArtifacts(leadId, {
      sessionPlans: {
        [leadId]: {
          title: 'Plan',
          steps: [{ title: 'Done', status: 'completed' }],
        },
      },
      subAgentPlans: {},
    });

    expect(cleared).toBe(true);
    expect(markRunArtifactCleared).toHaveBeenCalledWith(leadId, 'plan');
    expect(markRunArtifactCleared).not.toHaveBeenCalledWith(leadId, 'taskSubAgents');
  });
});

describe('isLeadRunDisplayFullyCompleted', () => {
  it('returns false while any present artifact is not marked completed', () => {
    mockStores({
      sessionRunStatus: { [leadId]: 'idle' },
    });

    expect(
      isLeadRunDisplayFullyCompleted(leadId, {
        sessionPlans: {
          [leadId]: {
            title: 'Plan',
            steps: [{ title: 'Step', status: 'pending' }],
          },
        },
        subAgentPlans: {},
      }),
    ).toBe(false);
  });
});
