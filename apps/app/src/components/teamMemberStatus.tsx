import type { CSSProperties } from 'react';
import type { SessionActivity } from '../stores/message';
import { cursorToolLabel } from '../thread/activitySteps';
import type { TeamMember, TeamMemberStatus } from '../types';

export const TEAM_MEMBER_STATUS_COLOR: Record<TeamMemberStatus, string> = {
  working: '#2B8FFF',
  idle: '#9A9A9A',
  completed: '#10A37F',
  error: '#EF4444',
  waiting: '#F59E0B',
};

export function getMemberActivityLabel(activity: SessionActivity | undefined): string | null {
  if (!activity) return null;
  if (activity.toolName) return cursorToolLabel(activity.toolName);
  const label = activity.label?.trim();
  return label || null;
}

export function teamMemberBadgeStyle(
  status: TeamMemberStatus,
  isLead: boolean,
): CSSProperties | undefined {
  if (isLead) {
    return status === 'working'
      ? { animation: 'teamRingPulse 2s ease-out infinite' }
      : undefined;
  }
  const style: CSSProperties = { borderColor: TEAM_MEMBER_STATUS_COLOR[status] };
  if (status === 'working') {
    style.animation = 'teamRingPulse 2s ease-out infinite';
  }
  return style;
}

export function TeamMemberStatusKeyframes() {
  return (
    <style>{`
      @keyframes teamRingPulse {
        0% { box-shadow: 0 0 0 0 rgba(43, 143, 255, 0.45); }
        70% { box-shadow: 0 0 0 3px rgba(43, 143, 255, 0); }
        100% { box-shadow: 0 0 0 0 rgba(43, 143, 255, 0); }
      }
    `}</style>
  );
}

export function TeamMemberSpinner({
  size = 12,
  className = 'text-[#2B8FFF]',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`animate-spin shrink-0 ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeDasharray="31.4 31.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TeamMemberStatusIndicator({ status }: { status: TeamMemberStatus }) {
  if (status === 'working') {
    return <TeamMemberSpinner size={12} />;
  }

  if (status === 'completed') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
        <circle cx="12" cy="12" r="10" stroke="#10A37F" strokeWidth="2" />
        <path
          d="M8 12l2.5 2.5L16 9"
          stroke="#10A37F"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <span
      className="w-1.5 h-1.5 rounded-full shrink-0"
      style={{ backgroundColor: TEAM_MEMBER_STATUS_COLOR[status] }}
    />
  );
}

export function TeamMemberActivityText({ label }: { label: string | null | undefined }) {
  if (!label) return null;
  return (
    <span className="text-[10px] text-[#9A9A9A] truncate min-w-0" title={label}>
      {label}
    </span>
  );
}

interface TeamMemberWorkingListProps {
  members: TeamMember[];
  sessionActivity: Record<string, SessionActivity>;
  memberName: (member: TeamMember) => string;
  onSelect: (memberId: string) => void;
}

export function TeamMemberWorkingList({
  members,
  sessionActivity,
  memberName,
  onSelect,
}: TeamMemberWorkingListProps) {
  const workingMembers = members.filter((member) => member.status === 'working');
  if (workingMembers.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 mt-1">
      <div className="text-[9px] text-[#9A9A9A] uppercase tracking-wide">进行中</div>
      {workingMembers.map((member) => {
        const activityLabel = getMemberActivityLabel(
          member.sessionID ? sessionActivity[member.sessionID] : undefined,
        );
        return (
          <button
            key={member.id}
            type="button"
            onClick={() => onSelect(member.id)}
            className="flex items-center gap-1.5 py-0.5 text-left min-w-0 w-full rounded px-0.5 hover:bg-[#F5F5F5] transition-colors"
          >
            <TeamMemberSpinner size={10} />
            <span className="text-[10px] text-[#1F1F1F] shrink-0">{memberName(member)}</span>
            <TeamMemberActivityText label={activityLabel} />
          </button>
        );
      })}
    </div>
  );
}
