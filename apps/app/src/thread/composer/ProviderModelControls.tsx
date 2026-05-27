import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { useClickOutside } from '../../hooks/useClickOutside';
import { opencodeProvider, opencodeSettings } from '../../services/opencodeAdapter';
import { useProviderStore } from '../../stores/provider';
import type { ProviderOption } from '../../types';
import { ProviderQuotaBadge } from './ProviderQuotaBadge';
import { ProviderQuotaTooltip } from './ProviderQuotaTooltip';
import { supportsProviderQuota } from './providerQuotaUtils';
import { setModelProviders } from './models';

function useDropDirection(ref: React.RefObject<HTMLElement | null>, isOpen: boolean): boolean {
  const [dropUp, setDropUp] = useState(true);
  useEffect(() => {
    if (!isOpen || !ref.current) return;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const DROPDOWN_EST = 240;
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceAbove >= DROPDOWN_EST || spaceBelow < DROPDOWN_EST);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [isOpen, ref]);
  return dropUp;
}

function computeTooltipPosition(rect: DOMRect, tooltipWidth = 240, tooltipHeight = 120): { top: number; left: number } {
  const GAP = 6;
  let left = rect.left - tooltipWidth - GAP;
  let top = rect.top;
  if (left < 8) {
    left = rect.right + GAP;
    if (left + tooltipWidth > window.innerWidth - 8) {
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
    }
  }
  if (top + tooltipHeight > window.innerHeight - 8) top = window.innerHeight - tooltipHeight - 8;
  if (top < 8) top = 8;
  return { top, left };
}

