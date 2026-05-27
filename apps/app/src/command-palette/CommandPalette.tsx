import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Settings, MessageSquare, Zap, FileCode, Terminal, PanelLeftClose, PanelRightClose } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface CommandItem {
  id: string;
  label: string;
  category: 'action' | 'session' | 'settings';
  icon: React.ReactNode;
  action: () => void;
}

const COMMANDS: CommandItem[] = [
  { id: 'new-chat', label: 'New chat', category: 'action', icon: <MessageSquare size={16} />, action: () => {} },
  { id: 'search', label: 'Search sessions', category: 'action', icon: <Search size={16} />, action: () => {} },
  { id: 'toggle-sidebar', label: 'Toggle sidebar', category: 'action', icon: <PanelLeftClose size={16} />, action: () => {} },
  { id: 'toggle-right-panel', label: 'Toggle right panel', category: 'action', icon: <PanelRightClose size={16} />, action: () => {} },
  { id: 'toggle-terminal', label: 'Toggle terminal', category: 'action', icon: <Terminal size={16} />, action: () => {} },
  { id: 'skills', label: 'Open Skills page', category: 'action', icon: <Zap size={16} />, action: () => {} },
  { id: 'open-settings', label: 'Open Settings', category: 'settings', icon: <Settings size={16} />, action: () => {} },
  { id: 'agent-config', label: 'Agent Configuration', category: 'settings', icon: <FileCode size={16} />, action: () => {} },
  { id: 'session-1', label: 'fix auth bug', category: 'session', icon: <MessageSquare size={16} />, action: () => {} },
  { id: 'session-2', label: 'add unit tests', category: 'session', icon: <MessageSquare size={16} />, action: () => {} },
];

function categoryLabel(category: string): string {
  switch (category) {
    case 'action': return 'Commands';
    case 'session': return 'Sessions';
    case 'settings': return 'Settings';
    default: return category;
  }
}

function groupByCategory(items: CommandItem[]): { category: string; items: CommandItem[] }[] {
  const groups: Record<string, CommandItem[]> = {};
  items.forEach((item) => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });
  return Object.entries(groups).map(([category, items]) => ({ category, items }));
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        setQuery('');
        setSelectedIndex(0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = COMMANDS.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  useEscapeKey(close, isOpen);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        close();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={close}
      />

      {/* Palette */}
      <div className="relative w-[480px] max-h-[360px] bg-[#343541] border border-white/[0.12] rounded-xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
          <Search size={16} className="text-[#9EA1AA]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, sessions, settings..."
            className="flex-1 bg-transparent text-sm text-[#D8DEE9] placeholder-[#9EA1AA] outline-none"
          />
          <kbd className="text-xs text-[#9EA1AA] bg-[#2A2B2D] px-1.5 py-0.5 rounded border border-white/[0.06]">Esc</kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto max-h-[280px] py-2">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-sm text-[#9EA1AA] text-center">No results found</div>
          )}
          {groupByCategory(filtered).map(({ category, items }) => (
            <div key={category}>
              <div className="px-4 py-1 text-xs font-semibold uppercase tracking-wider text-[#9EA1AA]">
                {categoryLabel(category)}
              </div>
              {items.map((item) => {
                const globalIdx = filtered.indexOf(item);
                return (
                  <button
                    key={item.id}
                    onClick={() => { item.action(); close(); }}
                    className={`flex items-center gap-2 px-4 py-2 w-full text-sm transition-colors ${
                      globalIdx === selectedIndex
                        ? 'bg-[#2A2B2D] text-[#D8DEE9]'
                        : 'text-[#9EA1AA] hover:text-[#D8DEE9] hover:bg-[#2A2B2D]'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
