import { useMemo } from 'react';
import { UserMessageItem, AssistantMessageItem } from './MessageItem';
import { TeamRelayMessageItem } from './TeamRelayMessageItem';
import { ActivityRail } from './ActivityRail';
import { buildTurnActivitySteps, COGNITION_WAIT_LABELS } from './activitySteps';
import { getUserMessageDisplay, isCompactionInternalContent, isTeamOrchestrationNudge, isTeamRelayMessage } from './displayContent';
import { dedupeTeamRelayTurns } from './teamRelayDedupe';
import { isCompactionUiActive } from './compactionActivity';
import type { CompactionActivity, SessionActivity } from '../stores/message';
import { useMessageStore } from '../stores/message';
import type { ChatMessage } from './types';
import {
  getCachedDefaultModelRef,
  modelSupportsReasoning,
} from './composer/models';

const PLACEHOLDER_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    sessionID: 'placeholder',
    sessionId: 'placeholder',
    role: 'user',
    content: 'hi',
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    sessionID: 'placeholder',
    sessionId: 'placeholder',
    role: 'assistant',
    content: 'hi',
    createdAt: new Date().toISOString(),
  },
];

interface ThinkingState {
  active: boolean;
  agent?: string;
  model?: string;
  reasoningText?: string;
  reasoningDone?: boolean;
}

interface MessageListProps {
  messages?: ChatMessage[];
  isStreaming?: boolean;
  thinking?: ThinkingState;
  activity?: SessionActivity | null;
  compactionActivities?: CompactionActivity[];
  onRestoreToComposer?: (text: string) => void;
}

interface MessageTurn {
  id: string;
  user?: ChatMessage;
  assistants: ChatMessage[];
}

function isHiddenUserMessage(msg: ChatMessage): boolean {
  if (msg.role !== 'user') return false;
  const raw = msg.content ?? '';
  if (isCompactionInternalContent(raw) || isCompactionInternalContent(msg.displayContent ?? '')) {
    return true;
  }
  if (isTeamOrchestrationNudge(raw) || isTeamOrchestrationNudge(msg.displayContent ?? '')) {
    return true;
  }
  return !getUserMessageDisplay(msg).trim();
}

function groupIntoTurns(messages: ChatMessage[]): MessageTurn[] {
  const turns: MessageTurn[] = [];
  let current: MessageTurn | null = null;

  for (const msg of messages) {
    if (msg.role === 'user' && isHiddenUserMessage(msg)) {
      continue;
    }
    if (msg.role === 'user') {
      current = { id: msg.id, user: msg, assistants: [] };
      turns.push(current);
    } else if (msg.role === 'assistant') {
      if (!current) {
        current = { id: `assistant-${msg.id}`, assistants: [] };
        turns.push(current);
      }
      current.assistants.push(msg);
    }
  }

  return turns;
}

function visibleAssistants(assistants: ChatMessage[]): ChatMessage[] {
  return assistants.filter((m) => !m.compactionSummary);
}

function resolveTurnModelSupportsReasoning(
  thinking: ThinkingState | undefined,
  turnAssistants: ChatMessage[],
  activity?: SessionActivity | null,
): boolean {
  if (activity?.label === 'Thinking') return true;
  if (activity?.label && COGNITION_WAIT_LABELS.has(activity.label)) return true;
  if (thinking?.reasoningText?.trim()) return true;
  if (thinking?.active && thinking?.model && modelSupportsReasoning(thinking.model)) return true;
  for (let i = turnAssistants.length - 1; i >= 0; i -= 1) {
    const msg = turnAssistants[i];
    if (msg.reasoningContent?.trim()) return true;
  }
  if (thinking?.model && modelSupportsReasoning(thinking.model)) return true;
  for (let i = turnAssistants.length - 1; i >= 0; i -= 1) {
    const msg = turnAssistants[i];
    if (msg.modelID) {
      const modelRef = msg.providerID ? `${msg.providerID}/${msg.modelID}` : msg.modelID;
      if (modelSupportsReasoning(modelRef)) return true;
    }
  }
  const defaultRef = getCachedDefaultModelRef();
  if (defaultRef) return modelSupportsReasoning(defaultRef);
  return false;
}

function mergeAssistantContentForDisplay(
  assistants: ChatMessage[],
  isStreaming: boolean,
): ChatMessage {
  const visible = visibleAssistants(assistants);
  if (visible.length === 0) {
    return assistants[assistants.length - 1];
  }
  const last = visible[visible.length - 1];
  if (isStreaming) {
    return last;
  }
  const mergedContent = visible.map((m) => m.content?.trim() ?? '').filter(Boolean).join('\n\n');
  const toolCalls = visible.flatMap((m) => m.toolCalls ?? []);
  const reasoningContent =
    assistants.map((m) => m.reasoningContent?.trim() ?? '').filter(Boolean).pop() ?? last.reasoningContent;

  return {
    ...last,
    content: mergedContent || last.content,
    toolCalls: toolCalls.length > 0 ? toolCalls : last.toolCalls,
    reasoningContent,
  };
}

