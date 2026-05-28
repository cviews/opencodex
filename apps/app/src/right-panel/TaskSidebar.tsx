import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { t } from '../constants/i18n';
import { CollapsibleSection } from './CollapsibleSection';
import { PlanStep } from './PlanStep';
import { useSessionStore } from '../stores/session';
import { useProjectStore } from '../stores/project';
import { useTeamStore } from '../stores/team';
import { opencodeSession, opencodeTeam } from '../services/opencodeAdapter';
import { on, EventType, extractEventPayload } from '../sdk/eventRouter';
import { selectTeamMember, selectSubAgent } from '../services/executionView';
import { memberDisplayName, resolveTaskSubAgentsForDisplay, resolveTeamMembersForDisplay } from '../services/teamDisplay';
import {
  isRunSidebarHidden,
  maybeClearCompletedLeadRunDisplay,
  setLeadRunPlanClearHandler,
} from '../services/sessionRunDisplayLifecycle';
import { useMessageStore } from '../stores/message';
import {
  teamMemberBadgeStyle,
  TeamMemberStatusKeyframes,
  TeamMemberWorkingList,
} from '../components/teamMemberStatus';
import type { TeamTaskStatus } from '../types';

interface CollapsedState {
  teamTasks: boolean;
  plan: boolean;
}

const INITIAL_SESSION_PLANS = opencodeSession.getSessionPlans();
const INITIAL_SUB_AGENT_PLANS = opencodeSession.getSubAgentPlans();

const TASK_BAR_COLOR: Record<TeamTaskStatus, string> = {
  in_progress: '#2B8FFF',
  pending: '#9A9A9A',
  blocked: '#F59E0B',
  completed: '#10A37F',
};

const PRIORITY_DOT: Record<string, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#9A9A9A',
};

const TASK_SORT_ORDER: Record<TeamTaskStatus, number> = {
  in_progress: 0,
  pending: 1,
  blocked: 2,
  completed: 3,
};


