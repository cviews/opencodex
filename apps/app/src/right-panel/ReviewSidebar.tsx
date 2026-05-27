import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DiffBlock } from '../rendering/DiffBlock';

type ReviewScope = 'uncommitted' | 'branch' | 'last-turn';

export function ReviewSidebar() {
  const [scope, setScope] = useState<ReviewScope>('last-turn');
  const [showScopeDropdown, setShowScopeDropdown] = useState(false);

type FileStatus = 'M' | 'A' | 'D';

  const changedFiles: { file: string; status: FileStatus; added: number; removed: number }[] = [
    { file: 'auth/auth.ts', status: 'M', added: 12, removed: 3 },
    { file: 'auth/login.ts', status: 'M', added: 5, removed: 1 },
    { file: 'auth/fix.ts', status: 'A', added: 8, removed: 0 },
  ];

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="relative">
        <button
          onClick={() => setShowScopeDropdown(!showScopeDropdown)}
          className="flex items-center gap-1 px-2 py-1 text-xs text-[#9A9A9A] hover:text-[#1F1F1F] bg-[#F0F0F0] rounded transition-colors w-full"
        >
          <span className="font-medium">范围</span>
          <ChevronDown size={12} />
          <span className="ml-1">{scopeLabel(scope)}</span>
        </button>
        {showScopeDropdown && (
          <div className="absolute top-full left-0 mt-1 min-w-[180px] bg-white border border-[#E5E5E5] rounded-md shadow-lg py-1 z-10">
            {(['uncommitted', 'branch', 'last-turn'] as ReviewScope[]).map((s) => (
              <button
                key={s}
                onClick={() => { setScope(s); setShowScopeDropdown(false); }}
                className={`flex items-center w-full px-3 py-1.5 text-xs transition-colors ${
                  s === scope ? 'text-[#1F1F1F] bg-[#F0F0F0]' : 'text-[#9A9A9A] hover:text-[#1F1F1F] hover:bg-[#F5F5F5]'
                }`}
              >
                {scopeLabel(s)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-[#9A9A9A] uppercase tracking-wider">变更文件</span>
        {changedFiles.map((f) => (
          <div key={f.file} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-[#F0F0F0] cursor-pointer rounded transition-colors">
            <span className={`font-medium ${
              f.status === 'A' ? 'text-[#10A37F]' : f.status === 'D' ? 'text-[#EC5F66]' : 'text-[#9A9A9A]'
            }`}>
              {f.status}
            </span>
            <span className="flex-1 text-[#1F1F1F] truncate">{f.file}</span>
            <span className="text-[#10A37F]">+{f.added}</span>
            <span className="text-[#EC5F66]">-{f.removed}</span>
          </div>
        ))}
      </div>

      <DiffBlock content={`--- a/auth/login.ts\n+++ b/auth/login.ts\n- function check() {\n+ async function login() {\n+   await auth();\n+ }`} />

      <div className="flex gap-2 mt-2">
        <button className="px-3 py-1.5 text-xs text-[#1F1F1F] bg-[#F0F0F0] rounded hover:bg-[#E5E5E5] transition-colors">
          暂存
        </button>
        <button className="px-3 py-1.5 text-xs text-[#1F1F1F] bg-[#F0F0F0] rounded hover:bg-[#E5E5E5] transition-colors">
          提交
        </button>
      </div>
    </div>
  );
}

function scopeLabel(scope: ReviewScope): string {
  switch (scope) {
    case 'uncommitted': return '未提交的变更';
    case 'branch': return '所有分支变更';
    case 'last-turn': return '最近一次变更';
  }
}
