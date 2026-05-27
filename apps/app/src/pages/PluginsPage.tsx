import { useState, useEffect } from 'react';
import { Puzzle, X, RefreshCw } from 'lucide-react';
import type { Plugin } from '../types';
import { opencodePlugins } from '../services/opencodeAdapter';
import { useEscapeKey } from '../hooks/useEscapeKey';

const SENSITIVE_KEYS = new Set([
  'apikey', 'api_key', 'apikey', 'token', 'secret', 'password', 'authorization',
  'accesstoken', 'access_token', 'refreshtoken', 'refresh_token',
]);

function isSensitive(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

function maskValue(value: string): string {
  if (value.length <= 6) return '••••••';
  return value.slice(0, 3) + '••••' + value.slice(-3);
}

function renderConfig(config: Record<string, unknown>, depth = 0): React.ReactNode[] {
  return Object.entries(config).map(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return (
        <div key={key} className={depth > 0 ? 'ml-4' : ''}>
          <div className="text-xs font-medium text-[#6B6B6B] mb-1">{key}</div>
          <div className="bg-white rounded-md p-3 space-y-2">
            {renderConfig(value as Record<string, unknown>, depth + 1)}
          </div>
        </div>
      );
    }
    if (Array.isArray(value)) {
      return (
        <div key={key} className={depth > 0 ? 'ml-4' : ''}>
          <div className="text-xs font-medium text-[#6B6B6B] mb-1">{key}</div>
          <div className="bg-white rounded-md p-3 text-xs text-[#1F1F1F]">
            {value.map((item, i) => (
              <div key={i} className="font-mono">{typeof item === 'string' ? item : JSON.stringify(item)}</div>
            ))}
          </div>
        </div>
      );
    }
    const strValue = String(value ?? '');
    const displayValue = isSensitive(key) ? maskValue(strValue) : strValue;
    return (
      <div key={key} className={`flex items-start gap-2 text-xs ${depth > 0 ? 'ml-4' : ''}`}>
        <span className="text-[#9A9A9A] shrink-0 font-mono">{key}:</span>
        <span className={`font-mono break-all ${isSensitive(key) ? 'text-[#9A9A9A]' : 'text-[#1F1F1F]'}`}>{displayValue}</span>
      </div>
    );
  });
}

export function PluginsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [plugins, setPlugins] = useState<Plugin[]>(opencodePlugins.getPlugins());
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);

  useEscapeKey(() => setSelectedPlugin(null), selectedPlugin !== null);

  useEffect(() => {
    opencodePlugins.fetchPlugins().then(setPlugins);
  }, []);

  const installedPlugins = plugins
    .filter((p) => p.installed)
    .filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()),
    );

  return (
    <div className="flex flex-col h-full bg-white relative">
      {toast.visible && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E5E5E5] rounded-lg shadow-lg">
            <svg className="w-4 h-4 text-[#10A37F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-[#1F1F1F]">{toast.message}</span>
            <button
              onClick={() => setToast((prev) => ({ ...prev, visible: false }))}
              className="text-[#9A9A9A] hover:text-[#1F1F1F] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-8 py-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#1F1F1F]">插件</h1>
          <p className="text-sm text-[#6B6B6B] mt-1">
            扩展 OpenCodex 的功能插件。了解更多
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-1 px-3 py-1.5 text-sm text-[#6B6B6B] hover:text-[#1F1F1F] hover:bg-[#F0F0F0] rounded-md transition-colors">
            <RefreshCw size={14} />
            刷新
          </button>
          <div className="relative">
            <input
              type="text"
              placeholder="搜索插件"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 px-3 py-1.5 text-sm bg-white border border-[#E5E5E5] rounded-md text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
            />
          </div>
          
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="mb-4">
          <h2 className="text-sm font-medium text-[#6B6B6B]">已安装</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-4xl">
          {installedPlugins.map((plugin) => (
            <div
              key={plugin.id}
              onClick={() => setSelectedPlugin(plugin)}
              className="flex items-start gap-3 bg-white border border-[#E5E5E5] rounded-lg p-4 hover:border-[#2B8FFF]/30 transition-colors cursor-pointer"
            >
              <Puzzle size={24} className="text-[#2B8FFF]" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-[#1F1F1F]">{plugin.name}</span>
                </div>
                <p className="text-xs text-[#6B6B6B]">{plugin.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedPlugin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setSelectedPlugin(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-start justify-between p-6 border-b border-[#E5E5E5]">
              <div className="flex items-start gap-4">
                <Puzzle size={28} className="text-[#2B8FFF] shrink-0" />
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-[#1F1F1F] mb-1">{selectedPlugin.name}</h2>
                  <p className="text-sm text-[#6B6B6B]">{selectedPlugin.description}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPlugin(null)}
                className="text-[#6B6B6B] hover:text-[#1F1F1F] p-1 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="text-sm font-medium text-[#1F1F1F] mb-3">配置信息</h3>
              {selectedPlugin.config ? (
                <div className="bg-[#F5F5F5] rounded-lg p-4 space-y-2">
                  {renderConfig(selectedPlugin.config)}
                </div>
              ) : (
                <p className="text-sm text-[#9A9A9A]">暂无配置信息</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}