import type { ReactNode } from 'react';

interface SettingGroupProps {
  label: string;
  children: ReactNode;
}

export function SettingGroup({ label, children }: SettingGroupProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#9EA1AA] mb-2">{label}</label>
      {children}
    </div>
  );
}

interface SettingToggleProps {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function SettingToggle({ label, description, value, onChange }: SettingToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="mr-4 min-w-0">
        <span className="text-sm text-[#D8DEE9]">{label}</span>
        {description && (
          <p className="text-xs text-[#9EA1AA] mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative flex-shrink-0 w-8 h-[18px] rounded-full transition-colors ${
          value ? 'bg-[#10A37F]' : 'bg-[#2A2B2D]'
        }`}
      >
        <span
          className={`block w-[14px] h-[14px] rounded-full bg-white transition-transform mt-[2px] ${
            value ? 'translate-x-[18px]' : 'translate-x-[2px]'
          }`}
        />
      </button>
    </div>
  );
}

interface SettingDropdownProps {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
}

export function SettingDropdown({ label, value, options, onChange }: SettingDropdownProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#9EA1AA] mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#2A2B2D] border border-white/[0.06] rounded-md px-3 py-1.5 text-sm text-[#D8DEE9] outline-none focus:border-[#2B8FFF] transition-colors cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface SettingTextareaProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}

export function SettingTextarea({
  label,
  placeholder,
  value,
  onChange,
  rows = 4,
}: SettingTextareaProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#9EA1AA] mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-[#2A2B2D] border border-white/[0.06] rounded-md px-3 py-2 text-sm text-[#D8DEE9] placeholder-[#9EA1AA] outline-none focus:border-[#2B8FFF] transition-colors resize-none"
      />
    </div>
  );
}

interface SettingInputProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

export function SettingInput({ label, placeholder, value, onChange }: SettingInputProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#9EA1AA] mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#2A2B2D] border border-white/[0.06] rounded-md px-3 py-1.5 text-sm text-[#D8DEE9] placeholder-[#9EA1AA] outline-none focus:border-[#2B8FFF] transition-colors"
      />
    </div>
  );
}
