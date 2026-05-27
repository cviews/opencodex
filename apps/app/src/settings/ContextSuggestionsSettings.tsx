import { useState } from 'react';
import { SettingToggle } from './SettingHelpers';

export function ContextSuggestionsSettings() {
  const [contextAware, setContextAware] = useState(true);
  const [followUp, setFollowUp] = useState(true);
  const [smartFiles, setSmartFiles] = useState(false);
  const [maxContextFiles, setMaxContextFiles] = useState('10');

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-sm font-semibold text-[#D8DEE9]">Context Suggestions</h3>

      <SettingToggle
        label="Context-aware suggestions"
        description="Suggest relevant files and code based on the current conversation context"
        value={contextAware}
        onChange={setContextAware}
      />

      <SettingToggle
        label="Follow-up suggestions"
        description="Show suggested follow-up prompts after task completion"
        value={followUp}
        onChange={setFollowUp}
      />

      <SettingToggle
        label="Smart file detection"
        description="Automatically detect and include related files when starting a new task"
        value={smartFiles}
        onChange={setSmartFiles}
      />

      <div>
        <label className="block text-xs font-medium text-[#9EA1AA] mb-1">
          Max context files
        </label>
        <select
          value={maxContextFiles}
          onChange={(e) => setMaxContextFiles(e.target.value)}
          className="w-full bg-[#2A2B2D] border border-white/[0.06] rounded-md px-3 py-1.5 text-sm text-[#D8DEE9] outline-none focus:border-[#2B8FFF] transition-colors cursor-pointer"
        >
          {['5', '10', '20', '50'].map((v) => (
            <option key={v} value={v}>
              {v} files
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
