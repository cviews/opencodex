import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { useMessageStore } from '../stores/message';
import { useSessionStore } from '../stores/session';
import { getDisplayTeamMembers, useTeamStore } from '../stores/team';
import { cursorToolLabel } from './activitySteps';

interface WorkerRow {
  id: string;
  name: string;
  sessionId: string;
}

function isWorkerRunning(
  sessionId: string,
  sessionRunStatus: Record<string, 'idle' | 'running' | 'error'>,
  loadingBySession: Record<string, boolean>,
): boolean {
  return (
    sessionRunStatus[sessionId] === 'running' ||
    loadingBySession[sessionId] === true
  );
}

interface DelegationParallelBannerProps {
  leadSessionId: string;
}

export function DelegationParallelBanner({ leadSessionId }: DelegationParallelBannerProps) {
  const { subAgents, sessionRunStatus } = useSessionStore();
  const { sessionActivity, loadingBySession } = useMessageStore();
  const { teamModeEnabled, currentTeam } = useTeamStore();

  const workers = useMemo(() => {
    const rows: WorkerRow[] = [];
    const seen = new Set<string>();

    const scopedSubAgents = subAgents.filter((a) => a.parentSessionId === leadSessionId);
    for (const agent of scopedSubAgents) {
      if (seen.has(agent.sessionId)) continue;
      seen.add(agent.sessionId);
      rows.push({
        id: agent.id,
        name: agent.title || agent.name || 'Sub-agent',
        sessionId: agent.sessionId,
      });
    }

    if (teamModeEnabled && currentTeam?.sessionId === leadSessionId) {
      for (const member of getDisplayTeamMembers(currentTeam, subAgents, leadSessionId)) {
        if (member.role === 'lead' || !member.sessionID) continue;
        if (seen.has(member.sessionID)) continue;
        seen.add(member.sessionID);
        rows.push({
          id: member.id,
          name: member.name,
          sessionId: member.sessionID,
        });
      }
    }

    return rows;
  }, [subAgents, leadSessionId, teamModeEnabled, currentTeam]);

  const runningWorkers = workers.filter((w) =>
    isWorkerRunning(w.sessionId, sessionRunStatus, loadingBySession),
  );

  if (runningWorkers.length === 0) return null;

  const names = runningWorkers.map((w) => w.name).join('、');
  const count = runningWorkers.length;

  return (
    <div className="delegation-parallel-banner mx-auto max-w-3xl rounded-xl border border-[#E8E0FF] bg-[#F8F6FF] px-4 py-3">
      <div className="flex items-start gap-2">
        <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-[#7C3AED]" />
        <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-[#4B5563]">
          <p className="font-medium text-[#1F1F1F]">
            等待 {count} 个成员完成后汇总输出
          </p>
          <p className="mt-1">
            {names} 正在并行工作中，完成后我会汇总结果。请稍候…
          </p>
          <ul className="mt-2 space-y-1">
            {runningWorkers.map((worker) => {
              const activity = sessionActivity[worker.sessionId];
              const label = activity?.toolName
                ? cursorToolLabel(activity.toolName)
                : activity?.label ?? '执行中';
              const detail = activity?.detail;
              return (
                <li
                  key={worker.sessionId}
                  className="flex min-w-0 items-center gap-2 font-mono text-[12px] text-[#6B7280]"
                >
                  <span className="shrink-0 text-[#7C3AED]">{worker.name}</span>
                  <span className="truncate">{label}</span>
                  {detail ? (
                    <span className="min-w-0 truncate text-[#9CA3AF]" title={detail}>
                      {detail}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
