import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { t } from '../constants/i18n';
import {
  MessageSquarePlus,
  Search,
  Zap,
  Settings,
  FolderOpen,
  ChevronRight,
  MessageSquare,
  Puzzle,
  MoreHorizontal,
  Loader2,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { useClickOutside } from '../hooks/useClickOutside';
import { useRemoveProject } from '../hooks/useRemoveProject';
import { SearchModal } from '../components/SearchModal';
import { useSessionStore, type SessionRunStatus } from '../stores/session';
import { usePermissionStore } from '../stores/permission';
import { opencodeSession } from '../services/opencodeAdapter';
import { useTeamStore } from '../stores/team';
import { useSDK } from '../sdk/provider';

import { useProjectStore } from '../stores/project';
import { useMessageStore } from '../stores/message';
import { selectSession, selectTeamMember, selectSubAgent } from '../services/executionView';
import { isTopLevelSession, dedupeSessionsById } from '../utils/sessionHierarchy';
import {
  displayNameFromSpawnTitle,
  isTeammateChildSession,
  memberDisplayName,
  resolveTaskSubAgentsForDisplay,
  resolveTeamMembersForDisplay,
} from '../services/teamDisplay';
import { buildSessionsNeedingUserAction } from '../utils/sessionUserAction';
import {
  getMemberActivityLabel,
  TeamMemberActivityText,
  TeamMemberStatusIndicator,
} from '../components/teamMemberStatus';

type ProjectItem = { id: string; name: string; path: string };

interface NavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  path?: string;
  onClick?: () => void;
}

