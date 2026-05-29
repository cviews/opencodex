import { useEffect, useState } from 'react';
import { Loader2, MoreHorizontal } from 'lucide-react';
import type { Session } from '@opencodex/types';
import type { ReactNode } from 'react';
import type { SessionActivity } from '../stores/message';
import type { SessionRunStatus } from '../stores/session';
import { useSidebarSessionTooltip } from '../components/SidebarSessionTooltip';
import { useAppI18n } from '../i18n';
import { resolveSidebarSessionRunStatus, type SidebarDelegationContext } from '../utils/sidebarSessionStatus';

function sessionRowTitle(session: Session, unnamedLabel: string): string {
  return session.title?.trim() || session.cwd?.split('/').pop() || unnamedLabel;
}

function sessionRowDirectory(session: Session, projectPath: string): string {
  return (
    session.directory?.trim()
    || session.path?.trim()
    || session.cwd?.trim()
    || projectPath.trim()
  );
}

const SESSION_ROW_HEIGHT = 28;
const SEE_MORE_ROW_HEIGHT = 24;
const DEFAULT_COLLAPSED_ROWS = 4;
const LOAD_MORE_BATCH = 4;
const STATUS_ICON_BOX = 'flex h-[13px] w-[13px] shrink-0 items-center justify-center';

function computeVisibleSessions(
  sessions: Session[],
  visibleLimit: number,
  activeSessionId: string | null,
): Session[] {
  if (sessions.length <= visibleLimit) {
    return sessions;
  }

  const head = sessions.slice(0, visibleLimit);
  if (!activeSessionId || head.some((session) => session.id === activeSessionId)) {
    return head;
  }

  const active = sessions.find((session) => session.id === activeSessionId);
  if (!active) return head;

  return [...head.slice(0, visibleLimit - 1), active];
}

function SessionRunStatusIcon({
  status,
  needsUserAction,
  t,
}: {
  status?: SessionRunStatus;
  needsUserAction?: boolean;
  t: (key: string) => string;
}) {
  if (needsUserAction) {
    return (
      <span className={STATUS_ICON_BOX}>
        <span className="h-2 w-2 rounded-full bg-[#D4A017]" title={t('sidebar.status.needsConfirm')} />
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className={STATUS_ICON_BOX}>
        <Loader2 size={13} className="animate-spin text-[#2B8FFF]" />
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className={STATUS_ICON_BOX}>
        <span className="h-2 w-2 rounded-full bg-[#C75450]" title={t('sidebar.status.error')} />
      </span>
    );
  }
  if (status === 'idle') {
    return (
      <span className={STATUS_ICON_BOX}>
        <span className="h-2 w-2 rounded-full bg-[#2B8FFF]" title={t('sidebar.status.completed')} />
      </span>
    );
  }
  return (
    <span className={STATUS_ICON_BOX}>
      <span className="h-2 w-2 rounded-full bg-[#B8B8B8] dark:bg-[#666666]" title={t('sidebar.status.notRunning')} />
    </span>
  );
}

