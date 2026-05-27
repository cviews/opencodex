import { Timer, Plus, PlayCircle, PauseCircle, AlertCircle } from 'lucide-react';

interface Automation {
  id: string;
  name: string;
  trigger: string;
  status: 'active' | 'paused' | 'error';
  lastRun: string;
}

const PLACEHOLDER_AUTOMATIONS: Automation[] = [
  { id: '1', name: 'Auto-review PRs', trigger: 'On pull request creation', status: 'active', lastRun: '2 hours ago' },
  { id: '2', name: 'Daily code quality check', trigger: 'Every day at 9:00 AM', status: 'paused', lastRun: '3 days ago' },
  { id: '3', name: 'Deploy on merge', trigger: 'On merge to main', status: 'error', lastRun: 'Failed yesterday' },
];

const STATUS_CONFIG = {
  active: { icon: <PlayCircle size={14} />, color: 'text-[#10A37F]', bg: 'bg-[#10A37F]/10' },
  paused: { icon: <PauseCircle size={14} />, color: 'text-[#6B6B6B]', bg: 'bg-[#F0F0F0]' },
  error: { icon: <AlertCircle size={14} />, color: 'text-[#EC5F66]', bg: 'bg-[#EC5F66]/10' },
} as const;

export function AutomationsPage() {
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E5E5]">
        <div className="flex items-center gap-3">
          <Timer size={20} className="text-[#F59E0B]" />
          <h1 className="text-lg font-semibold text-[#1F1F1F]">自动化</h1>
          <span className="text-xs text-[#6B6B6B] bg-[#F0F0F0] px-1.5 py-0.5 rounded-full">3</span>
        </div>
        <button className="flex items-center gap-1 px-3 py-1.5 text-sm text-[#10A37F] bg-[#10A37F]/10 rounded hover:bg-[#10A37F]/20 transition-colors">
          <Plus size={14} />
          创建自动化
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-3 max-w-2xl">
          {PLACEHOLDER_AUTOMATIONS.map((auto) => {
            const config = STATUS_CONFIG[auto.status];
            return (
              <div
                key={auto.id}
                className="flex items-center gap-4 bg-white border border-[#E5E5E5] rounded-lg p-4 hover:border-[#2B8FFF]/30 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-[#1F1F1F]">{auto.name}</span>
                    <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${config.color} ${config.bg}`}>
                      {config.icon}
                      {auto.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#6B6B6B]">Trigger: {auto.trigger}</p>
                  <p className="text-xs text-[#6B6B6B] mt-0.5">Last run: {auto.lastRun}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