export function NavLinks() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const { hasProject } = useProjectStore();

  const handleNewChat = () => {
    if (hasProject) {
      useSessionStore.getState().setActiveSession(null);
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

function SessionRunStatusIcon({
  status,
  isActive,
  needsUserAction,
}: {
  status?: SessionRunStatus;
  isActive: boolean;
  needsUserAction?: boolean;
}) {
  if (needsUserAction) {
    return (
      <span
        className="w-2 h-2 rounded-full bg-[#F59E0B] shrink-0"
        title="需要确认"
      />
    );
  }
  if (status === 'running') {
    return <Loader2 size={14} className="shrink-0 animate-spin text-[#2B8FFF]" />;
  }
  if (status === 'error') {
    return <AlertCircle size={14} className="shrink-0 text-[#EF4444]" />;
  }
  if (status === 'idle') {
    return (
      <MessageSquare
        size={14}
        className={isActive ? 'text-[#1F1F1F] shrink-0' : 'text-[#9A9A9A] shrink-0'}
      />
    );
  }
  return (
    <MessageSquare
      size={14}
      className={isActive ? 'text-[#1F1F1F] shrink-0' : 'text-[#9A9A9A] shrink-0'}
    />
  );
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
  const [isOpen, setIsOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameSessionName, setRenameSessionName] = useState('');
  const [switchingProjectId, setSwitchingProjectId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { restartWithDir, reconnecting } = useSDK();
  const { sessions, subAgents, activeSessionId, selectedSubAgentId, setActiveSession, sessionRunStatus } = useSessionStore();
  const loadingBySession = useMessageStore((s) => s.loadingBySession);
  const sessionActivity = useMessageStore((s) => s.sessionActivity);
  const pendingPermissions = usePermissionStore((s) => s.pendingPermissions);
  const pendingQuestions = usePermissionStore((s) => s.pendingQuestions);
  const sessionsNeedingUserAction = buildSessionsNeedingUserAction(
    pendingPermissions,
    pendingQuestions,
    sessionActivity,
  );
  const { teamModeEnabled, currentTeam, selectedMemberId } = useTeamStore();
  const { projects, currentProject, setProject } = useProjectStore();
  const { removeProjectWithConfirm } = useRemoveProject();

  useClickOutside([projectMenuRef], () => setProjectMenuId(null), projectMenuId !== null);
  useEscapeKey(() => setProjectMenuId(null), projectMenuId !== null);

  const performSwitch = useCallback(async (project: ProjectItem) => {
    if (project.id === currentProject.id || reconnecting) return;

    const previousProject = currentProject;
    setSwitchError(null);
    setSwitchingProjectId(project.id);

    // Optimistic UI: switch project immediately, restart server in background
    setProject(project);
    setActiveSession(null);
    useMessageStore.getState().setActiveSession(null);
    useMessageStore.getState().clearMessages();
    useSessionStore.getState().setSessions([]);
    navigate('/');

    const url = await restartWithDir(project.path);

    if (!url) {
      setProject(previousProject);
      setSwitchError('启动 opencode 服务失败，请重试');
      setSwitchingProjectId(null);
      return;
    }

    setSwitchingProjectId(null);
  }, [currentProject, reconnecting, restartWithDir, setProject, setActiveSession, navigate]);

  const handleProjectSwitch = (project: ProjectItem) => {
    void performSwitch(project);
  };

  const handleRemoveProject = (project: ProjectItem) => {
    setProjectMenuId(null);
    void removeProjectWithConfirm(project);
  };

  const handleSessionClick = (id: string) => {
    selectSession(id);
    navigate('/');
  };

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
    <div className="px-3 py-2">
      <div className="text-xs text-[#9A9A9A] font-medium mb-2 px-3 uppercase tracking-wider">项目</div>

      
      <div className="flex flex-col gap-0.5">
        {projects.map((p) => {
          const isCurrent = currentProject.id === p.id;
          const isSwitching = switchingProjectId === p.id || (isCurrent && reconnecting);
          return (
            <div key={p.id} className="relative group">
              <div
                className={`flex items-center rounded-lg ${
                  isCurrent ? 'bg-[#E8E8E8]' : 'hover:bg-[#F0F0F0]'
                }`}
              >
                <button
                  onClick={() => {
                    setProjectMenuId(null);
                    if (isCurrent) {
                      setIsOpen(!isOpen);
                    } else {
                      handleProjectSwitch(p);
                      setIsOpen(true);
                    }
                  }}
                  disabled={!!switchingProjectId && switchingProjectId !== p.id}
                  className={`flex items-center gap-2 flex-1 min-w-0 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    isCurrent
                      ? 'text-[#1F1F1F] font-medium'
                      : 'text-[#6B6B6B] hover:text-[#1F1F1F]'
                  }`}
                >
                  <FolderOpen size={16} className={isCurrent ? 'text-[#1F1F1F]' : 'text-[#9A9A9A]'} />
                  <span className="flex-1 text-left truncate">{p.name || p.path.split('/').pop() || '未选择项目'}</span>
                  {isSwitching && <Loader2 size={14} className="shrink-0 animate-spin text-[#2B8FFF]" />}
                  {isCurrent && !isSwitching && (
                    <ChevronRight
                      size={14}
                      className={`text-[#9A9A9A] transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProjectMenuId(projectMenuId === p.id ? null : p.id);
                  }}
                  disabled={!!switchingProjectId}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 p-1.5 mr-1 rounded text-[#9A9A9A] hover:text-[#1F1F1F] hover:bg-[#E0E0E0] transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="项目操作"
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>
              {projectMenuId === p.id && (
                <div
                  ref={projectMenuRef}
                  className="absolute right-0 top-full mt-0.5 w-36 bg-white border border-[#E5E5E5] rounded-lg shadow-lg py-1 z-50"
                >
                  <button
                    type="button"
                    onClick={() => handleRemoveProject(p)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[#EC5F66] hover:bg-[#FFF5F5] transition-colors"
                  >
                    <Trash2 size={14} />
                    <span>移除项目</span>
                  </button>
                </div>
              )}

              
              {isCurrent && isOpen && (
                <div className="ml-6 mt-1 flex flex-col gap-0.5">
                  {sessions.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-[#B0B0B0]">暂无聊天</div>
                  ) : (
                    dedupeSessionsById(sessions.filter(isTopLevelSession)).map((s) => {
              const isActive = activeSessionId === s.id;
              const runStatus =
                sessionRunStatus[s.id]
                ?? (loadingBySession[s.id] ? 'running' : undefined);
              const needsUserAction = sessionsNeedingUserAction.has(s.id);
              return (
                <div key={s.id}>
                  <div
                    onClick={() => handleSessionClick(s.id)}
                    onContextMenu={(e) => handleContextMenu(e, s.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm cursor-pointer transition-colors group ${
                      isActive
                        ? 'bg-[#E8E8E8] text-[#1F1F1F] font-medium'
                        : 'text-[#6B6B6B] hover:bg-[#F0F0F0]'
                    }`}
                  >
                    <SessionRunStatusIcon status={runStatus} isActive={isActive} needsUserAction={needsUserAction} />
                    <span className="flex-1 truncate">{s.title || s.cwd?.split('/').pop() || '未命名'}</span>
                    <span className="text-[10px] text-[#9A9A9A]">{s.updatedAt ? formatTime(s.updatedAt) : ''}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleContextMenu(e, s.id); }}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded text-[#9A9A9A] hover:text-[#1F1F1F] hover:bg-[#E8E8E8] transition-opacity"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                  {isActive && (() => {
                    const isTeamSession = teamModeEnabled && currentTeam && (
                      currentTeam.sessionId === s.id
                      || currentTeam.members.some((member) => member.sessionID === s.id)
                    );
                    const taskAgents = isTeamSession && currentTeam
                      ? resolveTaskSubAgentsForDisplay(currentTeam, subAgents, s.id)
                      : subAgents.filter((a) => a.parentSessionId === s.id);

                    const renderTaskSubAgents = () => {
                      if (taskAgents.length === 0) return null;
                      return (
                        <div className={`ml-3 mt-0.5 flex flex-col gap-px border-l pl-2 ${isTeamSession ? 'border-[#E5E5E5]' : 'border-[#E5E5E5]'}`}>
                          {isTeamSession && (
                            <div className="px-2 py-0.5 text-[9px] text-[#9A9A9A] uppercase tracking-wider">Task 子 Agent</div>
                          )}
                          {taskAgents.map((agent) => (
                            <div
                              key={agent.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (currentTeam && isTeammateChildSession(agent, currentTeam)) {
                                  const members = resolveTeamMembersForDisplay(currentTeam, subAgents, s.id);
                                  const member = members.find((m) => m.sessionID === agent.sessionId);
                                  if (member) {
                                    selectTeamMember(member.id);
                                    return;
                                  }
                                }
                                selectSubAgent(agent.id);
                              }}
                              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                                selectedSubAgentId === agent.id
                                  ? 'bg-[#EEF4FF] text-[#2B8FFF] font-medium'
                                  : 'text-[#6B6B6B] hover:bg-[#F0F0F0]'
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
                              <span className="flex-1 truncate">{displayNameFromSpawnTitle(agent.title)}</span>
                            </div>
                          ))}
                        </div>
                      );
                    };

                    if (isTeamSession && currentTeam) {
                      const displayMembers = resolveTeamMembersForDisplay(currentTeam, subAgents, s.id);
                      return (
                        <>
                          <div className="px-2 py-0.5 text-[9px] text-[#9A9A9A] uppercase tracking-wider ml-3">团队成员</div>
                          <div className="ml-3 mt-0.5 mb-0.5 flex flex-col gap-px border-l border-[#2B8FFF] pl-2">
                            {displayMembers.map((member) => {
                              const activityLabel = getMemberActivityLabel(
                                member.sessionID ? sessionActivity[member.sessionID] : undefined,
                              );
                              const isSelected = selectedMemberId === member.id;
                              const isWorking = member.status === 'working';
                              return (
                              <div
                                key={member.id}
                                onClick={(e) => { e.stopPropagation(); selectTeamMember(member.id); }}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer transition-colors min-w-0 ${
                                  isSelected
                                    ? 'bg-[#EEF4FF] text-[#2B8FFF] font-medium'
                                    : isWorking
                                      ? 'bg-[#F8FBFF] text-[#1F1F1F] hover:bg-[#EEF4FF]'
                                      : 'text-[#6B6B6B] hover:bg-[#F0F0F0]'
                                }`}
                              >
                                <TeamMemberStatusIndicator status={member.status} />
                                <span className="truncate min-w-0 flex-1">
                                  {memberDisplayName(member, s.title)}
                                </span>
                                {isWorking && (
                                  <TeamMemberActivityText label={activityLabel ?? '执行中'} />
                                )}
                                {member.role === 'lead' && (
                                  <span className="text-[9px] px-0.5 rounded bg-[#EEF4FF] text-[#2B8FFF] shrink-0 ml-auto">Lead</span>
                                )}
                              </div>
                              );
                            })}
                          </div>
                          {renderTaskSubAgents()}
                        </>
                      );
                    }

                    return renderTaskSubAgents();
                  })()}
                </div>
              );
            })
)}
                </div>
              )}
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
