import { useCallback } from 'react';
import { useSettingsStore } from '../stores/settings';
import { stringResource, type Language } from '../i18n';

function settingsLanguageToI18n(language: string): Language {
  return language === 'zh-CN' ? 'zh' : 'en';
}

export function useTerminalI18n() {
  const language = useSettingsStore((s) => s.language);
  const i18nLang = settingsLanguageToI18n(language);

  const t = useCallback((key: string) => stringResource(key, i18nLang), [i18nLang]);
  const tabLabel = useCallback(
    (index: number) => `${stringResource('terminal.title', i18nLang)} ${index}`,
    [i18nLang],
  );

  return { t, tabLabel };
}

export function terminalTabLabel(index: number, language: string): string {
  const i18nLang = settingsLanguageToI18n(language);
  return `${stringResource('terminal.title', i18nLang)} ${index}`;
}
