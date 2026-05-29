import type { PlanData, SubAgentItem, TeamInfo, TeamMember } from '../types';
import { resolveTaskSubAgentsForDisplay, resolveTeamMembersForDisplay } from './teamDisplay';
import { useSessionStore } from '../stores/session';
import { useTeamStore } from '../stores/team';
import { clearExecutionView } from './executionView';

export type RunArtifactKind = 'plan' | 'taskSubAgents' | 'team';

export interface LeadRunPlanSnapshot {
  sessionPlans: Record<string, PlanData>;
  subAgentPlans: Record<string, PlanData>;
}

export interface LeadRunArtifactSnapshot {
  leadRunEnded: boolean;
  hasPlan: boolean;
  planMarkedCompleted: boolean;
  hasTaskSubAgents: boolean;
  taskSubAgentsMarkedCompleted: boolean;
  hasTeam: boolean;
  teamMarkedCompleted: boolean;
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

/** Matches sidebar plan step UI: every step shows completed. */
function planMarkedCompleted(plan: PlanData | null | undefined): boolean {
  if (!plan?.steps.length) return false;
  return plan.steps.every((step) => step.status === 'completed');
}

function collectArtifactContext(
  leadSessionId: string,
  plans?: LeadRunPlanSnapshot,
): {
  workers: TeamMember[];
  tasks: TeamInfo['tasks'];
  taskSubAgents: SubAgentItem[];
  leadPlan: PlanData | undefined;
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
  );
  const tasks = currentTeam?.sessionId === leadSessionId ? currentTeam.tasks : [];
  const leadPlan = plans?.sessionPlans[leadSessionId];

  return { workers, tasks, taskSubAgents, leadPlan };
}

/** Per-session artifact presence and whether sidebar completion markers are all done. */
export function evaluateLeadRunArtifacts(
  leadSessionId: string,
  plans?: LeadRunPlanSnapshot,
): LeadRunArtifactSnapshot {
  const runStatus = useSessionStore.getState().sessionRunStatus[leadSessionId];
  const leadRunEnded = runStatus === 'idle' || runStatus === 'error';

  const { teamModeEnabled, currentTeam } = useTeamStore.getState();
  const { workers, tasks, taskSubAgents, leadPlan } = collectArtifactContext(leadSessionId, plans);

  const subAgentPlansWithSteps = taskSubAgents.filter(
    (agent) => (plans?.subAgentPlans[agent.id]?.steps.length ?? 0) > 0,
  );
  const hasLeadPlan = !!leadPlan?.steps.length;
  const hasPlan = hasLeadPlan || subAgentPlansWithSteps.length > 0;

  let planMarkedDone = true;
  if (hasLeadPlan && !planMarkedCompleted(leadPlan)) {
    planMarkedDone = false;
  }
  for (const agent of subAgentPlansWithSteps) {
    if (!planMarkedCompleted(plans?.subAgentPlans[agent.id])) {
      planMarkedDone = false;
      break;
    }
  }
  if (!hasPlan) {
    planMarkedDone = false;
  }

  const hasTaskSubAgents = taskSubAgents.length > 0;
  const taskSubAgentsMarkedDone =
    hasTaskSubAgents && taskSubAgents.every((agent) => agent.status === 'completed');

  const hasTeam =
    teamModeEnabled
    && !!currentTeam
    && currentTeam.sessionId === leadSessionId;
  const teamMarkedDone =
    hasTeam
    && workers.every((member) => member.status === 'completed')
    && (tasks.length === 0 || tasks.every((task) => task.status === 'completed'));

  return {
    leadRunEnded,
    hasPlan,
    planMarkedCompleted: planMarkedDone,
    hasTaskSubAgents,
    taskSubAgentsMarkedCompleted: taskSubAgentsMarkedDone,
    hasTeam,
    teamMarkedCompleted: teamMarkedDone,
  };
}

export function isRunArtifactCleared(leadSessionId: string, kind: RunArtifactKind): boolean {
  return !!useSessionStore.getState().runArtifactsCleared[leadSessionId]?.[kind];
}

