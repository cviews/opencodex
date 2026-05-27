import { useSettingsStore } from '../stores/settings';
import { stringResource, type Language } from '../i18n';

function settingsLanguageToI18n(language: string): Language {
  return language === 'zh-CN' ? 'zh' : 'en';
}

export function useTerminalI18n() {
  const language = useSettingsStore((s) => s.language);
  const i18nLang = settingsLanguageToI18n(language);

  const t = (key: string) => stringResource(key, i18nLang);
  const tabLabel = (index: number) => `${t('terminal.title')} ${index}`;

  return { t, tabLabel };
}

export function terminalTabLabel(index: number, language: string): string {
  const i18nLang = settingsLanguageToI18n(language);
  return `${stringResource('terminal.title', i18nLang)} ${index}`;
}
