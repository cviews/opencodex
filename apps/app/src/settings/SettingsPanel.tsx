import { useEffect, useState, useRef, useCallback, useMemo, useLayoutEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Cpu, FileText, Folder, Info, Loader2, Plus, Puzzle, Search, Settings, Sun, Trash2, Users, X, Zap } from 'lucide-react';
import { opencodeEngine, opencodeSettings, opencodeProvider, opencodeSettingsProvider } from '../services/opencodeAdapter';
import { describeAgentPermission } from '../services/permissionNormalize';
import { MarkdownRenderer } from '../rendering/MarkdownRenderer';
import { getCustomAgents, useAgentStore } from '../stores/agent';

import { useProviderStore } from '../stores/provider';
import { useSettingsStore } from '../stores/settings';
import { EditorSelector } from '../components/EditorSelector';
import { CircularProgress } from '../components/CircularProgress';
import { QuotaDisplay } from '../components/QuotaDisplay';
import { useI18n } from '../constants/i18n';
import { getBuiltinPopularProviders } from '../constants/builtin';
import { ApiKeyModal } from './ApiKeyModal';
import { CustomProviderModal } from './CustomProviderModal';
import type { Agent, Team, ProviderEntry, ProviderConfig } from '../types';
import { useProjectStore } from '../stores/project';
import { useQuotaStore } from '../stores/quota';
import { readConfig, readPlugins, removePlugin } from '../services/configService';
import { ModelConfigModal } from './ModelConfigModal';
import { ProjectConfigModal } from './ProjectConfigModal';
import { useClickOutside } from '../hooks/useClickOutside';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useRemoveProject } from '../hooks/useRemoveProject';

type SettingsSection = 'general' | 'appearance' | 'agent-config' | 'archived-threads' | 'update' | 'team' | 'plugins';
type PromptMode = 'edit' | 'preview';
type PromptEditMode = PromptMode;

const inputClass = 'settings-input';
const buttonClass = 'settings-button';
const DEFAULT_AGENT_PERMISSION: Record<string, string> = {
  read: 'allow',
  glob: 'allow',
  grep: 'allow',
  lsp: 'allow',
  edit: 'deny',
  write: 'deny',
  bash: 'deny',
};
const INITIAL_DEFAULT_MODELS = opencodeSettingsProvider.getDefaultModels();
const INITIAL_CONNECTED_PROVIDERS = opencodeProvider.getConnectedProviders();
const POPULAR_PROVIDERS = getBuiltinPopularProviders();

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function normalizePromptText(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

const DROPDOWN_GAP = 4;
const VIEWPORT_PADDING = 8;

type MenuPlacement = 'bottom' | 'top';
type MenuAlign = 'start' | 'end';

interface FloatingMenuStyle {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: MenuPlacement;
}

interface FloatingMenuOptions {
  menuWidth?: number;
  align?: MenuAlign;
}

function useFloatingMenuStyle(
  triggerRef: React.RefObject<HTMLElement | null>,
  menuRef: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  preferredMaxHeight: number,
  contentKey: string | number,
  options: FloatingMenuOptions = {},
): FloatingMenuStyle | null {
  const { menuWidth: fixedWidth, align = 'start' } = options;
  const [style, setStyle] = useState<FloatingMenuStyle | null>(null);

  const update = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || !isOpen) {
      setStyle(null);
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const menuEl = menuRef.current;
    const measuredHeight = menuEl?.offsetHeight ?? preferredMaxHeight;
    const width = fixedWidth ?? Math.max(rect.width, 200);

    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING;
    const spaceAbove = rect.top - VIEWPORT_PADDING;

    let placement: MenuPlacement = 'bottom';
    if (spaceBelow < measuredHeight && spaceAbove > spaceBelow) {
      placement = 'top';
    } else if (spaceBelow < measuredHeight && spaceAbove <= spaceBelow) {
      placement = 'bottom';
    }

    const available = placement === 'bottom' ? spaceBelow : spaceAbove;
    const maxHeight = Math.min(preferredMaxHeight, Math.max(120, available - DROPDOWN_GAP));

    let top: number;
    if (placement === 'bottom') {
      top = rect.bottom + DROPDOWN_GAP;
    } else {
      const height = menuEl ? Math.min(menuEl.offsetHeight, maxHeight) : maxHeight;
      top = Math.max(VIEWPORT_PADDING, rect.top - DROPDOWN_GAP - height);
    }

    let left = align === 'end' ? rect.right - width : rect.left;
    if (left + width > window.innerWidth - VIEWPORT_PADDING) {
      left = window.innerWidth - width - VIEWPORT_PADDING;
    }
    left = Math.max(VIEWPORT_PADDING, left);

    setStyle({ top, left, width, maxHeight, placement });
  }, [triggerRef, menuRef, isOpen, preferredMaxHeight, fixedWidth, align]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setStyle(null);
      return;
    }

    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isOpen, update, contentKey]);

  return style;
}

function FloatingActionMenu({
  open,
  onClose,
  triggerRef,
  menuWidth = 160,
  align = 'end',
  children,
}: {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  menuWidth?: number;
  align?: MenuAlign;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const menuStyle = useFloatingMenuStyle(
    triggerRef,
    menuRef,
    open,
    280,
    'action-menu',
    { menuWidth, align },
  );

  useClickOutside([triggerRef, menuRef], onClose, open);

  if (!open || !menuStyle) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] bg-[var(--app-elevated)] border border-[var(--app-border)] rounded-lg shadow-lg py-1 overflow-hidden"
      style={{
        top: menuStyle.top,
        left: menuStyle.left,
        width: menuStyle.width,
        maxHeight: menuStyle.maxHeight,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

function parseMaxHeightPx(maxH: string): number {
  if (maxH.includes('72')) return 288;
  if (maxH.includes('48')) return 192;
  return 240;
}

function parseOptionalPositiveInteger(value: string): number | undefined {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function createAgentId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
  return slug || `a${Date.now()}`;
}

function SearchableSelect({
  options,
  value,
  onChange,
  searchPlaceholder,
  emptyText,
  searchable = true,
  maxH = 'max-h-60',
}: {
  options: { value: string; label: string; icon?: ReactNode }[];
  value: string;
  onChange: (v: string) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  searchable?: boolean;
  maxH?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const preferredMaxHeight = parseMaxHeightPx(maxH);

  const selected = options.find((o) => o.value === value);
  const filtered = searchable
    ? options.filter((o) => !search || o.label.toLowerCase().includes(search.toLowerCase()) || o.value.toLowerCase().includes(search.toLowerCase()))
    : options;

  const menuStyle = useFloatingMenuStyle(
    triggerRef,
    menuRef,
    open,
    preferredMaxHeight + (searchable ? 44 : 0),
    `${filtered.length}:${search}`,
    { align: 'start' },
  );

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  useClickOutside([containerRef, menuRef], () => {
    setOpen(false);
    setSearch('');
  }, open);

  const menu = open && menuStyle ? createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] bg-[var(--app-elevated)] border border-[var(--app-border)] rounded-lg shadow-lg overflow-hidden"
      style={{
        top: menuStyle.top,
        left: menuStyle.left,
        width: menuStyle.width,
        maxHeight: menuStyle.maxHeight,
      }}
    >
      {searchable && (
        <div className="px-2 py-1.5 border-b border-[var(--app-border)]">
          <div className="flex items-center gap-1.5">
            <Search size={12} className="text-[var(--app-text-muted)]" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder ?? '搜索...'}
              className="w-full text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] bg-transparent focus:outline-none"
            />
          </div>
        </div>
      )}
      <div className="overflow-y-auto py-1" style={{ maxHeight: menuStyle.maxHeight - (searchable ? 44 : 0) }}>
        {filtered.length > 0
          ? filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); setSearch(''); }}
                className={`flex items-center w-full px-3 py-1.5 text-xs transition-colors text-left ${opt.value === value ? 'text-[var(--app-text)] bg-[var(--app-active)]' : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:bg-[var(--app-hover)]'}`}
              >
                {opt.icon && <span className="mr-2">{opt.icon}</span>}
                <span className="truncate">{opt.label}</span>
              </button>
            ))
          : <div className="px-3 py-4 text-xs text-[var(--app-text-muted)] text-center">{emptyText ?? '无数据'}</div>
        }
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setOpen(!open); setSearch(''); }}
        className="w-full flex items-center justify-between pl-3 pr-10 py-2 text-sm text-[var(--app-text)] bg-[var(--app-elevated)] border border-[var(--app-border)] rounded-md focus:outline-none hover:bg-[var(--app-hover)] focus:bg-[var(--app-hover)] cursor-pointer text-left"
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)] pointer-events-none">
          <ChevronDown size={16} />
        </span>
      </button>
      {menu}
    </div>
  );
}



