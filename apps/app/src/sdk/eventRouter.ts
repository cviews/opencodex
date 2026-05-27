import { getClient } from './client';
import { eventDirectoryMatchesProject, getEventSubscribeDirectory } from './eventDirectory';
import { isPipelineTimingEnabled, pipelineMarkFromSse } from '../utils/pipelineTiming';
import { questionLog, questionWarn } from '../utils/questionDebug';
import { debugError, debugLog } from '../utils/debugLog';
import { isDebugEnabled } from '../utils/debugMode';

type EventHandler = (event: Record<string, unknown>) => void;

const handlers: Map<string, Set<EventHandler>> = new Map();

function getOrCreateHandlers(eventType: string): Set<EventHandler> {
  let set = handlers.get(eventType);
  if (!set) {
    set = new Set();
    handlers.set(eventType, set);
  }
  return set;
}

/** Wire format: flat bus event or GlobalBus `{ directory, payload: { type, properties } }`. */
export function unwrapEvent(event: Record<string, unknown>): Record<string, unknown> {
  if (typeof event.type === 'string') {
    return event;
  }
  const payload = event.payload;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const nested = payload as Record<string, unknown>;
    if (typeof nested.type === 'string') {
      return nested;
    }
  }
  return event;
}

function routeEvent(resolved: Record<string, unknown>) {
  const eventType = resolved.type as string | undefined;
  if (!eventType) return;

  const specific = handlers.get(eventType);
  if (specific) {
    specific.forEach((fn) => {
      try { fn(resolved); } catch (e) { debugError('eventRouter.handler', e); }
    });
  }

  const wildcard = handlers.get('*');
  if (wildcard) {
    wildcard.forEach((fn) => {
      try { fn(resolved); } catch (e) { debugError('eventRouter.wildcard', e); }
    });
  }
}

function extractEventPayload(event: Record<string, unknown>): Record<string, unknown> {
  if (event.properties && typeof event.properties === 'object') {
    return event.properties as Record<string, unknown>;
  }
  if (event.data && typeof event.data === 'object') {
    return event.data as Record<string, unknown>;
  }
  return event;
}

export { extractEventPayload };

export function on(eventType: string, handler: EventHandler): () => void {
  const set = getOrCreateHandlers(eventType);
  set.add(handler);
  return () => set.delete(handler);
}

function handleSseData(raw: Record<string, unknown>) {
  const eventDirectory =
    typeof raw.directory === 'string' ? raw.directory : undefined;

  const resolved = unwrapEvent(raw);
  const eventType = typeof resolved.type === 'string' ? resolved.type : undefined;

  if (!eventDirectoryMatchesProject(eventDirectory)) {
    if (eventType?.startsWith('question.') || eventType === 'permission.asked') {
      questionWarn('sse-dropped', {
        eventType,
        eventDirectory: eventDirectory ?? '(none)',
        projectDirectory: getEventSubscribeDirectory() ?? '(none)',
      });
    }
    return;
  }

  // v2 experimental sync stream — not consumed by desktop stores (matches official app).
  if (eventType === 'sync') return;

  if (eventType && isPipelineTimingEnabled()) {
    const props = extractEventPayload(resolved);
    const sessionId = String(
      props.sessionID ?? props.sessionId ?? props.session_id ?? '',
    );
    if (sessionId) {
      pipelineMarkFromSse(eventType, sessionId, {
        tool: typeof props.name === 'string' ? props.name : undefined,
      });
    } else if (eventType === 'server.connected') {
      debugLog('pipeline.sse', {
        eventType,
        envelopeDirectory: eventDirectory ?? '(none — global event)',
        subscribeDirectory: getEventSubscribeDirectory() ?? '(all)',
      });
    }
    // server.heartbeat: omit — fires every few seconds and looks like a false alarm
  }

  if (
    eventType
    && (eventType.startsWith('question.') || eventType === 'permission.asked')
  ) {
    questionLog('sse-route', {
      eventType,
      directory: eventDirectory ?? '(none)',
      preview: JSON.stringify(resolved).slice(0, 400),
    });
  }

  if (
    isDebugEnabled()
    && eventType
    && eventType !== 'server.heartbeat'
    && !eventType.startsWith('tui.')
  ) {
    debugLog('eventRouter.sse', {
      eventType,
      preview: JSON.stringify(resolved).slice(0, 300),
    });
  }

  routeEvent(resolved);
}

