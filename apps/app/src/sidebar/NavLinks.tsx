import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Session } from '@opencodex/types';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { t } from '../constants/i18n';
import {
  MessageSquarePlus,
  Search,
  Zap,
  Settings,
  FolderOpen,
  Puzzle,
  MoreHorizontal,
  Plus,
  Loader2,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { useClickOutside } from '../hooks/useClickOutside';
import { useRemoveProject } from '../hooks/useRemoveProject';
import { SearchModal } from '../components/SearchModal';
import { useSessionStore } from '../stores/session';
import { usePermissionStore } from '../stores/permission';
import { opencodeSession } from '../services/opencodeAdapter';
import { useTeamStore } from '../stores/team';
import { useSDK } from '../sdk/provider';

import { useProjectStore } from '../stores/project';
import { useMessageStore } from '../stores/message';
import { selectSession, selectTeamMember, selectSubAgent } from '../services/executionView';
import { resetProjectScope } from '../services/projectScopeReset';
import { isTopLevelSession, dedupeSessionsById } from '../utils/sessionHierarchy';
import {
  displayNameFromSpawnTitle,
  isTeammateChildSession,
  memberDisplayName,
  resolveTaskSubAgentsForDisplay,
  resolveTeamMembersForDisplay,
} from '../services/teamDisplay';
import { isRunSidebarHidden } from '../services/sessionRunDisplayLifecycle';
import { buildSessionsNeedingUserActionForProject } from '../utils/sessionUserAction';
import { ProjectSessionsList } from './ProjectSessionsList';
import {
  getMemberActivityLabel,
  TeamMemberActivityText,
  TeamMemberStatusIndicator,
} from '../components/teamMemberStatus';
import type { TeamInfo } from '../types';
import type { SubAgentItem } from '../types';
import type { SessionActivity } from '../stores/message';
import type { SessionRunStatus } from '../stores/session';

type ProjectItem = { id: string; name: string; path: string };

interface NavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  path?: string;
  onClick?: () => void;
}

