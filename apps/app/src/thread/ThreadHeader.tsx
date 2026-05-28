import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MoreHorizontal, PanelLeftOpen, Users } from 'lucide-react';
import { useSessionStore } from '../stores/session';
import { opencodeSession } from '../services/opencodeAdapter';
import { useTeamStore } from '../stores/team';
import { ContextUsageIndicator } from './ContextUsageIndicator';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useSessionContext } from '../hooks/useSessionContext';
import { clearExecutionView, selectTeamMember } from '../services/executionView';
import {
  displayNameFromSpawnTitle,
  memberDisplayName,
  resolveTeamMembersForDisplay,
} from '../services/teamDisplay';
import type { TeamMemberStatus } from '../types';

export function ThreadHeader({ leftCollapsed, onToggleLeft }: { leftCollapsed?: boolean; onToggleLeft?: () => void }) {
  const { sessions, activeSessionId, removeSession, updateSession, subAgents, selectedSubAgentId, sessionRunStatus } = useSessionStore();
  const { currentTeam, setCurrentTeamBySession, teamModeEnabled, selectedMemberId } = useTeamStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const [memberTooltip, setMemberTooltip] = useState<{ idx: number; top: number; left: number } | null>(null);
  const memberDotsRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ x: 0, y: 0 });
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameSessionName, setRenameSessionName] = useState('');
  const sessionContext = useSessionContext();
  const headerRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const displayMembers = useMemo(
    () => (currentTeam && activeSessionId
      ? resolveTeamMembersForDisplay(currentTeam, subAgents, activeSessionId, sessionRunStatus)
      : []),
    [currentTeam, subAgents, activeSessionId, sessionRunStatus],
  );
  const selectedMember = teamModeEnabled && displayMembers.length > 0 && selectedMemberId
    ? displayMembers.find(m => m.id === selectedMemberId)
    : null;
  const selectedSubAgent = selectedSubAgentId
    ? subAgents.find((a) => a.id === selectedSubAgentId)
    : null;
  const sessionName = selectedMember
    ? (() => {
        const label = memberDisplayName(selectedMember, activeSession?.title);
        const model = selectedMember.model?.trim();
        return model ? `${label} · ${model}` : label;
      })()
    : selectedSubAgent
      ? displayNameFromSpawnTitle(selectedSubAgent.title)
      : activeSession?.title || '新对话';

  const handleOpenDropdown = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const menuWidth = 140;
    const menuHeight = 80;

    let x = rect.left;
    let y = rect.bottom + 4;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 8;
    }
    if (y + menuHeight > window.innerHeight) {
      y = rect.top - menuHeight - 4;
    }

    setDropdownPos({ x, y });
    setShowDropdown(!showDropdown);
  };

  const openRenameModal = () => {
    if (activeSessionId) {
      setRenameSessionId(activeSessionId);
      setRenameSessionName(activeSession?.title || '');
      setShowDropdown(false);
    }
  };

  const confirmRename = () => {
    if (!renameSessionId) return;
    if (renameSessionName.trim()) {
      updateSession(renameSessionId, { title: renameSessionName.trim() });
    }
    setRenameSessionId(null);
    setRenameSessionName('');
  };

  const cancelRename = () => {
    setRenameSessionId(null);
    setRenameSessionName('');
  };

  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-header-dropdown]') && !target.closest('[data-header-trigger]')) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  useEffect(() => {
    if (renameSessionId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renameSessionId]);

  const stableCancelRename = useCallback(cancelRename, [renameSessionId]);
  useEscapeKey(stableCancelRename, !!renameSessionId);

  useEffect(() => {
    if (activeSessionId) {
      setCurrentTeamBySession(activeSessionId);
    }
  }, [activeSessionId, setCurrentTeamBySession]);

  const statusColorMap: Record<TeamMemberStatus, string> = {
    working: '#2B8FFF',
    idle: '#9A9A9A',
    completed: '#10A37F',
    waiting: '#F59E0B',
    error: '#EF4444',
  };

  const statusLabelMap: Record<TeamMemberStatus, string> = {
    working: '工作中',
    idle: '空闲',
    completed: '已完成',
    waiting: '等待中',
    error: '异常',
  };

  const workerMembers = displayMembers.filter((m) => m.role !== 'lead');
  const workingCount = workerMembers.filter((m) => m.status === 'working').length;
  const memberCount = workerMembers.length;

  const handleMemberDotHover = (idx: number, e: React.MouseEvent) => {
    const barRect = memberDotsRef.current?.getBoundingClientRect();
    if (!barRect) return;
    const dotEl = e.currentTarget as HTMLElement;
    const dotRect = dotEl.getBoundingClientRect();
    const TOOLTIP_WIDTH = 160;
    const TOOLTIP_HEIGHT = 70;
    const GAP = 6;

    let top = barRect.top - TOOLTIP_HEIGHT - GAP;
    if (top < 8) {
      top = barRect.bottom + GAP;
    }

    let left = dotRect.left + dotRect.width / 2 - TOOLTIP_WIDTH / 2;
    if (left + TOOLTIP_WIDTH > window.innerWidth - 8) {
      left = window.innerWidth - TOOLTIP_WIDTH - 8;
    }
    if (left < 8) left = 8;

    setMemberTooltip({ idx, top, left });
  };

  return (
    <>
      <div ref={headerRef} className={`relative flex items-center justify-between px-4 py-2 border-b border-[#E5E5E5] bg-white ${leftCollapsed ? 'pt-[38px]' : ''}`}>
        {leftCollapsed && (
          <div
            className="absolute inset-x-0 top-0 h-[38px]"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          />
        )}
        <div
          className="relative flex items-center gap-2"
          style={leftCollapsed ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}
        >
          {leftCollapsed && onToggleLeft && (
            <button onClick={onToggleLeft} className="p-1 rounded-md text-[#9A9A9A] hover:text-[#1F1F1F] hover:bg-[#F0F0F0] transition-colors">
              <PanelLeftOpen size={16} />
            </button>
          )}
          <h2
            data-header-trigger
            onClick={handleOpenDropdown}
            className="text-sm font-medium text-[#1F1F1F] truncate cursor-pointer select-none hover:text-[#2B8FFF] transition-colors"
          >
            {sessionName}
          </h2>
          {teamModeEnabled && currentTeam && (
            <button
              onClick={() => (selectedMemberId ? clearExecutionView() : undefined)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#EEF4FF] text-[#2B8FFF] hover:bg-[#DDEAFF] transition-colors shrink-0"
            >
              <Users size={12} />
              <span>{selectedMember ? `← ${currentTeam.key}` : `${currentTeam.key} · ${displayMembers.length}人`}</span>
            </button>
          )}
          <ContextUsageIndicator context={sessionContext} />
          <button
            data-header-trigger
            onClick={handleOpenDropdown}
            className="text-[#9A9A9A] hover:text-[#1F1F1F] p-1 rounded hover:bg-[#F0F0F0] transition-colors"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>

        {showDropdown && (
          <div
            data-header-dropdown
            className="fixed z-50 min-w-[140px] bg-white border border-[#E5E5E5] rounded-lg shadow-lg py-1"
            style={{ left: dropdownPos.x, top: dropdownPos.y }}
          >
            <button
              onClick={openRenameModal}
              className="flex items-center w-full px-3 py-1.5 text-sm text-[#1F1F1F] hover:bg-[#F5F5F5] transition-colors"
            >
              重命名
            </button>
            <button
              onClick={async () => {
                if (!activeSessionId) return;
                setShowDropdown(false);
                try {
                  await opencodeSession.deleteSession(activeSessionId);
                  removeSession(activeSessionId);
                } catch (e) {
                  console.error('[ThreadHeader] Failed to delete session:', e);
                }
              }}
              className="flex items-center w-full px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
            >
              删除
            </button>
          </div>
        )}
      </div>

      {teamModeEnabled && currentTeam && (
        <div
          ref={memberDotsRef}
          className="flex items-center px-4 h-6 bg-[#FAFAFA] border-b border-[#E5E5E5]"
          onMouseLeave={() => setMemberTooltip(null)}
        >
          <div className="flex items-center gap-1.5">
            {displayMembers.map((member, idx) => (
              <div
                key={member.id}
                className="relative cursor-pointer"
                onMouseEnter={(e) => handleMemberDotHover(idx, e)}
                onClick={() => selectTeamMember(member.id)}
              >
                <div
                  className={`w-3 h-3 rounded-full transition-colors ${
                    selectedMemberId === member.id ? 'ring-2 ring-[#2B8FFF] ring-offset-1' : ''
                  }`}
                  style={{
                    backgroundColor: statusColorMap[member.status],
                    animation: member.status === 'working' ? 'teamPulse 2s ease-in-out infinite' : undefined,
                  }}
                />
              </div>
            ))}
          </div>
          <span className="ml-2 text-xs text-[#9A9A9A]">
            {memberCount === 0
              ? '无成员'
              : workingCount > 0
                ? `${workingCount}/${memberCount} 进行中`
                : `${memberCount} 人 · 空闲`}
          </span>
          {memberTooltip && displayMembers[memberTooltip.idx] && (
            <div
              className="fixed z-50 w-[160px] bg-white text-[#1F1F1F] text-xs rounded-lg px-3 py-2 shadow-lg border border-[#E5E5E5] pointer-events-none"
              style={{ top: memberTooltip.top, left: memberTooltip.left }}
            >
              <div className="font-medium">{displayMembers[memberTooltip.idx].name}</div>
              <div className="flex items-center gap-1.5 mt-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: statusColorMap[displayMembers[memberTooltip.idx].status] }}
                />
                <span className="text-[#6B6B6B]">{statusLabelMap[displayMembers[memberTooltip.idx].status]}</span>
              </div>
              {displayMembers[memberTooltip.idx].currentTask && (
                <div className="text-[#9A9A9A] mt-1 truncate">{displayMembers[memberTooltip.idx].currentTask}</div>
              )}
            </div>
          )}
          <style>{`
            @keyframes teamPulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.4; }
            }
          `}</style>
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
    </>
  );
}
