import { useEffect, useState } from 'react';
import { useSettingsStore, type ThemeType } from '../stores/settings';

export function resolveIsDark(theme: ThemeType): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useResolvedTheme() {
  const theme = useSettingsStore((s) => s.theme);
  const [isDark, setIsDark] = useState(() => resolveIsDark(theme));

  useEffect(() => {
    setIsDark(resolveIsDark(theme));

    if (theme !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setIsDark(media.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [theme]);

  return { theme, isDark };
}

export function getXtermTheme(isDark: boolean) {
  if (isDark) {
    return {
      background: '#191515',
      foreground: '#d4d4d4',
      cursor: '#d4d4d4',
      selectionBackground: 'rgba(43, 143, 255, 0.35)',
    };
  }
  return {
    background: '#fcfcfc',
    foreground: '#211e1e',
    cursor: '#211e1e',
    selectionBackground: 'rgba(31, 31, 31, 0.15)',
  };
}
