import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowDown, Sparkles } from 'lucide-react';
import { ThreadHeader } from './ThreadHeader';
import { MessageList } from './MessageList';
import { DelegationParallelBanner } from './DelegationParallelBanner';
import { Composer } from './Composer';
import { PermissionApprovalPanel } from './PermissionApprovalPanel';
import { QuestionPanel } from './QuestionPanel';
import { useMessageStore, type CompactionActivity } from '../stores/message';
import { useSessionStore } from '../stores/session';
import { getDisplayTeamMembers, useTeamStore } from '../stores/team';
import { usePermissionStore } from '../stores/permission';
import { useProjectStore } from '../stores/project';
import { toChatMessage } from './utils';
import { ensureModelCapabilitiesReady } from './composer/models';
import { clearExecutionView, getEffectiveSessionId } from '../services/executionView';
import { isPendingSessionId } from '../utils/pendingSession';
import { isSessionExecuting } from '../utils/sidebarSessionStatus';
import { EmbeddedTerminal } from '../components/EmbeddedTerminal';
import { useTerminalStore } from '../stores/terminal';
import { questionLog } from '../utils/questionDebug';
import { pickQuestionForSessionTree, collectRelatedSessionIds } from '../utils/sessionQuestionTree';
import type { Session } from '@opencodex/types';
import type { SubAgentItem } from '../types';

const EMPTY_COMPACTIONS: CompactionActivity[] = [];

function pickPermissionForView(
  permissions: ReturnType<typeof usePermissionStore.getState>['pendingPermissions'],
  preferredSessionId: string | null,
  sessions: Session[],
  subAgents: SubAgentItem[],
) {
  if (permissions.length === 0) return null;
  if (preferredSessionId) {
    const related = collectRelatedSessionIds(preferredSessionId, sessions, subAgents);
    for (const sessionId of related) {
      const matched = permissions.find((p) => p.sessionId === sessionId);
      if (matched) return matched;
    }
    return null;
  }
  return null;
}

