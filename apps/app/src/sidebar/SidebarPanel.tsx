import { PanelLeftClose } from 'lucide-react';
import { NavLinks, ProjectSection, SettingsButton } from './NavLinks';

export function SidebarPanel({ onSettingsClick, onCollapse }: { onSettingsClick?: () => void; onCollapse?: () => void }) {
  return (
    <div className="flex h-full flex-col app-panel-sidebar app-border-r">
      <div className="flex items-center justify-between px-3 pt-[38px]" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <span className="text-sm font-medium text-[var(--app-text)]" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>对话</span>
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-1 rounded-md text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-hover)] transition-colors"
            >
              <PanelLeftClose size={16} />
            </button>
          )}
        </div>
      </div>
      <NavLinks />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ProjectSection />
      </div>
      <SettingsButton onClick={onSettingsClick} />
    </div>
  );
}
