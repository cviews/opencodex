import { useState, useEffect, useCallback } from 'react';
import type { ContextMenuState } from '../types';

interface ContextMenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
}

const SESSION_MENU_ITEMS: ContextMenuItem[] = [
  { label: 'Rename', action: () => { /* TODO */ } },
  { label: 'Pin', action: () => { /* TODO */ } },
  { label: 'Archive', action: () => { /* TODO */ } },
  { label: 'Delete', action: () => { /* TODO */ }, danger: true },
];

const SUBPROCESS_MENU_ITEMS: ContextMenuItem[] = [
  { label: 'Rename', action: () => { /* TODO */ } },
  { label: 'View output', action: () => { /* TODO */ } },
  { label: 'Stop', action: () => { /* TODO */ }, danger: true },
  { label: 'Delete', action: () => { /* TODO */ }, danger: true },
];

// Global menu state — only one context menu can be open at a time
let globalMenuState: ContextMenuState | null = null;
let globalSetMenuState: (state: ContextMenuState | null) => void = () => {};

export function registerMenuController(setter: (state: ContextMenuState | null) => void) {
  globalSetMenuState = setter;
}

// Singleton context menu — rendered once at the app level
export function GlobalContextMenu() {
  const [state, setState] = useState<ContextMenuState | null>(null);

  // Register this instance as the global controller
  useEffect(() => {
    registerMenuController(setState);
    return () => { registerMenuController(() => {}); };
  }, [setState]);

  // Close on click outside or Escape
  useEffect(() => {
    if (!state) return;
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') {
          setState(null);
          return;
        }
        // Ignore if the event originated from the menu itself
        if ((e.target as HTMLElement).closest('[data-context-menu]')) return;
      }
      // Close on any click outside the menu
      if (e instanceof MouseEvent) {
        if ((e.target as HTMLElement).closest('[data-context-menu]')) return;
        setState(null);
      }
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, [state]);

  if (!state) return null;

  const menuItems = state.type === 'session' ? SESSION_MENU_ITEMS : SUBPROCESS_MENU_ITEMS;

  return (
    <div
      data-context-menu
      className="fixed z-50 min-w-[160px] bg-[#343541] border border-white/[0.12] rounded-md shadow-lg py-1"
      style={{ left: state.x, top: state.y }}
    >
      {menuItems.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            item.action();
            setState(null);
          }}
          className={`flex items-center w-full px-3 py-1.5 text-sm transition-colors ${
            item.danger
              ? 'text-red-400 hover:bg-red-400/10'
              : 'text-[#D8DEE9] hover:bg-[#2A2B2D]'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function useContextMenu(type: 'session' | 'subprocess', itemData: Record<string, string>) {
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    globalSetMenuState({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      type,
      itemData,
    });
  }, [type, itemData]);

  return { handleContextMenu };
}
