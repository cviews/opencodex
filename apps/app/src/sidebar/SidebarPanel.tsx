import { PanelLeftClose } from 'lucide-react';
import { NavLinks, ProjectSection, SettingsButton } from './NavLinks';

export function SidebarPanel({ onSettingsClick, onCollapse }: { onSettingsClick?: () => void; onCollapse?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-[#F5F5F5] border-r border-[#E5E5E5]">
      <div className="flex items-center justify-between px-3 pt-[38px]" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <span className="text-sm font-medium text-[#1F1F1F]" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>对话</span>
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-1 rounded-md text-[#9A9A9A] hover:text-[#1F1F1F] hover:bg-[#E5E5E5] transition-colors"
            >
              <PanelLeftClose size={16} />
            </button>
          )}
        </div>
      </div>
      <NavLinks />
      <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <ProjectSection />
      </div>
      <SettingsButton onClick={onSettingsClick} />
    </div>
  );
}