function sectionList(t: ReturnType<typeof useI18n>['t']): { id: SettingsSection; label: string }[] {
  return [
    { id: 'general', label: t('settings_general') },
    { id: 'appearance', label: t('settings_appearance') },
    { id: 'agent-config', label: t('settings_agent_config') },
    { id: 'archived-threads', label: t('settings_archived_threads') },
    { id: 'team', label: t('settings_team') },
    { id: 'plugins', label: t('settings_plugins') },
    { id: 'update', label: t('settings_update') },
  ];
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const { t } = useI18n();

  useEscapeKey(onClose, isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full h-full app-settings-shell flex">
        <div className="w-64 app-settings-nav app-border-r flex flex-col">
          <div
            className="flex items-center justify-between px-4 py-3 pt-[38px] app-border-b"
            style={{ WebkitAppRegion: 'drag' } as CSSProperties}
          >
            <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
              <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="text-[var(--app-text-secondary)] hover:text-[var(--app-text)] p-1 transition-colors"
              >
                <ArrowLeft size={16} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="text-sm font-medium text-[var(--app-text)] hover:text-[#2B8FFF] transition-colors"
              >
                返回应用
              </button>
            </div>
            <div style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
              <EditorSelector />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {sectionList(t).map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex items-center gap-2 w-full px-4 py-2 text-sm transition-colors app-settings-nav-item ${
                  activeSection === section.id ? 'app-settings-nav-item--active' : ''
                }`}
              >
                <span>{section.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto app-settings-content">
          {activeSection === 'general' && <GeneralSettingsContent />}
          {activeSection === 'appearance' && <AppearanceSettingsContent />}
          {activeSection === 'agent-config' && <AgentConfigSettingsContent />}
          {activeSection === 'archived-threads' && <ArchivedThreadsSettingsContent />}
          {activeSection === 'update' && <UpdateSettingsContent />}
          {activeSection === 'team' && <TeamSettingsContent />}
          {activeSection === 'plugins' && <PluginsSettingsContent />}
        </div>
      </div>
    </div>
  );
}

function GeneralSettingsContent() {
  const [defaultModel, setDefaultModel] = useState<{ id: string; name: string; modelId: string } | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [showReasoning, setShowReasoning] = useState(opencodeSettings.getShowReasoning());
  const [autoCompact, setAutoCompact] = useState(opencodeSettings.getAutoCompact());

  useEffect(() => {
    setModelLoading(true);
    opencodeSettings.fetchDefaultModel().then((model) => {
      setDefaultModel(model);
      setModelLoading(false);
    }).catch(() => {
      setDefaultModel(null);
      setModelLoading(false);
    });
    opencodeSettings.fetchShowReasoning().then(setShowReasoning).catch(() => setShowReasoning(true));
    opencodeSettings.fetchAutoCompact().then(setAutoCompact).catch(() => setAutoCompact(true));
  }, []);

  return (
    <div className="max-w-2xl mx-auto py-8 px-8">
      <h1 className="text-2xl font-semibold text-[#1F1F1F] mb-8">常规</h1>

      <div className="mb-8">
        <h2 className="text-sm font-medium text-[#1F1F1F] mb-1">模型</h2>
        <p className="text-xs text-[#6B6B6B] mb-4">选择默认对话模型并查看其推理方式。</p>
        <div className="flex items-center justify-between p-4 border border-[#E5E5E5] rounded-lg mb-4">
          <div>
            <div className="text-sm font-medium text-[#1F1F1F]">默认模型</div>
            <div className="text-xs text-[#6B6B6B] mt-1">
              {modelLoading ? '加载中...' : defaultModel?.name ?? '未配置'}
            </div>
          </div>
          <button
            onClick={() => useSettingsStore.getState().openConfigFile()}
            className={buttonClass}
          >
            打开配置
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <SettingsToggleRow
          title="显示推理过程"
          description="在消息中展示模型 reasoning 内容。"
          enabled={showReasoning}
          onChange={(value) => {
            setShowReasoning(value);
            opencodeSettings.setShowReasoning(value);
          }}
        />
        <SettingsToggleRow
          title="自动压缩上下文"
          description="上下文较长时自动触发压缩。"
          enabled={autoCompact}
          onChange={(value) => {
            setAutoCompact(value);
            opencodeSettings.setAutoCompact(value);
          }}
        />
      </div>
    </div>
  );
}

function AppearanceSettingsContent() {
  const { theme, setTheme, language, setLanguage } = useSettingsStore();
  const { t } = useI18n();

  const themeOptions: { value: 'system' | 'light' | 'dark'; label: string }[] = [
    { value: 'system', label: t('appearance_theme_system') },
    { value: 'light', label: t('appearance_theme_light') },
    { value: 'dark', label: t('appearance_theme_dark') },
  ];

  const languageOptions: { value: 'zh-CN' | 'en'; label: string }[] = [
    { value: 'zh-CN', label: t('appearance_language_zh') },
    { value: 'en', label: t('appearance_language_en') },
  ];

  return (
    <div className="max-w-2xl mx-auto py-8 px-8">
      <Header title={t('appearance_title')} desc={t('appearance_desc')} />

      <div className="space-y-8">
        <Section title={t('appearance_theme')} desc={t('appearance_theme_desc')}>
          <div className="flex gap-6">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={`flex flex-col items-center gap-2 p-1 rounded-xl transition-all ${
                  theme === option.value
                    ? 'ring-2 ring-[#2B8FFF]'
                    : 'hover:bg-[var(--app-hover)]'
                }`}
              >
                <div
                  className={`w-[140px] h-[90px] rounded-lg border ${
                    option.value === 'dark'
                      ? 'bg-[#1E1E1E] border-[#3A3A3A]'
                      : option.value === 'light'
                      ? 'bg-white border-[var(--app-border)]'
                      : 'bg-[var(--app-bg-secondary)] border-[var(--app-border)]'
                  }`}
                />
                <span className="text-sm text-[var(--app-text)]">{option.label}</span>
              </button>
            ))}
          </div>
          {theme === 'system' && (
            <p className="text-xs text-[#9A9A9A] mt-2">{t('appearance_theme_system_note')}</p>
          )}
        </Section>

        <Section title={t('appearance_language')} desc={t('appearance_language_desc')}>
          <div className="max-w-xs ml-auto">
            <SearchableSelect
              options={languageOptions.map((option) => ({ value: option.value, label: option.label }))}
              value={language}
              onChange={(value) => setLanguage(value as 'zh-CN' | 'en')}
              searchable={false}
            />
          </div>
        </Section>

        <Section title={t('appearance_window')} desc={t('appearance_window_desc')}>
          <Card>
            <SettingRow title="标题栏样式" desc="选择窗口标题栏的显示风格。">
              <span className="text-xs text-[#6B6B6B]">默认</span>
            </SettingRow>
          </Card>
        </Section>
      </div>
    </div>
  );
}

function AgentConfigSettingsContent() {
  const [connectedProviders, setConnectedProviders] = useState<ProviderEntry[]>(INITIAL_CONNECTED_PROVIDERS);
  const [popularProviders, setPopularProviders] = useState<ProviderEntry[]>(POPULAR_PROVIDERS);
  const [apiKeyModalProvider, setApiKeyModalProvider] = useState<string | null>(null);
  const [apiKeyModalReconfig, setApiKeyModalReconfig] = useState(false);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [modelConfigModal, setModelConfigModal] = useState<{ open: boolean; providerId: string; providerName: string }>({
    open: false,
    providerId: '',
    providerName: '',
  });
  const [configDropdownProviderId, setConfigDropdownProviderId] = useState<string | null>(null);
  const [reloadToast, setReloadToast] = useState<string | null>(null);
  const configDropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const addProvider = useProviderStore((s) => s.addProvider);
  const removeProvider = useProviderStore((s) => s.removeProvider);
  const reloadServerConfig = useProviderStore((s) => s.reloadServerConfig);

  useEffect(() => {
    opencodeProvider.fetchConnectedProviders().then((connected) => {
      setConnectedProviders(connected);
    }).catch((e) => console.warn('[Settings] fetchConnectedProviders failed:', e.message));
  }, []);

  const handleDisconnect = async (providerId: string) => {
    await removeProvider(providerId);
    const connected = await opencodeProvider.fetchConnectedProviders();
    setConnectedProviders(connected);
  };

  const handleConnect = (providerId: string) => {
    setApiKeyModalReconfig(false);
    setApiKeyModalProvider(providerId);
  };

  const handleApiKeySubmit = async (apiKey: string, name: string, providerKey: string) => {
    const modalProviderId = apiKeyModalProvider ?? '';
    if (apiKeyModalReconfig) {
      const existingProvider = connectedProviders.find(p => p.id === modalProviderId);
      const existingModels: ProviderConfig['models'] = {};
      if (existingProvider?.models) {
        existingProvider.models.forEach((m) => { existingModels[m.id] = { name: m.name, disable: !m.enabled }; });
      }
      const existingConfig = await readConfig();
      const existingProviderEntry = existingConfig?.provider?.[modalProviderId];
      const existingNpm = existingProviderEntry?.npm ?? '@ai-sdk/openai-compatible';
      const existingOptions = existingProviderEntry?.options ?? { baseURL: '', apiKey: '' };
      const existingBaseURL = (existingOptions.baseURL as string) ?? (modalProviderId === 'zhipuai-coding' ? 'https://open.bigmodel.cn/api/coding/paas/v4' : modalProviderId === 'volcengine-coding' ? 'https://ark.cn-beijing.volces.com/api/coding/v3' : '');
      const existingProviderType = existingProvider?.providerType ?? (existingProviderEntry as unknown as Record<string, unknown>)?.providerType as string ?? undefined;
      await addProvider(providerKey, { npm: existingNpm, name, providerType: existingProviderType, options: { ...existingOptions, baseURL: existingBaseURL, apiKey }, models: Object.keys(existingModels).length > 0 ? existingModels : {} });
      await reloadServerConfig();
      const connected = await opencodeProvider.fetchConnectedProviders();
      setConnectedProviders(connected);
      return;
    }
    const provider = POPULAR_PROVIDERS.find(p => p.id === apiKeyModalProvider);
    if (!provider) return;
    const baseURL = provider.providerType === 'zhipuai-coding' ? 'https://open.bigmodel.cn/api/coding/paas/v4' : provider.providerType === 'volcengine-coding' ? 'https://ark.cn-beijing.volces.com/api/coding/v3' : '';
    const models: ProviderConfig['models'] = {};
    INITIAL_DEFAULT_MODELS.forEach((m) => { models[m.id] = { name: m.name, disable: !m.enabled }; });
    await addProvider(providerKey, { npm: '@ai-sdk/openai-compatible', name, providerType: provider.providerType, options: { baseURL, apiKey }, models });
    await reloadServerConfig();
    const connected = await opencodeProvider.fetchConnectedProviders();
    setConnectedProviders(connected);
  };

const handleReloadConfig = async () => {
    const ok = await reloadServerConfig();
    const connected = await opencodeProvider.fetchConnectedProviders();
    setConnectedProviders(connected);
    setReloadToast(ok ? '配置已刷新' : '刷新完成（服务器可能需要重启才能生效）');
    setTimeout(() => setReloadToast(null), 3000);
  };

  const toggleProviderExpanded = (providerId: string) => {
    setConnectedProviders((prev) => prev.map((p) => p.id === providerId ? { ...p, expanded: !p.expanded } : p));
  };

  const toggleModelEnabled = (providerId: string, modelId: string) => {
    setConnectedProviders((prev) => prev.map((p) => {
      if (p.id !== providerId || !p.models) return p;
      return { ...p, models: p.models.map(m => m.id === modelId ? { ...m, enabled: !m.enabled } : m) };
    }));
  };

  const modalProvider = apiKeyModalReconfig
    ? connectedProviders.find((p) => p.id === apiKeyModalProvider)
    : POPULAR_PROVIDERS.find((p) => p.id === apiKeyModalProvider);

return (
    <div className="max-w-2xl mx-auto py-8 px-8">
      {reloadToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E5E5E5] rounded-lg shadow-lg">
            <svg className="w-4 h-4 text-[#10A37F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-[#1F1F1F]">{reloadToast}</span>
          </div>
        </div>
      )}
      <Header title="配置" desc="管理 OpenCode 提供商、API 密钥和模型列表。" />

      <div className="space-y-8">
        <Section title="已连接提供商" desc="从 opencode.json 和运行中服务读取的提供商。">
          <div className="flex items-center justify-between p-4 border border-[#E5E5E5] rounded-lg mb-4">
            <div>
              <div className="text-sm font-medium text-[#1F1F1F]">opencode.json</div>
              <div className="text-xs text-[#6B6B6B] mt-1">全局配置文件，点击使用当前选中的编辑器打开</div>
            </div>
            <button
              onClick={() => useSettingsStore.getState().openConfigFile()}
              className={buttonClass}
            >
              打开配置文件
            </button>
          </div>
          <Card>
            {connectedProviders.map((provider) => (
              <div key={provider.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Zap size={16} />
                      <span className="text-sm font-medium text-[#1F1F1F]">{provider.name}</span>
                      <ProviderQuotaIcon providerId={provider.id} apiKey={provider.apiKey} providerType={provider.providerType} />
                      {provider.tag && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[#F0F0F0] text-[#6B6B6B]">
                          {provider.tag}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#6B6B6B] mt-1">{provider.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {provider.models && provider.models.length > 0 && (
                      <button
                        onClick={() => toggleProviderExpanded(provider.id)}
                        className="text-[#6B6B6B] hover:text-[#1F1F1F] transition-colors"
                      >
                        <ChevronRight size={16} className={`transition-transform ${provider.expanded ? 'rotate-90' : ''}`} />
                      </button>
                    )}
                    <div className="relative">
                      <button
                        ref={configDropdownProviderId === provider.id ? configDropdownTriggerRef : undefined}
                        type="button"
                        onClick={() => setConfigDropdownProviderId(configDropdownProviderId === provider.id ? null : provider.id)}
                        className="p-1 text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors"
                      >
                        <Settings size={14} />
                      </button>
                      <FloatingActionMenu
                        open={configDropdownProviderId === provider.id}
                        onClose={() => setConfigDropdownProviderId(null)}
                        triggerRef={configDropdownTriggerRef}
                        menuWidth={168}
                        align="end"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setModelConfigModal({ open: true, providerId: provider.id, providerName: provider.name });
                            setConfigDropdownProviderId(null);
                          }}
                          className="w-full px-3 py-1.5 text-sm text-left text-[var(--app-text)] hover:bg-[var(--app-hover)]"
                        >
                          添加模型
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setApiKeyModalReconfig(true);
                            setApiKeyModalProvider(provider.id);
                            setConfigDropdownProviderId(null);
                          }}
                          className="w-full px-3 py-1.5 text-sm text-left text-[var(--app-text)] hover:bg-[var(--app-hover)]"
                        >
                          修改密钥
                        </button>
                        <button
                          type="button"
                          onClick={() => { handleReloadConfig(); setConfigDropdownProviderId(null); }}
                          className="w-full px-3 py-1.5 text-sm text-left text-[var(--app-text)] hover:bg-[var(--app-hover)]"
                        >
                          刷新配置
                        </button>
                        <button
                          type="button"
                          onClick={() => { handleDisconnect(provider.id); setConfigDropdownProviderId(null); }}
                          className="w-full px-3 py-1.5 text-sm text-left text-[#EC5F66] hover:bg-[var(--app-hover)]"
                        >
                          断开
                        </button>
                      </FloatingActionMenu>
                    </div>
                  </div>
                </div>
                {provider.expanded && provider.models && (
                  <div className="mt-3 space-y-2">
                    {provider.models.map((model) => (
                      <div key={model.id} className="flex items-center justify-between text-sm bg-[#F5F5F5] rounded-md px-3 py-2">
                        <span>{model.name}</span>
                        <ToggleSwitch enabled={model.enabled} onChange={() => toggleModelEnabled(provider.id, model.id)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {connectedProviders.length === 0 && <Empty text="尚未连接任何提供商。" />}
          </Card>
        </Section>

        <Section title="热门提供商" desc="快速添加推荐或自定义的 OpenAI 兼容提供商。">
          <Card>
            {popularProviders.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#1F1F1F]">{provider.name}</span>
                    {provider.tag && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[#F0F0F0] text-[#6B6B6B]">
                        {provider.tag}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#6B6B6B] mt-1">{provider.description}</div>
                </div>
                <button
                  onClick={() => {
                    if (provider.providerType === 'custom') {
                      setCustomModalOpen(true);
                    } else {
                      handleConnect(provider.id);
                    }
                  }}
                  className="px-3 py-1.5 text-sm text-white bg-[#1F1F1F] hover:bg-[#333333] rounded-lg transition-colors"
                >
                  连接
                </button>
              </div>
            ))}
          </Card>
        </Section>
      </div>

      <ApiKeyModal
        isOpen={apiKeyModalProvider !== null}
        onClose={() => { setApiKeyModalProvider(null); setApiKeyModalReconfig(false); }}
        providerName={modalProvider?.name ?? ''}
        providerType={
          modalProvider?.providerType === 'zhipuai-coding' || modalProvider?.providerType === 'volcengine-coding'
            ? modalProvider.providerType
            : 'other'
        }
        defaultProviderKey={apiKeyModalReconfig ? apiKeyModalProvider ?? undefined : undefined}
        existingProviderKeys={connectedProviders.map(p => p.id)}
        onSubmit={handleApiKeySubmit}
      />
      <CustomProviderModal isOpen={customModalOpen} onClose={() => setCustomModalOpen(false)} />
      <ModelConfigModal
        isOpen={modelConfigModal.open}
        onClose={() => setModelConfigModal({ open: false, providerId: '', providerName: '' })}
        providerName={modelConfigModal.providerName}
        onSubmit={() => {}}
/>
    </div>
  );
}

function ArchivedThreadsSettingsContent() {
  const { projects, addProject } = useProjectStore();
  const { removeProjectWithConfirm } = useRemoveProject();
  const [projectConfigModal, setProjectConfigModal] = useState<{
    open: boolean;
    project: { id: string; name: string; path: string } | null;
  }>({ open: false, project: null });
  const [pickingFolder, setPickingFolder] = useState(false);
  const { t } = useI18n();

  const handleRemoveProject = async (project: { id: string; name: string; path: string }) => {
    const removed = await removeProjectWithConfirm(project);
    if (removed && projectConfigModal.project?.id === project.id) {
      setProjectConfigModal({ open: false, project: null });
    }
  };

  const handleAddProject = async () => {
    if (pickingFolder) return;

    const api = (window as unknown as Record<string, unknown>)['electronAPI'] as
      | { openFolderDialog: () => Promise<string | null> }
      | undefined;
    if (api?.openFolderDialog) {
      setPickingFolder(true);
      try {
        const folder = await api.openFolderDialog();
        if (folder) {
          const pathParts = folder.split('/');
          const name = pathParts[pathParts.length - 1] || folder;
          addProject({ id: `proj-${Date.now()}`, name, path: folder });
        }
      } finally {
        setPickingFolder(false);
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-8">
      <Header title={t('settings_archived_threads')} desc="管理本地项目路径，添加的项目会在主页侧边栏显示。" />

      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-[#1F1F1F]">已添加的项目</h2>
          <button
            onClick={handleAddProject}
            disabled={pickingFolder}
            className="px-4 py-1.5 text-sm text-[#1F1F1F] border border-[#E5E5E5] rounded-full hover:bg-[#F5F5F5] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            添加项目
          </button>
        </div>

        <div className="space-y-2">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between p-4 border border-[#E5E5E5] bg-white rounded-lg hover:bg-[#F5F5F5] transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Folder size={16} className="text-[#6B6B6B] shrink-0" />
                <span className="text-sm text-[#1F1F1F] truncate">{project.name || project.path.split('/').pop()}</span>
                <span className="text-xs text-[#9A9A9A] truncate">{project.path}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleRemoveProject(project)}
                  className="p-2 text-[#9A9A9A] hover:text-[#EC5F66] transition-colors"
                  title="移除项目"
                  aria-label="移除项目"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setProjectConfigModal({ open: true, project })}
                  className="p-2 text-[#9A9A9A] hover:text-[#1F1F1F] transition-colors"
                  title="环境配置"
                  aria-label="环境配置"
                >
                  <Settings size={16} />
                </button>
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="p-6 text-sm text-[#9A9A9A] text-center border border-dashed border-[#E5E5E5] rounded-lg">
              暂无项目，点击上方按钮添加
            </div>
          )}
        </div>
      </div>

      <ProjectConfigModal
        isOpen={projectConfigModal.open}
        onClose={() => setProjectConfigModal({ open: false, project: null })}
        project={projectConfigModal.project}
        onSave={() => {}}
        onRemove={projectConfigModal.project ? () => void handleRemoveProject(projectConfigModal.project!) : undefined}
      />
    </div>
  );
}

function UpdateSettingsContent() {
  const [engineConnected, setEngineConnected] = useState(false);
  const [engineVersion, setEngineVersion] = useState('unknown');
  const [appVersion, setAppVersion] = useState('未知');
  const [checking, setChecking] = useState(false);
  const [backgroundCheck, setBackgroundCheck] = useState(true);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const reloadServerConfig = useProviderStore((s) => s.reloadServerConfig);

  useEffect(() => {
    opencodeEngine.fetchStatus().then((status) => {
      setEngineConnected(status.connected);
      setEngineVersion(status.version);
    });
    opencodeEngine.getAppVersion().then(setAppVersion);
  }, []);

  const handleCheckUpdate = () => {
    setChecking(true);
    window.setTimeout(() => setChecking(false), 2000);
  };

  const handleReloadConfig = async () => {
    await reloadServerConfig();
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-8">
      <h1 className="text-2xl font-semibold text-[#1F1F1F] mb-2">运行时</h1>
      <p className="text-sm text-[#6B6B6B] mb-8">本地引擎和 opencodex 服务器的状态。</p>

      <div className="border border-[#E5E5E5] rounded-lg p-4 mb-8">
        <div className="text-sm font-medium text-[#1F1F1F]">OpenCode 引擎</div>
        <div className="flex items-center gap-1.5 mt-3">
          <span className={`w-2 h-2 rounded-full ${engineConnected ? 'bg-[#10A37F]' : 'bg-[#9A9A9A]'}`} />
          <span className="text-sm text-[#1F1F1F]">{engineConnected ? '已连接' : '未连接'}</span>
          <span className="text-sm text-[#6B6B6B] ml-2 font-mono">{engineConnected ? engineVersion : ''}</span>
        </div>
        {engineConnected && (
          <div className="mt-3">
            <button onClick={handleReloadConfig} className={buttonClass}>
              刷新引擎配置
            </button>
          </div>
        )}
      </div>

      <h1 className="text-2xl font-semibold text-[#1F1F1F] mb-2">更新</h1>
      <p className="text-sm text-[#6B6B6B] mb-8">通过静默后台检查和安装控制保持应用为最新版本。</p>

      <div className="mb-8">
        <h2 className="text-sm font-medium text-[#1F1F1F] mb-1">应用版本</h2>
        <p className="text-sm text-[#6B6B6B] font-mono">{appVersion}</p>
      </div>

      <div className="flex items-center justify-between mb-8 pb-8 border-b border-[#E5E5E5]">
        <div>
          <h3 className="text-sm font-medium text-[#1F1F1F] mb-1">已是最新</h3>
          <p className="text-xs text-[#6B6B6B]">上次检查刚刚</p>
        </div>
        <button
          onClick={handleCheckUpdate}
          disabled={checking}
          className={`px-4 py-2 text-sm border border-[#E5E5E5] rounded-md transition-colors ${
            checking
              ? 'text-[#9A9A9A] bg-[#F0F0F0] cursor-not-allowed'
              : 'text-[#1F1F1F] hover:bg-[#F5F5F5]'
          }`}
        >
          {checking ? '检查中...' : '检查'}
        </button>
      </div>

      <div className="space-y-6">
        <SettingsToggleRow
          title="后台检查"
          description="opencodex 启动时始终检查，同时每天检查一次。"
          enabled={backgroundCheck}
          onChange={setBackgroundCheck}
        />
        <SettingsToggleRow
          title="自动更新"
          description="自动下载更新（安装前会提示）。"
          enabled={autoUpdate}
          onChange={setAutoUpdate}
        />
      </div>
    </div>
  );
}

function TeamSettingsContent() {
  const { agents, teams, addAgent, updateAgent, removeAgent, addTeam, updateTeam, removeTeam, fetchAgents, fetchTeams } = useAgentStore();
  const customAgents = useMemo(() => getCustomAgents(agents), [agents]);
  const { providers, loadProviders } = useProviderStore();
  const [providerEntries, setProviderEntries] = useState<ProviderEntry[]>(INITIAL_CONNECTED_PROVIDERS);

  const availableModels = useMemo(() => {
    const groups = new Map<string, { providerId: string; providerName: string; models: { id: string; label: string }[] }>();

    for (const [providerId, provider] of Object.entries(providers)) {
      const models = Object.entries(provider.models ?? {})
        .filter(([, modelConfig]) => !modelConfig.disable)
        .map(([modelId, modelConfig]) => ({ id: `${providerId}/${modelId}`, label: modelConfig.name || modelId }));
      if (models.length > 0) {
        groups.set(providerId, { providerId, providerName: provider.name || providerId, models });
      }
    }

    for (const provider of providerEntries) {
      if (!groups.has(provider.id) && provider.models && provider.models.length > 0) {
        const models = provider.models
          .filter((model) => model.enabled)
          .map((model) => ({ id: `${provider.id}/${model.id}`, label: model.name || model.id }));
        if (models.length > 0) {
          groups.set(provider.id, { providerId: provider.id, providerName: provider.name || provider.id, models });
        }
      }
    }

    if (groups.size === 0 && INITIAL_DEFAULT_MODELS.length > 0) {
      groups.set('default', {
        providerId: 'default',
        providerName: '默认模型',
        models: INITIAL_DEFAULT_MODELS.filter((model) => model.enabled).map((model) => ({ id: model.id, label: model.name || model.id })),
      });
    }

    return Array.from(groups.values());
  }, [providers, providerEntries]);

const [defaultModelInfo, setDefaultModelInfo] = useState<{ id: string; name: string; modelId: string } | null>(null);
  const defaultModelLabel = defaultModelInfo ? defaultModelInfo.name : '默认模型';

  useEffect(() => {
    opencodeSettings.fetchDefaultModel().then(setDefaultModelInfo).catch(() => setDefaultModelInfo(null));
  }, []);

  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [agentForm, setAgentForm] = useState({
    name: '',
    description: '',
    providerId: 'default',
    model: 'default',
    color: '',
    steps: '',
    prompt: '',
    permission: {} as Record<string, string>,
  });

  const providerOptions = useMemo(() => [
    { value: 'default', label: `默认模型（${defaultModelLabel}）` },
    ...availableModels.filter(g => g.providerId !== 'default').map((g) => ({ value: g.providerId, label: g.providerName })),
  ], [availableModels, defaultModelLabel]);

  const modelOptions = useMemo(() => {
    if (agentForm.providerId === 'default') {
      return [{ value: 'default', label: `默认模型（${defaultModelLabel}）` }];
    }
    const group = availableModels.find((g) => g.providerId === agentForm.providerId);
    return group?.models.map((m) => ({
      value: m.id.includes('/') ? m.id.split('/').slice(1).join('/') : m.id,
      label: m.label,
    })) ?? [];
  }, [availableModels, agentForm.providerId, defaultModelLabel]);
  const [agentPromptMode, setAgentPromptMode] = useState<PromptEditMode>('edit');

  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamForm, setTeamForm] = useState({
    name: '',
    key: '',
    description: '',
    delegate: false,
    prompt: '',
  });
  const [teamSelectedAgentIds, setTeamSelectedAgentIds] = useState<string[]>([]);

  const agentModalRef = useRef<HTMLDivElement>(null);
  const teamModalRef = useRef<HTMLDivElement>(null);

useEffect(() => {
    fetchAgents().catch((e) => console.warn('[Settings] fetchAgents failed:', e.message));
    fetchTeams().catch((e) => console.warn('[Settings] fetchTeams failed:', e.message));
    loadProviders().catch((e) => console.warn('[Settings] loadProviders failed:', e.message));
    opencodeProvider.fetchConnectedProviders()
      .then(setProviderEntries)
      .catch((e) => console.warn('[Settings] fetchConnectedProviders failed:', e.message));
  }, [fetchAgents, fetchTeams, loadProviders]);

  const openAddAgentModal = () => {
    setEditingAgent(null);
    const initialProviderId = defaultModelInfo ? defaultModelInfo.id.split('/')[0] : 'default';
    setAgentForm({
      name: '',
      description: '',
      providerId: initialProviderId,
      model: 'default',
      color: '',
      steps: '',
      prompt: '',
      permission: { ...DEFAULT_AGENT_PERMISSION },
    });
    setAgentPromptMode('edit');
    setAgentModalOpen(true);
  };

  const openEditAgentModal = (agent: Agent) => {
    setEditingAgent(agent);
    const agentModelValue = agent.model || 'default';
    let agentProviderId = 'default';
    let agentModelId = agentModelValue;
    if (agentModelValue.includes('/')) {
      const [pId, mId] = agentModelValue.split('/');
      agentProviderId = pId;
      agentModelId = mId;
    }
    setAgentForm({
      name: agent.name,
      description: agent.description,
      providerId: agentProviderId,
      model: agentModelId,
      color: agent.color || '',
      steps: agent.steps ? String(agent.steps) : '',
      prompt: normalizePromptText(agent.prompt),
      permission: { ...(agent.permission ?? DEFAULT_AGENT_PERMISSION) },
    });
    setAgentPromptMode('edit');
    setAgentModalOpen(true);
  };

const handleAgentConfirm = () => {
    if (!agentForm.name.trim()) return;
    const steps = parseOptionalPositiveInteger(agentForm.steps);
    const id = editingAgent ? editingAgent.id : createAgentId(agentForm.name);
    const permission = Object.keys(agentForm.permission).length > 0 ? agentForm.permission : undefined;
    const modelValue = agentForm.providerId === 'default' && agentForm.model === 'default' ? 'default' : `${agentForm.providerId}/${agentForm.model}`;

    if (editingAgent) {
      updateAgent(id, {
        name: agentForm.name.trim(),
        description: agentForm.description,
        mode: 'all',
        model: modelValue,
        color: agentForm.color || undefined,
        steps,
        prompt: normalizePromptText(agentForm.prompt),
        permission,
      });
    } else {
      addAgent({
        id,
        name: agentForm.name.trim(),
        description: agentForm.description,
        mode: 'all',
        model: modelValue,
        color: agentForm.color || undefined,
        steps,
        prompt: normalizePromptText(agentForm.prompt),
        permission,
      });
    }
    setAgentModalOpen(false);
    setEditingAgent(null);
  };

  const handleAgentCancel = () => {
    setAgentModalOpen(false);
    setEditingAgent(null);
  };

  const openAddTeamModal = () => {
    setEditingTeam(null);
    setTeamForm({
      name: '',
      key: '',
      description: '',
      delegate: false,
      prompt: '',
    });
    setTeamSelectedAgentIds([]);
    setTeamModalOpen(true);
  };

  const openEditTeamModal = (team: Team) => {
    setEditingTeam(team);
    setTeamForm({
      name: team.name,
      key: team.key,
      description: team.description,
      delegate: team.delegate ?? false,
      prompt: team.prompt ?? '',
    });
    setTeamSelectedAgentIds([...team.agentIds]);
    setTeamModalOpen(true);
  };

  const toggleTeamAgentSelection = (agentId: string) => {
    setTeamSelectedAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const handleTeamConfirm = () => {
    if (!teamForm.name.trim()) return;
    const key = editingTeam ? editingTeam.key : (teamForm.key.trim() || createAgentId(teamForm.name));

    if (editingTeam) {
      updateTeam(editingTeam.id, {
        name: teamForm.name.trim(),
        description: teamForm.description,
        delegate: teamForm.delegate,
        agentIds: teamSelectedAgentIds,
        prompt: teamForm.prompt,
      });
    } else {
      addTeam({
        id: key,
        name: teamForm.name.trim(),
        key,
        description: teamForm.description,
        agentIds: teamSelectedAgentIds,
        delegate: teamForm.delegate,
        expanded: false,
        prompt: teamForm.prompt,
      });
    }
    setTeamModalOpen(false);
    setEditingTeam(null);
  };

  const handleTeamCancel = () => {
    setTeamModalOpen(false);
    setEditingTeam(null);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-8">
      <Header title="智能体" desc="管理 agent markdown 配置和 team 编排。" />

      <div className="space-y-8">
        <Section title="Agents" desc="仅显示 ~/.opencode/agent 下的自定义 agent 配置，插件 agent 请在对话中通过 @ 使用。">
          <div className="flex items-center justify-between mb-4">
            <div />
            <SmallButton onClick={openAddAgentModal}>
              <Zap size={14} />
              添加 Agent
            </SmallButton>
          </div>
          <Card>
            {customAgents.map((agent) => (
              <div key={agent.id} className="p-4">
<div className="flex items-start justify-between">
                   <button
                     onClick={() => openEditAgentModal(agent)}
                     className="text-left flex-1 min-w-0 hover:bg-[#F5F5F5] rounded-md transition-colors outline-none focus:outline-none"
                   >
                     <div className="text-sm font-medium text-[#1F1F1F] hover:text-[#2B8FFF] transition-colors">
                       {agent.name}
                     </div>
                     <div className="text-xs text-[#6B6B6B] mt-1">{agent.description || '无描述'}</div>
                     <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-[#9A9A9A]">
                          {agent.model === 'default' ? `默认模型（${defaultModelLabel}）` : agent.model}
                        </span>
                      {agent.steps && (
                        <>
                          <span className="text-xs text-[#9A9A9A]">·</span>
                          <span className="text-xs text-[#9A9A9A]">steps: {agent.steps}</span>
                        </>
                      )}
                      {agent.color && (
                        <>
                          <span className="text-xs text-[#9A9A9A]">·</span>
                          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: agent.color }} />
                        </>
                      )}
                    </div>
{agent.permission && Object.keys(agent.permission).length > 0 && (
                      <div className="text-xs text-[#9A9A9A] mt-1">
                        权限: {describeAgentPermission(agent.permission)}
                      </div>
                    )}
                  </button>
                  <button
                    onClick={() => removeAgent(agent.id)}
                    className="text-[#9A9A9A] hover:text-[#EC5F66] p-1 transition-colors ml-2"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {customAgents.length === 0 && <Empty text="尚未发现自定义 agent 配置。" />}
          </Card>
        </Section>

        <Section title="Teams" desc="Team 由多个 agent 成员组成，可设置 delegate 和团队提示词。">
          <div className="flex items-center justify-between mb-4">
            <div />
            <SmallButton onClick={openAddTeamModal}>
              <Users size={14} />
              添加 Team
            </SmallButton>
          </div>
          <Card>
            {teams.map((team) => (
              <div key={team.id} className="p-4">
<div className="flex items-start justify-between">
                   <button
                     onClick={() => openEditTeamModal(team)}
                     className="text-left flex-1 min-w-0 hover:bg-[#F5F5F5] rounded-md transition-colors outline-none focus:outline-none"
                   >
                     <div className="text-sm font-medium text-[#1F1F1F] hover:text-[#2B8FFF] transition-colors">
                       {team.name}
                     </div>
                    <div className="text-xs text-[#6B6B6B] mt-1">{team.description || team.key}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-[#9A9A9A]">key: {team.key}</span>
                      {team.delegate && (
                        <>
                          <span className="text-xs text-[#9A9A9A]">·</span>
                          <span className="text-xs text-[#10A37F]">delegate</span>
                        </>
                      )}
                      {team.model && (
                        <>
                          <span className="text-xs text-[#9A9A9A]">·</span>
                          <span className="text-xs text-[#9A9A9A]">model: {team.model}</span>
                        </>
                      )}
                      {team.steps && (
                        <>
                          <span className="text-xs text-[#9A9A9A]">·</span>
                          <span className="text-xs text-[#9A9A9A]">steps: {team.steps}</span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-[#9A9A9A] mt-1">
                      成员：{team.agentIds.join(', ') || '无'}
                    </div>
                  </button>
                  <button
                    onClick={() => removeTeam(team.id)}
                    className="text-[#9A9A9A] hover:text-[#EC5F66] p-1 transition-colors ml-2"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {teams.length === 0 && <Empty text="尚未创建 team。" />}
          </Card>
        </Section>
      </div>

      {agentModalOpen && (
<AgentModal
          modalRef={agentModalRef}
          title={editingAgent ? '编辑 Agent' : '添加 Agent'}
          name={agentForm.name}
          setName={(v) => setAgentForm((prev) => ({ ...prev, name: v }))}
          description={agentForm.description}
          setDescription={(v) => setAgentForm((prev) => ({ ...prev, description: v }))}
          providerId={agentForm.providerId}
          setProviderId={(v) => setAgentForm((prev) => ({ ...prev, providerId: v }))}
          model={agentForm.model}
          setModel={(v) => setAgentForm((prev) => ({ ...prev, model: v }))}
          color={agentForm.color}
          setColor={(v) => setAgentForm((prev) => ({ ...prev, color: v }))}
          steps={agentForm.steps}
          setSteps={(v) => setAgentForm((prev) => ({ ...prev, steps: v }))}
          prompt={agentForm.prompt}
          setPrompt={(v) => setAgentForm((prev) => ({ ...prev, prompt: v }))}
          promptMode={agentPromptMode}
          setPromptMode={setAgentPromptMode}
          permission={agentForm.permission}
          setPermission={(v) => setAgentForm((prev) => ({ ...prev, permission: v }))}
          providerOptions={providerOptions}
          modelOptions={modelOptions}
          defaultModelLabel={defaultModelLabel}
          onConfirm={handleAgentConfirm}
          onCancel={handleAgentCancel}
        />
      )}

      {teamModalOpen && (
        <TeamModal
          modalRef={teamModalRef}
          title={editingTeam ? '编辑 Team' : '添加 Team'}
          name={teamForm.name}
          setName={(v) => setTeamForm((prev) => ({ ...prev, name: v }))}
          teamKey={teamForm.key}
          setTeamKey={(v) => setTeamForm((prev) => ({ ...prev, key: v }))}
          description={teamForm.description}
          setDescription={(v) => setTeamForm((prev) => ({ ...prev, description: v }))}
          prompt={teamForm.prompt}
          setPrompt={(v) => setTeamForm((prev) => ({ ...prev, prompt: v }))}
          delegate={teamForm.delegate}
          setDelegate={(v) => setTeamForm((prev) => ({ ...prev, delegate: v }))}
          agents={customAgents}
          selectedIds={teamSelectedAgentIds}
          toggleAgent={toggleTeamAgentSelection}
          onConfirm={handleTeamConfirm}
          onCancel={handleTeamCancel}
        />
      )}
    </div>
  );
}

function AgentModal(props: {
  modalRef: React.RefObject<HTMLDivElement | null>;
  title: string;
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  providerId: string;
  setProviderId: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  steps: string;
  setSteps: (v: string) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  promptMode: PromptEditMode;
  setPromptMode: (v: PromptEditMode) => void;
  permission: Record<string, string>;
  setPermission: (v: Record<string, string>) => void;
  providerOptions: { value: string; label: string }[];
  modelOptions: { value: string; label: string }[];
  defaultModelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscapeKey(props.onCancel, true);

  const AGENT_COLORS = [
    { value: '', label: '默认', icon: <span className="w-3 h-3 rounded-full border border-[#E5E5E5]" /> },
    { value: '#2B8FFF', label: '蓝色', icon: <span className="w-3 h-3 rounded-full bg-[#2B8FFF]" /> },
    { value: '#10A37F', label: '绿色', icon: <span className="w-3 h-3 rounded-full bg-[#10A37F]" /> },
    { value: '#EC5F66', label: '红色', icon: <span className="w-3 h-3 rounded-full bg-[#EC5F66]" /> },
    { value: '#F59E0B', label: '橙色', icon: <span className="w-3 h-3 rounded-full bg-[#F59E0B]" /> },
    { value: '#8B5CF6', label: '紫色', icon: <span className="w-3 h-3 rounded-full bg-[#8B5CF6]" /> },
    { value: '#6B7280', label: '灰色', icon: <span className="w-3 h-3 rounded-full bg-[#6B7280]" /> },
  ];

  const PERMISSION_ITEMS = [
    { key: 'read', label: '文件读取' },
    { key: 'glob', label: '文件搜索' },
    { key: 'grep', label: '内容搜索' },
    { key: 'lsp', label: 'LSP 工具' },
    { key: 'edit', label: '文件编辑' },
    { key: 'write', label: '文件写入' },
    { key: 'bash', label: '命令执行' },
  ];

  const PERMISSION_OPTIONS = [
    { value: '', label: '不设置' },
    { value: 'allow', label: '允许' },
    { value: 'ask', label: '需确认' },
    { value: 'deny', label: '禁止' },
  ];

  const modelOptionsWithDefault = useMemo(() => [
    { value: 'default', label: `默认模型（${props.defaultModelLabel}）` },
    ...props.modelOptions,
  ], [props.modelOptions, props.defaultModelLabel]);

  const handleProviderChange = (newProviderId: string) => {
    props.setProviderId(newProviderId);
    if (newProviderId === 'default') {
      props.setModel('default');
    } else {
      props.setModel(props.modelOptions[0]?.value ?? 'default');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
      <div
        ref={props.modalRef}
        className="bg-white rounded-xl shadow-xl w-[560px] max-h-[86vh] flex flex-col"
      >
        <div className="px-6 pt-6">
          <ModalTitle title={props.title} onClose={props.onCancel} />
        </div>

        <div className="px-6 mt-4 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="text-xs text-[#6B6B6B] mb-1 block">名称</label>
            <input
              type="text"
              value={props.name}
              onChange={(e) => props.setName(e.target.value)}
              className={inputClass}
              placeholder="Agent 名称"
            />
          </div>

          <div>
            <label className="text-xs text-[#6B6B6B] mb-1 block">描述</label>
            <textarea
              value={props.description}
              onChange={(e) => props.setDescription(e.target.value)}
              className={`${inputClass} min-h-[60px] resize-y`}
              placeholder="Agent 描述"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#6B6B6B] mb-1 block">提供商</label>
              <SearchableSelect
                options={props.providerOptions}
                value={props.providerId}
                onChange={handleProviderChange}
                searchPlaceholder="搜索提供商..."
                emptyText="暂无提供商"
              />
            </div>
            <div>
              <label className="text-xs text-[#6B6B6B] mb-1 block">模型</label>
              <SearchableSelect
                options={modelOptionsWithDefault}
                value={props.model}
                onChange={props.setModel}
                searchPlaceholder="搜索模型..."
                emptyText="暂无模型"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-[#6B6B6B] mb-1 block">颜色</label>
            <SearchableSelect
              options={AGENT_COLORS}
              value={props.color}
              onChange={props.setColor}
              searchPlaceholder="搜索颜色..."
              emptyText="暂无颜色"
            />
            {props.color && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-[#6B6B6B]">预览：</span>
                <span className="w-4 h-4 rounded-full" style={{ backgroundColor: props.color }} />
                <span className="text-xs text-[#1F1F1F]">{props.color}</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-[#6B6B6B] mb-1 block">权限</label>
            <div className="border border-[#E5E5E5] rounded-md p-3 space-y-2">
              {PERMISSION_ITEMS.map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <span className="text-sm text-[#1F1F1F]">{item.label}</span>
                  <div className="w-28">
                    <SearchableSelect
                      options={PERMISSION_OPTIONS}
                      value={props.permission[item.key] || ''}
                      onChange={(v) => {
                        const newPerm = { ...props.permission };
                        if (v) { newPerm[item.key] = v; } else { delete newPerm[item.key]; }
                        props.setPermission(newPerm);
                      }}
                      searchable={false}
                      maxH="max-h-36"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-[#9A9A9A] mt-1">未设置的权限项使用全局默认配置</div>
          </div>

          <div>
            <label className="text-xs text-[#6B6B6B] mb-1 block">最大步骤</label>
            <input
              type="text"
              value={props.steps}
              onChange={(e) => props.setSteps(e.target.value)}
              className={inputClass}
              placeholder="留空使用默认值"
            />
          </div>

          <PromptEditor
            prompt={props.prompt}
            setPrompt={props.setPrompt}
            mode={props.promptMode}
            setMode={props.setPromptMode}
          />
        </div>

        <div className="px-6 pb-6">
          <ModalActions
            onConfirm={props.onConfirm}
            onCancel={props.onCancel}
            disabled={!props.name.trim()}
          />
        </div>
      </div>
    </div>
  );
}

function TeamModal(props: {
  modalRef: React.RefObject<HTMLDivElement | null>;
  title: string;
  name: string;
  setName: (v: string) => void;
  teamKey: string;
  setTeamKey: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  delegate: boolean;
  setDelegate: (v: boolean) => void;
  agents: Agent[];
  selectedIds: string[];
  toggleAgent: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscapeKey(props.onCancel, true);

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
      <div
        ref={props.modalRef}
        className="bg-white rounded-xl shadow-xl w-[560px] max-h-[86vh] flex flex-col"
      >
        <div className="px-6 pt-6">
          <ModalTitle title={props.title} onClose={props.onCancel} />
        </div>

        <div className="px-6 mt-4 overflow-y-auto flex-1 space-y-4">
          <TextInput
            label="名称"
            value={props.name}
            onChange={props.setName}
            placeholder="团队名称"
          />
          <TextInput
            label="Key"
            value={props.teamKey}
            onChange={props.setTeamKey}
            placeholder="team-key"
          />
          <TextArea
            label="描述"
            value={props.description}
            onChange={props.setDescription}
            placeholder="团队描述"
            rows={2}
          />
          <SettingRow title="Delegate" desc="允许团队将任务委派给成员。">
            <ToggleSwitch enabled={props.delegate} onChange={props.setDelegate} />
          </SettingRow>
          <div>
            <label className="text-xs text-[#6B6B6B] mb-2 block">成员</label>
            <div className="border border-[#E5E5E5] rounded-lg divide-y divide-[#E5E5E5]">
              {props.agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between w-full p-3 text-sm"
                >
                  <span className="text-[#1F1F1F]">{agent.name}</span>
                  <ToggleSwitch enabled={props.selectedIds.includes(agent.id)} onChange={() => props.toggleAgent(agent.id)} />
                </div>
              ))}
              {props.agents.length === 0 && <Empty text="暂无 agent" />}
            </div>
          </div>
          <PromptEditor
            prompt={props.prompt}
            setPrompt={props.setPrompt}
            mode="edit"
            setMode={() => undefined}
          />
        </div>

        <div className="px-6 pb-6">
          <ModalActions
            onConfirm={props.onConfirm}
            onCancel={props.onCancel}
            disabled={!props.name.trim()}
          />
        </div>
      </div>
    </div>
  );
}

function Header({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold text-[var(--app-text)] mb-2">{title}</h1>
      <p className="text-sm text-[var(--app-text-secondary)]">{desc}</p>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-[var(--app-text)] mb-1">{title}</h2>
      <p className="text-xs text-[var(--app-text-secondary)] mb-4">{desc}</p>
      {children}
    </section>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="settings-card">
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="p-6 text-sm text-[var(--app-text-muted)] text-center">{text}</div>
  );
}

function SmallButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="settings-button inline-flex items-center gap-1"
    >
      {children}
    </button>
  );
}

function SettingRow({ title, desc, children, loading = false }: { title: string; desc: string; children: ReactNode; loading?: boolean }) {
  return (
    <div className="flex items-center justify-between p-4 gap-4">
      <div>
        <div className="text-sm font-medium text-[var(--app-text)]">{title}</div>
        <div className="text-xs text-[var(--app-text-secondary)] mt-1">{desc}</div>
      </div>
      <div className="flex items-center gap-2">
        {loading && <Loader2 size={14} className="animate-spin text-[#9A9A9A]" />}
        {children}
      </div>
    </div>
  );
}

function ModalTitle({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-lg font-semibold text-[#1F1F1F]">{title}</h2>
      <button
        onClick={onClose}
        className="text-[#9A9A9A] hover:text-[#1F1F1F] p-1 transition-colors"
      >
        <X size={20} />
      </button>
    </div>
  );
}

function ModalActions({ onConfirm, onCancel, disabled }: { onConfirm: () => void; onCancel: () => void; disabled?: boolean }) {
  return (
    <div className="flex gap-2 mt-6">
      <button
        onClick={onConfirm}
        disabled={disabled}
        className="flex-1 py-2 text-sm text-white bg-[#1F1F1F] rounded-md hover:bg-[#333333] transition-colors disabled:bg-[#9A9A9A] disabled:cursor-not-allowed"
      >
        确定
      </button>
      <button
        onClick={onCancel}
        className="flex-1 py-2 text-sm text-[#6B6B6B] border border-[#E5E5E5] rounded-md hover:bg-[#F5F5F5] transition-colors"
      >
        取消
      </button>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="text-xs text-[#6B6B6B] mb-1 block">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-md text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
      />
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder, rows }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; rows: number }) {
  return (
    <div>
      <label className="text-xs text-[#6B6B6B] mb-1 block">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(normalizePromptText(e.target.value))}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-md text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF] resize-y"
      />
    </div>
  );
}

function PromptEditor({ prompt, setPrompt, mode, setMode }: { prompt: string; setPrompt: (v: string) => void; mode: PromptEditMode; setMode: (v: PromptEditMode) => void }) {
  return (
    <div>
      <label className="text-xs text-[#6B6B6B] mb-1 block">提示词（支持 Markdown）</label>
      <div className="flex gap-1 mb-1">
        <button
          type="button"
          onClick={() => setMode('edit')}
          className={`px-2 py-0.5 text-xs rounded-md ${
            mode === 'edit' ? 'bg-[#1F1F1F] text-white' : 'text-[#6B6B6B] hover:bg-[#F0F0F0]'
          }`}
        >
          编辑
        </button>
        <button
          type="button"
          onClick={() => setMode('preview')}
          className={`px-2 py-0.5 text-xs rounded-md ${
            mode === 'preview' ? 'bg-[#1F1F1F] text-white' : 'text-[#6B6B6B] hover:bg-[#F0F0F0]'
          }`}
        >
          预览
        </button>
      </div>
      {mode === 'edit' ? (
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(normalizePromptText(e.target.value))}
          placeholder="输入提示词，支持 Markdown 格式"
          rows={8}
          className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-md text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF] resize-y min-h-[160px]"
        />
      ) : (
        <div className="border border-[#E5E5E5] rounded-md p-3 min-h-[120px] max-h-[240px] overflow-y-auto text-sm">
          {prompt ? (
            <MarkdownRenderer content={prompt} />
          ) : (
            <span className="text-[#9A9A9A]">暂无提示词内容</span>
          )}
        </div>
      )}
    </div>
  );
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        enabled ? 'bg-[#2B8FFF]' : 'bg-[#E5E5E5]'
      }`}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          enabled ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

function ProviderQuotaIcon({ providerId, apiKey, providerType }: { providerId: string; apiKey?: string; providerType?: string }) {
  const quotas = useQuotaStore((s) => s.quotas);
  const fetchQuota = useQuotaStore((s) => s.fetchQuota);
  const getFiveHourQuota = useQuotaStore((s) => s.getFiveHourQuota);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!fetched && apiKey && providerType === 'zhipuai-coding') {
      fetchQuota(providerId, apiKey);
      setFetched(true);
    }
  }, [providerId, apiKey, providerType, fetched, fetchQuota]);

  const data = quotas[providerId];
  if (!data) return null;
  const fiveHour = getFiveHourQuota(providerId);
  if (!fiveHour) return null;
  const percentage = Math.min(fiveHour.percentage, 100);
  return (
    <span className="inline-flex items-center gap-1" title={`使用额度 ${percentage}%`}>
      <CircularProgress percentage={percentage} size={16} />
    </span>
  );
}

