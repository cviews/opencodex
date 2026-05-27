import { MessageSquare, Pin } from 'lucide-react';
import { useContextMenu } from './ContextMenu';

interface SessionItemProps {
  title: string;
  isActive?: boolean;
  isRunning?: boolean;
  isPinned?: boolean;
}

export function SessionItem({ title, isActive, isRunning, isPinned }: SessionItemProps) {
  const { handleContextMenu } = useContextMenu('session', { title });

  return (
    <div
      onContextMenu={handleContextMenu}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors ${
        isActive
          ? 'bg-[#2A2B2D] text-[#D8DEE9]'
          : 'text-[#9EA1AA] hover:bg-[#2A2B2D] hover:text-[#D8DEE9]'
      }`}
    >
      <MessageSquare size={14} className={isActive ? 'text-[#10A37F]' : ''} />
      <span className="flex-1 truncate">{title}</span>
      {isRunning && (
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
      )}
      {isPinned && <Pin size={12} className="text-[#9EA1AA]" />}
    </div>
  );
}
