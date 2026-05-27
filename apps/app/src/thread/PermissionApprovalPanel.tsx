import {
  ShieldCheck,
  XCircle,
  Clock3,
  Check,
  Terminal,
  FileEdit,
  FileIcon,
  FilePlus,
  Users,
  Globe,
  Zap,
} from 'lucide-react';
import type { PendingPermission } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface PermissionApprovalPanelProps {
  permission: PendingPermission | null;
  onApprove: (permissionId: string, mode: 'once' | 'session') => void;
  onDeny: (permissionId: string) => void;
}

const kindIcons: Record<string, React.ElementType> = {
  bash: Terminal,
  edit: FileEdit,
  read: FileIcon,
  write: FilePlus,
  external_directory: FileIcon,
  task: Users,
  webfetch: Globe,
  skill: Zap,
  team_spawn: Users,
  team_create: Users,
  team_shutdown: Users,
  team_cleanup: Users,
};

const kindTitles: Record<string, string> = {
  external_directory: '允许读取项目外文件',
  team_spawn: '允许创建团队成员',
  team_create: '允许创建团队',
  team_shutdown: '允许关闭团队成员',
  team_cleanup: '允许清理团队',
  bash: '允许执行命令',
};

function getKindIcon(kind: string): React.ElementType {
  return kindIcons[kind] ?? ShieldCheck;
}

export function PermissionApprovalPanel({
  permission,
  onApprove,
  onDeny,
}: PermissionApprovalPanelProps) {
  useEscapeKey(
    () => {
      if (permission) onDeny(permission.id);
    },
    permission !== null,
  );

  if (!permission) return null;

  const KindIcon = getKindIcon(permission.kind);

  return (
    <div className="relative z-30 border-b border-[#FCD34D] bg-[#FFFBEB] shadow-sm">
      <div className="px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-xl border border-[#FCD34D] bg-white overflow-hidden shadow-md">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border border-[#E5E5E5] bg-[#F5F5F5] text-[#666]">
                  <KindIcon size={16} strokeWidth={1.9} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium leading-5 text-[#1F1F1F]">
                    {kindTitles[permission.kind] ?? permission.title}
                  </div>
                  <div className="mt-1 text-[12px] leading-5 text-[#666]">
                    {permission.message || 'AI 正在等待你确认此操作，请选择下方按钮后继续。'}
                  </div>
                  {permission.sessionId && (
                    <div className="mt-1 text-[11px] text-[#9A9A9A]">
                      会话：{permission.sessionId.replace(/^ses_/, '').slice(0, 12)}…
                    </div>
                  )}
                  {permission.scope && (
                    <div className="mt-2 font-mono text-[12px] text-[#1F1F1F] bg-[#F5F5F5] rounded-lg px-3 py-2 border border-[#E5E5E5]">
                      {permission.scope}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-4 pb-3 flex items-center gap-2">
              <button
                onClick={() => onDeny(permission.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#EC5F66]/25 text-[#EC5F66] hover:bg-[#EC5F66]/10 transition-colors"
              >
                <XCircle size={12} />
                拒绝
              </button>
              <button
                onClick={() => onApprove(permission.id, 'once')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#2B8FFF] text-white hover:bg-[#1a7adf] transition-colors"
              >
                <Clock3 size={12} />
                允许一次
              </button>
              <button
                onClick={() => onApprove(permission.id, 'session')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#E5E5E5] bg-white text-[#1F1F1F] hover:bg-[#F5F5F5] transition-colors"
              >
                <Check size={12} />
                允许会话
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}