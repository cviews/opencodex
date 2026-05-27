import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { en } from './en';
import { zh } from './zh';

export type Language = 'en' | 'zh';

type TranslationMap = Record<string, string>;

const translations: Record<Language, TranslationMap> = { en, zh };

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  setLanguage: () => {},
  t: (key: string) => key,
});

const LANGUAGE_STORAGE_KEY = 'codex-language-v1';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === 'zh' || saved === 'en') return saved;
    } catch { /* ignore */ }
    return 'en';
  });

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  const t = (key: string): string => {
    const value = translations[language]?.[key];
    if (value) return value;
    // Fallback to English if key not found in current language
    const fallback = translations.en?.[key];
    if (fallback) return fallback;
    // Return the key itself if not found anywhere
    return key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

// Convenience function — can be used outside React if needed
export function stringResource(key: string, language: Language = 'en'): string {
  const value = translations[language]?.[key] ?? translations.en?.[key] ?? key;
  return value;
}