export function ProjectSessionsList({
  sessions,
  activeSessionId,
  sessionRunStatus,
  loadingBySession,
  sessionActivity,
  sessionsNeedingUserAction,
  onSessionClick,
  onSessionContextMenu,
  formatTime,
  renderSessionExtra,
  delegationContext,
  projectPath,
}: {
  sessions: Session[];
  activeSessionId: string | null;
  sessionRunStatus: Record<string, SessionRunStatus>;
  loadingBySession: Record<string, boolean>;
  sessionActivity: Record<string, SessionActivity>;
  sessionsNeedingUserAction: Set<string>;
  onSessionClick: (sessionId: string) => void;
  onSessionContextMenu: (event: React.MouseEvent, sessionId: string) => void;
  formatTime: (dateStr: string) => string;
  renderSessionExtra?: (session: Session) => ReactNode;
  delegationContext?: SidebarDelegationContext;
  projectPath: string;
}) {
  const { show: showSessionTooltip, hide: hideSessionTooltip, portal: sessionTooltipPortal } =
    useSidebarSessionTooltip();
  const { t } = useAppI18n();
  const seeMoreLabel = t('sidebar.seeMore');
  const emptyLabel = t('sidebar.noChats');
  const unnamedLabel = t('sidebar.unnamed');

  const [visibleLimit, setVisibleLimit] = useState(DEFAULT_COLLAPSED_ROWS);
  const sessionIdsKey = sessions.map((session) => session.id).join('\0');

  useEffect(() => {
    setVisibleLimit(DEFAULT_COLLAPSED_ROWS);
  }, [sessionIdsKey]);

  if (sessions.length === 0) {
    return <div className="px-2 py-2 text-[11px] text-[#8A8A8A] dark:text-[#727272]">{emptyLabel}</div>;
  }

  const visibleSessions = computeVisibleSessions(sessions, visibleLimit, activeSessionId);
  const hiddenCount = Math.max(0, sessions.length - visibleSessions.length);

  return (
    <div className="flex flex-col">
      <div className="flex flex-col">
        {visibleSessions.map((session) => {
          const isActive = activeSessionId === session.id;
          const runStatus = resolveSidebarSessionRunStatus(
            session.id,
            sessionRunStatus,
            loadingBySession,
            sessionActivity,
            delegationContext,
          );
          const needsUserAction = sessionsNeedingUserAction.has(session.id);
          const isRunning = runStatus === 'running';
          const isError = runStatus === 'error';
          const extra = renderSessionExtra?.(session);

          return (
            <div key={session.id} className="flex flex-col">
              <div
                onClick={() => onSessionClick(session.id)}
                onContextMenu={(event) => onSessionContextMenu(event, session.id)}
                onMouseEnter={(event) => {
                  showSessionTooltip(event.currentTarget, {
                    title: sessionRowTitle(session, unnamedLabel),
                    projectPath: sessionRowDirectory(session, projectPath),
                  });
                }}
                onMouseLeave={hideSessionTooltip}
                className={`group flex items-center gap-2 px-2 py-1 rounded-md text-[12px] leading-5 cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-[#ECECEC]/90 text-[#3D3D3D] dark:bg-[#3A3A3A]/80 dark:text-[#D4D4D4]'
                    : isRunning
                      ? 'text-[#5A5A5A] hover:bg-[#EBEBEB]/80 dark:text-[#B8B8B8] dark:hover:bg-[#333333]/70'
                      : isError
                        ? 'text-[#8A4A4A] hover:bg-[#F7EDED]/80 dark:text-[#D49A9A] dark:hover:bg-[#3A2A2A]/70'
                        : 'text-[#8A8A8A] hover:text-[#666666] hover:bg-[#F0F0F0]/70 dark:text-[#8A8A8A] dark:hover:text-[#B0B0B0] dark:hover:bg-[#333333]/60'
                } ${isRunning && !isActive ? 'font-medium' : ''}`}
                style={{ minHeight: SESSION_ROW_HEIGHT }}
              >
                <SessionRunStatusIcon status={runStatus} needsUserAction={needsUserAction} t={t} />
                <span className="min-w-0 flex-1 truncate">
                  {sessionRowTitle(session, unnamedLabel)}
                </span>
                <span className="text-[10px] text-[#A3A3A3] dark:text-[#666666] opacity-0 group-hover:opacity-100 transition-opacity">
                  {session.updatedAt ? formatTime(session.updatedAt) : ''}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSessionContextMenu(event, session.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded text-[#A3A3A3] hover:text-[#666666] dark:hover:text-[#B0B0B0] transition-opacity"
                >
                  <MoreHorizontal size={12} />
                </button>
              </div>
              {extra ? <div className="ml-2 flex flex-col">{extra}</div> : null}
            </div>
          );
        })}
      </div>

      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setVisibleLimit((prev) => Math.min(prev + LOAD_MORE_BATCH, sessions.length))}
          className="mt-0.5 flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] text-[#8A8A8A] hover:text-[#666666] dark:text-[#727272] dark:hover:text-[#A8A8A8] transition-colors"
          style={{ minHeight: SEE_MORE_ROW_HEIGHT }}
        >
          <span className={`${STATUS_ICON_BOX} opacity-0`} aria-hidden />
          <span>{seeMoreLabel.replace('{count}', String(hiddenCount))}</span>
        </button>
      ) : null}
      {sessionTooltipPortal}
    </div>
  );
}
