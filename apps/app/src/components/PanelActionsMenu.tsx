import { useState, useRef } from 'react';
import { MoreHorizontal, Terminal } from 'lucide-react';
import { useClickOutside } from '../hooks/useClickOutside';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { openProjectTerminal } from '../services/openTerminal';
import { useTerminalI18n } from '../hooks/useTerminalI18n';
import { terminalLogError } from '../services/terminalLog';

export function PanelActionsMenu() {
  const { t } = useTerminalI18n();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useClickOutside([menuRef, buttonRef], () => setOpen(false), open);
  useEscapeKey(() => setOpen(false), open);

  const handleOpenTerminal = async () => {
    setOpen(false);
    const result = await openProjectTerminal();
    if (!result.success && result.error) {
      terminalLogError('open.failed', result.error);
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((value) => !value)}
        className="p-1 rounded-md text-[#9A9A9A] hover:text-[#1F1F1F] hover:bg-[#E5E5E5] transition-colors"
        aria-label="更多操作"
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 w-40 bg-white border border-[#E5E5E5] rounded-lg shadow-lg py-1 z-50"
        >
          <button
            onClick={handleOpenTerminal}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[#6B6B6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F5] transition-colors"
          >
            <Terminal size={14} className="text-[#9A9A9A]" />
            <span>{t('terminal.open')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
