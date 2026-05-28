import { useState, useEffect, type ReactNode } from 'react';
import { PanelRightOpen } from 'lucide-react';
import { SidebarPanel } from '../sidebar/SidebarPanel';
import { ThreadPanel } from '../thread/ThreadPanel';
import { RightPanel } from '../right-panel/RightPanel';
import { EditorSelector } from '../components/EditorSelector';
import { PanelActionsMenu } from '../components/PanelActionsMenu';

interface PanelState {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  leftWidth: number;
  rightWidth: number;
}

const STORAGE_KEY = 'codex-panel-state-v1';

const DEFAULT_STATE: PanelState = {
  leftCollapsed: false,
  rightCollapsed: false,
  leftWidth: 260,
  rightWidth: 300,
};

export function ThreePanelLayout({ children, onSettingsClick }: { children?: ReactNode; onSettingsClick?: () => void }) {
  const [panelState, setPanelState] = useState<PanelState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_STATE;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panelState));
  }, [panelState]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'b' && !e.altKey) {
        e.preventDefault();
        setPanelState((s) => ({ ...s, leftCollapsed: !s.leftCollapsed }));
      }
      if (e.metaKey && e.altKey && e.key === 'b') {
        e.preventDefault();
        setPanelState((s) => ({ ...s, rightCollapsed: !s.rightCollapsed }));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleLeft = () => setPanelState((s) => ({ ...s, leftCollapsed: !s.leftCollapsed }));
  const toggleRight = () => setPanelState((s) => ({ ...s, rightCollapsed: !s.rightCollapsed }));

  return (
    <div className="flex h-screen w-screen overflow-hidden app-shell">
      {/* Left sidebar */}
      <div
        className="transition-[width] duration-150 ease-in-out overflow-hidden app-border-r"
        style={{
          width: panelState.leftCollapsed ? 0 : panelState.leftWidth,
          pointerEvents: panelState.leftCollapsed ? 'none' : undefined,
        }}
      >
        {!panelState.leftCollapsed && (
          <div className="flex h-full flex-col">
            <SidebarPanel onSettingsClick={onSettingsClick} onCollapse={toggleLeft} />
          </div>
        )}
      </div>

      {/* Left resize handle */}
      {!panelState.leftCollapsed && (
        <div
          className="w-[2px] cursor-col-resize bg-transparent hover:bg-[#2B8FFF] transition-colors"
          onMouseDown={(e) => handleResize(e, 'left', setPanelState, panelState)}
        />
      )}

      {/* Center content */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col relative">
        {panelState.rightCollapsed && (
          <div
            className="absolute right-2 top-[38px] z-10 flex items-center gap-2"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <EditorSelector compact />
            <PanelActionsMenu />
            <button
              onClick={toggleRight}
              className="p-1.5 rounded-md text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-hover)] transition-colors"
            >
              <PanelRightOpen size={16} />
            </button>
          </div>
        )}
        <div className="flex-1 min-w-0 overflow-hidden">
          {children || <ThreadPanel leftCollapsed={panelState.leftCollapsed} onToggleLeft={toggleLeft} />}
        </div>
      </div>

      {/* Right resize handle */}
      {!panelState.rightCollapsed && (
        <div
          className="w-[2px] cursor-col-resize bg-transparent hover:bg-[#2B8FFF] transition-colors"
          onMouseDown={(e) => handleResize(e, 'right', setPanelState, panelState)}
        />
      )}

      {/* Right panel */}
      <div
        className="transition-[width] duration-150 ease-in-out overflow-hidden app-border-l"
        style={{ width: panelState.rightCollapsed ? 0 : panelState.rightWidth }}
      >
        {!panelState.rightCollapsed && (
          <div className="relative flex h-full flex-col">
            <RightPanel onCollapse={toggleRight} />
          </div>
        )}
      </div>
    </div>
  );
}

function handleResize(
  e: React.MouseEvent,
  side: 'left' | 'right',
  setState: React.Dispatch<React.SetStateAction<PanelState>>,
  state: PanelState,
) {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = side === 'left' ? state.leftWidth : state.rightWidth;

  const onMouseMove = (moveEvent: MouseEvent) => {
    const delta = side === 'left'
      ? moveEvent.clientX - startX
      : startX - moveEvent.clientX;
    const newWidth = Math.max(200, Math.min(500, startWidth + delta));
    setState((s) => ({
      ...s,
      [side === 'left' ? 'leftWidth' : 'rightWidth']: newWidth,
    }));
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}