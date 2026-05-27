import { useState } from 'react';
import { FileText } from 'lucide-react';
import { SettingDropdown, SettingToggle } from './SettingHelpers';

export function AgentConfigSettings() {
  const [model, setModel] = useState('glm-5.1');
  const [approvalPolicy, setApprovalPolicy] = useState('on-request');
  const [sandboxMode, setSandboxMode] = useState('workspace-write');
  const [reasoningEffort, setReasoningEffort] = useState('high');
  const [webSearch, setWebSearch] = useState(true);
  const [verboseOutput, setVerboseOutput] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-sm font-semibold text-[#D8DEE9]">Agent Config</h3>

      <SettingDropdown
        label="Model"
        value={model}
        options={[
          { id: 'glm-5.1', label: 'GLM-5.1 (Flagship)' },
          { id: 'glm-5', label: 'GLM-5' },
          { id: 'glm-4.7', label: 'GLM-4.7' },
          { id: 'glm-4.7-FlashX', label: 'GLM-4.7-FlashX' },
          { id: 'glm-4.7-Flash', label: 'GLM-4.7-Flash (Free)' },
        ]}
        onChange={setModel}
      />

      <SettingDropdown
        label="Approval policy"
        value={approvalPolicy}
        options={[
          { id: 'on-request', label: 'On request' },
          { id: 'never', label: 'Never (auto-approve)' },
          { id: 'auto-review', label: 'Auto-review' },
        ]}
        onChange={setApprovalPolicy}
      />

      <SettingDropdown
        label="Sandbox mode"
        value={sandboxMode}
        options={[
          { id: 'read-only', label: 'Read-only' },
          { id: 'workspace-write', label: 'Workspace write' },
          { id: 'danger-full-access', label: 'Full access (danger)' },
        ]}
        onChange={setSandboxMode}
      />

      <SettingDropdown
        label="Reasoning effort"
        value={reasoningEffort}
        options={[
          { id: 'low', label: 'Low' },
          { id: 'medium', label: 'Medium' },
          { id: 'high', label: 'High' },
          { id: 'xhigh', label: 'Maximum' },
        ]}
        onChange={setReasoningEffort}
      />

      <SettingToggle
        label="Web search"
        description="Allow the agent to search the web for information"
        value={webSearch}
        onChange={setWebSearch}
      />

      <SettingToggle
        label="Verbose output"
        description="Show detailed reasoning and intermediate steps"
        value={verboseOutput}
        onChange={setVerboseOutput}
      />

      <div className="pt-2 border-t border-white/[0.06]">
        <button
          type="button"
          className="flex items-center gap-2 text-xs text-[#9EA1AA] hover:text-[#D8DEE9] transition-colors"
        >
          <FileText size={14} />
          <span>Edit config.toml</span>
        </button>
      </div>
    </div>
  );
}
