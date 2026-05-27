import { useState, useMemo, useEffect } from 'react';
import { Plus, MessageSquare, Pin, FolderOpen, Users } from 'lucide-react';
import { opencodeProject } from '../services/opencodeAdapter';
import { SectionHeader } from './SectionHeader';
import { SessionItem } from './SessionItem';
import { SubProcessItem } from './SubProcessItem';
import { GlobalContextMenu } from './ContextMenu';
import { useSessionStore } from '../stores/session';
import { getDisplayTeamMembers, useTeamStore } from '../stores/team';
import { memberDisplayName } from '../services/teamDisplay';
import { selectTeamMember } from '../services/executionView';
import type { TeamMember, TeamMemberStatus, ProjectInfo } from '../types';

interface SectionState {
  pinned: boolean;
  team: boolean;
  chats: boolean;
  projects: Record<string, boolean>;
}

const DEFAULT_SECTION_STATE: SectionState = {
  pinned: false,
  team: false,
  chats: false,
  projects: {},
};

const STATUS_ORDER: Record<TeamMemberStatus, number> = {
  working: 0,
  idle: 1,
  waiting: 2,
  completed: 3,
  error: 4,
};

const STATUS_COLOR: Record<TeamMemberStatus, string> = {
  working: '#2B8FFF',
  idle: '#9A9A9A',
  completed: '#10A37F',
  waiting: '#F59E0B',
  error: '#EF4444',
};

const STORAGE_KEY = 'sidebar-collapsed-sections-v1';

export function ScrollableSections() {
  const [allProjects, setAllProjects] = useState<ProjectInfo[]>(opencodeProject.getProjects());
  const { activeSessionId, subAgents } = useSessionStore();
  const { activeTeams, teamModeEnabled, selectedMemberId, currentTeam } = useTeamStore();

  useEffect(() => {
    opencodeProject.fetchProjects().then(setAllProjects);
  }, []);

  const [collapsed, setCollapsed] = useState<SectionState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULT_SECTION_STATE, ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return DEFAULT_SECTION_STATE;
  });

  const persist = (next: SectionState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const toggleSection = (key: 'pinned' | 'team' | 'chats') => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      persist(next);
      return next;
    });
  };

  const sortedMembers = useMemo(() => {
    const team = currentTeam ?? activeTeams[0];
    if (!team) return [];
    const parentSessionId = currentTeam?.sessionId ?? activeSessionId ?? team.sessionId;
    return [...getDisplayTeamMembers(team, subAgents, parentSessionId)].sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
    );
  }, [activeTeams, currentTeam, subAgents, activeSessionId]);

  const sidebarTeam = currentTeam ?? activeTeams[0];
  const leadSessionTitle = useSessionStore((s) => {
    const leadId = sidebarTeam?.sessionId ?? activeSessionId;
    return leadId ? s.sessions.find((sess) => sess.id === leadId)?.title : undefined;
  });

  const toggleProject = (projectId: string) => {
    setCollapsed((prev) => {
      const next = {
        ...prev,
        projects: { ...prev.projects, [projectId]: !prev.projects[projectId] },
      };
      persist(next);
      return next;
    });
  };

  return (
    <>
      <div className="flex flex-col gap-1 px-2 py-2">
        <section>
          <SectionHeader
            icon={<Pin size={14} />}
            label="Pinned"
            collapsed={collapsed.pinned}
            onToggle={() => toggleSection('pinned')}
            draggable
          />
          {!collapsed.pinned && (
            <div className="flex flex-col gap-0.5 ml-2">
              <SessionItem title="refactor API" isPinned />
            </div>
          )}
        </section>

        {teamModeEnabled && sidebarTeam && (
          <section>
            <SectionHeader
              icon={<Users size={14} />}
              label={sidebarTeam.name}
              collapsed={collapsed.team}
              onToggle={() => toggleSection('team')}
            />
            {!collapsed.team && (
              <div className="flex flex-col gap-0.5 ml-2">
                {sortedMembers.map((member: TeamMember) => (
                  <div
                    key={member.id}
                    onClick={() => selectTeamMember(member.id)}
                    className={`flex items-start gap-2 px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
                      selectedMemberId === member.id ? 'bg-[#EEF4FF]' : 'hover:bg-[#F0F0F0]'
                    }`}
                  >
                    <span
                      className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: STATUS_COLOR[member.status],
                        animation: member.status === 'working' ? 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' : undefined,
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-[#1F1F1F] truncate">
                          {memberDisplayName(member, leadSessionTitle)}
                        </span>
                        {member.role === 'lead' && (
                          <span className="bg-[#EEF4FF] text-[#2B8FFF] text-[10px] px-1 rounded shrink-0">
                            Lead
                          </span>
                        )}
                      </div>
                      {member.currentTask && (
                        <span className="text-[10px] text-[#9A9A9A] truncate block">{member.currentTask}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section>
          <SectionHeader
            icon={<MessageSquare size={14} />}
            label="Chats"
            collapsed={collapsed.chats}
            onToggle={() => toggleSection('chats')}
            draggable
            actionIcon={<Plus size={14} />}
            onActionClick={() => { /* TODO: create new chat */ }}
          />
          {!collapsed.chats && (
            <div className="flex flex-col gap-0.5 ml-2">
              <SessionItem title="fix auth bug" isActive isRunning />
              <SessionItem title="add unit tests" />
              <SessionItem title="old session (3d ago)" />
              <button className="flex items-center gap-2 px-2 py-1 text-sm text-[#9EA1AA] hover:text-[#D8DEE9] hover:bg-[#2A2B2D] rounded-md transition-colors">
                <Plus size={14} />
                <span>New chat</span>
              </button>
            </div>
          )}
        </section>

        <section>
          <SectionHeader
            icon={<FolderOpen size={14} />}
            label={allProjects.length > 1 ? allProjects[1].name : 'project-2'}
            collapsed={collapsed.projects['project-2'] ?? false}
            onToggle={() => toggleProject('project-2')}
            isProject
          />
          {!collapsed.projects['zmn-tgsp-android'] && (
            <div className="flex flex-col gap-0.5 ml-2">
              <SubProcessItem title="sub-process-1" isRunning />
              <SubProcessItem title="sub-process-2" />
            </div>
          )}
        </section>
      </div>

      <GlobalContextMenu />
    </>
  );
}