export function ThreadPanel(props: { leftCollapsed?: boolean; onToggleLeft?: () => void }) {
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const isTerminalOpen = useTerminalStore((s) => s.isOpen);
  const [composerRestoreText, setComposerRestoreText] = useState<string | null>(null);
  const location = useLocation();
  const { messages, thinking, loadingBySession, sessionActivity, compactionsBySession } = useMessageStore();
  const { activeSessionId, subAgents, selectedSubAgentId, sessions } = useSessionStore();
  const { teamModeEnabled, selectedMemberId, currentTeam } = useTeamStore();
  const {
    pendingPermissions,
    pendingQuestions,
    approvePermission,
    denyPermission,
    answerQuestion,
    rejectQuestion,
  } = usePermissionStore();
  const currentProject = useProjectStore((s) => s.currentProject);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userPinnedToBottomRef = useRef(true);
  const chatMessages = useMemo(() => messages.map(toChatMessage), [messages]);

  const isNearBottom = useCallback((el: HTMLElement) => {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 48;
  }, []);

  const updateJumpButton = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = isNearBottom(el);
    userPinnedToBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);
  }, [isNearBottom]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    userPinnedToBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  const effectiveSessionId = getEffectiveSessionId();
  const currentPermission = pickPermissionForView(
    pendingPermissions,
    effectiveSessionId,
    sessions,
    subAgents,
  );
  const currentQuestion = pickQuestionForSessionTree(
    pendingQuestions,
    effectiveSessionId,
    sessions,
    subAgents,
  );

  useEffect(() => {
    questionLog('ui.panel-state', {
      effectiveSessionId: effectiveSessionId?.slice(0, 12) ?? null,
      pendingCount: pendingQuestions.length,
      pending: pendingQuestions.map((q) => ({
        id: q.id.slice(0, 12),
        sessionId: q.sessionId?.slice(0, 12),
        title: q.title,
        options: q.options.length,
      })),
      showingQuestionId: currentQuestion?.id.slice(0, 12) ?? null,
      showingTitle: currentQuestion?.title ?? null,
    });
  }, [pendingQuestions, currentQuestion, effectiveSessionId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => updateJumpButton();

    el.addEventListener('scroll', handleScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      if (userPinnedToBottomRef.current) {
        el.scrollTop = el.scrollHeight;
        setShowJumpToLatest(false);
      } else {
        updateJumpButton();
      }
    });
    resizeObserver.observe(el.firstElementChild ?? el);

    updateJumpButton();

    return () => {
      el.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, [updateJumpButton, chatMessages.length]);

  useEffect(() => {
    userPinnedToBottomRef.current = true;
    setShowJumpToLatest(false);
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [effectiveSessionId]);

  const selectedMember = teamModeEnabled && currentTeam && selectedMemberId
    ? getDisplayTeamMembers(currentTeam, subAgents, activeSessionId ?? undefined)
        .find((m) => m.id === selectedMemberId)
    : null;

  const selectedSubAgent = selectedSubAgentId
    ? subAgents.find(a => a.id === selectedSubAgentId)
    : null;

  const isViewingSubAgent = !!selectedSubAgent;
  const isLeadMainView = !!activeSessionId && !selectedMember && !isViewingSubAgent;

  useEffect(() => {
    if (!activeSessionId) return;

    const poll = () => {
      if (isLeadMainView) {
        if (teamModeEnabled && currentTeam) {
          for (const member of currentTeam.members) {
            if (member.role === 'lead' || !member.sessionID) continue;
            void useMessageStore.getState().loadMessages(member.sessionID);
          }
        } else {
          const runningChildren = subAgents.filter(
            (a) =>
              a.parentSessionId === activeSessionId
              && (a.status === 'running'
                || useSessionStore.getState().sessionRunStatus[a.sessionId] === 'running'),
          );
          for (const child of runningChildren) {
            void useMessageStore.getState().loadMessages(child.sessionId);
          }
        }
      } else if (effectiveSessionId && effectiveSessionId !== activeSessionId) {
        void useMessageStore.getState().loadMessages(effectiveSessionId);
      }
    };

    poll();
    const timer = window.setInterval(poll, 4000);
    return () => window.clearInterval(timer);
  }, [isLeadMainView, activeSessionId, effectiveSessionId, subAgents, teamModeEnabled, currentTeam]);

  useEffect(() => {
    void ensureModelCapabilitiesReady();
  }, []);

  useEffect(() => {
    const effectiveSessionId = getEffectiveSessionId();
    const messageState = useMessageStore.getState();

    if (effectiveSessionId) {
      if (
        isPendingSessionId(effectiveSessionId)
        && messageState.activeSessionId
        && !isPendingSessionId(messageState.activeSessionId)
      ) {
        return;
      }

      messageState.setActiveSession(effectiveSessionId);
      if (
        !isPendingSessionId(effectiveSessionId)
        && !messageState.loadingBySession[effectiveSessionId]
      ) {
        void messageState.loadMessages(effectiveSessionId);
      }
    } else {
      messageState.setActiveSession(null);
    }
  }, [activeSessionId, teamModeEnabled, selectedMemberId, currentTeam, isViewingSubAgent, selectedSubAgent]);

  const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const skillMode = urlParams.get('skill');
  const skillName = urlParams.get('skillName');
  const skillIcon = urlParams.get('skillIcon');

  const isSkillCreator = skillMode === 'creator' || skillMode === '8';
  const displaySkillName = isSkillCreator ? (skillName || 'Skill Creator') : skillName;
  const displaySkillIcon = isSkillCreator ? (skillIcon || '✏️') : skillIcon;

  const sessionRunStatusMap = useSessionStore((s) => s.sessionRunStatus);
  const isStreaming = isSessionExecuting(
    effectiveSessionId,
    sessionRunStatusMap,
    loadingBySession,
    sessionActivity,
  );
  const sessionRunStatus = effectiveSessionId ? sessionRunStatusMap[effectiveSessionId] : undefined;
  const liveActivity = effectiveSessionId ? sessionActivity[effectiveSessionId] ?? null : null;
  const sessionCompactions = useMemo(
    () =>
      effectiveSessionId
        ? compactionsBySession[effectiveSessionId] ?? EMPTY_COMPACTIONS
        : EMPTY_COMPACTIONS,
    [compactionsBySession, effectiveSessionId],
  );

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;

  useEffect(() => {
    if (!userPinnedToBottomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setShowJumpToLatest(false);
  }, [
    messages.length,
    lastMessage?.content,
    lastMessage?.reasoningContent,
    isStreaming,
    liveActivity?.kind,
    liveActivity?.label,
    thinking?.reasoningText,
    thinking?.active,
    sessionCompactions.length,
  ]);

  const handleRestoreToComposer = useCallback((text: string) => {
    if (!text.trim()) return;
    setComposerRestoreText(text);
  }, []);

  return (
    <div className="flex h-full flex-col bg-white">
      <ThreadHeader leftCollapsed={props.leftCollapsed} onToggleLeft={props.onToggleLeft} />

      {isLeadMainView && activeSessionId && (
        <div className="shrink-0 border-b border-[#F0EBFF] bg-white px-4 pt-3 pb-2">
          <DelegationParallelBanner leadSessionId={activeSessionId} />
        </div>
      )}

      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div className="scrollbar-hover h-full overflow-y-auto" ref={scrollRef}>
          {chatMessages.length > 0 ? (
            <MessageList
              messages={chatMessages}
              isStreaming={isStreaming}
              thinking={thinking}
              activity={liveActivity}
              compactionActivities={sessionCompactions}
              onRestoreToComposer={handleRestoreToComposer}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full px-8">
              <div className="flex flex-col items-center max-w-lg w-full">
                <div className="w-12 h-12 rounded-2xl bg-[#F0EBFF] flex items-center justify-center mb-4">
                  <Sparkles size={24} className="text-[#7C3AED]" />
                </div>
                <h1 className="text-2xl font-semibold text-[#1F1F1F] mb-2 text-center">
                  {currentProject.name
                    ? `我们能在 ${currentProject.name} 中做什么？`
                    : '开始一段新对话'}
                </h1>
                <p className="text-sm text-[#6B6B6B] text-center">
                  在下方输入框中描述你的问题，AI 将为你解答
                </p>
              </div>
            </div>
          )}
        </div>
        {showJumpToLatest && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="滚动到最新消息"
            className="absolute bottom-4 left-1/2 z-20 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-[#1F1F1F] text-white shadow-lg transition-colors hover:bg-[#333333] pointer-events-auto"
          >
            <ArrowDown size={16} />
          </button>
        )}
      </div>

      <PermissionApprovalPanel
        permission={currentPermission}
        onApprove={approvePermission}
        onDeny={denyPermission}
      />

      <QuestionPanel
        question={currentQuestion}
        onAnswer={answerQuestion}
        onClose={() => { if (currentQuestion) rejectQuestion(currentQuestion.id); }}
      />

      {!selectedMember && !isViewingSubAgent && (
        <>
          {effectiveSessionId && sessionRunStatus === 'error' && (
            <div className="shrink-0 border-t border-[#FECACA] bg-[#FEF2F2] px-4 py-2 text-center text-sm text-[#DC2626]">
              会话执行出错，请重试发送；详情见开发者工具 [zmn-opencodex] 日志。
            </div>
          )}
          <Composer
            skillName={displaySkillName}
            skillIcon={displaySkillIcon}
            loading={isStreaming}
            restoreText={composerRestoreText}
            onRestoreHandled={() => setComposerRestoreText(null)}
            onAbort={() => {
              const abortSessionId = effectiveSessionId ?? activeSessionId;
              if (abortSessionId) {
                useMessageStore.getState().abortSession(abortSessionId);
              }
            }}
          />
        </>
      )}

      {isTerminalOpen && <EmbeddedTerminal />}

      {selectedMember && (
        <div className="flex items-center justify-center py-2 px-4 border-t border-[#E5E5E5] bg-[#FAFAFA]">
          <span className="text-xs text-[#9A9A9A]">
            正在查看 {selectedMember.name} 的执行记录
          </span>
          <button
            onClick={() => clearExecutionView()}
            className="ml-3 text-xs text-[#2B8FFF] hover:underline"
          >
            返回对话
          </button>
        </div>
      )}

      {!selectedMember && isViewingSubAgent && selectedSubAgent && (
        <div className="flex items-center justify-center py-2 px-4 border-t border-[#E5E5E5] bg-[#FAFAFA]">
          <span className="text-xs text-[#9A9A9A]">
            正在查看 {selectedSubAgent.title} 的执行记录
          </span>
          <button
            onClick={() => clearExecutionView()}
            className="ml-3 text-xs text-[#2B8FFF] hover:underline"
          >
            返回对话
          </button>
        </div>
      )}
    </div>
  );
}
