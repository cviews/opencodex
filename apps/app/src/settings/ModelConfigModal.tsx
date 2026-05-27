import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface ModelProperty {
  id: string;
  name: string;
  value: string;
}

interface SdkOption {
  id: string;
  name: string;
  value: string;
}

interface ModelConfig {
  modelId: string;
  displayName: string;
  properties: ModelProperty[];
  sdkOptions: SdkOption[];
}

interface ModelConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerName: string;
  initialConfig?: ModelConfig;
  onSubmit: (config: ModelConfig) => void;
}

export function ModelConfigModal({ isOpen, onClose, providerName, initialConfig, onSubmit }: ModelConfigModalProps) {
  const [config, setConfig] = useState<ModelConfig>({
    modelId: '',
    displayName: '',
    properties: [],
    sdkOptions: [],
  });

  useEscapeKey(onClose, isOpen);

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
    } else {
      setConfig({
        modelId: `model-${Date.now()}`,
        displayName: '',
        properties: [],
        sdkOptions: [],
      });
    }
  }, [initialConfig, isOpen]);

  if (!isOpen) return null;

  const addProperty = () => {
    setConfig(prev => ({
      ...prev,
      properties: [...prev.properties, { id: Date.now().toString(), name: '', value: '' }],
    }));
  };

  const removeProperty = (id: string) => {
    setConfig(prev => ({
      ...prev,
      properties: prev.properties.filter(p => p.id !== id),
    }));
  };

  const updateProperty = (id: string, field: 'name' | 'value', value: string) => {
    setConfig(prev => ({
      ...prev,
      properties: prev.properties.map(p => p.id === id ? { ...p, [field]: value } : p),
    }));
  };

  const addSdkOption = () => {
    setConfig(prev => ({
      ...prev,
      sdkOptions: [...prev.sdkOptions, { id: Date.now().toString(), name: '', value: '' }],
    }));
  };

  const removeSdkOption = (id: string) => {
    setConfig(prev => ({
      ...prev,
      sdkOptions: prev.sdkOptions.filter(o => o.id !== id),
    }));
  };

  const updateSdkOption = (id: string, field: 'name' | 'value', value: string) => {
    setConfig(prev => ({
      ...prev,
      sdkOptions: prev.sdkOptions.map(o => o.id === id ? { ...o, [field]: value } : o),
    }));
  };

  const handleSubmit = () => {
    onSubmit(config);
    onClose();
  };

  const jsonPreview = JSON.stringify(
    {
      npm: '@ai-sdk/openai-compatible',
      options: {
        baseURL: '',
        apiKey: '',
        setCacheKey: true,
      },
      models: {
        [config.modelId]: {
          name: config.displayName,
          ...config.properties.reduce((acc, p) => ({ ...acc, [p.name]: p.value }), {}),
        },
      },
    },
    null,
    2
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#E5E5E5]">
          <h2 className="text-lg font-semibold text-[#1F1F1F]">
            {initialConfig ? '编辑模型' : '添加模型'} - {providerName}
          </h2>
          <button
            onClick={onClose}
            className="text-[#6B6B6B] hover:text-[#1F1F1F] p-1 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm text-[#6B6B6B] mb-1.5">模型 ID</label>
              <input
                type="text"
                value={config.modelId}
                onChange={(e) => setConfig(prev => ({ ...prev, modelId: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
              />
            </div>
            <div>
              <label className="block text-sm text-[#6B6B6B] mb-1.5">显示名称</label>
              <input
                type="text"
                value={config.displayName}
                onChange={(e) => setConfig(prev => ({ ...prev, displayName: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
              />
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#1F1F1F]">模型属性</h3>
              <button
                onClick={addProperty}
                className="text-[#6B6B6B] hover:text-[#1F1F1F] transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
            <p className="text-xs text-[#9A9A9A] mb-2">模型属性 (variants, cost 等)，点击 + 添加</p>
            {config.properties.map((prop) => (
              <div key={prop.id} className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  placeholder="属性名称"
                  value={prop.name}
                  onChange={(e) => updateProperty(prop.id, 'name', e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
                />
                <input
                  type="text"
                  placeholder="属性值"
                  value={prop.value}
                  onChange={(e) => updateProperty(prop.id, 'value', e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
                />
                <button
                  onClick={() => removeProperty(prop.id)}
                  className="text-[#9A9A9A] hover:text-[#EC5F66] p-1 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#1F1F1F]">SDK 选项</h3>
              <button
                onClick={addSdkOption}
                className="text-[#6B6B6B] hover:text-[#1F1F1F] transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
            <p className="text-xs text-[#9A9A9A] mb-2">模型选项，点击 + 添加</p>
            {config.sdkOptions.map((option) => (
              <div key={option.id} className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  placeholder="选项名称"
                  value={option.name}
                  onChange={(e) => updateSdkOption(option.id, 'name', e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
                />
                <input
                  type="text"
                  placeholder="选项值"
                  value={option.value}
                  onChange={(e) => updateSdkOption(option.id, 'value', e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
                />
                <button
                  onClick={() => removeSdkOption(option.id)}
                  className="text-[#9A9A9A] hover:text-[#EC5F66] p-1 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-sm font-medium text-[#1F1F1F] mb-3">配置 JSON</h3>
            <pre className="bg-[#F5F5F5] rounded-lg p-4 text-xs text-[#1F1F1F] overflow-x-auto">
              {jsonPreview}
            </pre>
          </div>
        </div>

        <div className="flex justify-end p-4 border-t border-[#E5E5E5]">
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm text-white bg-[#1F1F1F] rounded-lg hover:bg-[#333333] transition-colors"
          >
            提交
          </button>
        </div>
      </div>
    </div>
  );
}
