import type { Message } from '@opencodex/types';
import { parseTeamRelayMessage } from '../thread/displayContent';
import { opencodeMessage } from './opencodeAdapter';
import { scheduleLeadOrchestrationResume } from './teamLeadExecution';
import { useMessageStore } from '../stores/message';
import { useTeamStore } from '../stores/team';
import type { TeamMember } from '../types';
import { debugLog, debugWarn } from '../utils/debugLog';

const MEMBER_NOTIFY_COOLDOWN_MS = 15_000;
const lastMemberNotifyAt = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveLeadAgentId(leadSessionId: string): string | undefined {
  const leadMember = useTeamStore.getState().currentTeam?.members.find((member) => member.role === 'lead');
  if (leadMember?.agentId) return leadMember.agentId;
  return 'OpenCode-Builder';
}

function extractVisibleAssistantSummary(messages: Message[], maxLen = 480): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== 'assistant') continue;
    const text = (message.content ?? message.displayContent ?? '').trim();
    if (!text) continue;
    if (text.length <= maxLen) return text;
    return `${text.slice(0, maxLen).trim()}…`;
  }
  return '当前任务已执行完成。';
}

function leadHasRecentRelayFromMember(
  leadSessionId: string,
  memberName: string,
  windowMs = 90_000,
): boolean {
  const messages = useMessageStore.getState().getSessionMessagesSnapshot(leadSessionId);
  const now = Date.now();
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    const raw = message.displayContent || message.content || '';
    const parsed = parseTeamRelayMessage(raw);
    if (!parsed) continue;
    if (parsed.from.toLowerCase() !== memberName.toLowerCase()) continue;
    const ts = message.createdAt ? Date.parse(message.createdAt) : now;
    if (Number.isFinite(ts) && now - ts <= windowMs) return true;
    return false;
  }
  return false;
}

function buildMemberCompletionRelay(member: TeamMember, summary: string): string {
  return `[Team message from ${member.name}]: ${summary}`;
}

export async function notifyLeadOfMemberCompletion(
  member: TeamMember,
  leadSessionId: string,
): Promise<boolean> {
  const { teamModeEnabled, currentTeam } = useTeamStore.getState();
  if (!teamModeEnabled || !currentTeam || currentTeam.sessionId !== leadSessionId) return false;
  if (!member.sessionID || member.role === 'lead') return false;

  const notifyKey = `${member.sessionID}:${leadSessionId}`;
  const lastAt = lastMemberNotifyAt.get(notifyKey) ?? 0;
  if (Date.now() - lastAt < MEMBER_NOTIFY_COOLDOWN_MS) return false;

  try {
    await useMessageStore.getState().loadMessages(member.sessionID);
    await sleep(400);
    const memberMessages = useMessageStore.getState().getSessionMessagesSnapshot(member.sessionID);
    const summary = extractVisibleAssistantSummary(memberMessages);
    if (leadHasRecentRelayFromMember(leadSessionId, member.name)) {
      lastMemberNotifyAt.set(notifyKey, Date.now());
      return false;
    }

    const relay = buildMemberCompletionRelay(member, summary);
    await useMessageStore.getState().loadMessages(leadSessionId);
    await opencodeMessage.sendMessage(leadSessionId, relay, {
      agent: resolveLeadAgentId(leadSessionId),
    });

    lastMemberNotifyAt.set(notifyKey, Date.now());
    debugLog('team.member.notifyLead', {
      member: member.name,
      leadSessionId: leadSessionId.slice(0, 16),
      summaryLen: summary.length,
    });

    scheduleLeadOrchestrationResume(
      leadSessionId,
      { reason: 'member-message', memberName: member.name },
      1200,
    );
    return true;
  } catch (err) {
    debugWarn('team.member.notifyLead.failed', err, {
      member: member.name,
      leadSessionId,
    });
    return false;
  }
}

export function scheduleNotifyLeadOfMemberCompletion(
  member: TeamMember,
  leadSessionId: string,
  delayMs = 600,
): void {
  window.setTimeout(() => {
    void notifyLeadOfMemberCompletion(member, leadSessionId);
  }, delayMs);
}
