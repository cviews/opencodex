import type { SlashItem, ProviderEntry } from '../types';
import { t } from './i18n';

export function getBuiltinModes(): SlashItem[] {
  return [
    { name: t('mode_plan'), description: t('mode_plan_desc'), source: 'mode', scope: 'mode', icon: 'plan' },
    { name: t('mode_compress'), description: t('mode_compress_desc'), source: 'mode', scope: 'mode', icon: 'compress' },
  ];
}

export function getPermissionOptions() {
  return [
    { id: 'default', label: t('permission_default'), description: '' },
    { id: 'auto-review', label: t('permission_auto_review'), description: '' },
    { id: 'full-access', label: t('permission_full_access'), description: '' },
  ] as const;
}

export function getBuiltinPopularProviders(): ProviderEntry[] {
  return [
    { id: '9', name: 'Zhipu AI Coding Plan', description: t('provider_zhipuai'), connected: false, tag: t('provider_tag_recommend'), providerType: 'zhipuai-coding' },
    { id: '10', name: 'Volcano Engine Coding Plan', description: t('provider_volcengine'), connected: false, providerType: 'volcengine-coding' },
    { id: '11', name: t('provider_custom_title'), description: t('provider_custom'), connected: false, tag: t('provider_tag_custom'), providerType: 'custom' },
  ];
}