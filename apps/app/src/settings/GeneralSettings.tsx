import { useState } from 'react';
import { SettingGroup, SettingToggle } from './SettingHelpers';

export function GeneralSettings() {
  const [detailLevel, setDetailLevel] = useState<'default' | 'coding'>('default');
  const [multilineSend, setMultilineSend] = useState(false);
  const [preventSleep, setPreventSleep] = useState(true);

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-sm font-semibold text-[#D8DEE9]">General</h3>

      <SettingGroup label="Detail level">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDetailLevel('default')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              detailLevel === 'default'
                ? 'bg-[#2B8FFF] text-white'
                : 'bg-[#2A2B2D] text-[#9EA1AA] hover:text-[#D8DEE9]'
            }`}
          >
            Default
          </button>
          <button
            type="button"
            onClick={() => setDetailLevel('coding')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              detailLevel === 'coding'
                ? 'bg-[#2B8FFF] text-white'
                : 'bg-[#2A2B2D] text-[#9EA1AA] hover:text-[#D8DEE9]'
            }`}
          >
            Coding
          </button>
        </div>
      </SettingGroup>

      <SettingToggle
        label="Cmd+Enter for multiline send"
        description="Require Cmd+Enter to send messages instead of just Enter"
        value={multilineSend}
        onChange={setMultilineSend}
      />

      <SettingToggle
        label="Prevent sleep while running"
        description="Keep the system awake when agent is executing tasks"
        value={preventSleep}
        onChange={setPreventSleep}
      />
    </div>
  );
}
