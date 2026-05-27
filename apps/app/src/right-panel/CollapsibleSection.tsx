import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function CollapsibleSection({ title, collapsed, onToggle, children }: CollapsibleSectionProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-1 w-full text-xs font-semibold uppercase tracking-wider text-[#9A9A9A] hover:text-[#1F1F1F] py-1 transition-colors"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <span>{title}</span>
      </button>
      {!collapsed && children}
    </div>
  );
}
