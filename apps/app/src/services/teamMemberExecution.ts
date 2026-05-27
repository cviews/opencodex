import type { Message } from '@zmn-codex/types';
import { opencodeMessage } from './opencodeAdapter';
import { isTeammateBootstrapContent } from '../thread/displayContent';
import { useMessageStore } from '../stores/message';
import { useSessionStore } from '../stores/session';
import { useTeamStore } from '../stores/team';
import type { TeamMember } from '../types';
import { debugWarn } from '../utils/debugLog';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function memberMatchesKey(member: TeamMember, key: string): boolean {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return false;
  return (
    member.id.toLowerCase() === normalized
    || member.name.toLowerCase() === normalized
    || member.agentId.toLowerCase() === normalized
  );
}

function visibleMessages(messages: Message[]): Message[] {
  return messages.filter((message) => {
    const content = message.content ?? message.displayContent ?? '';
    if (message.role === 'user' && isTeammateBootstrapContent(content)) return false;
    return content.trim().length > 0 || message.role === 'assistant';
  });
}

export function sessionNeedsAgentReply(messages: Message[]): boolean {
  const visible = visibleMessages(messages);
  if (visible.length === 0) return true;
  return visible[visible.length - 1]?.role === 'user';
}

function messageBodyPresent(messages: Message[], body: string): boolean {
  const needle = body.trim();
  if (!needle) return false;
  const sample = needle.slice(0, 120);
  return messages.some((message) => {
    if (message.role !== 'user') return false;
    const content = (message.content ?? message.displayContent ?? '').trim();
    return content.includes(sample);
  });
}

export function extractTeamMessageBody(data: Record<string, unknown>): string {
  for (const key of ['message', 'content', 'body', 'text'] as const) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function memberIsBusy(sessionId: string): boolean {
  const runStatus = useSessionStore.getState().sessionRunStatus[sessionId];
  const loading = useMessageStore.getState().loadingBySession[sessionId];
  return runStatus === 'running' || loading === true;
}

function markMemberWorking(member: TeamMember): void {
  const teamName = useTeamStore.getState().currentTeam?.name ?? '';
  if (!teamName) return;
  useTeamStore.getState().updateMemberStatus(teamName, member.name, 'working');
}

export async function ensureTeamMemberExecutes(
  member: TeamMember,
  messageBody: string,
): Promise<void> {
  const sessionId = member.sessionID;
  if (!sessionId) return;

  await useMessageStore.getState().loadMessages(sessionId);
  await sleep(700);
  await useMessageStore.getState().loadMessages(sessionId);

  if (memberIsBusy(sessionId)) return;

  const messages = useMessageStore.getState().getSessionMessagesSnapshot(sessionId);
  const trimmedBody = messageBody.trim();

  if (trimmedBody && !messageBodyPresent(messages, trimmedBody)) {
    try {
      await opencodeMessage.sendMessage(sessionId, trimmedBody, {
        agent: member.agentId || member.name,
      });
      markMemberWorking(member);
    } catch (err) {
      debugWarn('team.member.dispatch.failed', err, {
        member: member.name,
        sessionId,
        reason: 'task-not-in-member-session',
      });
    }
    return;
  }

  try {
    await opencodeMessage.resumeMemberSession(sessionId, member.agentId || member.name);
    markMemberWorking(member);
  } catch (err) {
    debugWarn('team.member.resume.failed', err, {
      member: member.name,
      sessionId,
      hadTaskInSession: trimmedBody ? messageBodyPresent(messages, trimmedBody) : false,
      lastTurnNeedsReply: sessionNeedsAgentReply(messages),
    });
  }
}

export function scheduleTeamMemberExecution(
  member: TeamMember,
  eventData: Record<string, unknown>,
): void {
  const body = extractTeamMessageBody(eventData);
  void ensureTeamMemberExecutes(member, body);
}

export function parseTeamMessageToolInput(input: unknown): { to: string; body: string } | null {
  let parsed: Record<string, unknown>;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (input && typeof input === 'object') {
    parsed = input as Record<string, unknown>;
  } else {
    return null;
  }

  const to = String(parsed.to ?? '').trim();
  if (!to || to.toLowerCase() === 'lead') return null;
  return { to, body: extractTeamMessageBody(parsed) };
}

export function handleTeamMessageToolSuccess(leadSessionId: string, input: unknown): void {
  const parsed = parseTeamMessageToolInput(input);
  if (!parsed) return;

  const { teamModeEnabled, currentTeam } = useTeamStore.getState();
  if (!teamModeEnabled || !currentTeam || currentTeam.sessionId !== leadSessionId) return;

  const target = currentTeam.members.find((member) => memberMatchesKey(member, parsed.to));
  if (!target?.sessionID) {
    debugWarn('team.member.target.notFound', {
      to: parsed.to,
      leadSessionId,
      members: currentTeam.members.map((member) => member.name),
    });
    return;
  }

  scheduleTeamMemberExecution(target, {
    to: parsed.to,
    message: parsed.body,
  });
}
