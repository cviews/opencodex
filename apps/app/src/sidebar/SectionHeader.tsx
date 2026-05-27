import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';

interface SectionHeaderProps {
  icon: ReactNode;
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  draggable?: boolean;
  isProject?: boolean;
  actionIcon?: ReactNode;
  onActionClick?: () => void;
}

export function SectionHeader({
  icon,
  label,
  collapsed,
  onToggle,
  draggable,
  isProject,
  actionIcon,
  onActionClick,
}: SectionHeaderProps) {
  return (
    <div
      className="flex items-center gap-1 px-1 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#9EA1AA] hover:text-[#D8DEE9] group cursor-pointer select-none"
      onClick={onToggle}
    >
      {draggable && (
        <span className="opacity-0 group-hover:opacity-100 text-[#9EA1AA] cursor-grab">
          <GripVertical size={12} />
        </span>
      )}
      <span className="transition-transform duration-150">
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
      </span>
      <span>{icon}</span>
      <span className="flex-1">{label}</span>
      {isProject && (
        <span className="text-[10px] text-[#9EA1AA] bg-[#2A2B2D] px-1.5 py-0.5 rounded">
          project
        </span>
      )}
      {actionIcon && onActionClick && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onActionClick();
          }}
          className="opacity-0 group-hover:opacity-100 text-[#9EA1AA] hover:text-[#D8DEE9]"
        >
          {actionIcon}
        </button>
      )}
    </div>
  );
}
