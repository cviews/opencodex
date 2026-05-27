import { useState } from 'react';
import { SettingInput, SettingToggle, SettingTextarea } from './SettingHelpers';

export function GitSettings() {
  const [branchPrefix, setBranchPrefix] = useState('feat/');
  const [autoStage, setAutoStage] = useState(true);
  const [forcePush, setForcePush] = useState(false);
  const [commitTemplate, setCommitTemplate] = useState('');
  const [prTemplate, setPrTemplate] = useState('');
  const [signCommits, setSignCommits] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-sm font-semibold text-[#D8DEE9]">Git</h3>

      <SettingInput
        label="Branch naming prefix"
        placeholder="feat/, fix/, chore/"
        value={branchPrefix}
        onChange={setBranchPrefix}
      />

      <SettingToggle
        label="Auto-stage changes"
        description="Automatically stage all modified files before committing"
        value={autoStage}
        onChange={setAutoStage}
      />

      <SettingToggle
        label="Allow force push"
        description="Enable force push to remote branches"
        value={forcePush}
        onChange={setForcePush}
      />

      <SettingToggle
        label="Sign commits"
        description="GPG-sign all commits"
        value={signCommits}
        onChange={setSignCommits}
      />

      <SettingTextarea
        label="Commit message template"
        placeholder="e.g. {type}: {description}"
        value={commitTemplate}
        onChange={setCommitTemplate}
        rows={3}
      />

      <SettingTextarea
        label="PR description template"
        placeholder="## Summary&#10;- "
        value={prTemplate}
        onChange={setPrTemplate}
        rows={3}
      />
    </div>
  );
}
