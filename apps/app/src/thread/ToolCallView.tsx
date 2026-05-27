import { useState } from 'react';
import { t } from '../constants/i18n';
import {
  Terminal,
  FileEdit,
  FileIcon,
  FilePlus,
  FolderOpen,
  Search,
  Box,
  Check,
  AlertCircle,
  Loader2,
  ChevronDown,
  Copy,
} from 'lucide-react';
import type { ToolCall } from '../types';

type ToolCategory = 'read' | 'edit' | 'write' | 'search' | 'terminal' | 'glob' | 'task' | 'skill' | 'tool';

const categoryIcons: Record<ToolCategory, React.ElementType> = {
  read: FileIcon,
  edit: FileEdit,
  write: FilePlus,
  search: Search,
  terminal: Terminal,
  glob: FolderOpen,
  task: Box,
  skill: Box,
  tool: Box,
};

const categoryMap: Record<string, ToolCategory> = {
  read: 'read',
  edit: 'edit',
  write: 'write',
  grep: 'search',
  glob: 'glob',
  search: 'search',
  bash: 'terminal',
  task: 'task',
  skill: 'skill',
  webfetch: 'search',
};

function classifyTool(name: string): ToolCategory {
  return categoryMap[name] ?? 'tool';
}

interface ToolCallViewProps {
  toolCall: ToolCall;
}

export function ToolCallView({ toolCall }: ToolCallViewProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const category = classifyTool(toolCall.name);
  const Icon = categoryIcons[category];

  const statusConfig = {
    running: { icon: Loader2, color: 'text-[#2B8FFF]', label: t('toolcall_running'), animate: true },
    completed: { icon: Check, color: 'text-[#10A37F]', label: t('toolcall_completed'), animate: false },
    error: { icon: AlertCircle, color: 'text-[#EC5F66]', label: '失败', animate: false },
    pending: {
      icon: Loader2,
      color: 'text-[#9A9A9A]',
      label: '准备中',
      animate: true,
    },
  };

  const config = statusConfig[toolCall.status] ?? statusConfig.completed;
  const StatusIcon = config.icon;

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopied(section);
    setTimeout(() => setCopied(null), 1200);
  };

  const hasExpandableContent = toolCall.input || toolCall.output || toolCall.error;

  return (
    <div className="border border-[#E5E5E5] rounded-lg bg-white">
      <button
        onClick={() => hasExpandableContent && setExpanded(!expanded)}
        className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-left hover:bg-[#F5F5F5] transition-colors"
      >
        <Icon size={14} className="text-[#9A9A9A]" />
        <span className="flex-1 font-medium text-[#1F1F1F] truncate">{toolCall.name}</span>
        <div className="flex items-center gap-1.5">
          <StatusIcon
            size={14}
            className={`${config.color} ${config.animate ? 'animate-spin' : ''}`}
          />
          <span className={`text-xs ${config.color}`}>{config.label}</span>
          {hasExpandableContent && (
            <ChevronDown
              size={12}
              className={`text-[#9A9A9A] transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#E5E5E5] px-3 py-2 space-y-2">
          {toolCall.input && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-[#6B6B6B]">请求</span>
                <button
                  onClick={() => handleCopy(toolCall.input!, 'input')}
                  className="text-[#9A9A9A] hover:text-[#1F1F1F] p-0.5"
                  title="复制"
                >
                  {copied === 'input' ? <Check size={12} className="text-[#2B8FFF]" /> : <Copy size={12} />}
                </button>
              </div>
              <pre className="text-xs text-[#6B6B6B] bg-[#F5F5F5] rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                {toolCall.input}
              </pre>
            </div>
          )}
          {toolCall.output && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-[#6B6B6B]">结果</span>
                <button
                  onClick={() => handleCopy(toolCall.output!, 'output')}
                  className="text-[#9A9A9A] hover:text-[#1F1F1F] p-0.5"
                  title="复制"
                >
                  {copied === 'output' ? <Check size={12} className="text-[#2B8FFF]" /> : <Copy size={12} />}
                </button>
              </div>
              <pre className="text-xs text-[#6B6B6B] bg-[#F5F5F5] rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                {toolCall.output}
              </pre>
            </div>
          )}
          {toolCall.error && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-[#EC5F66]">错误</span>
                <button
                  onClick={() => handleCopy(toolCall.error!, 'error')}
                  className="text-[#9A9A9A] hover:text-[#1F1F1F] p-0.5"
                  title="复制"
                >
                  {copied === 'error' ? <Check size={12} className="text-[#2B8FFF]" /> : <Copy size={12} />}
                </button>
              </div>
              <pre className="text-xs text-[#EC5F66] bg-[#EC5F66]/5 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all font-mono border border-[#EC5F66]/20">
                {toolCall.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}