/** True when lead run ended and every present artifact type has been cleared from sidebars. */
export function isRunSidebarHidden(leadSessionId: string, plans?: LeadRunPlanSnapshot): boolean {
  const snapshot = evaluateLeadRunArtifacts(leadSessionId, plans);
  if (!snapshot.leadRunEnded) return false;

  if (snapshot.hasPlan && !isRunArtifactCleared(leadSessionId, 'plan')) return false;
  if (snapshot.hasTaskSubAgents && !isRunArtifactCleared(leadSessionId, 'taskSubAgents')) {
    return false;
  }
  if (snapshot.hasTeam && !isRunArtifactCleared(leadSessionId, 'team')) return false;
  return true;
}

function clearRunArtifact(leadSessionId: string, kind: RunArtifactKind): void {
  useSessionStore.getState().markRunArtifactCleared(leadSessionId, kind);

  switch (kind) {
    case 'plan':
      planClearHandler?.(leadSessionId);
      break;
    case 'taskSubAgents':
      useSessionStore.getState().clearSubAgentsForLeadSession(leadSessionId);
      useSessionStore.getState().clearLeadRunExcludedChildren(leadSessionId);
      break;
    case 'team':
      useTeamStore.getState().clearTeamRunScope(leadSessionId);
      useTeamStore.getState().deactivateSessionTeam(leadSessionId);
      break;
  }
}

/** After lead run ends, clear each artifact block once its sidebar markers are all completed. */
export function maybeClearCompletedRunArtifacts(
  leadSessionId: string,
  plans?: LeadRunPlanSnapshot,
): boolean {
  if (!leadSessionId) return false;

  const snapshot = evaluateLeadRunArtifacts(leadSessionId, plans);
  if (!snapshot.leadRunEnded) return false;

  let clearedAny = false;

  if (
    snapshot.hasPlan
    && snapshot.planMarkedCompleted
    && !isRunArtifactCleared(leadSessionId, 'plan')
  ) {
    clearRunArtifact(leadSessionId, 'plan');
    clearedAny = true;
  }

  if (
    snapshot.hasTaskSubAgents
    && snapshot.taskSubAgentsMarkedCompleted
    && !isRunArtifactCleared(leadSessionId, 'taskSubAgents')
  ) {
    clearRunArtifact(leadSessionId, 'taskSubAgents');
    clearedAny = true;
  }

  if (
    snapshot.hasTeam
    && snapshot.teamMarkedCompleted
    && !isRunArtifactCleared(leadSessionId, 'team')
  ) {
    clearRunArtifact(leadSessionId, 'team');
    clearedAny = true;
  }

  if (isRunSidebarHidden(leadSessionId, plans)) {
    clearExecutionView();
  }

  return clearedAny;
}

/** @deprecated alias */
export function maybeClearCompletedLeadRunDisplay(
  leadSessionId: string,
  plans?: LeadRunPlanSnapshot,
): boolean {
  return maybeClearCompletedRunArtifacts(leadSessionId, plans);
}

export function isLeadRunDisplayFullyCompleted(
  leadSessionId: string,
  plans?: LeadRunPlanSnapshot,
): boolean {
  const snapshot = evaluateLeadRunArtifacts(leadSessionId, plans);
  if (!snapshot.leadRunEnded) return false;
  if (snapshot.hasPlan && !snapshot.planMarkedCompleted) return false;
  if (snapshot.hasTaskSubAgents && !snapshot.taskSubAgentsMarkedCompleted) return false;
  if (snapshot.hasTeam && !snapshot.teamMarkedCompleted) return false;
  return true;
}

export function resetLeadSessionForNewRun(leadSessionId: string): void {
  if (!leadSessionId) return;
  useSessionStore.getState().captureLeadRunExcludedChildren(leadSessionId);
  useSessionStore.getState().resetRunArtifactsCleared(leadSessionId);
  useSessionStore.getState().clearSubAgentsForLeadSession(leadSessionId);
  useTeamStore.getState().clearTeamRunScope(leadSessionId);
  planClearHandler?.(leadSessionId);
  clearExecutionView();
}
