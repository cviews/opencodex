import type { PlanData, SubAgentItem, TeamInfo, TeamMember } from '../types';
import { resolveTaskSubAgentsForDisplay, resolveTeamMembersForDisplay } from './teamDisplay';
import { useSessionStore } from '../stores/session';
import { useTeamStore } from '../stores/team';
import { clearExecutionView } from './executionView';

export interface LeadRunPlanSnapshot {
  sessionPlans: Record<string, PlanData>;
  subAgentPlans: Record<string, PlanData>;
}

type PlanClearHandler = (leadSessionId: string) => void;

let planClearHandler: PlanClearHandler | null = null;

export function setLeadRunPlanClearHandler(handler: PlanClearHandler | null): void {
  planClearHandler = handler;
}

export function isLeadSessionId(sessionId: string): boolean {
  const { sessions } = useSessionStore.getState();
  const session = sessions.find((s) => s.id === sessionId);
  if (session && !session.parentID?.trim()) return true;
  return useTeamStore.getState().currentTeam?.sessionId === sessionId;
}

function planStepsAllCompleted(plan?: PlanData | null): boolean {
  if (!plan?.steps.length) return true;
  return plan.steps.every((step) => step.status === 'completed');
}

function collectRunDisplayItems(
  leadSessionId: string,
  plans?: LeadRunPlanSnapshot,
): {
  workers: TeamMember[];
  tasks: TeamInfo['tasks'];
  taskSubAgents: SubAgentItem[];
  hadArtifacts: boolean;
} {
  const sessionStore = useSessionStore.getState();
  const { teamModeEnabled, currentTeam } = useTeamStore.getState();
  const subAgents = sessionStore.subAgents;
  const sessionRunStatus = sessionStore.sessionRunStatus;

  const displayMembers =
    teamModeEnabled && currentTeam
      ? resolveTeamMembersForDisplay(currentTeam, subAgents, leadSessionId, sessionRunStatus)
      : [];
  const workers = displayMembers.filter((member) => member.role !== 'lead');
  const taskSubAgents = resolveTaskSubAgentsForDisplay(
    teamModeEnabled ? currentTeam : null,
    subAgents,
    leadSessionId,
    undefined,
  );
  const tasks = currentTeam?.sessionId === leadSessionId ? currentTeam.tasks : [];

  const leadPlan = plans?.sessionPlans[leadSessionId];
  const hasPlanSteps =
    !!leadPlan?.steps.length
    || taskSubAgents.some((agent) => (plans?.subAgentPlans[agent.id]?.steps.length ?? 0) > 0);

  const hadArtifacts =
    workers.length > 0
    || tasks.length > 0
    || taskSubAgents.length > 0
    || hasPlanSteps;

  return { workers, tasks, taskSubAgents, hadArtifacts };
}

export function isLeadRunDisplayFullyCompleted(
  leadSessionId: string,
  plans?: LeadRunPlanSnapshot,
): boolean {
  const runStatus = useSessionStore.getState().sessionRunStatus[leadSessionId];
  if (runStatus !== 'idle' && runStatus !== 'error') return false;

  const { workers, tasks, taskSubAgents, hadArtifacts } = collectRunDisplayItems(leadSessionId, plans);
  if (!hadArtifacts) return true;

  if (workers.length > 0 && !workers.every((member) => member.status === 'completed')) {
    return false;
  }

  if (tasks.length > 0 && !tasks.every((task) => task.status === 'completed')) {
    return false;
  }

  if (taskSubAgents.length > 0 && !taskSubAgents.every((agent) => agent.status === 'completed')) {
    return false;
  }

  if (plans) {
    const leadPlan = plans.sessionPlans[leadSessionId];
    if (!planStepsAllCompleted(leadPlan)) return false;

    for (const agent of taskSubAgents) {
      if (!planStepsAllCompleted(plans.subAgentPlans[agent.id])) return false;
    }
  }

  return true;
}

export function isRunSidebarHidden(leadSessionId: string): boolean {
  const { runSidebarCleared, sessionRunStatus } = useSessionStore.getState();
  if (!runSidebarCleared[leadSessionId]) return false;
  const runStatus = sessionRunStatus[leadSessionId];
  return runStatus === 'idle' || runStatus === 'error';
}

export function clearLeadSessionRunDisplay(leadSessionId: string): void {
  if (!leadSessionId) return;
  useSessionStore.getState().clearSubAgentsForLeadSession(leadSessionId);
  useSessionStore.getState().markRunSidebarCleared(leadSessionId);
  useTeamStore.getState().clearTeamRunScope(leadSessionId);
  useTeamStore.getState().deactivateSessionTeam(leadSessionId);
  planClearHandler?.(leadSessionId);
  clearExecutionView();
}

export function resetLeadSessionForNewRun(leadSessionId: string): void {
  if (!leadSessionId) return;
  useSessionStore.getState().markRunSidebarVisible(leadSessionId);
  useSessionStore.getState().clearSubAgentsForLeadSession(leadSessionId);
  useTeamStore.getState().clearTeamRunScope(leadSessionId);
  planClearHandler?.(leadSessionId);
  clearExecutionView();
}

export function maybeClearCompletedLeadRunDisplay(
  leadSessionId: string,
  plans?: LeadRunPlanSnapshot,
): boolean {
  if (!leadSessionId || isRunSidebarHidden(leadSessionId)) return false;
  if (!isLeadRunDisplayFullyCompleted(leadSessionId, plans)) return false;
  clearLeadSessionRunDisplay(leadSessionId);
  return true;
}