function SettingsToggleRow({ title, description, enabled, onChange }: { title: string; description: string; enabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <SettingRow title={title} desc={description}>
      <ToggleSwitch enabled={enabled} onChange={onChange} />
    </SettingRow>
  );
}

function PluginsSettingsContent() {
  const [plugins, setPlugins] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });

  const loadPlugins = async () => {
    setLoading(true);
    try {
      const list = await readPlugins();
      setPlugins(list);
    } catch {
      setPlugins([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlugins();
  }, []);

  const handleRemove = async (pluginName: string) => {
    setRemoving(pluginName);
    try {
      const ok = await removePlugin(pluginName);
      if (ok) {
        setPlugins((prev) => prev.filter((p) => p !== pluginName));
        setToast({ message: `已卸载 ${pluginName}`, visible: true });
        setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 2000);
      }
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-8">
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

      <Header title="插件" desc="管理 opencode.json 中已安装的插件。" />

      <Section title="已安装插件" desc="以下插件已配置在全局配置文件中，卸载将从配置文件中移除。">
        <Card>
          {loading ? (
            <div className="p-6 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-[#9A9A9A]" />
            </div>
          ) : plugins.length === 0 ? (
            <Empty text="暂无已安装的插件。" />
          ) : (
            plugins.map((pluginName) => (
              <div key={pluginName} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Puzzle size={18} className="text-[#2B8FFF] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#1F1F1F] truncate">{pluginName.split('@')[0]}</div>
                    {pluginName.includes('@') && (
                      <div className="text-xs text-[#9A9A9A]">{pluginName.split('@').slice(1).join('@')}</div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(pluginName)}
                  disabled={removing === pluginName}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-[#EC5F66] hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                >
                  {removing === pluginName ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                  卸载
                </button>
              </div>
            ))
          )}
        </Card>
      </Section>
    </div>
  );
}

function SimpleSettingsContent({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto py-8 px-8">
      <Header title={title} desc={description} />
      <div className="space-y-6">
        {children}
      </div>
    </div>
  );
}