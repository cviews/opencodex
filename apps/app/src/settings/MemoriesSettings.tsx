import { useState } from 'react';
import { SettingToggle } from './SettingHelpers';

export function MemoriesSettings() {
  const [crossThreadContext, setCrossThreadContext] = useState(true);
  const [autoRemember, setAutoRemember] = useState(false);
  const [maxMemoryEntries, setMaxMemoryEntries] = useState('100');

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-sm font-semibold text-[#D8DEE9]">Memories</h3>

      <SettingToggle
        label="Cross-thread context"
        description="Persist learned context across different conversation threads"
        value={crossThreadContext}
        onChange={setCrossThreadContext}
      />

      <SettingToggle
        label="Auto-remember preferences"
        description="Automatically save user preferences and patterns detected during conversations"
        value={autoRemember}
        onChange={setAutoRemember}
      />

      <div>
        <label className="block text-xs font-medium text-[#9EA1AA] mb-1">
          Max memory entries
        </label>
        <select
          value={maxMemoryEntries}
          onChange={(e) => setMaxMemoryEntries(e.target.value)}
          className="w-full bg-[#2A2B2D] border border-white/[0.06] rounded-md px-3 py-1.5 text-sm text-[#D8DEE9] outline-none focus:border-[#2B8FFF] transition-colors cursor-pointer"
        >
          {['50', '100', '200', '500'].map((v) => (
            <option key={v} value={v}>
              {v} entries
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
