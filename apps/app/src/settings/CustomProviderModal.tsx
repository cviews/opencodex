import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useProviderStore } from '../stores/provider';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface ModelField {
  id: string;
  modelId: string;
  displayName: string;
}

interface HeaderField {
  id: string;
  name: string;
  value: string;
}

interface CustomProviderForm {
  providerId: string;
  displayName: string;
  npm: string;
  baseUrl: string;
  apiKey: string;
  models: ModelField[];
  headers: HeaderField[];
}

interface CustomProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CustomProviderModal({ isOpen, onClose }: CustomProviderModalProps) {
  const addProvider = useProviderStore((s) => s.addProvider);
  const reloadServerConfig = useProviderStore((s) => s.reloadServerConfig);
  const [submitting, setSubmitting] = useState(false);

  useEscapeKey(onClose, isOpen);

const [form, setForm] = useState<CustomProviderForm>({
    providerId: '',
    displayName: '',
    npm: '@ai-sdk/openai-compatible',
    baseUrl: '',
    apiKey: '',
    models: [{ id: '1', modelId: '', displayName: '' }],
    headers: [],
  });

  if (!isOpen) return null;

  const addModel = () => {
    setForm(prev => ({
      ...prev,
      models: [...prev.models, { id: Date.now().toString(), modelId: '', displayName: '' }],
    }));
  };

  const removeModel = (id: string) => {
    setForm(prev => ({
      ...prev,
      models: prev.models.filter(m => m.id !== id),
    }));
  };

  const updateModel = (id: string, field: 'modelId' | 'displayName', value: string) => {
    setForm(prev => ({
      ...prev,
      models: prev.models.map(m => m.id === id ? { ...m, [field]: value } : m),
    }));
  };

  const addHeader = () => {
    setForm(prev => ({
      ...prev,
      headers: [...prev.headers, { id: Date.now().toString(), name: '', value: '' }],
    }));
  };

  const removeHeader = (id: string) => {
    setForm(prev => ({
      ...prev,
      headers: prev.headers.filter(h => h.id !== id),
    }));
  };

