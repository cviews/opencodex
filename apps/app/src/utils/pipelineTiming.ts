/**
 * Pipeline timing for Thought → team_create → team_spawn gaps.
 * Logs to DevTools with prefix [zmn-pipeline] when `zmn_debug=1`.
 */

import { isDebugEnabled } from './debugMode';

const PREFIX = '[zmn-pipeline]';

const TRACKED_TOOLS = new Set([
  'team_create',
  'team_spawn',
  'team_message',
  'team_tasks',
  'team_shutdown',
  'team_cleanup',
  'question',
  'bash',
  'skill',
]);

export function isPipelineTimingEnabled(): boolean {
  return isDebugEnabled();
}

interface SessionTiming {
  turnStart: number;
  lastPhase: string;
  lastAt: number;
  milestones: Map<string, number>;
}

const bySession = new Map<string, SessionTiming>();

function sessionState(sessionId: string): SessionTiming {
  let s = bySession.get(sessionId);
  if (!s) {
    const now = Date.now();
    s = {
      turnStart: now,
      lastPhase: 'turn.start',
      lastAt: now,
      milestones: new Map(),
    };
    bySession.set(sessionId, s);
  }
  return s;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function keyMilestone(phase: string, tool?: string, status?: string): string {
  if (tool && status) return `${tool}:${status}`;
  return phase;
}

export function pipelineReset(sessionId: string, reason?: string): void {
  if (!isPipelineTimingEnabled()) return;
  bySession.delete(sessionId);
  console.info(PREFIX, 'reset', { sessionId: shortId(sessionId), reason });
}

export function pipelineMark(
  sessionId: string,
  phase: string,
  detail?: Record<string, unknown>,
): void {
  if (!isPipelineTimingEnabled() || !sessionId) return;

  const tool = typeof detail?.tool === 'string' ? detail.tool : undefined;
  const status = typeof detail?.status === 'string' ? detail.status : undefined;
  const trackTool = !tool || TRACKED_TOOLS.has(tool) || tool.startsWith('team_');

  if (tool && !trackTool && !phase.includes('permission') && !phase.includes('session')) {
    return;
  }

  const now = Date.now();
  const s = sessionState(sessionId);
  const sinceLast = now - s.lastAt;
  const sinceTurn = now - s.turnStart;

  const milestoneKey = keyMilestone(phase, tool, status);
  if (!s.milestones.has(milestoneKey)) {
    s.milestones.set(milestoneKey, now);
  }

  const gaps: Record<string, string> = {};
  const compareKeys = [
    'composer.team.fetch.start',
    'composer.prompt.dispatch.start',
    'adapter.command.request',
    'adapter.command.accepted',
    'adapter.prompt.request',
    'adapter.prompt.accepted',
    'reasoning:end',
    'team_create:pending',
    'team_create:running',
    'team_create:completed',
    'team_spawn:pending',
    'team_spawn:running',
    'team_spawn:completed',
    'session:idle',
    'session:busy',
    'assistant:new',
    'llm:first-token',
    'llm:wait.slow',
    'llm:process:start',
  ];
  for (const k of compareKeys) {
    const t = s.milestones.get(k);
    if (t != null && k !== milestoneKey) {
      gaps[`since_${k.replace(/:/g, '_')}`] = formatMs(now - t);
    }
  }

  console.info(PREFIX, phase, {
    sessionId: shortId(sessionId),
    sinceLast: formatMs(sinceLast),
    sinceTurn: formatMs(sinceTurn),
    ...gaps,
    ...(detail ?? {}),
  });

  s.lastPhase = phase;
  s.lastAt = now;
}

export function pipelineMarkFromSse(
  eventType: string,
  sessionId: string,
  extra?: Record<string, unknown>,
): void {
  if (!isPipelineTimingEnabled() || !sessionId) return;

  // message.part.* has richer marks in message store — avoid duplicate lines
  if (
    eventType === 'message.part.updated'
    || eventType === 'message.part.delta'
    || eventType === 'message.updated'
  ) {
    return;
  }

  const interesting =
    eventType.startsWith('session.')
    || eventType.startsWith('permission.')
    || eventType.startsWith('session.next.tool')
    || eventType.startsWith('session.next.reasoning')
    || eventType.startsWith('session.next.step');

  if (!interesting) return;

  pipelineMark(sessionId, `sse:${eventType}`, extra);
}

function shortId(sessionId: string): string {
  return sessionId.replace(/^ses_/, '').slice(0, 12);
}
