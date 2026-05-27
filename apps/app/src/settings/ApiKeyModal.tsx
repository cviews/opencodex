import { useState, useEffect } from 'react';
import { X, Zap } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';

type ProviderType = 'volcengine-coding' | 'zhipuai-coding' | 'other';

interface ProviderPreset {
  baseURL: string;
  npm: string;
  defaultProviderKey: string;
}

const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  'volcengine-coding': {
    baseURL: 'https://ark.cn-beijing.volces.com/api/coding/v3',
    npm: '@ai-sdk/openai-compatible',
    defaultProviderKey: 'volcengine-coding',
  },
  'zhipuai-coding': {
    baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
    npm: '@ai-sdk/openai-compatible',
    defaultProviderKey: 'zhipuai-coding',
  },
};

function computeDefaultKey(baseKey: string, existingKeys: Set<string>): string {
  if (!existingKeys.has(baseKey)) return baseKey;
  let i = 1;
  while (existingKeys.has(`${baseKey}-${i}`)) i++;
  return `${baseKey}-${i}`;
}

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerName: string;
  providerType?: ProviderType;
  defaultProviderKey?: string;
  existingProviderKeys?: string[];
  onSubmit: (apiKey: string, name: string, providerKey: string) => void;
}

export function ApiKeyModal({ isOpen, onClose, providerName, providerType = 'other', defaultProviderKey, existingProviderKeys = [], onSubmit }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [name, setName] = useState('');
  const [providerKey, setProviderKey] = useState('');

  useEscapeKey(onClose, isOpen);

  useEffect(() => {
    if (isOpen) {
      const preset = PROVIDER_PRESETS[providerType];
      const baseKey = preset?.defaultProviderKey ?? '';
      const existingSet = new Set(existingProviderKeys);
      const computedKey = defaultProviderKey ?? computeDefaultKey(baseKey, existingSet);
      setProviderKey(computedKey);
      setName('');
      setApiKey('');
    }
  }, [isOpen, providerType, defaultProviderKey, existingProviderKeys]);

  if (!isOpen) return null;

  const preset = PROVIDER_PRESETS[providerType];

  const handleSubmit = () => {
    if (apiKey.trim() && providerKey.trim()) {
      onSubmit(apiKey.trim(), name.trim() || providerName, providerKey.trim());
      setApiKey('');
      setName('');
      setProviderKey('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-[#E5E5E5]">
          <div className="flex items-center gap-2">
            <Zap size={20} className="text-[#1F1F1F]" />
            <h2 className="text-lg font-semibold text-[#1F1F1F]">连接 {providerName}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#6B6B6B] hover:text-[#1F1F1F] p-1 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm text-[#6B6B6B] mb-6">
            输入你的 {providerName} API 密钥以连接帐户，并在 OpenCode 中使用 {providerName} 模型。
          </p>

          {preset && (
            <div className="space-y-3 mb-6">
              <div>
                <label className="block text-xs text-[#9A9A9A] mb-1">Base URL</label>
                <div className="px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg bg-[#F5F5F5] text-[#6B6B6B] select-all">
                  {preset.baseURL}
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#9A9A9A] mb-1">NPM 包</label>
                <div className="px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg bg-[#F5F5F5] text-[#6B6B6B] select-all">
                  {preset.npm}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-[#6B6B6B] mb-1.5">
                Provider Key
              </label>
              <input
                type="text"
                placeholder={preset?.defaultProviderKey ?? 'my-provider'}
                value={providerKey}
                onChange={(e) => setProviderKey(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
              />
              <p className="text-xs text-[#9A9A9A] mt-1">
                写入 opencode.json 的提供商标识符（provider[id]），使用小写字母、数字、连字符
              </p>
            </div>

            <div>
              <label className="block text-sm text-[#6B6B6B] mb-1.5">
                配置名称
              </label>
              <input
                type="text"
                placeholder={providerName}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
              />
            </div>

            <div>
              <label className="block text-sm text-[#6B6B6B] mb-1.5">
                {providerName} API 密钥
              </label>
              <input
                type="password"
                placeholder="API 密钥"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end p-4 border-t border-[#E5E5E5]">
          <button
            onClick={handleSubmit}
            disabled={!apiKey.trim() || !providerKey.trim()}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              apiKey.trim() && providerKey.trim()
                ? 'text-white bg-[#1F1F1F] hover:bg-[#333333]'
                : 'text-[#9A9A9A] bg-[#F0F0F0] cursor-not-allowed'
            }`}
          >
            提交
          </button>
        </div>
      </div>
    </div>
  );
}