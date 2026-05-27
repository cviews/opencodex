import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface Operation {
  id: string;
  name: string;
  command: string;
}

interface ProjectConfig {
  name: string;
  path: string;
  setupScript: string;
  cleanupScript: string;
  activePlatform: 'default' | 'macos' | 'linux' | 'windows';
  operations: Operation[];
}

interface ProjectConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: { id: string; name: string; path: string } | null;
  onSave: (config: ProjectConfig) => void;
  onRemove?: () => void;
}

const PLATFORMS = [
  { id: 'default' as const, label: '默认' },
  { id: 'macos' as const, label: 'macOS' },
  { id: 'linux' as const, label: 'Linux' },
  { id: 'windows' as const, label: 'Windows' },
];

export function ProjectConfigModal({ isOpen, onClose, project, onSave, onRemove }: ProjectConfigModalProps) {
  const [config, setConfig] = useState<ProjectConfig>({
    name: project?.name || '',
    path: project?.path || '',
    setupScript: '',
    cleanupScript: '',
    activePlatform: 'default',
    operations: [],
  });

  useEscapeKey(onClose, isOpen && project !== null);

  if (!isOpen || !project) return null;

  const addOperation = () => {
    setConfig(prev => ({
      ...prev,
      operations: [...prev.operations, { id: Date.now().toString(), name: '', command: '' }],
    }));
  };

  const removeOperation = (id: string) => {
    setConfig(prev => ({
      ...prev,
      operations: prev.operations.filter(o => o.id !== id),
    }));
  };

  const updateOperation = (id: string, field: 'name' | 'command', value: string) => {
    setConfig(prev => ({
      ...prev,
      operations: prev.operations.map(o => o.id === id ? { ...o, [field]: value } : o),
    }));
  };

  const handleSave = () => {
    onSave(config);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#E5E5E5]">
          <h2 className="text-lg font-semibold text-[#1F1F1F]">环境</h2>
          <button
            onClick={onClose}
            className="text-[#6B6B6B] hover:text-[#1F1F1F] p-1 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6">
            <h3 className="text-sm font-medium text-[#1F1F1F] mb-3">本地环境</h3>
            <div className="flex items-center gap-3 p-3 border border-[#E5E5E5] rounded-lg">
              <svg className="w-5 h-5 text-[#6B6B6B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <div>
                <div className="text-sm font-medium text-[#1F1F1F]">{project.name}</div>
                <div className="text-xs text-[#6B6B6B]">{project.path}</div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-[#1F1F1F] mb-2">名称</label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] focus:outline-none focus:border-[#2B8FFF]"
            />
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-medium text-[#1F1F1F] mb-1">设置脚本</h3>
            <p className="text-xs text-[#6B6B6B] mb-3">创建工作树时在项目根目录下运行</p>
            
            <div className="flex gap-2 mb-3">
              {PLATFORMS.map((platform) => (
                <button
                  key={platform.id}
                  onClick={() => setConfig(prev => ({ ...prev, activePlatform: platform.id }))}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    config.activePlatform === platform.id
                      ? 'text-[#1F1F1F] bg-[#F0F0F0]'
                      : 'text-[#6B6B6B] hover:text-[#1F1F1F]'
                  }`}
                >
                  {platform.label}
                </button>
              ))}
              <button className="ml-auto text-sm text-[#6B6B6B] hover:text-[#1F1F1F] transition-colors">
                变量
              </button>
            </div>
            
            <textarea
              value={config.setupScript}
              onChange={(e) => setConfig(prev => ({ ...prev, setupScript: e.target.value }))}
              placeholder={`cd "$OPENCODEX_WORKTREE_PATH"\npip install -r requirements.txt\nnpm install\n./run/setup.sh`}
              rows={6}
              className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] font-mono placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF] resize-y"
            />
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-medium text-[#1F1F1F] mb-1">清理脚本</h3>
            <p className="text-xs text-[#6B6B6B] mb-3">清理工作树之前在项目根目录下运行</p>
            
            <div className="flex gap-2 mb-3">
              {PLATFORMS.map((platform) => (
                <button
                  key={platform.id}
                  onClick={() => setConfig(prev => ({ ...prev, activePlatform: platform.id }))}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    config.activePlatform === platform.id
                      ? 'text-[#1F1F1F] bg-[#F0F0F0]'
                      : 'text-[#6B6B6B] hover:text-[#1F1F1F]'
                  }`}
                >
                  {platform.label}
                </button>
              ))}
            </div>
            
            <textarea
              value={config.cleanupScript}
              onChange={(e) => setConfig(prev => ({ ...prev, cleanupScript: e.target.value }))}
              placeholder={`docker compose down --remove-orphans\nrm -rf .cache/tmp`}
              rows={4}
              className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] font-mono placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF] resize-y"
            />
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#1F1F1F]">操作</h3>
              <button
                onClick={addOperation}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-[#1F1F1F] border border-[#E5E5E5] rounded-md hover:bg-[#F5F5F5] transition-colors"
              >
                <Plus size={14} />
                添加操作
              </button>
            </div>
            <p className="text-xs text-[#6B6B6B] mb-3">这些操作可以运行任意命令并将显示在标头中。</p>
            
            <div className="space-y-3">
              {config.operations.map((operation) => (
                <div key={operation.id} className="p-4 border border-[#E5E5E5] rounded-lg">
                  <div className="mb-3">
                    <label className="block text-xs text-[#6B6B6B] mb-1.5">名称</label>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded bg-[#F0F0F0] flex items-center justify-center">
                        <svg className="w-4 h-4 text-[#6B6B6B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        placeholder="操作名称"
                        value={operation.name}
                        onChange={(e) => updateOperation(operation.id, 'name', e.target.value)}
                        className="flex-1 px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
                      />
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <label className="block text-xs text-[#6B6B6B] mb-1.5">操作脚本</label>
                    <textarea
                      placeholder="npm run dev"
                      value={operation.command}
                      onChange={(e) => updateOperation(operation.id, 'command', e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] font-mono placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF] resize-y"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs text-[#6B6B6B] mb-0.5">平台</label>
                      <p className="text-xs text-[#9A9A9A]">仅在特定操作系统上运行。</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#6B6B6B]">平台特定</span>
                      <button
                        onClick={() => removeOperation(operation.id)}
                        className="text-[#9A9A9A] hover:text-[#EC5F66] p-1 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {config.operations.length === 0 && (
                <p className="text-sm text-[#9A9A9A] text-center py-4 border border-dashed border-[#E5E5E5] rounded-lg">
                  添加操作，以便从本地工具栏运行命令。
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-[#E5E5E5]">
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#EC5F66] hover:bg-[#FFF5F5] rounded-lg transition-colors"
            >
              <Trash2 size={14} />
              移除项目
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm text-white bg-[#1F1F1F] rounded-lg hover:bg-[#333333] transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
