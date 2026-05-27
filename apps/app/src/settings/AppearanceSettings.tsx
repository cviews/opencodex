import { useState } from 'react';
import { useI18n, type Language } from '../i18n';
import { SettingDropdown } from './SettingHelpers';

const ACCENT_COLORS = [
  { id: '#2B8FFF', label: 'Blue' },
  { id: '#10A37F', label: 'Green' },
  { id: '#F97316', label: 'Orange' },
  { id: '#EF4444', label: 'Red' },
  { id: '#8B5CF6', label: 'Purple' },
  { id: '#EC4899', label: 'Pink' },
];

export function AppearanceSettings() {
  const { language, setLanguage, t } = useI18n();
  const [theme, setTheme] = useState('dark');
  const [accentColor, setAccentColor] = useState('#2B8FFF');
  const [uiFont, setUiFont] = useState('system');
  const [codeFont, setCodeFont] = useState('jetbrains-mono');
  const [fontSize, setFontSize] = useState('14');

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-sm font-semibold text-[#D8DEE9]">Appearance</h3>

      <SettingDropdown
        label="Theme"
        value={theme}
        options={[
          { id: 'light', label: 'Light' },
          { id: 'dark', label: 'Dark' },
          { id: 'system', label: 'System' },
        ]}
        onChange={setTheme}
      />

      <div>
        <label className="block text-xs font-medium text-[#9EA1AA] mb-2">
          Accent color
        </label>
        <div className="flex gap-2">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color.id}
              type="button"
              title={color.label}
              onClick={() => setAccentColor(color.id)}
              className={`w-6 h-6 rounded-full transition-all ${
                accentColor === color.id
                  ? 'ring-2 ring-offset-1 ring-offset-[#202123] ring-white/30 scale-110'
                  : 'hover:scale-110'
              }`}
              style={{ backgroundColor: color.id }}
            />
          ))}
        </div>
      </div>

      <SettingDropdown
        label="UI font"
        value={uiFont}
        options={[
          { id: 'system', label: 'System default' },
          { id: 'inter', label: 'Inter' },
          { id: 'sf-pro', label: 'SF Pro' },
          { id: 'menlo', label: 'Menlo' },
        ]}
        onChange={setUiFont}
      />

      <SettingDropdown
        label="Code font"
        value={codeFont}
        options={[
          { id: 'jetbrains-mono', label: 'JetBrains Mono' },
          { id: 'fira-code', label: 'Fira Code' },
          { id: 'source-code-pro', label: 'Source Code Pro' },
          { id: 'monaspace', label: 'Monaspace Neon' },
        ]}
        onChange={setCodeFont}
      />

      <SettingDropdown
        label="Code font size"
        value={fontSize}
        options={[
          { id: '12', label: '12px' },
          { id: '13', label: '13px' },
          { id: '14', label: '14px' },
          { id: '15', label: '15px' },
          { id: '16', label: '16px' },
        ]}
        onChange={setFontSize}
      />

      <SettingDropdown
        label={t('settings.language')}
        value={language}
        options={[
          { id: 'en', label: t('settings.languageEn') },
          { id: 'zh', label: t('settings.languageZh') },
        ]}
        onChange={(v) => setLanguage(v as Language)}
      />
    </div>
  );
}
