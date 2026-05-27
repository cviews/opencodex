import { X } from 'lucide-react';

interface TerminalDrawerProps {
  onClose: () => void;
}

export function TerminalDrawer({ onClose }: TerminalDrawerProps) {
  return (
    <div className="border-t border-white/[0.06] bg-[#1a1b1e] h-[200px] flex flex-col">
      <div className="flex items-center justify-between px-3 py-1 border-b border-white/[0.06]">
        <span className="text-xs text-[#9EA1AA]">Terminal</span>
        <button onClick={onClose} className="text-[#9EA1AA] hover:text-[#D8DEE9] p-0.5">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 p-3 overflow-y-auto">
        <div className="text-xs text-[#99C794] font-mono">$ git status</div>
        <div className="text-xs text-[#9EA1AA] font-mono mt-1">On branch main, nothing to commit</div>
      </div>
    </div>
  );
}
