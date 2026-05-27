import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { t } from '../constants/i18n';
import { CollapsibleSection } from './CollapsibleSection';
import { PlanStep } from './PlanStep';
import { useSessionStore } from '../stores/session';
import { useProjectStore } from '../stores/project';
import { useTeamStore } from '../stores/team';
import { opencodeSession, opencodeTeam } from '../services/opencodeAdapter';
import { on, EventType } from '../sdk/eventRouter';
import { selectTeamMember, selectSubAgent } from '../services/executionView';
import { memberDisplayName, resolveTaskSubAgentsForDisplay, resolveTeamMembersForDisplay } from '../services/teamDisplay';
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

  const { activeSessionId, subAgents, selectedSubAgentId, fetchSubAgents, sessions } = useSessionStore();
  const sessionActivity = useMessageStore((s) => s.sessionActivity);
  const { currentTeam, setCurrentTeamBySession, teamModeEnabled, selectedMemberId, setActiveTeams } = useTeamStore();

  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  const refreshPlans = useCallback(() => {
    const directory = useProjectStore.getState().currentProject.path?.trim() || undefined;
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    opencodeSession.fetchSessionPlans(directory, [sid]).then((plans) => {
      setSessionPlans((prev) => ({ ...prev, ...plans }));
    }).catch(() => {});
    opencodeSession.fetchSubAgentPlans(directory, [sid]).then((plans) => {
      setSubAgentPlans((prev) => ({ ...prev, ...plans }));
    }).catch(() => {});
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
    refreshPlans();
  }, [refreshPlans]);

  useEffect(() => {
    if (activeSessionId) {
      void setCurrentTeamBySession(activeSessionId);
    }
  }, [activeSessionId, setCurrentTeamBySession]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      on(EventType.TODO_UPDATED, () => {
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
  }, [refreshPlans, refreshTeam, fetchSubAgents]);

  const sessionPlan = activeSessionId ? sessionPlans[activeSessionId] : null;
  const displayMembers = useMemo(
    () => (currentTeam && activeSessionId
      ? resolveTeamMembersForDisplay(currentTeam, subAgents, activeSessionId)
      : []),
    [currentTeam, subAgents, activeSessionId],
  );

  const taskSubAgents = useMemo(
    () => (currentTeam && activeSessionId
      ? resolveTaskSubAgentsForDisplay(currentTeam, subAgents, activeSessionId)
      : activeSessionId
        ? subAgents.filter((a) => a.parentSessionId === activeSessionId)
        : []),
    [currentTeam, subAgents, activeSessionId],
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

  const sortedTasks = teamModeEnabled && currentTeam
    ? [...currentTeam.tasks].sort((a, b) => TASK_SORT_ORDER[a.status] - TASK_SORT_ORDER[b.status])
    : [];

  const workingCount = teamModeEnabled && teamWorkers.length > 0
    ? teamWorkers.filter((m) => m.status === 'working').length
    : 0;

  const leadSessionTitle = activeSessionId
    ? sessions.find((session) => session.id === activeSessionId)?.title
    : undefined;

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
              {sortedTasks.map((task) => {
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

      {planDataResolved ? (
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
            {planDataResolved.steps.map((step, idx) => (
              <PlanStep key={`${step.title}-${idx}`} title={step.title} status={step.status} />
            ))}
          </div>
        </CollapsibleSection>
      ) : (
        <div className="text-xs text-[#9A9A9A] px-3 py-4">
          {activeSessionId ? t('task_no_plan') : t('task_select_session')}
        </div>
      )}

      {taskSubAgents.length > 0 && (
        <CollapsibleSection
          title="Task 子 Agent"
          collapsed={false}
          onToggle={() => {}}
        >
          <div className="flex flex-col gap-1 ml-2">
            {taskSubAgents.map((agent) => (
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
