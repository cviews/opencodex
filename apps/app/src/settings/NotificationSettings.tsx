import { useState } from 'react';
import { SettingDropdown, SettingToggle } from './SettingHelpers';

export function NotificationSettings() {
  const [taskComplete, setTaskComplete] = useState('background');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [desktopNotifications, setDesktopNotifications] = useState(true);
  const [errorAlerts, setErrorAlerts] = useState(true);

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-sm font-semibold text-[#D8DEE9]">Notifications</h3>

      <SettingDropdown
        label="Task complete"
        value={taskComplete}
        options={[
          { id: 'background', label: 'When in background' },
          { id: 'always', label: 'Always' },
          { id: 'never', label: 'Never' },
        ]}
        onChange={setTaskComplete}
      />

      <SettingToggle
        label="Sound effects"
        description="Play sounds for task completion and errors"
        value={soundEnabled}
        onChange={setSoundEnabled}
      />

      <SettingToggle
        label="Desktop notifications"
        description="Show system notifications for important events"
        value={desktopNotifications}
        onChange={setDesktopNotifications}
      />

      <SettingToggle
        label="Error alerts"
        description="Show alerts when an agent encounters an error"
        value={errorAlerts}
        onChange={setErrorAlerts}
      />
    </div>
  );
}