function renderSessionSidebarExtra({
  session,
  activeSessionId,
  teamModeEnabled,
  currentTeam,
  subAgents,
  sessionRunStatus,
  sessionRunStartedAt,
  selectedSubAgentId,
  selectedMemberId,
  sessionActivity,
}: {
  session: Session;
  activeSessionId: string;
  teamModeEnabled: boolean;
  currentTeam: TeamInfo | null;
  subAgents: SubAgentItem[];
  sessionRunStatus: Record<string, SessionRunStatus>;
  sessionRunStartedAt: Record<string, number>;
  selectedSubAgentId: string | null;
  selectedMemberId: string | null;
  sessionActivity: Record<string, SessionActivity>;
}): ReactNode {
  if (session.id !== activeSessionId) return null;
  if (isRunSidebarHidden(session.id)) return null;

  const isTeamSession = teamModeEnabled && currentTeam && (
    currentTeam.sessionId === session.id
    || currentTeam.members.some((member) => member.sessionID === session.id)
  );
  const taskAgents = isTeamSession && currentTeam
    ? resolveTaskSubAgentsForDisplay(
      currentTeam,
      subAgents,
      session.id,
      sessionRunStartedAt[session.id],
    )
    : resolveTaskSubAgentsForDisplay(null, subAgents, session.id, sessionRunStartedAt[session.id]);

  const renderTaskSubAgents = () => {
    if (taskAgents.length === 0) return null;
    return (
      <div className="mt-0.5 flex flex-col gap-px border-l border-[#ECECEC] pl-2 dark:border-[#3A3A3A]">
        {taskAgents.map((agent) => (
          <div
            key={agent.id}
            onClick={(e) => {
              e.stopPropagation();
              if (currentTeam && isTeammateChildSession(agent, currentTeam)) {
                const members = resolveTeamMembersForDisplay(
                  currentTeam,
                  subAgents,
                  session.id,
                  sessionRunStatus,
                );
                const member = members.find((m) => m.sessionID === agent.sessionId);
                if (member) {
                  selectTeamMember(member.id);
                  return;
                }
              }
              selectSubAgent(agent.id);
            }}
            className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors ${
              selectedSubAgentId === agent.id
                ? 'text-[#666666] dark:text-[#D4D4D4]'
                : 'text-[#8A8A8A] hover:text-[#666666] dark:hover:text-[#B0B0B0]'
            }`}
          >
            <span className="truncate flex-1">{displayNameFromSpawnTitle(agent.title)}</span>
          </div>
        ))}
      </div>
    );
  };

  if (isTeamSession && currentTeam) {
    const displayMembers = resolveTeamMembersForDisplay(
      currentTeam,
      subAgents,
      session.id,
      sessionRunStatus,
    );
    if (displayMembers.length === 0 && taskAgents.length === 0) return null;

    return (
      <div className="mt-0.5 flex flex-col gap-px">
        {displayMembers.map((member) => {
          const activityLabel = getMemberActivityLabel(
            member.sessionID ? sessionActivity[member.sessionID] : undefined,
          );
          const isSelected = selectedMemberId === member.id;
          return (
            <div
              key={member.id}
              onClick={(e) => {
                e.stopPropagation();
                selectTeamMember(member.id);
              }}
              className={`flex min-w-0 cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors ${
                isSelected
                  ? 'text-[#666666] dark:text-[#D4D4D4]'
                  : 'text-[#8A8A8A] hover:text-[#666666] dark:hover:text-[#B0B0B0]'
              }`}
            >
              <TeamMemberStatusIndicator status={member.status} />
              <span className="min-w-0 flex-1 truncate">{memberDisplayName(member, session.title)}</span>
              {member.status === 'working' && (
                <TeamMemberActivityText label={activityLabel ?? '执行中'} />
              )}
            </div>
          );
        })}
        {renderTaskSubAgents()}
      </div>
    );
  }

  return renderTaskSubAgents();
}

export function NavLinks() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const { hasProject } = useProjectStore();

  const handleNewChat = () => {
    if (hasProject) {
      useSessionStore.getState().setActiveSession(null);
      useMessageStore.getState().setActiveSession(null);
      navigate('/');
    } else {
      navigate('/startup');
    }
  };

  const topItems: NavItem[] = [
    {
      id: 'new-chat',
      icon: <MessageSquarePlus size={16} />,
      label: '新对话',
      onClick: handleNewChat,
    },
    {
      id: 'search',
      icon: <Search size={16} />,
      label: '搜索',
      onClick: () => setSearchModalOpen(true),
    },
    {
      id: 'skills',
      icon: <Zap size={16} />,
      label: '技能',
      path: '/skills',
    },
    {
      id: 'plugins',
      icon: <Puzzle size={16} />,
      label: 'Mcp',
      path: '/plugins',
    },
  ];

  const isActive = (path?: string) => {
    if (!path) return false;
    return location.pathname === path;
  };

  return (
    <>
      <nav className="flex flex-col gap-0.5 px-3 pb-3 pt-1">
        {topItems.map((item) => (
          <NavLinkButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={isActive(item.path)}
            onClick={item.onClick || (() => item.path && navigate(item.path))}
          />
        ))}
      </nav>
      <SearchModal isOpen={searchModalOpen} onClose={() => setSearchModalOpen(false)} />
    </>
  );
}

interface NavLinkButtonProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}

function NavLinkButton({ icon, label, active, onClick }: NavLinkButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors w-full ${
        active
          ? 'bg-[#E8E8E8] text-[#1F1F1F] font-medium'
          : 'text-[#6B6B6B] hover:bg-[#F0F0F0] hover:text-[#1F1F1F]'
      }`}
    >
      <span className={active ? 'text-[#1F1F1F]' : 'text-[#9A9A9A]'}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}

export function ProjectSection() {
  const [contextMenu, setContextMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameSessionName, setRenameSessionName] = useState('');
  const [switchingProjectId, setSwitchingProjectId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { restartWithDir, reconnecting, connected } = useSDK();
  const { sessions, subAgents, activeSessionId, selectedSubAgentId, sessionRunStatus, sessionRunStartedAt, byProject } =
    useSessionStore();
  const loadingBySession = useMessageStore((s) => s.loadingBySession);
  const sessionActivity = useMessageStore((s) => s.sessionActivity);
  const pendingPermissions = usePermissionStore((s) => s.pendingPermissions);
  const pendingQuestions = usePermissionStore((s) => s.pendingQuestions);
  const pendingByDirectory = usePermissionStore((s) => s.pendingByDirectory);
  const { teamModeEnabled, currentTeam, selectedMemberId } = useTeamStore();
  const { projects, currentProject, setProject } = useProjectStore();
  const { removeProjectWithConfirm } = useRemoveProject();

  useClickOutside([projectMenuRef], () => setProjectMenuId(null), projectMenuId !== null);
  useEscapeKey(() => setProjectMenuId(null), projectMenuId !== null);

  useEffect(() => {
    for (const project of projects) {
      const path = project.path.trim();
      if (!path || project.id === currentProject.id) continue;
      void useSessionStore.getState().prefetchProjectSessions(path);
    }
  }, [projects, currentProject.id]);

  useEffect(() => {
    if (!connected) return;

    const refreshPending = () => {
      void usePermissionStore.getState().fetchPendingPermissions();
      void usePermissionStore.getState().fetchPendingQuestions();
    };

    refreshPending();
    const timer = window.setInterval(refreshPending, 3000);
    return () => window.clearInterval(timer);
  }, [connected]);

  useEffect(() => {
    if (!connected) return;

    const refreshBackgroundPending = () => {
      for (const project of projects) {
        if (project.id === currentProject.id) continue;
        const path = project.path.trim();
        if (!path) continue;
        void usePermissionStore.getState().fetchPendingForDirectory(path);
      }
    };

    refreshBackgroundPending();
    const timer = window.setInterval(refreshBackgroundPending, 8000);
    return () => window.clearInterval(timer);
  }, [connected, projects, currentProject.id]);

  useEffect(() => {
    const refreshAllRunStatus = () => {
      for (const project of projects) {
        const path = project.path.trim();
        if (!path) continue;
        void useSessionStore.getState().refreshProjectRunStatus(path);
      }
    };

    refreshAllRunStatus();
    const timer = window.setInterval(refreshAllRunStatus, 2500);
    return () => window.clearInterval(timer);
  }, [projects]);

  useEffect(() => {
    if (!teamModeEnabled || !currentTeam?.sessionId) return;

    const leadSessionId = currentTeam.sessionId;
    const refreshTeamScope = () => {
      void useSessionStore.getState().fetchSubAgents(leadSessionId);
      void useTeamStore.getState().refreshCurrentTeam();
    };

    refreshTeamScope();
    const timer = window.setInterval(refreshTeamScope, 3000);
    return () => window.clearInterval(timer);
  }, [teamModeEnabled, currentTeam?.sessionId, currentTeam?.id]);

  const sessionsForProject = useCallback(
    (project: ProjectItem) => {
      const path = project.path.trim();
      if (project.id === currentProject.id) {
        return dedupeSessionsById(sessions.filter(isTopLevelSession));
      }
      return dedupeSessionsById((byProject[path]?.sessions ?? []).filter(isTopLevelSession));
    },
    [byProject, currentProject.id, sessions],
  );

  const runStatusForProject = useCallback(
    (project: ProjectItem) => {
      const path = project.path.trim();
      if (project.id === currentProject.id) return sessionRunStatus;
      return byProject[path]?.sessionRunStatus ?? {};
    },
    [byProject, currentProject.id, sessionRunStatus],
  );

  const activeSessionIdForProject = useCallback(
    (project: ProjectItem) => {
      if (project.id !== currentProject.id) return null;
      return activeSessionId;
    },
    [activeSessionId, currentProject.id],
  );

  const performSwitch = useCallback(async (project: ProjectItem, sessionIdAfterSwitch?: string) => {
    if (project.id === currentProject.id || reconnecting) {
      if (sessionIdAfterSwitch) {
        selectSession(sessionIdAfterSwitch);
        navigate('/');
      }
      return;
    }

    const previousProject = currentProject;
    setSwitchError(null);
    setSwitchingProjectId(project.id);

    resetProjectScope(project.path);
    setProject(project);
    void useSessionStore.getState().refreshProjectRunStatus(project.path);
    navigate('/');

    const { url, error } = await restartWithDir(project.path);

    if (!url) {
      resetProjectScope(previousProject.path);
      setProject(previousProject);
      await restartWithDir(previousProject.path);
      setSwitchError(error || '启动 opencode 服务失败，请重试');
      setSwitchingProjectId(null);
      return;
    }

    if (sessionIdAfterSwitch) {
      selectSession(sessionIdAfterSwitch);
    }
    setSwitchingProjectId(null);
  }, [currentProject, reconnecting, restartWithDir, setProject, navigate]);

  const handleProjectSwitch = (project: ProjectItem) => {
    void performSwitch(project);
  };

  const handleRemoveProject = (project: ProjectItem) => {
    setProjectMenuId(null);
    void removeProjectWithConfirm(project);
  };

  const handleSessionClick = (project: ProjectItem, sessionId: string) => {
    if (project.id === currentProject.id) {
      selectSession(sessionId);
      navigate('/');
      return;
    }
    void performSwitch(project, sessionId);
  };

  const openNewChatForProject = useCallback(async (project: ProjectItem) => {
    setProjectMenuId(null);

    const clearToNewChat = () => {
      useSessionStore.getState().setActiveSession(null);
      useSessionStore.getState().setSelectedSubAgentId(null);
      useTeamStore.getState().setSelectedMemberId(null);
      useMessageStore.getState().setActiveSession(null);
      navigate('/');
    };

    if (project.id === currentProject.id) {
      if (reconnecting || switchingProjectId) return;
      clearToNewChat();
      return;
    }

    await performSwitch(project);
    if (useProjectStore.getState().currentProject.id === project.id) {
      clearToNewChat();
    }
  }, [currentProject.id, navigate, performSwitch, reconnecting, switchingProjectId]);

  const handleContextMenu = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    const menuWidth = 140;
    const menuHeight = 80;

    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 8;
    }
    if (y + menuHeight > window.innerHeight) {
      y = e.clientY - menuHeight;
    }

    setContextMenu({ sessionId, x, y });
  };

  const openRenameModal = (sessionId: string) => {
    const session = useSessionStore.getState().sessions.find(s => s.id === sessionId);
    if (session) {
      setRenameSessionId(sessionId);
      setRenameSessionName(session.title || '');
      setContextMenu(null);
    }
  };

  const confirmRename = () => {
    if (!renameSessionId) return;
    if (renameSessionName.trim()) {
      useSessionStore.getState().updateSession(renameSessionId, { title: renameSessionName.trim() });
    }
    setRenameSessionId(null);
    setRenameSessionName('');
  };

  const cancelRename = () => {
    setRenameSessionId(null);
    setRenameSessionName('');
  };

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    window.addEventListener('contextmenu', handler);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('contextmenu', handler);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (renameSessionId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renameSessionId]);

  const stableCancelRename = useCallback(cancelRename, [renameSessionId]);
  useEscapeKey(stableCancelRename, !!renameSessionId);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-2 py-2">
      <div className="mb-2 shrink-0 px-2 text-[11px] font-medium uppercase tracking-wider text-[#8A8A8A] dark:text-[#727272]">
        项目
      </div>

      <div className="scrollbar-sidebar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden">
        {projects.map((p) => {
          const isCurrent = currentProject.id === p.id;
          const isSwitching = switchingProjectId === p.id || (isCurrent && reconnecting);
          const projectSessions = sessionsForProject(p);
          const projectRunStatus = runStatusForProject(p);
          const projectActiveSessionId = activeSessionIdForProject(p);
          const projectSessionsNeedingUserAction = buildSessionsNeedingUserActionForProject(
            p.path,
            isCurrent,
            pendingPermissions,
            pendingQuestions,
            pendingByDirectory,
            sessionActivity,
          );

          return (
            <div key={p.id} className="relative group flex shrink-0 flex-col">
              <div className="flex items-center rounded-md">
                <button
                  onClick={() => {
                    setProjectMenuId(null);
                    if (!isCurrent) {
                      handleProjectSwitch(p);
                    }
                  }}
                  disabled={!!switchingProjectId && switchingProjectId !== p.id}
                  className={`flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    isCurrent
                      ? 'text-[#666666] dark:text-[#BFBFBF]'
                      : 'text-[#8A8A8A] dark:text-[#8A8A8A] hover:text-[#666666] dark:hover:text-[#B0B0B0]'
                  }`}
                >
                  <FolderOpen size={14} className="shrink-0 opacity-70" />
                  <span className="flex-1 truncate text-left">{p.name || p.path.split('/').pop() || '未选择项目'}</span>
                  {isSwitching && <Loader2 size={12} className="shrink-0 animate-spin text-[#8A8A8A]" />}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void openNewChatForProject(p);
                  }}
                  disabled={!!switchingProjectId}
                  className="shrink-0 rounded p-1 text-[#A3A3A3] opacity-0 transition-opacity hover:text-[#666666] group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="新对话"
                >
                  <Plus size={12} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProjectMenuId(projectMenuId === p.id ? null : p.id);
                  }}
                  disabled={!!switchingProjectId}
                  className="mr-1 shrink-0 rounded p-1 text-[#A3A3A3] opacity-0 transition-opacity hover:text-[#666666] group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="项目操作"
                >
                  <MoreHorizontal size={12} />
                </button>
              </div>

              {projectMenuId === p.id && (
                <div
                  ref={projectMenuRef}
                  className="absolute right-0 top-7 z-50 w-36 rounded-lg border border-[#E5E5E5] bg-white py-1 shadow-lg dark:border-[#444444] dark:bg-[#2A2B2D]"
                >
                  <button
                    type="button"
                    onClick={() => handleRemoveProject(p)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#EC5F66] transition-colors hover:bg-[#FFF5F5]"
                  >
                    <Trash2 size={14} />
                    <span>移除项目</span>
                  </button>
                </div>
              )}

              <div className="ml-3 flex shrink-0 flex-col border-l border-[#E8E8E8] pl-1 dark:border-[#3A3A3A]">
                <ProjectSessionsList
                  sessions={projectSessions}
                  activeSessionId={projectActiveSessionId}
                  sessionRunStatus={projectRunStatus}
                  loadingBySession={loadingBySession}
                  sessionActivity={sessionActivity}
                  sessionsNeedingUserAction={projectSessionsNeedingUserAction}
                  onSessionClick={(sessionId) => handleSessionClick(p, sessionId)}
                  onSessionContextMenu={handleContextMenu}
                  formatTime={formatTime}
                  renderSessionExtra={
                    isCurrent && projectActiveSessionId
                      ? (session) => renderSessionSidebarExtra({
                        session,
                        activeSessionId: projectActiveSessionId,
                        teamModeEnabled,
                        currentTeam,
                        subAgents,
                        sessionRunStatus,
                        sessionRunStartedAt,
                        selectedSubAgentId,
                        selectedMemberId,
                        sessionActivity,
                      })
                      : undefined
                  }
                  delegationContext={
                    isCurrent
                      ? { teamModeEnabled, currentTeam, subAgents }
                      : undefined
                  }
                />
              </div>
            </div>
          );
        })}
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[140px] bg-white border border-[#E5E5E5] rounded-lg shadow-lg py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => openRenameModal(contextMenu.sessionId)}
            className="flex items-center w-full px-3 py-1.5 text-sm text-[#1F1F1F] hover:bg-[#F5F5F5] transition-colors"
          >
            重命名
          </button>
          <button
            onClick={async () => {
              const sessionId = contextMenu.sessionId;
              setContextMenu(null);
              try {
                await opencodeSession.deleteSession(sessionId);
                useSessionStore.getState().removeSession(sessionId);
              } catch (e) {
                console.error('[NavLinks] Failed to delete session:', e);
              }
            }}
            className="flex items-center w-full px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
          >
            删除会话
          </button>
        </div>
      )}

      {renameSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={cancelRename} />
          <div className="relative bg-white rounded-xl shadow-xl w-[400px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#E5E5E5]">
              <h2 className="text-lg font-semibold text-[#1F1F1F]">重命名会话</h2>
              <button onClick={cancelRename} className="text-[#6B6B6B] hover:text-[#1F1F1F] p-1 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm text-[#6B6B6B] mb-1.5">会话名称</label>
              <input
                ref={renameInputRef}
                type="text"
                value={renameSessionName}
                onChange={(e) => setRenameSessionName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmRename(); }}
                className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
              />
            </div>
            <div className="flex gap-2 p-4 border-t border-[#E5E5E5]">
              <button
                onClick={confirmRename}
                disabled={!renameSessionName.trim()}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  renameSessionName.trim()
                    ? 'text-white bg-[#1F1F1F] hover:bg-[#333333]'
                    : 'text-[#9A9A9A] bg-[#F0F0F0] cursor-not-allowed'
                }`}
              >
                确定
              </button>
              <button
                onClick={cancelRename}
                className="px-4 py-2 text-sm text-[#6B6B6B] border border-[#E5E5E5] rounded-lg hover:bg-[#F5F5F5] transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      {switchError && (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-red-600">{switchError}</p>
            <button
              onClick={() => setSwitchError(null)}
              className="mt-1 text-xs text-red-500 underline"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} 天`;
}

export function SettingsButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#6B6B6B] hover:bg-[#F0F0F0] hover:text-[#1F1F1F] transition-colors w-full mt-auto mx-3 mb-3"
    >
      <Settings size={16} className="text-[#9A9A9A]" />
      <span>设置</span>
    </button>
  );
}
