import { useState, useRef, useCallback, useEffect } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import { useSettingsStore } from '../stores/settings';
import type { EditorType } from '../stores/settings';
import vscodeIcon from '../assets/icons/vscode.svg';
import finderIcon from '../assets/icons/finder.svg';
import terminalIcon from '../assets/icons/terminal.svg';

const EDITOR_CONFIG: Record<EditorType, { label: string; iconSrc: string }> = {
  vscode: { label: 'VS Code', iconSrc: vscodeIcon },
  finder: { label: 'Finder', iconSrc: finderIcon },
  terminal: { label: 'Terminal', iconSrc: terminalIcon },
};

interface EditorSelectorProps {
  compact?: boolean;
}

export function EditorSelector({ compact = false }: EditorSelectorProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { selectedEditor, availableEditors, platform, isLoaded } = useSettingsStore();

  const closeDropdown = useCallback(() => setShowDropdown(false), []);
  useClickOutside([dropdownRef], closeDropdown, showDropdown);

  useEffect(() => {
    if (showDropdown && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const estimatedDropdownHeight = compact ? 120 : 160;
      setDropUp(spaceBelow < estimatedDropdownHeight);
    }
  }, [showDropdown, compact]);

  const isMacOS = platform === 'darwin';

  const visibleEditors = (Object.entries(availableEditors) as [EditorType, boolean][])
    .filter(([key, available]) => {
      if (key === 'vscode' && !available) return false;
      if ((key === 'finder' || key === 'terminal') && !isMacOS) return false;
      return true;
    })
    .map(([key]) => key);

  if (!isLoaded) return null;

  if (!isMacOS) {
    return <span className="text-xs text-[#9A9A9A]">仅支持 macOS</span>;
  }

  const current = EDITOR_CONFIG[selectedEditor];

  if (compact) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          ref={buttonRef}
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-[#6B6B6B] hover:text-[#1F1F1F] hover:bg-[#F0F0F0] rounded transition-colors"
        >
          <img src={current.iconSrc} alt={current.label} className="w-[14px] h-[14px]" />
          <svg className="w-3 h-3 flex-shrink-0 text-[#9A9A9A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showDropdown && visibleEditors.length > 0 && (
          <div className={`absolute ${dropUp ? 'bottom-full' : 'top-full'} right-0 ${dropUp ? 'mb-1' : 'mt-1'} w-36 bg-white border border-[#E5E5E5] rounded-lg shadow-lg py-1 z-50`}>
            {visibleEditors.map((editor) => {
              const cfg = EDITOR_CONFIG[editor];
              return (
                <button
                  key={editor}
                  onClick={() => {
                    useSettingsStore.getState().setSelectedEditor(editor);
                    setShowDropdown(false);
                  }}
                  className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors ${
                    editor === selectedEditor
                      ? 'text-[#1F1F1F] bg-[#F0F0F0]'
                      : 'text-[#6B6B6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F5]'
                  }`}
                >
                  <img src={cfg.iconSrc} alt={cfg.label} className="w-[14px] h-[14px]" />
                  <span>{cfg.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#6B6B6B] hover:text-[#1F1F1F] bg-[#F0F0F0] rounded-md transition-colors"
      >
        <img src={current.iconSrc} alt={current.label} className="w-4 h-4" />
        <svg className="w-4 h-4 text-[#9A9A9A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDropdown && visibleEditors.length > 0 && (
        <div className={`absolute ${dropUp ? 'bottom-full' : 'top-full'} right-0 ${dropUp ? 'mb-1' : 'mt-1'} w-48 bg-white border border-[#E5E5E5] rounded-lg shadow-lg py-1 z-50`}>
          {visibleEditors.map((editor) => {
            const cfg = EDITOR_CONFIG[editor];
            return (
              <button
                key={editor}
                onClick={() => {
                  useSettingsStore.getState().setSelectedEditor(editor);
                  setShowDropdown(false);
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${
                  editor === selectedEditor
                    ? 'text-[#1F1F1F] bg-[#F0F0F0]'
                    : 'text-[#6B6B6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F5]'
                }`}
              >
                <img src={cfg.iconSrc} alt={cfg.label} className="w-4 h-4" />
                <span>{cfg.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}