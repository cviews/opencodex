import { useState } from 'react';
import { SettingTextarea } from './SettingHelpers';

const PERSONALITY_MODES = [
  { id: 'friendly', label: 'Friendly' },
  { id: 'pragmatic', label: 'Pragmatic' },
  { id: 'none', label: 'None' },
] as const;

type PersonalityMode = (typeof PERSONALITY_MODES)[number]['id'];

export function PersonalizationSettings() {
  const [personality, setPersonality] = useState<PersonalityMode>('friendly');
  const [customInstructions, setCustomInstructions] = useState('');

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-sm font-semibold text-[#D8DEE9]">Personalization</h3>

      <div>
        <label className="block text-xs font-medium text-[#9EA1AA] mb-2">
          Personality mode
        </label>
        <div className="flex gap-2">
          {PERSONALITY_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setPersonality(mode.id)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                personality === mode.id
                  ? 'bg-[#2B8FFF] text-white'
                  : 'bg-[#2A2B2D] text-[#9EA1AA] hover:text-[#D8DEE9]'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <SettingTextarea
        label="Custom instructions"
        placeholder="Add custom instructions for the agent... These will be saved to AGENTS.md"
        value={customInstructions}
        onChange={setCustomInstructions}
        rows={6}
      />

      {customInstructions.length > 0 && (
        <p className="text-xs text-[#9EA1AA]">
          These instructions will be appended to AGENTS.md
        </p>
      )}
    </div>
  );
}