  const updateHeader = (id: string, field: 'name' | 'value', value: string) => {
    setForm(prev => ({
      ...prev,
      headers: prev.headers.map(h => h.id === id ? { ...h, [field]: value } : h),
    }));
  };

const handleSubmit = async () => {
    if (!form.providerId.trim() || !form.baseUrl.trim()) return;

    setSubmitting(true);
    try {
      const modelsRecord: Record<string, { name: string }> = {};
      for (const model of form.models) {
        if (model.modelId.trim()) {
          modelsRecord[model.modelId.trim()] = { name: model.displayName.trim() || model.modelId.trim() };
        }
      }

      const headersRecord: Record<string, string> = {};
      for (const header of form.headers) {
        if (header.name.trim() && header.value.trim()) {
          headersRecord[header.name.trim()] = header.value.trim();
        }
      }

      const config = {
        npm: form.npm || '@ai-sdk/openai-compatible',
        name: form.displayName || form.providerId,
        options: {
          baseURL: form.baseUrl,
          apiKey: form.apiKey,
          ...(Object.keys(headersRecord).length > 0 ? { headers: headersRecord } : {}),
        },
        ...(Object.keys(modelsRecord).length > 0 ? { models: modelsRecord } : {}),
      };

      await addProvider(form.providerId.trim(), config);
      await reloadServerConfig();
      onClose();
    } catch (error) {
      console.error('Failed to add provider:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#E5E5E5]">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-[#1F1F1F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h2 className="text-lg font-semibold text-[#1F1F1F]">自定义提供商</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#6B6B6B] hover:text-[#1F1F1F] p-1 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-sm text-[#6B6B6B] mb-6">
            配置与 OpenAI 兼容的提供商。请查看<a href="#" className="text-[#2B8FFF] hover:underline">提供商配置文档</a>。
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-[#6B6B6B] mb-1.5">提供商 ID</label>
              <input
                type="text"
                placeholder="myprovider"
                value={form.providerId}
                onChange={(e) => setForm(prev => ({ ...prev, providerId: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
              />
              <p className="text-xs text-[#9A9A9A] mt-1">使用小写字母、数字、连字符或下划线</p>
            </div>

            <div>
              <label className="block text-sm text-[#6B6B6B] mb-1.5">显示名称</label>
              <input
                type="text"
                placeholder="我的 AI 提供商"
                value={form.displayName}
                onChange={(e) => setForm(prev => ({ ...prev, displayName: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
              />
            </div>

            <div>
              <label className="block text-sm text-[#6B6B6B] mb-1.5">NPM 包</label>
              <input
                type="text"
                placeholder="@ai-sdk/openai-compatible"
                value={form.npm}
                onChange={(e) => setForm(prev => ({ ...prev, npm: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
              />
              <p className="text-xs text-[#9A9A9A] mt-1">默认为 @ai-sdk/openai-compatible</p>
            </div>

            <div>
              <label className="block text-sm text-[#6B6B6B] mb-1.5">基础 URL</label>
              <input
                type="text"
                placeholder="https://api.myprovider.com/v1"
                value={form.baseUrl}
                onChange={(e) => setForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
              />
            </div>

            <div>
              <label className="block text-sm text-[#6B6B6B] mb-1.5">API 密钥</label>
              <input
                type="password"
                placeholder="API 密钥"
                value={form.apiKey}
                onChange={(e) => setForm(prev => ({ ...prev, apiKey: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
              />
              <p className="text-xs text-[#9A9A9A] mt-1">可选。如果你通过请求头管理认证，可留空。</p>
            </div>

            <div>
              <label className="block text-sm text-[#6B6B6B] mb-1.5">模型</label>
              <div className="space-y-2">
                {form.models.map((model) => (
                  <div key={model.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="model-id"
                      value={model.modelId}
                      onChange={(e) => updateModel(model.id, 'modelId', e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
                    />
                    <input
                      type="text"
                      placeholder="显示名称"
                      value={model.displayName}
                      onChange={(e) => updateModel(model.id, 'displayName', e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
                    />
                    {form.models.length > 1 && (
                      <button
                        onClick={() => removeModel(model.id)}
                        className="text-[#9A9A9A] hover:text-[#EC5F66] p-1 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={addModel}
                className="flex items-center gap-1 mt-2 text-sm text-[#1F1F1F] hover:text-[#2B8FFF] transition-colors"
              >
                <Plus size={14} />
                添加模型
              </button>
            </div>

            <div>
              <label className="block text-sm text-[#6B6B6B] mb-1.5">请求头（可选）</label>
              <div className="space-y-2">
                {form.headers.map((header) => (
                  <div key={header.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Header-Name"
                      value={header.name}
                      onChange={(e) => updateHeader(header.id, 'name', e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
                    />
                    <input
                      type="text"
                      placeholder="value"
                      value={header.value}
                      onChange={(e) => updateHeader(header.id, 'value', e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
                    />
                    <button
                      onClick={() => removeHeader(header.id)}
                      className="text-[#9A9A9A] hover:text-[#EC5F66] p-1 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={addHeader}
                className="flex items-center gap-1 mt-2 text-sm text-[#1F1F1F] hover:text-[#2B8FFF] transition-colors"
              >
                <Plus size={14} />
                添加请求头
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end p-4 border-t border-[#E5E5E5]">
          <button
            onClick={handleSubmit}
            disabled={submitting || !form.providerId.trim() || !form.baseUrl.trim()}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              !submitting && form.providerId.trim() && form.baseUrl.trim()
                ? 'text-white bg-[#1F1F1F] hover:bg-[#333333]'
                : 'text-[#9A9A9A] bg-[#F0F0F0] cursor-not-allowed'
            }`}
          >
            {submitting ? '提交中...' : '提交'}
          </button>
        </div>
      </div>
    </div>
  );
}
