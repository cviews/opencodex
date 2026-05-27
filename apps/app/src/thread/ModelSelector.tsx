import { useState, useEffect } from 'react';
import { opencodeProvider } from '../services/opencodeAdapter';

export function ModelSelector() {
  const [providers, setProviders] = useState(opencodeProvider.getProviders());
  const [selectedProvider, setSelectedProvider] = useState(providers[0] ?? null);
  const [selectedModel, setSelectedModel] = useState(providers[0]?.models[0] ?? null);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  useEffect(() => {
    opencodeProvider.fetchProviders().then(setProviders);
  }, []);

  if (!selectedProvider || !selectedModel) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Provider dropdown */}
      <div className="relative">
        <button
          onClick={() => { setShowProviderDropdown(!showProviderDropdown); setShowModelDropdown(false); }}
          className="flex items-center gap-1 px-2 py-1 text-xs text-[#9EA1AA] hover:text-[#D8DEE9] bg-[#2A2B2D] rounded transition-colors whitespace-nowrap"
        >
          {selectedProvider.label}
          <span className="text-[8px]">▾</span>
        </button>
        {showProviderDropdown && (
          <div className="absolute bottom-full left-0 mb-1 bg-[#343541] border border-white/[0.12] rounded-md shadow-lg py-1 z-10 whitespace-nowrap">
            {providers.map((provider) => (
              <button
                key={provider.id}
                onClick={() => {
                  setSelectedProvider(provider);
                  setSelectedModel(provider.models[0] ?? null);
                  setShowProviderDropdown(false);
                }}
                className={`flex items-center w-full px-3 py-1.5 text-xs transition-colors ${
                  provider.id === selectedProvider.id
                    ? 'text-[#D8DEE9] bg-[#2A2B2D]'
                    : 'text-[#9EA1AA] hover:text-[#D8DEE9] hover:bg-[#2A2B2D]'
                }`}
              >
                {provider.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Separator */}
      <span className="text-[#9EA1AA] text-xs">──</span>

      {/* Model dropdown */}
      <div className="relative">
        <button
          onClick={() => { setShowModelDropdown(!showModelDropdown); setShowProviderDropdown(false); }}
          className="flex items-center gap-1 px-2 py-1 text-xs text-[#9EA1AA] hover:text-[#D8DEE9] bg-[#2A2B2D] rounded transition-colors whitespace-nowrap"
        >
          {selectedModel.label}
          <span className="text-[8px]">▾</span>
        </button>
        {showModelDropdown && (
          <div className="absolute bottom-full left-0 mb-1 bg-[#343541] border border-white/[0.12] rounded-md shadow-lg py-1 z-10 whitespace-nowrap">
            {selectedProvider.models.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  setSelectedModel(model);
                  setShowModelDropdown(false);
                }}
                className={`flex items-center w-full px-3 py-1.5 text-xs transition-colors ${
                  model.id === selectedModel.id
                    ? 'text-[#D8DEE9] bg-[#2A2B2D]'
                    : 'text-[#9EA1AA] hover:text-[#D8DEE9] hover:bg-[#2A2B2D]'
                }`}
              >
                {model.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
