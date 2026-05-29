import { opencodeMessage } from './opencodeAdapter';
import { isLeadRunDisplayFullyCompleted } from './sessionRunDisplayLifecycle';
import { isLeadSessionAwaitingDelegation } from './teamLeadSessionStatus';
import { sessionNeedsAgentReply } from './teamMemberExecution';
import { useMessageStore } from '../stores/message';
import { useSessionStore } from '../stores/session';
import { useTeamStore } from '../stores/team';
import { debugLog, debugWarn } from '../utils/debugLog';

export type LeadOrchestrationResumeReason =
  | 'member-idle'
  | 'member-completed'
  | 'member-message';

interface LeadResumeContext {
  reason: LeadOrchestrationResumeReason;
  memberName?: string;
}

const resumeTimers = new Map<string, number>();
const resumeInFlight = new Set<string>();
const lastResumeAt = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveLeadAgentId(leadSessionId: string): string | undefined {
  const leadMember = useTeamStore.getState().currentTeam?.members.find((member) => member.role === 'lead');
  if (leadMember?.agentId) return leadMember.agentId;
  const session = useSessionStore.getState().sessions.find((item) => item.id === leadSessionId);
  return session?.agent ?? 'OpenCode-Builder';
}

function buildLeadResumePrompt(context: LeadResumeContext): string {
  const member = context.memberName?.trim();
  switch (context.reason) {
    case 'member-message':
      return [
        '[Team orchestration] 收到团队成员更新。',
        '请立即 team_list + team_tasks 检查进度，并继续协调：',
        '- 若仍有 pending/in_progress 任务，立刻 team_message 派发给合适成员并行执行',
        '- 禁止停在「等待阶段」或只向用户解释调度问题；本 turn 必须产出 team_message/team_tasks 动作',
      ].join('\n');
    case 'member-completed':
    case 'member-idle':
    default:
      return [
        '[Team orchestration]',
        member
          ? `成员 ${member} 已结束当前执行。`
          : '有团队成员已结束当前执行。',
        '请立即 team_list + team_tasks 检查整体进度，并继续派发剩余任务（例如 T2-T5 并行 team_message），',
        '禁止 idle 等待用户下一条消息。',
      ].join('\n');
  }
}

function leadResumeCooldownMs(leadSessionId: string): number {
  const last = lastResumeAt.get(leadSessionId) ?? 0;
  return Math.max(0, 1800 - (Date.now() - last));
}

export async function resumeLeadOrchestration(
  leadSessionId: string,
  context: LeadResumeContext,
): Promise<void> {
  const { teamModeEnabled, currentTeam } = useTeamStore.getState();
  if (!teamModeEnabled || !currentTeam || currentTeam.sessionId !== leadSessionId) return;

  const runStatus = useSessionStore.getState().sessionRunStatus[leadSessionId];
  const loading = useMessageStore.getState().loadingBySession[leadSessionId];
  const { subAgents, sessionRunStatus } = useSessionStore.getState();
  const messageState = useMessageStore.getState();
  const awaitingDelegation = isLeadSessionAwaitingDelegation(
    leadSessionId,
    sessionRunStatus,
    messageState.loadingBySession,
    messageState.sessionActivity,
    teamModeEnabled,
    currentTeam,
    subAgents,
  );
  if ((runStatus === 'running' || loading) && awaitingDelegation) return;

  if (isLeadRunDisplayFullyCompleted(leadSessionId)) return;

  const cooldown = leadResumeCooldownMs(leadSessionId);
  if (cooldown > 0) return;

  if (resumeInFlight.has(leadSessionId)) return;
  resumeInFlight.add(leadSessionId);

  try {
    await useMessageStore.getState().loadMessages(leadSessionId);
    await sleep(500);

    const messages = useMessageStore.getState().getSessionMessagesSnapshot(leadSessionId);
    const needsReply = sessionNeedsAgentReply(messages);
    const prompt = buildLeadResumePrompt(context);

    await opencodeMessage.sendMessage(leadSessionId, prompt, {
      agent: resolveLeadAgentId(leadSessionId),
      displayContent: '',
    });

    lastResumeAt.set(leadSessionId, Date.now());
    debugLog('team.lead.resume', {
      leadSessionId: leadSessionId.slice(0, 16),
      reason: context.reason,
      memberName: context.memberName,
      needsReply,
    });
  } catch (err) {
    debugWarn('team.lead.resume.failed', err, {
      leadSessionId,
      reason: context.reason,
      memberName: context.memberName,
    });
  } finally {
    resumeInFlight.delete(leadSessionId);
  }
}

export function scheduleLeadOrchestrationResume(
  leadSessionId: string,
  context: LeadResumeContext,
  delayMs = 900,
): void {
  if (!leadSessionId) return;

  const existing = resumeTimers.get(leadSessionId);
  if (existing) {
    window.clearTimeout(existing);
  }

  const timer = window.setTimeout(() => {
    resumeTimers.delete(leadSessionId);
    void resumeLeadOrchestration(leadSessionId, context);
  }, delayMs);

  resumeTimers.set(leadSessionId, timer);
}