export function MessageList({
  messages = PLACEHOLDER_MESSAGES,
  isStreaming = false,
  thinking,
  activity,
  compactionActivities = [],
  onRestoreToComposer,
}: MessageListProps) {
  const abortedTurnSnapshots = useMessageStore((s) => s.abortedTurnSnapshots);
  const turns = useMemo(
    () => dedupeTeamRelayTurns(groupIntoTurns(messages)),
    [messages],
  );

  const compactionRunning = compactionActivities.some((c) => c.status === 'running');
  const isCompressingUi = isCompactionUiActive(compactionActivities, activity?.label);

  return (
    <div
      className={`message-list mx-auto max-w-3xl px-4 py-6${isCompressingUi ? ' message-list--compressing' : ''}`}
    >
      {turns.map((turn, turnIdx) => {
        const isLastTurn = turnIdx === turns.length - 1;
        const lastAssistantInTurn = turn.assistants[turn.assistants.length - 1];
        const isStreamingTurn = isLastTurn && isStreaming;
        const lastAssistantId = lastAssistantInTurn?.id;

        const turnCompactions = compactionActivities.filter(
          (c) =>
            (isLastTurn && c.status === 'running') ||
            !c.turnUserMessageId ||
            c.turnUserMessageId === turn.user?.id,
        );

        const railAssistants = visibleAssistants(turn.assistants);
        const hasRunningCompaction = turnCompactions.some((c) => c.status === 'running');

        const turnModelSupportsReasoning = resolveTurnModelSupportsReasoning(
          thinking,
          turn.assistants,
          activity,
        );

        const isCognitionWait =
          activity?.kind === 'thinking' &&
          activity.label !== 'Compressing' &&
          activity.label !== '正在手动压缩上下文…' &&
          activity.label !== '正在自动压缩上下文…' &&
          !(typeof activity.label === 'string' && activity.label.includes('压缩')) &&
          (COGNITION_WAIT_LABELS.has(activity.label) ||
            activity.label === 'Preparing next step');

        const cognitionLive =
          isStreamingTurn &&
          !isCompressingUi &&
          (isCognitionWait ||
            activity?.kind === 'thinking' ||
            thinking?.active ||
            !!thinking?.reasoningText?.trim());

        const sessionId =
          turn.user?.sessionID
          ?? turn.user?.sessionId
          ?? lastAssistantInTurn?.sessionID
          ?? lastAssistantInTurn?.sessionId;
        const abortedSnapshot =
          isLastTurn && !isStreamingTurn && sessionId
            ? abortedTurnSnapshots[sessionId]
            : undefined;

        let turnActivitySteps = buildTurnActivitySteps({
          assistants: railAssistants,
          lastAssistantId: railAssistants[railAssistants.length - 1]?.id ?? lastAssistantId,
          thinkingActive: cognitionLive,
          reasoningText: isStreamingTurn && turnModelSupportsReasoning
            ? thinking?.reasoningText
            : undefined,
          reasoningDone: isStreamingTurn ? thinking?.reasoningDone : false,
          liveActivity: isStreamingTurn ? activity ?? null : null,
          isStreaming: isStreamingTurn,
          compactionActivities: turnCompactions,
          hideStreamDraft: isCompressingUi,
          hideCompactionSteps: isCompressingUi,
          modelSupportsReasoning: turnModelSupportsReasoning,
        });

        if (abortedSnapshot?.length) {
          turnActivitySteps = abortedSnapshot;
        }

        const hasRunningActivity =
          turnActivitySteps.some((step) => step.status === 'running');
        const suppressBody =
          !abortedSnapshot?.length &&
          (isStreamingTurn || isCompressingUi) &&
          (isCompressingUi ||
            compactionRunning ||
            hasRunningCompaction ||
            hasRunningActivity);

        const displayMessage =
          railAssistants.length > 0
            ? mergeAssistantContentForDisplay(turn.assistants, isStreamingTurn)
            : null;

        const showAssistantBlock =
          (turn.assistants.length > 0 ||
            turnCompactions.length > 0 ||
            isStreamingTurn) &&
          (turnActivitySteps.length > 0 ||
            !!displayMessage?.content?.trim() ||
            isStreamingTurn);

        return (
          <div key={turn.id} className="message-turn">
            {turn.user && (
              isTeamRelayMessage(turn.user.content ?? '') ||
              isTeamRelayMessage(turn.user.displayContent ?? '')
                ? <TeamRelayMessageItem message={turn.user} />
                : (
                  <UserMessageItem
                    message={turn.user}
                    onRestoreToComposer={onRestoreToComposer}
                  />
                )
            )}

            {showAssistantBlock && (
              <div className="message-turn-assistant-block">
                {turnActivitySteps.length > 0 && (
                  <ActivityRail
                    steps={turnActivitySteps}
                    isStreaming={isStreamingTurn && !abortedSnapshot?.length}
                    streamDraftContent={
                      suppressBody && isStreamingTurn && !isCompressingUi && !abortedSnapshot?.length
                        ? displayMessage?.content?.trim() || undefined
                        : undefined
                    }
                    hideStreamDraft={isCompressingUi}
                  />
                )}
                {displayMessage && (
                  <AssistantMessageItem
                    message={displayMessage}
                    activitySteps={turnActivitySteps}
                    hideActivityRail
                    isStreaming={isStreamingTurn}
                    suppressBody={isStreamingTurn ? suppressBody : false}
                    compactionRunning={isCompressingUi}
                    isThinking={false}
                    onRestoreToComposer={onRestoreToComposer}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
