import { TaskSidebar } from './TaskSidebar';
import { EditorSelector } from '../components/EditorSelector';
import { PanelActionsMenu } from '../components/PanelActionsMenu';

export function RightPanel({ onCollapse }: { onCollapse?: () => void }) {
  return (
    <div className="flex h-full flex-col app-panel-secondary overflow-hidden">
      <div
        className="flex items-center justify-between px-3 pt-[38px] pb-2 app-border-b"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span
          className="text-sm font-medium text-[var(--app-text)]"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          任务
        </span>
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <EditorSelector compact />
          <PanelActionsMenu />
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-1 rounded-md text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-hover)] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <TaskSidebar />
      </div>
    </div>
  );
}