import { Wrench } from 'lucide-react';
import { useContextMenu } from './ContextMenu';

interface SubProcessItemProps {
  title: string;
  isRunning?: boolean;
}

export function SubProcessItem({ title, isRunning }: SubProcessItemProps) {
  const { handleContextMenu } = useContextMenu('subprocess', { title });

  return (
    <div
      onContextMenu={handleContextMenu}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-[#9EA1AA] hover:bg-[#2A2B2D] hover:text-[#D8DEE9] cursor-pointer transition-colors"
    >
      <Wrench size={14} />
      <span className="flex-1 truncate">{title}</span>
      {isRunning && (
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
      )}
    </div>
  );
}
