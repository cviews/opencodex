import { useState, useEffect, useRef, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { Check, ListOrdered, ClipboardList } from 'lucide-react';
import type { AutoCompleteState } from './plugins';
import { insertMention, insertSlashCommand, insertModelChip, insertModelMention, clearSlashTrigger } from './plugins';
import { MODEL_PROVIDERS, getAllModels, type ModelItem, type ProviderGroup } from './models';
import { useAgentStore } from '../../stores/agent';
import { useProjectStore } from '../../stores/project';
import { opencodeSlash, opencodeReference } from '../../services/opencodeAdapter';
import { getBuiltinModes } from '../../constants/builtin';
import { t } from '../../constants/i18n';
import type { AgentItem, FileItem, SlashItem } from '../../types';

interface TeamItem {
  name: string;
  kind: 'team';
  description: string;
  key: string;
}

const MAX_ITEMS = 50;
const MAX_MODEL_ITEMS = 50;

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;

  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

type MenuItem = AgentItem | TeamItem | FileItem | SlashItem | ModelItem;

type RenderRow =
  | { type: 'header'; label: string }
  | { type: 'item'; item: MenuItem; selectIndex: number };

function getScopeLabel(scope: string): string {
  switch (scope) {
    case 'project': return '项目';
    case 'global': return '全局';
    case 'command': return '命令';
    case 'mode': return t('autocomplete_mode');
    case 'model': return '模型';
    default: return '';
  }
}

function getSlashKindLabel(item: SlashItem): string | null {
  if (item.source === 'skill') return '技能';
  if (item.source === 'command') return '命令';
  return null;
}

function slashItemKey(item: MenuItem, idx: number): string {
  if ('entryId' in item && item.entryId) return item.entryId;
  if ('modelId' in item && item.modelId) return `model:${item.modelId}`;
  if ('key' in item && item.key) return `team:${item.key}`;
  return `i-${idx}`;
}

function SkillIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 1025 1024" width={size} height={size} className="text-[#9A9A9A]">
      <path d="M254 745.6h267.2c11.5 19.4 24.6 37.3 39.4 53.6H254V745.6zm0-84.7h231.3a358 358 0 01-10.1-53.5H254v53.5zm0-138.2h221.9c2.3-18.3 5.7-36.3 10.7-53.5H254v53.5zm431.3 358.7v46.8c0 22.4-16.8 40.6-37.3 40.6H87.5c-20.6 0-37.3-18.2-37.3-40.6V250.1l185.8-167.7v178H138.1v53.5h147.1V53.5H648c20.6 0 37.3 18.2 37.3 40.5v160.1c15.9-5.4 32.4-9 49.4-11.6V94C734.7 42.3 695.8 0 648 0H250L.8 225v703.3c0 51.9 38.9 94.1 86.7 94.1h560.6c47.8 0 86.7-42.2 86.7-94.1v-35.3c-16.9-2.5-33.5-6.1-49.4-11.5h-.1zM187.1 469.3h-63.7v53.5h63.7v-53.5zm-63.7 329.9h63.7v-53.5h-63.7v53.5zm63.7-191.7h-63.7v53.5h63.7v-53.5zm717.7-120.3l-39.2-32.6-99.6 141-89.5-74.5-30.1 42.5 128.7 107 129.7-183.4zM1024.8 567.8c0-149-111.8-270.2-249.2-270.2-137.3 0-249.1 121.2-249.1 270.2S638.3 838.1 775.6 838.1c137.4 0 249.1-121.2 249.1-270.3h.1zm-49.4 0c0 119.5-89.6 216.8-199.8 216.8-110.2 0-199.9-97.3-199.9-216.8 0-119.5 89.6-216.8 199.9-216.8 110.2 0 199.8 97.3 199.8 216.8z" fill="currentColor" />
    </svg>
  );
}

function AgentIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 1024 1024" width={size} height={size} className="text-[#9A9A9A]">
      <path d="M458 476.6L170.8 332.9c-19.6-9.8-38.6-10.2-53.4-1-14.8 9.2-23 26.2-23 48.1v332.2c0 31.4 21.7 67.7 49.3 82.8l289.1 156.6c10.5 5.7 20.8 8.6 30.6 8.6 8.1 0 15.6-2 22.2-5.9 14.7-8.8 22.9-25.7 22.9-47.6V558.2c0-15.4-5.2-32.2-14.5-47.4-9.4-15.1-22.2-27.3-36-34.2zm-7.3 81.6v337.4L171.2 744.2c-8.9-4.8-19.1-21.9-19.1-32V388.3l280 140c8.7 4.3 18.6 20.2 18.6 29.9zM874.5 300.8c19.3-9.5 29.9-23.1 29.8-38.3 0-15.2-10.6-28.8-29.9-38.3l-302-148c-16.3-8-37.8-12.3-60.5-12.3-22.7 0-44.2 4.4-60.4 12.3l-302 147.9c-19.3 9.5-29.8 23.1-29.8 38.3 0 15.2 10.6 28.8 29.9 38.3l302 148c16.3 8 37.8 12.3 60.5 12.3 22.7 0 44.2-4.4 60.4-12.3l302-147.9zm-671.8-38.4L477 128.1c18-8.8 52-8.8 70.1 0l274.2 134.3L547 396.8c-18 8.8-52 8.8-70.1 0L202.7 262.4zM906.7 332.4c-14.8-8.8-33.6-7.9-52.9 2.6L581 483.3c-27.6 15.1-49.3 51.6-49.3 82.9v340.3c0 22 8.1 38.8 22.8 47.4 6.4 3.7 13.6 5.6 21.4 5.6 10 0 20.4-3.1 31.1-9.1l273.8-154.7c13.3-7.6 25.7-20.3 34.8-35.8 9.1-15.5 14.1-32.5 14.1-47.7V380c-0.1-21.9-8.2-38.8-23-47.6zm-34.9 58.7v321c0 10.4-10.3 28.1-19.4 33.2L589.5 893.9V566.2c0-10.1 10.2-27.2 19.1-32.1l263.2-143z" fill="currentColor" />
    </svg>
  );
}

function FileIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 1024 1024" width={size} height={size} className="text-[#9A9A9A]">
      <path d="M923.8 133.6c-55.2 0-100.2 44.9-100.2 100.2v623.3c0 5.2 1.2 10.3 3.5 14.9l66.8 133.6a33.4 33.4 0 0059.7 0l66.8-133.6c2.3-4.6 3.5-9.7 3.5-14.9V233.7c0-55.2-44.9-100.2-100.2-100.2zm33.4 715.6l-33.4 66.8-33.4-66.8v-25.5h66.8v25.5zm0-92.3h-66.8V400.7h66.8v356.2zm0-423h-66.8V233.7a33.4 33.4 0 0133.4-33.4 33.4 33.4 0 0133.4 33.4v100.2zM723.5 0a33.4 33.4 0 0133.4 33.4v957.2a33.4 33.4 0 01-33.4 33.4H233.7c-8.9 0-17.4-3.6-23.6-9.8L9.8 813.9A33.7 33.7 0 010 790.3V33.4A33.4 33.4 0 0133.4 0h690.1zM200.3 910v-86.3H114l86.3 86.3zm489.7 47.2V66.8H66.8v690.1h167a33.4 33.4 0 0133.4 33.4v167h422.9zm-233.7-823.6a33.4 33.4 0 010 66.8H300.5a33.4 33.4 0 110-66.8h155.8zm133.6 155.8a33.4 33.4 0 010 66.8H167a33.4 33.4 0 110-66.8h422.9zm0 133.6a33.4 33.4 0 010 66.8H167a33.4 33.4 0 010-66.8h422.9zm0 133.6a33.4 33.4 0 010 66.8H167a33.4 33.4 0 110-66.8h422.9zm0 133.6a33.4 33.4 0 010 66.8H367.3a33.4 33.4 0 110-66.8h222.6zm0 133.6a33.4 33.4 0 010 66.8H367.3a33.4 33.4 0 110-66.8h222.6z" fill="currentColor" />
    </svg>
  );
}

function ModelIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" className="text-[#9A9A9A]">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
    </svg>
  );
}

function PlanIcon({ size = 16 }: { size?: number }) {
  return (
    <ListOrdered size={size} className="text-[#9A9A9A]" />
  );
}

function CompressIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" className="text-[#9A9A9A]">
      <path d="M4 14.899A7 7 0 1115.71 8h1.79a4.5 4.5 0 012.5 8.242" />
      <path d="M12 12v9m-4-4 4 4 4-4" />
    </svg>
  );
}

function TeamIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" className="text-[#9A9A9A]">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

export function AutocompleteMenu({
  state,
  onClose,
  includeModels = false,
  dropDirection = 'up',
  fixedPosition,
  onTogglePlanMode,
  onCompress,
}: {
  state: AutoCompleteState;
  onClose: () => void;
  includeModels?: boolean;
  dropDirection?: 'up' | 'down';
  fixedPosition?: { top: number; left: number; right: number };
  onTogglePlanMode?: () => void;
  onCompress?: () => void;
}): React.JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [slashCommands, setSlashCommands] = useState<SlashItem[]>(() => opencodeSlash.getCachedSlashCommands());
  const [slashLoading, setSlashLoading] = useState(false);
  const projectPath = useProjectStore((s) => s.currentProject.path);
  const { agents: configuredAgents, teams: configuredTeams, fetchAgents, fetchTeams } = useAgentStore();

  useEffect(() => {
    let cancelled = false;
    setSlashCommands(opencodeSlash.getCachedSlashCommands());
    opencodeSlash.fetchSlashCommands().then((items) => {
      if (!cancelled) setSlashCommands(items);
    });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  useEffect(() => {
    if (state.type !== 'slash') return;
    setSlashLoading(true);
    opencodeSlash.fetchSlashCommands()
      .then(setSlashCommands)
      .finally(() => setSlashLoading(false));
  }, [state.type, projectPath]);

  useEffect(() => {
    if (!state.type) return;
    if (state.type === 'mention') {
      void opencodeReference.fetchProjectFiles().then(setFiles);
      void fetchAgents();
      void fetchTeams();
    }
  }, [state.type, fetchAgents, fetchTeams]);

  const dynamicAgents: AgentItem[] = configuredAgents.map((a) => ({
    name: a.name,
    kind: 'agent' as const,
    description: a.description,
    sourceType: a.sourceType,
    sourceLabel: a.sourceLabel,
  }));
  const dynamicTeams: TeamItem[] = configuredTeams.map((t) => ({
    name: t.name,
    kind: 'team' as const,
    description: t.description,
    key: t.key,
  }));

  const flatItems = getFilteredItems(state, includeModels, dynamicAgents, dynamicTeams, files, slashCommands);
  const selectCount = flatItems.length;

  const renderRows = buildRenderRows(flatItems, includeModels, state.type);

  useEffect(() => {
    setSelectedIndex(0);
  }, [state.type, state.query]);

  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex < selectCount) {
      const btns = menuRef.current?.querySelectorAll('[data-selectable]');
      btns?.[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, selectCount]);

  const handleSelect = useCallback(
    (item: MenuItem) => {
      if (state.type === 'mention') {
        if ('modelId' in item && item.modelId) {
          insertModelMention(editor, item.modelId, item.name);
        } else if ('kind' in item && item.kind === 'team' && 'key' in item) {
          insertMention(editor, item.key, 'team');
        } else if ('kind' in item) {
          insertMention(editor, item.name, item.kind);
        }
      } else if (state.type === 'slash') {
        if ('modelId' in item && item.modelId) {
          insertModelChip(editor, item.modelId, item.name);
        } else if ('icon' in item && item.icon === 'plan') {
          clearSlashTrigger(editor);
          onTogglePlanMode?.();
        } else if (
          ('icon' in item && item.icon === 'compress')
          || ('name' in item && (item.name === t('mode_compress') || item.name === 'compress'))
        ) {
          clearSlashTrigger(editor);
          onCompress?.();
        } else if ('source' in item) {
          insertSlashCommand(editor, item.name);
        }
      }
      onClose();
    },
    [editor, state.type, onClose, onTogglePlanMode, onCompress],
  );

  useEffect(() => {
    if (!state.type) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev + 1) % Math.max(selectCount, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev - 1 + selectCount) % Math.max(selectCount, 1));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        if (selectCount > 0) {
          const selectedItem = flatItems[selectedIndex];
          if (selectedItem) handleSelect(selectedItem);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [state.type, selectCount, selectedIndex, handleSelect, onClose, flatItems]);

  if (!state.type) return null;

  const isSlash = state.type === 'slash';
  const catalogItemCount = slashCommands.filter((c) => c.source !== 'mode').length;
  const showSlashLoading = isSlash && slashLoading && catalogItemCount === 0;

  const menuPositionClass = fixedPosition
    ? 'fixed z-[200]'
    : `absolute left-0 right-0 z-50 ${dropDirection === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`;

  return (
    <div
      ref={menuRef}
      className={`${menuPositionClass} bg-white border border-[#E5E5E5] rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] max-h-80 overflow-hidden flex flex-col`}
      style={fixedPosition ? { top: fixedPosition.top, left: fixedPosition.left, right: fixedPosition.right } : undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="overflow-y-auto flex-1 py-1">
        {showSlashLoading ? (
          <div className="px-3 py-6 text-xs text-[#9A9A9A] text-center">
            加载技能和命令...
          </div>
        ) : renderRows.length === 0 ? (
          <div className="px-3 py-6 text-xs text-[#9A9A9A] text-center">
            {state.query.trim() ? `未找到「${state.query.trim()}」` : '暂无可用项'}
          </div>
        ) : renderRows.map((row, i) => {
          if (row.type === 'header') {
            return (
              <div
                key={`h-${i}`}
                className="flex items-center gap-2.5 px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#9A9A9A] bg-[#FAFAFA] sticky top-0 z-10 border-b border-[#F0F0F0]"
              >
                <span className="shrink-0 w-4" aria-hidden />
                <span className="shrink-0 w-4" aria-hidden />
                <span>{row.label}</span>
              </div>
            );
          }

          const item = row.item;
          const idx = row.selectIndex;
          const isCurrentSelect = idx === selectedIndex;
          const label = item.name;
          const desc = item.description;
          const slashKindTag = isSlash && isSlashSkillItem(item)
            ? getSlashKindLabel(item)
            : isSlash && isSlashCommandItem(item)
              ? getSlashKindLabel(item)
              : null;
          const scopeTag = 'scope' in item
            && !('icon' in item && item.icon)
            && !(isSlash && (isSlashSkillItem(item) || isSlashCommandItem(item)))
            ? getScopeLabel(item.scope)
            : null;
          const providerTag = 'providerLabel' in item ? item.providerLabel : null;
          const isAgentItem = 'kind' in item && item.kind === 'agent';
          const agentSrc = isAgentItem ? (item as AgentItem) : null;
          const sourceTag = agentSrc
            ? (agentSrc.sourceLabel || (agentSrc.sourceType ? agentSrc.sourceType : '内置'))
            : null;

          return (
            <button
              key={slashItemKey(item, idx)}
              type="button"
              data-selectable
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelect(item);
              }}
              className={`flex items-center gap-2.5 w-full px-3 py-2 transition-colors ${
                isCurrentSelect ? 'bg-[#EEF4FF]' : 'hover:bg-[#F5F5F5]'
              }`}
            >
              <span className="shrink-0 w-4 flex items-center justify-center">
                {isCurrentSelect && <Check size={14} className="text-[#2B8FFF]" />}
              </span>
              <span className="shrink-0 w-4 flex items-center justify-center">
                {'source' in item && item.source === 'model' && <ModelIcon size={16} />}
                {'icon' in item && item.icon === 'plan' && <PlanIcon size={16} />}
                {'icon' in item && item.icon === 'compress' && <CompressIcon size={16} />}
                {'kind' in item && item.kind === 'team' && <TeamIcon size={16} />}
                {isSlash && isSlashSkillItem(item) && <SkillIcon size={16} />}
                {isSlash && isSlashCommandItem(item) && <ClipboardList size={16} className="text-[#B8860B]" />}
                {isAgentItem && <AgentIcon size={16} />}
                {'kind' in item && item.kind === 'file' && <FileIcon size={16} />}
              </span>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-sm font-medium text-[#1F1F1F] truncate">{label}</div>
                {desc && (
                  <div className="text-xs text-[#9A9A9A] truncate mt-0.5">{desc}</div>
                )}
              </div>
              {providerTag && (
                <span className="text-[11px] text-[#9A9A9A] shrink-0">{providerTag}</span>
              )}
              {slashKindTag && !providerTag && (
                <span className={`text-[11px] shrink-0 ${
                  slashKindTag === '命令' ? 'text-[#B8860B]' : 'text-[#2B8FFF]'
                }`}
                >
                  {slashKindTag}
                </span>
              )}
              {scopeTag && !providerTag && !slashKindTag && (
                <span className="text-[11px] text-[#9A9A9A] shrink-0">{scopeTag}</span>
              )}
              {sourceTag && (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#F0F0F0] text-[#6B6B6B] shrink-0">{sourceTag}</span>
              )}
            </button>
          );
        })}
      </div>
      {renderRows.length > 0 && (
        <div className="px-3 py-1.5 border-t border-[#ECECEC] bg-[#FAFAFA] text-[11px] text-[#9A9A9A] flex items-center gap-3">
          <span>↑↓ 选择</span>
          <span>Enter 确认</span>
          <span>Esc 关闭</span>
        </div>
      )}
    </div>
  );
}

function isSlashSkillItem(item: MenuItem): item is SlashItem {
  return 'source' in item && item.source === 'skill';
}

function isSlashCommandItem(item: MenuItem): item is SlashItem {
  return 'source' in item && item.source === 'command' && !('icon' in item && item.icon);
}

function isSlashCatalogItem(item: MenuItem): item is SlashItem {
  return 'source' in item
    && (item.source === 'skill' || item.source === 'command')
    && !('icon' in item && item.icon);
}

function appendSlashScopeGroup(
  rows: RenderRow[],
  label: string,
  items: SlashItem[],
  startIndex: number,
): number {
  if (items.length === 0) return startIndex;

  rows.push({ type: 'header', label });
  let selectIdx = startIndex;
  for (const item of items) {
    rows.push({ type: 'item', item, selectIndex: selectIdx++ });
  }
  return selectIdx;
}

function appendSlashScopeGroups(
  rows: RenderRow[],
  catalogItems: SlashItem[],
  startIndex: number,
): number {
  const projectItems = catalogItems.filter((item) => item.scope === 'project');
  const globalItems = catalogItems.filter((item) => item.scope === 'global');
  const commandItems = catalogItems.filter((item) => item.scope === 'command');

  let selectIdx = startIndex;
  selectIdx = appendSlashScopeGroup(rows, '项目', projectItems, selectIdx);
  selectIdx = appendSlashScopeGroup(rows, '全局', globalItems, selectIdx);
  selectIdx = appendSlashScopeGroup(rows, '命令', commandItems, selectIdx);
  return selectIdx;
}

function buildRenderRows(items: MenuItem[], includeModels: boolean, type: 'mention' | 'slash' | null): RenderRow[] {
  const rows: RenderRow[] = [];
  let selectIdx = 0;

  if (type === 'slash' && includeModels) {
    const modelItems = items.filter((i) => 'source' in i && i.source === 'model');
    const modeItems = items.filter((i) => 'icon' in i && (i as SlashItem).icon);
    const catalogItems = items.filter(isSlashCatalogItem);

    if (modelItems.length > 0) {
      let lastProvider = '';
      for (const m of modelItems) {
        if ('providerLabel' in m && m.providerLabel !== lastProvider) {
          rows.push({ type: 'header', label: m.providerLabel });
          lastProvider = m.providerLabel;
        }
        rows.push({ type: 'item', item: m, selectIndex: selectIdx++ });
      }
    }

    if (modeItems.length > 0) {
      for (const s of modeItems) {
        rows.push({ type: 'item', item: s, selectIndex: selectIdx++ });
      }
    }

    selectIdx = appendSlashScopeGroups(rows, catalogItems, selectIdx);
  } else if (type === 'slash') {
    const modeItems = items.filter((i) => 'icon' in i && (i as SlashItem).icon);
    const catalogItems = items.filter(isSlashCatalogItem);

    if (modeItems.length > 0) {
      for (const item of modeItems) {
        rows.push({ type: 'item', item, selectIndex: selectIdx++ });
      }
    }

    selectIdx = appendSlashScopeGroups(rows, catalogItems, selectIdx);
  } else if (type === 'mention') {
    if (includeModels) {
      const modelItems = items.filter((i) => 'source' in i && i.source === 'model');
      const agentFileItems = items.filter((i) => 'kind' in i);
      const fileItems = agentFileItems.filter((i) => 'kind' in i && i.kind === 'file');
      const agentItems = agentFileItems.filter((i) => 'kind' in i && i.kind === 'agent') as AgentItem[];

      if (modelItems.length > 0) {
        let lastProvider = '';
        for (const m of modelItems) {
          if ('providerLabel' in m && m.providerLabel !== lastProvider) {
            rows.push({ type: 'header', label: m.providerLabel });
            lastProvider = m.providerLabel;
          }
          rows.push({ type: 'item', item: m, selectIndex: selectIdx++ });
        }
      }

      const customAgents = agentItems.filter((a) => a.sourceType === 'custom');
      const pluginAgents = agentItems.filter((a) => a.sourceType === 'plugin');
      const otherAgents = agentItems.filter((a) => !a.sourceType);

      if (otherAgents.length > 0) {
        rows.push({ type: 'header', label: '智能体' });
        for (const item of otherAgents) {
          rows.push({ type: 'item', item, selectIndex: selectIdx++ });
        }
      }

      if (customAgents.length > 0) {
        rows.push({ type: 'header', label: '自定义' });
        for (const item of customAgents) {
          rows.push({ type: 'item', item, selectIndex: selectIdx++ });
        }
      }

      const pluginGroups = new Map<string, AgentItem[]>();
      for (const a of pluginAgents) {
        const key = a.sourceLabel ?? '插件';
        if (!pluginGroups.has(key)) pluginGroups.set(key, []);
        pluginGroups.get(key)!.push(a);
      }
      for (const [pluginName, agents] of pluginGroups) {
        rows.push({ type: 'header', label: pluginName });
        for (const item of agents) {
          rows.push({ type: 'item', item, selectIndex: selectIdx++ });
        }
      }

      const teamItems = items.filter((i) => 'kind' in i && i.kind === 'team');
      if (teamItems.length > 0) {
        rows.push({ type: 'header', label: '团队' });
        for (const item of teamItems) {
          rows.push({ type: 'item', item, selectIndex: selectIdx++ });
        }
      }

      if (fileItems.length > 0) {
        rows.push({ type: 'header', label: '文件' });
        for (const item of fileItems) {
          rows.push({ type: 'item', item, selectIndex: selectIdx++ });
        }
      }
    } else if (items.length > 0) {
      const agentItems = items.filter((i) => 'kind' in i && i.kind === 'agent') as AgentItem[];
      const teamItems = items.filter((i) => 'kind' in i && i.kind === 'team');
      const fileItems = items.filter((i) => 'kind' in i && i.kind === 'file');

      const customAgents = agentItems.filter((a) => a.sourceType === 'custom');
      const pluginAgents = agentItems.filter((a) => a.sourceType === 'plugin');
      const otherAgents = agentItems.filter((a) => !a.sourceType);

      if (otherAgents.length > 0) {
        rows.push({ type: 'header', label: '智能体' });
        for (const item of otherAgents) {
          rows.push({ type: 'item', item, selectIndex: selectIdx++ });
        }
      }

      if (customAgents.length > 0) {
        rows.push({ type: 'header', label: '自定义' });
        for (const item of customAgents) {
          rows.push({ type: 'item', item, selectIndex: selectIdx++ });
        }
      }

      const pluginGroups = new Map<string, AgentItem[]>();
      for (const a of pluginAgents) {
        const key = a.sourceLabel ?? '插件';
        if (!pluginGroups.has(key)) pluginGroups.set(key, []);
        pluginGroups.get(key)!.push(a);
      }
      for (const [pluginName, agents] of pluginGroups) {
        rows.push({ type: 'header', label: pluginName });
        for (const item of agents) {
          rows.push({ type: 'item', item, selectIndex: selectIdx++ });
        }
      }

      if (teamItems.length > 0) {
        rows.push({ type: 'header', label: '团队' });
        for (const item of teamItems) {
          rows.push({ type: 'item', item, selectIndex: selectIdx++ });
        }
      }

      if (fileItems.length > 0) {
        rows.push({ type: 'header', label: '文件' });
        for (const item of fileItems) {
          rows.push({ type: 'item', item, selectIndex: selectIdx++ });
        }
      }
    }
  }

  return rows;
}

function getFilteredItems(state: AutoCompleteState, includeModels: boolean = false, dynamicAgents: AgentItem[] = [], dynamicTeams: TeamItem[] = [], files: FileItem[] = [], slashCommands: SlashItem[] = []): MenuItem[] {
  if (!state.type) return [];
  const q = state.query.trim();
  const agentList = dynamicAgents.length > 0 ? dynamicAgents : [];

  if (state.type === 'mention') {
    const teamList = dynamicTeams;
    const filteredTeams = q
      ? teamList.filter((t) => fuzzyMatch(q, t.name) || fuzzyMatch(q, t.key) || fuzzyMatch(q, t.description))
      : teamList;
    if (includeModels) {
      const allModels = getAllModels();
      const filteredModels = q ? allModels.filter((m) => fuzzyMatch(q, m.name)) : allModels;
      const filteredAgents = q
        ? agentList.filter((a) => fuzzyMatch(q, a.name) || fuzzyMatch(q, a.description))
        : agentList;
      const filteredFiles = q ? files.filter((f) => fuzzyMatch(q, f.name)) : files;
      return [...filteredModels, ...filteredAgents, ...filteredTeams, ...filteredFiles].slice(0, MAX_MODEL_ITEMS);
    }
    const filteredAgents = q
      ? agentList.filter((a) => fuzzyMatch(q, a.name) || fuzzyMatch(q, a.description))
      : agentList;
    const filteredFiles = q ? files.filter((f) => fuzzyMatch(q, f.name)) : files;
    return [...filteredAgents, ...filteredTeams, ...filteredFiles].slice(0, MAX_ITEMS);
  }

  if (state.type === 'slash') {
    const builtinModes = getBuiltinModes();
    const filteredModes = q
      ? builtinModes.filter((m) => fuzzyMatch(q, m.name) || fuzzyMatch(q, m.description) || (m.icon === 'compress' && fuzzyMatch(q, 'compress')))
      : builtinModes;
    const builtinNames = new Set(builtinModes.map((m) => m.name));
    const filteredSkills = (q ? slashCommands.filter((c) => fuzzyMatch(q, c.name)) : slashCommands)
      .filter((c) => !builtinNames.has(c.name));

    if (includeModels) {
      const allModels = getAllModels();
      const filteredModels = q ? allModels.filter((m) => fuzzyMatch(q, m.name)) : allModels;
      return [...filteredModels, ...filteredModes, ...filteredSkills].slice(0, MAX_MODEL_ITEMS);
    }

    return [...filteredModes, ...filteredSkills].slice(0, MAX_MODEL_ITEMS);
  }

  return [];
}