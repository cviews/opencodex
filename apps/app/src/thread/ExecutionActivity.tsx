import { Loader2, ShieldCheck, Terminal, FileIcon, Users } from 'lucide-react';
import type { SessionActivity } from '../stores/message';

function activityIcon(activity: SessionActivity) {
  if (activity.kind === 'permission') return ShieldCheck;
  if (activity.toolName === 'bash') return Terminal;
  if (activity.toolName?.startsWith('team_')) return Users;
  if (activity.toolName === 'read' || activity.toolName === 'edit') return FileIcon;
  return Loader2;
}

interface ExecutionActivityProps {
  activity: SessionActivity | null;
}

export function ExecutionActivity({ activity }: ExecutionActivityProps) {
  if (!activity) return null;

  const Icon = activityIcon(activity);
  const spinning = activity.kind !== 'permission';

  return (
    <div className="message-execution-activity flex items-start gap-2 rounded-lg border border-[#E8EEF8] bg-[#F7FAFF] px-3 py-2.5 text-sm">
      <Icon
        size={16}
        className={`mt-0.5 shrink-0 text-[#2B8FFF] ${spinning ? 'animate-spin' : ''}`}
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-[#1F1F1F]">{activity.label}</div>
        {activity.detail && (
          <div className="mt-0.5 truncate font-mono text-xs text-[#6B6B6B]">{activity.detail}</div>
        )}
        {activity.kind === 'permission' && (
          <div className="mt-1 text-xs font-medium text-[#B45309]">
            请在下方黄色审批条点击「允许一次」或「允许会话」
          </div>
        )}
      </div>
    </div>
  );
}
