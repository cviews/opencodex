import { FileText, Folder, ImageIcon } from 'lucide-react';
import type { ReferenceKind } from './composer/referenceChip';
import { REFERENCE_CHIP_CLASS } from './composer/referenceChip';

export function ReferenceChip({ kind, label }: { kind: ReferenceKind; label: string }) {
  const Icon = kind === 'folder' ? Folder : kind === 'image' ? ImageIcon : FileText;
  return (
    <span className={REFERENCE_CHIP_CLASS}>
      <Icon size={12} className="shrink-0 opacity-80" />
      {label}
    </span>
  );
}