export function ProviderModelControls() {
  const [providers, setProviders] = useState<ProviderOption[]>(opencodeProvider.getProviders());
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption | null>(null);
  const [selectedModel, setSelectedModel] = useState<{ id: string; label: string } | null>(null);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [hoveredProviderId, setHoveredProviderId] = useState<string | null>(null);
  const [hoveredProviderType, setHoveredProviderType] = useState<string | null>(null);
  const [providerTooltipPos, setProviderTooltipPos] = useState({ top: 0, left: 0 });

  const providerStoreProviders = useProviderStore((s) => s.providers);
  const loadProviders = useProviderStore((s) => s.loadProviders);
  const providerMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const providerSearchRef = useRef<HTMLInputElement>(null);
  const modelSearchRef = useRef<HTMLInputElement>(null);

  const provDropUp = useDropDirection(providerMenuRef, showProviderDropdown);
  const modelDropUp = useDropDirection(modelMenuRef, showModelDropdown);

  const closeAll = () => {
    setShowProviderDropdown(false);
    setShowModelDropdown(false);
    setProviderSearch('');
    setModelSearch('');
    setHoveredProviderId(null);
    setHoveredProviderType(null);
  };

  useClickOutside([providerMenuRef, modelMenuRef], closeAll);

  useEffect(() => {
    loadProviders().catch(() => {});
  }, [loadProviders]);

  useEffect(() => {
    opencodeProvider.fetchModelProviders().then(setModelProviders).catch(() => {});
  }, [providerStoreProviders]);

  useEffect(() => {
    opencodeProvider.fetchProviders().then((loadedProviders) => {
      setProviders(loadedProviders);
      opencodeSettings.fetchDefaultModel().then((defaultModel) => {
        if (defaultModel && loadedProviders.length > 0) {
          const [defaultProviderId] = defaultModel.id.split('/');
          const matchedProvider = loadedProviders.find((p) => p.id === defaultProviderId);
          if (matchedProvider) {
            setSelectedProvider(matchedProvider);
            setSelectedModel(
              matchedProvider.models.find((m) => m.id === defaultModel.modelId) ?? matchedProvider.models[0] ?? null,
            );
          } else {
            setSelectedProvider(loadedProviders[0] ?? null);
            setSelectedModel(loadedProviders[0]?.models[0] ?? null);
          }
        } else {
          setSelectedProvider(loadedProviders[0] ?? null);
          setSelectedModel(loadedProviders[0]?.models[0] ?? null);
        }
      }).catch(() => {
        setSelectedProvider(loadedProviders[0] ?? null);
        setSelectedModel(loadedProviders[0]?.models[0] ?? null);
      });
    }).catch(() => {
      setSelectedProvider(null);
      setSelectedModel(null);
    });
  }, [providerStoreProviders]);

  useEffect(() => {
    if (showProviderDropdown && providerSearchRef.current) {
      providerSearchRef.current.focus();
    }
  }, [showProviderDropdown]);

  useEffect(() => {
    if (showModelDropdown && modelSearchRef.current) {
      modelSearchRef.current.focus();
    }
  }, [showModelDropdown]);

  const persistModel = async (provider: ProviderOption, model: { id: string; label: string }) => {
    const modelRef = `${provider.id}/${model.id}`;
    await opencodeProvider.setModel(provider.id, model.id);
    await opencodeSettings.setDefaultModel(modelRef);
  };

  const handleSelectProvider = async (provider: ProviderOption) => {
    const nextModel = provider.models.find((m) => m.id === selectedModel?.id) ?? provider.models[0] ?? null;
    setSelectedProvider(provider);
    setSelectedModel(nextModel);
    setShowProviderDropdown(false);
    setProviderSearch('');
    if (nextModel) {
      await persistModel(provider, nextModel);
    }
  };

  const handleSelectModel = async (model: { id: string; label: string }) => {
    setSelectedModel(model);
    setShowModelDropdown(false);
    setModelSearch('');
    if (selectedProvider) {
      await persistModel(selectedProvider, model);
    }
  };

  const filteredProviders = providers.filter(
    (p) =>
      !providerSearch ||
      p.label.toLowerCase().includes(providerSearch.toLowerCase()) ||
      p.id.toLowerCase().includes(providerSearch.toLowerCase()),
  );

  const filteredModels = (selectedProvider?.models ?? []).filter(
    (m) =>
      !modelSearch ||
      m.label.toLowerCase().includes(modelSearch.toLowerCase()) ||
      m.id.toLowerCase().includes(modelSearch.toLowerCase()),
  );

  const dropdownShell = (dropUp: boolean) =>
    `absolute right-0 min-w-[220px] max-w-[300px] bg-white border border-[#E5E5E5] rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] z-50 overflow-hidden ${
      dropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
    }`;

  const searchBox = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    inputRef: React.RefObject<HTMLInputElement | null>,
  ) => (
    <div className="px-2.5 py-2 border-b border-[#ECECEC] bg-[#FAFAFA]">
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white border border-[#E5E5E5]">
        <Search size={12} className="text-[#9A9A9A] shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full text-xs text-[#1F1F1F] placeholder-[#9A9A9A] bg-transparent focus:outline-none"
        />
      </div>
    </div>
  );

  const menuItemClass = (selected: boolean) =>
    `flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors ${
      selected ? 'bg-[#EEF4FF] text-[#1F1F1F]' : 'text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1F1F1F]'
    }`;

  return (
    <>
      <div className="relative" ref={providerMenuRef}>
        <button
          type="button"
          onClick={() => {
            setShowProviderDropdown(!showProviderDropdown);
            setShowModelDropdown(false);
          }}
          className="flex items-center gap-1 px-2 py-1 text-xs text-[#6B6B6B] hover:text-[#1F1F1F] bg-[#F0F0F0] rounded-md transition-colors max-w-[140px]"
        >
          <span className="truncate">{selectedProvider?.label ?? '提供商'}</span>
          <ChevronDown size={12} className="shrink-0 text-[#9A9A9A]" />
        </button>

        {showProviderDropdown && (
          <div className={dropdownShell(provDropUp)}>
            {searchBox(providerSearch, setProviderSearch, '搜索提供商...', providerSearchRef)}
            <div className="max-h-60 overflow-y-auto py-1">
              {filteredProviders.length > 0 ? (
                filteredProviders.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => void handleSelectProvider(provider)}
                    onMouseEnter={(e) => {
                      if (!supportsProviderQuota(provider.providerType)) return;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setHoveredProviderId(provider.id);
                      setHoveredProviderType(provider.providerType ?? null);
                      setProviderTooltipPos(computeTooltipPosition(rect));
                    }}
                    onMouseLeave={() => {
                      setHoveredProviderId(null);
                      setHoveredProviderType(null);
                    }}
                    className={menuItemClass(selectedProvider?.id === provider.id)}
                  >
                    <span className="truncate flex-1 text-left">{provider.label}</span>
                    <ProviderQuotaBadge providerId={provider.id} providerType={provider.providerType} />
                    {selectedProvider?.id === provider.id && <Check size={14} className="text-[#2B8FFF] shrink-0" />}
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-xs text-[#9A9A9A] text-center">暂无提供商</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="relative" ref={modelMenuRef}>
        <button
          type="button"
          onClick={() => {
            setShowModelDropdown(!showModelDropdown);
            setShowProviderDropdown(false);
          }}
          className="flex items-center gap-1 px-2 py-1 text-xs text-[#6B6B6B] hover:text-[#1F1F1F] bg-[#F0F0F0] rounded-md transition-colors max-w-[160px]"
        >
          <span className="truncate">{selectedModel?.label ?? '模型'}</span>
          <ChevronDown size={12} className="shrink-0 text-[#9A9A9A]" />
        </button>

        {showModelDropdown && (
          <div className={dropdownShell(modelDropUp)}>
            {searchBox(modelSearch, setModelSearch, '搜索模型...', modelSearchRef)}
            <div className="max-h-72 overflow-y-auto py-1">
              {filteredModels.length > 0 ? (
                filteredModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => void handleSelectModel(model)}
                    className={menuItemClass(selectedModel?.id === model.id)}
                  >
                    <span className="truncate flex-1 text-left">{model.label}</span>
                    {selectedModel?.id === model.id && <Check size={14} className="text-[#2B8FFF] shrink-0" />}
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-xs text-[#9A9A9A] text-center">
                  {selectedProvider ? '暂无模型' : '请先选择提供商'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showProviderDropdown && hoveredProviderId && hoveredProviderType && (
        <ProviderQuotaTooltip
          providerId={hoveredProviderId}
          providerType={hoveredProviderType}
          position={providerTooltipPos}
        />
      )}
    </>
  );
}