export function startRouter(): () => void {
  const client = getClient();
  if (!client) return () => {};

  let active = true;
  let abortController = new AbortController();
  const directory = getEventSubscribeDirectory();
  debugLog('eventRouter.subscribing', {
    endpoint: '/global/event',
    directory: directory ?? '(all)',
  });

  (async () => {
    try {
      const result = await client.global.event({
        signal: abortController.signal,
        onSseEvent: (event) => {
          if (!active) return;
          const raw = event.data as Record<string, unknown>;
          if (raw && typeof raw === 'object') {
            handleSseData(raw);
          }
        },
        onSseError: (err) => {
          if (active) debugError('eventRouter.sse-error', err);
        },
      });

      if (result?.stream) {
        try {
          for await (const _event of result.stream) {
            if (!active) break;
          }
        } catch (err) {
          if (active) debugError('eventRouter.stream', err);
        }
      }
    } catch (err) {
      if (active) debugError('eventRouter.subscribe', err);
    }
  })();

  return () => {
    active = false;
    abortController.abort();
  };
}

export function restartEventRouter(): () => void {
  return startRouter();
}

export const EventType = {
  SERVER_CONNECTED: 'server.connected',
  SESSION_CREATED: 'session.created',
  SESSION_UPDATED: 'session.updated',
  SESSION_DELETED: 'session.deleted',
  SESSION_STATUS: 'session.status',
  SESSION_IDLE: 'session.idle',
  SESSION_ERROR: 'session.error',
  SESSION_DIFF: 'session.diff',
  SESSION_COMPACTED: 'session.compacted',
  SESSION_NEXT_COMPACTION_STARTED: 'session.next.compaction.started',
  SESSION_NEXT_COMPACTION_DELTA: 'session.next.compaction.delta',
  SESSION_NEXT_COMPACTION_ENDED: 'session.next.compaction.ended',
  SESSION_NEXT_TEXT_STARTED: 'session.next.text.started',
  SESSION_NEXT_TEXT_DELTA: 'session.next.text.delta',
  SESSION_NEXT_TEXT_ENDED: 'session.next.text.ended',
  SESSION_NEXT_TOOL_INPUT_STARTED: 'session.next.tool.input.started',
  SESSION_NEXT_TOOL_INPUT_DELTA: 'session.next.tool.input.delta',
  SESSION_NEXT_TOOL_INPUT_ENDED: 'session.next.tool.input.ended',
  SESSION_NEXT_TOOL_CALLED: 'session.next.tool.called',
  SESSION_NEXT_TOOL_PROGRESS: 'session.next.tool.progress',
  SESSION_NEXT_TOOL_SUCCESS: 'session.next.tool.success',
  SESSION_NEXT_TOOL_FAILED: 'session.next.tool.failed',
  SESSION_NEXT_STEP_STARTED: 'session.next.step.started',
  SESSION_NEXT_STEP_ENDED: 'session.next.step.ended',
  SESSION_NEXT_STEP_FAILED: 'session.next.step.failed',
  SESSION_NEXT_REASONING_STARTED: 'session.next.reasoning.started',
  SESSION_NEXT_REASONING_DELTA: 'session.next.reasoning.delta',
  SESSION_NEXT_REASONING_ENDED: 'session.next.reasoning.ended',
  SESSION_NEXT_AGENT_SWITCHED: 'session.next.agent.switched',
  SESSION_NEXT_MODEL_SWITCHED: 'session.next.model.switched',
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_REMOVED: 'message.removed',
  MESSAGE_PART_UPDATED: 'message.part.updated',
  MESSAGE_PART_REMOVED: 'message.part.removed',
  MESSAGE_PART_DELTA: 'message.part.delta',
  PERMISSION_ASKED: 'permission.asked',
  PERMISSION_UPDATED: 'permission.updated',
  PERMISSION_REPLIED: 'permission.replied',
  QUESTION_ASKED: 'question.asked',
  QUESTION_REPLIED: 'question.replied',
  QUESTION_REJECTED: 'question.rejected',
  TODO_UPDATED: 'todo.updated',
  FILE_EDITED: 'file.edited',
  FILE_WATCHER_UPDATED: 'file.watcher.updated',
  PROJECT_UPDATED: 'project.updated',
  VCS_BRANCH_UPDATED: 'vcs.branch.updated',
  MCP_TOOLS_CHANGED: 'mcp.tools.changed',
  COMMAND_EXECUTED: 'command.executed',
  TEAM_MEMBER_STATUS: 'team.member.status',
  TEAM_TASK_CREATED: 'team.task.created',
  TEAM_TASK_UPDATED: 'team.task.updated',
  TEAM_TASK_CLAIMED: 'team.task.claimed',
  TEAM_MESSAGE: 'team.message',
  TEAM_STATE: 'team.state',
} as const;

export type EventTypeValue = (typeof EventType)[keyof typeof EventType];