export function TaskSidebar() {
  const [collapsed, setCollapsed] = useState<CollapsedState>({
    teamTasks: false,
    plan: false,
  });
  const [sessionPlans, setSessionPlans] = useState(INITIAL_SESSION_PLANS);
  const [subAgentPlans, setSubAgentPlans] = useState(INITIAL_SUB_AGENT_PLANS);

  const toggle = (key: keyof CollapsedState) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const { activeSessionId, subAgents, selectedSubAgentId, fetchSubAgents, sessions, sessionRunStatus, sessionRunStartedAt } = useSessionStore();
  const sessionActivity = useMessageStore((s) => s.sessionActivity);
  const { currentTeam, setCurrentTeamBySession, teamModeEnabled, selectedMemberId, setActiveTeams } = useTeamStore();

  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  const lastTodoUpdatedAtRef = useRef<Record<string, number>>({});
  const subAgentPlanKeysByParentRef = useRef<Record<string, Set<string>>>({});

  const refreshPlans = useCallback(() => {
    const directory = useProjectStore.getState().currentProject.path?.trim() || undefined;
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    opencodeSession.fetchSessionPlans(directory, [sid]).then((plans) => {
      setSessionPlans((prev) => {
        const next = { ...prev };
        if (plans[sid]) {
          next[sid] = plans[sid];
        } else {
          delete next[sid];
        }
        return next;
      });
    }).catch(() => {});
    opencodeSession.fetchSubAgentPlans(directory, [sid]).then((plans) => {
      setSubAgentPlans((prev) => {
        const next = { ...prev };
        const childIds = useSessionStore
          .getState()
          .subAgents.filter((agent) => agent.parentSessionId === sid)
          .map((agent) => agent.id);
        const tracked = subAgentPlanKeysByParentRef.current[sid] ?? new Set<string>();
        for (const id of childIds) {
          tracked.add(id);
        }
        subAgentPlanKeysByParentRef.current[sid] = tracked;
        for (const id of tracked) {
          if (plans[id]) {
            next[id] = plans[id];
          } else {
            delete next[id];
          }
        }
        return next;
      });
    }).catch(() => {});
  }, []);

  const clearPlansForSession = useCallback((sessionID: string) => {
    if (!sessionID) return;
    setSessionPlans((prev) => {
      if (!prev[sessionID]) return prev;
      const next = { ...prev };
      delete next[sessionID];
      return next;
    });
    setSubAgentPlans((prev) => {
      const tracked = subAgentPlanKeysByParentRef.current[sessionID];
      const childIds = useSessionStore
        .getState()
        .subAgents.filter((agent) => agent.parentSessionId === sessionID)
        .map((agent) => agent.id);
      const keysToClear = new Set([...(tracked ?? []), ...childIds]);
      if (keysToClear.size === 0) return prev;
      const next = { ...prev };
      for (const id of keysToClear) {
        delete next[id];
      }
      subAgentPlanKeysByParentRef.current[sessionID] = new Set();
      return next;
    });
  }, []);

  const refreshTeam = useCallback(async () => {
    const leadId =
      useTeamStore.getState().currentTeam?.sessionId
      ?? activeSessionIdRef.current;
    if (leadId) {
      await setCurrentTeamBySession(leadId);
    }
    const teams = await opencodeTeam.fetchActiveTeams();
    if (teams.length > 0) {
      setActiveTeams(teams);
    }
  }, [setCurrentTeamBySession, setActiveTeams]);

  useEffect(() => {
    setLeadRunPlanClearHandler((leadSessionId) => {
      clearPlansForSession(leadSessionId);
    });
    return () => setLeadRunPlanClearHandler(null);
  }, [clearPlansForSession]);

  useEffect(() => {
    refreshPlans();
  }, [refreshPlans]);

  useEffect(() => {
    if (activeSessionId) {
      void setCurrentTeamBySession(activeSessionId);
    }
  }, [activeSessionId, setCurrentTeamBySession]);

  useEffect(() => {
    if (!activeSessionId) return;
    const runStartedAt = sessionRunStartedAt[activeSessionId];
    if (!runStartedAt) return;
    clearPlansForSession(activeSessionId);
    void refreshTeam();
    fetchSubAgents();
  }, [activeSessionId, sessionRunStartedAt, clearPlansForSession, refreshTeam, fetchSubAgents]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      on(EventType.TODO_UPDATED, (event) => {
        const props = extractEventPayload(event as Record<string, unknown>);
        const sessionID = String(props.sessionID ?? props.sessionId ?? '').trim();
        if (sessionID) {
          lastTodoUpdatedAtRef.current[sessionID] = Date.now();
        }
        refreshPlans();
      }),
    );

    unsubs.push(
      on(EventType.SESSION_CREATED, () => {
        fetchSubAgents();
        refreshPlans();
      }),
    );

    unsubs.push(
      on(EventType.SESSION_IDLE, () => {
        refreshPlans();
        refreshTeam();
        fetchSubAgents();
      }),
    );

    unsubs.push(
      on('*', (event) => {
        const eventType = typeof event.type === 'string' ? event.type : '';
        if (eventType === 'team.created' || eventType === 'team.member.spawned') {
          refreshTeam();
          fetchSubAgents();
          return;
        }
        if (eventType === 'team.member.status' || eventType === 'team.member.execution') {
          refreshTeam();
          return;
        }
        if (eventType === 'team.task.updated' || eventType === 'team.task.created' || eventType === 'team.task.claimed') {
          refreshTeam();
          return;
        }
        if (eventType === 'team.message' || eventType === 'team.broadcast') {
          refreshTeam();
        }
      }),
    );

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [refreshPlans, refreshTeam, fetchSubAgents, clearPlansForSession]);

  const leadSessionIdle = activeSessionId
    ? sessionRunStatus[activeSessionId] === 'idle' || sessionRunStatus[activeSessionId] === 'error'
    : false;
  const runSidebarHidden = activeSessionId ? isRunSidebarHidden(activeSessionId) : false;

  useEffect(() => {
    if (!activeSessionId || !leadSessionIdle || runSidebarHidden) return;
    const timer = window.setTimeout(() => {
      maybeClearCompletedLeadRunDisplay(activeSessionId, {
        sessionPlans,
        subAgentPlans,
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    activeSessionId,
    leadSessionIdle,
    runSidebarHidden,
    sessionPlans,
    subAgentPlans,
    currentTeam,
    subAgents,
    sessionRunStatus,
  ]);

  const currentRunStartedAt = activeSessionId ? sessionRunStartedAt[activeSessionId] : undefined;

  const sessionPlan = activeSessionId ? sessionPlans[activeSessionId] : null;
  const displayMembers = useMemo(
    () => (currentTeam && activeSessionId
      ? resolveTeamMembersForDisplay(currentTeam, subAgents, activeSessionId, sessionRunStatus)
      : []),
    [currentTeam, subAgents, activeSessionId, sessionRunStatus],
  );

  const taskSubAgents = useMemo(
    () => (currentTeam && activeSessionId
      ? resolveTaskSubAgentsForDisplay(currentTeam, subAgents, activeSessionId, currentRunStartedAt)
      : activeSessionId
        ? resolveTaskSubAgentsForDisplay(null, subAgents, activeSessionId, currentRunStartedAt)
        : []),
    [currentTeam, subAgents, activeSessionId, currentRunStartedAt],
  );

  const teamWorkers = displayMembers.filter((m) => m.role !== 'lead');

  const selectedMember = teamModeEnabled && displayMembers.length > 0 && selectedMemberId
    ? displayMembers.find(m => m.id === selectedMemberId)
    : null;

  const selectedSubAgent = selectedSubAgentId
    ? subAgents.find((a) => a.id === selectedSubAgentId)
    : null;

  const effectiveSessionId = selectedMember
    ? selectedMember.sessionID
    : selectedSubAgent
      ? selectedSubAgent.sessionId
      : activeSessionId;

  const planData = effectiveSessionId
    ? sessionPlans[effectiveSessionId] ?? (effectiveSessionId !== activeSessionId ? null : sessionPlan)
    : sessionPlan;

  const planAgentId = selectedSubAgentId ?? taskSubAgents.find((a) => a.status === 'running')?.id;
  const planDataResolved = planAgentId
    ? subAgentPlans[planAgentId] ?? planData
    : planData;

  const planSessionId = planAgentId ?? activeSessionId;
  const planUpdatedThisRun = !planSessionId
    || !currentRunStartedAt
    || Math.max(
      lastTodoUpdatedAtRef.current[planSessionId] ?? 0,
      activeSessionId ? (lastTodoUpdatedAtRef.current[activeSessionId] ?? 0) : 0,
    ) >= currentRunStartedAt;

  const planStillActive = !!planDataResolved && (
    !currentRunStartedAt || planUpdatedThisRun
  );

  const displayTaskSubAgents = taskSubAgents;

  const sortedTasks = teamModeEnabled && currentTeam
    ? [...currentTeam.tasks].sort((a, b) => TASK_SORT_ORDER[a.status] - TASK_SORT_ORDER[b.status])
    : [];

  const displayTasks = sortedTasks;

  const workingCount = teamModeEnabled && teamWorkers.length > 0
    ? teamWorkers.filter((m) => m.status === 'working').length
    : 0;

  const leadSessionTitle = activeSessionId
    ? sessions.find((session) => session.id === activeSessionId)?.title
    : undefined;

  if (runSidebarHidden) {
    return (
      <div className="px-3 py-4 text-xs text-[#9A9A9A]">
        {activeSessionId ? t('task_no_plan') : t('task_select_session')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {teamModeEnabled && currentTeam && (
        <CollapsibleSection
          title="Team Tasks"
          collapsed={collapsed.teamTasks}
          onToggle={() => toggle('teamTasks')}
        >
          <div className="flex flex-col gap-2 ml-2">
            {teamWorkers.length > 0 && (
              <div className="text-[10px] font-medium text-[#6B6B6B] uppercase tracking-wide">
                团队成员
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <div className="flex -space-x-1">
                {displayMembers.map((member) => (
                  <div
                    key={member.id}
                    onClick={() => selectTeamMember(member.id)}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[8px] font-semibold cursor-pointer transition-all ${
                      member.role === 'lead'
                        ? 'bg-[#2B8FFF] text-white border-[#2B8FFF]'
                        : 'bg-[#F0F0F0] text-[#1F1F1F]'
                    } ${
                      selectedMemberId === member.id ? 'ring-2 ring-[#2B8FFF] ring-offset-1' : ''
                    } ${
                      member.status === 'completed' && member.role !== 'lead' ? 'opacity-80' : ''
                    }`}
                    style={teamMemberBadgeStyle(member.status, member.role === 'lead')}
                    title={
                      member.status === 'working'
                        ? '执行中'
                        : member.status === 'completed'
                          ? '已完成'
                          : undefined
                    }
                  >
                    {member.role === 'lead' ? '★' : member.name.charAt(0)}
                  </div>
                ))}
              </div>
              <span className="text-[10px] text-[#9A9A9A] ml-1">
                {teamWorkers.length === 0
                  ? '无成员'
                  : workingCount > 0
                    ? `${workingCount}/${teamWorkers.length} 进行中`
                    : `${teamWorkers.length} 人 · 空闲`}
              </span>
            </div>

            <TeamMemberWorkingList
              members={displayMembers}
              sessionActivity={sessionActivity}
              memberName={(member) => memberDisplayName(member, leadSessionTitle)}
              onSelect={selectTeamMember}
            />
            <TeamMemberStatusKeyframes />

            <div className="flex flex-col gap-0.5">
              {displayTasks.map((task) => {
                const assignee = task.assigneeId
                  ? displayMembers.find((m) => m.id === task.assigneeId)
                  : undefined;
                const isCompleted = task.status === 'completed';

                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-1.5 py-0.5 text-xs"
                    style={{ opacity: isCompleted ? 0.5 : 1 }}
                  >
                    <div
                      className="w-0.5 self-stretch rounded-full shrink-0"
                      style={{ backgroundColor: TASK_BAR_COLOR[task.status] }}
                    />
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: PRIORITY_DOT[task.priority] }}
                    />
                    <span
                      className={`flex-1 truncate text-[#1F1F1F] ${
                        isCompleted ? 'line-through' : ''
                      }`}
                    >
                      {task.title}
                    </span>
                    {assignee && (
                      <span className="text-[10px] text-[#9A9A9A] shrink-0">
                        {assignee.name}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CollapsibleSection>
      )}

      {planStillActive ? (
        <CollapsibleSection
          title={
            selectedSubAgent
              ? `${selectedSubAgent.title} 计划`
              : selectedMember
                ? `${selectedMember.name} 计划`
                : '计划'
          }
          collapsed={collapsed.plan}
          onToggle={() => toggle('plan')}
        >
          <div className="flex flex-col gap-1 ml-2">
            {planDataResolved!.steps.map((step, idx) => (
              <PlanStep key={`${step.title}-${idx}`} title={step.title} status={step.status} />
            ))}
          </div>
        </CollapsibleSection>
      ) : (
        <div className="text-xs text-[#9A9A9A] px-3 py-4">
          {activeSessionId ? t('task_no_plan') : t('task_select_session')}
        </div>
      )}

      {displayTaskSubAgents.length > 0 && (
        <CollapsibleSection
          title="Task 子 Agent"
          collapsed={false}
          onToggle={() => {}}
        >
          <div className="flex flex-col gap-1 ml-2">
            {displayTaskSubAgents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => {
                  if (currentTeam) {
                    const member = displayMembers.find((m) => m.sessionID === agent.sessionId);
                    if (member && member.role !== 'lead') {
                      selectTeamMember(member.id);
                      return;
                    }
                  }
                  selectSubAgent(agent.id);
                }}
                className={`flex items-center gap-1.5 py-1 text-xs cursor-pointer rounded px-1 transition-colors ${
                  selectedSubAgentId === agent.id
                    ? 'bg-[#EEF4FF] text-[#2B8FFF] font-medium'
                    : agent.status === 'running'
                    ? 'text-[#2B8FFF]'
                    : agent.status === 'completed'
                    ? 'text-[#6B6B6B]'
                    : 'text-[#9A9A9A]'
                }`}
              >
                {agent.status === 'running' ? (
                  <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                  </svg>
                ) : agent.status === 'completed' ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#10A37F" strokeWidth="2" />
                    <path d="M8 12l2.5 2.5L16 9" stroke="#10A37F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  </svg>
                )}
                <span className="flex-1 truncate">{agent.title}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
