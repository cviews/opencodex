import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { opencodeSettingsProvider } from '../services/opencodeAdapter';
import type { SettingsProvider } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface ModelSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ModelSelectorModal({ isOpen, onClose }: ModelSelectorModalProps) {
  const [providers, setProviders] = useState<SettingsProvider[]>(opencodeSettingsProvider.getSettingsProviders());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'default' | 'available'>('default');

  useEscapeKey(onClose, isOpen);

  useEffect(() => {
    opencodeSettingsProvider.fetchSettingsProviders().then(setProviders);
  }, []);

  if (!isOpen) return null;

  const toggleProvider = (providerId: string) => {
    setProviders(prev =>
      prev.map(p =>
        p.id === providerId ? { ...p, expanded: !p.expanded } : p
      )
    );
  };

  const toggleModel = (providerId: string, modelId: string) => {
    setProviders(prev =>
      prev.map(p =>
        p.id === providerId
          ? {
              ...p,
              models: p.models.map(m =>
                m.id === modelId ? { ...m, enabled: !m.enabled } : m
              ),
            }
          : p
      )
    );
  };

  const selectAll = (providerId: string) => {
    setProviders(prev =>
      prev.map(p =>
        p.id === providerId
          ? { ...p, models: p.models.map(m => ({ ...m, enabled: true })) }
          : p
      )
    );
  };

  const unselectAll = (providerId: string) => {
    setProviders(prev =>
      prev.map(p =>
        p.id === providerId
          ? { ...p, models: p.models.map(m => ({ ...m, enabled: false })) }
          : p
      )
    );
  };

  const filteredProviders = providers.map(provider => ({
    ...provider,
    models: provider.models.filter(
      model =>
        model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        provider.name.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(provider => provider.models.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-white/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#E5E5E5]">
          <div>
            <h2 className="text-lg font-semibold text-[#1F1F1F]">Models</h2>
            <p className="text-xs text-[#6B6B6B]">Choose which models appear in the model selector.</p>
          </div>
          <button
            onClick={onClose}
            className="text-[#6B6B6B] hover:text-[#1F1F1F] p-1 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-2 p-4 border-b border-[#E5E5E5]">
          <button
            onClick={() => setActiveTab('default')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'default'
                ? 'bg-[#F0F0F0] text-[#1F1F1F]'
                : 'text-[#6B6B6B] hover:text-[#1F1F1F]'
            }`}
          >
            Default model
          </button>
          <button
            onClick={() => setActiveTab('available')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'available'
                ? 'bg-[#F0F0F0] text-[#1F1F1F]'
                : 'text-[#6B6B6B] hover:text-[#1F1F1F]'
            }`}
          >
            Available models
          </button>
        </div>

        <div className="p-4 border-b border-[#E5E5E5]">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9A9A]" />
            <input
              type="text"
              placeholder="Search providers and models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-[#E5E5E5] rounded-lg text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filteredProviders.map((provider) => (
            <div key={provider.id} className="mb-4">
              <button
                onClick={() => toggleProvider(provider.id)}
                className="flex items-center gap-2 w-full text-left mb-2"
              >
                <span className="text-xs text-[#9A9A9A]">{provider.expanded ? '▼' : '▶'}</span>
                <span className="text-sm font-medium text-[#1F1F1F]">{provider.name}</span>
                <span className="text-xs text-[#9A9A9A]">
                  {provider.models.filter(m => m.enabled).length}/{provider.models.length} models
                </span>
              </button>

              {provider.expanded && (
                <div className="ml-4">
                  <div className="flex gap-2 mb-2 text-xs">
                    <button
                      onClick={() => selectAll(provider.id)}
                      className="text-[#2B8FFF] hover:underline"
                    >
                      Select all
                    </button>
                    <span className="text-[#9A9A9A]">|</span>
                    <button
                      onClick={() => unselectAll(provider.id)}
                      className="text-[#2B8FFF] hover:underline"
                    >
                      Unselect all
                    </button>
                  </div>
                  {provider.models.map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center gap-3 py-2 hover:bg-[#F5F5F5] rounded cursor-pointer"
                      onClick={() => toggleModel(provider.id, model.id)}
                    >
                      <div
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                          model.enabled
                            ? 'bg-[#1F1F1F] border-[#1F1F1F]'
                            : 'border-[#E5E5E5]'
                        }`}
                      >
                        {model.enabled && (
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <span className="text-sm text-[#1F1F1F]">{model.name}</span>
                        <span className="text-xs text-[#9A9A9A] ml-2">{model.modelId}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end p-4 border-t border-[#E5E5E5]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#1F1F1F] border border-[#E5E5E5] rounded-lg hover:bg-[#F5F5F5] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
