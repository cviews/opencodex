interface SourceItemProps {
  file: string;
  operation: 'read' | 'edit' | 'create' | 'delete';
}

export function SourceItem({ file, operation }: SourceItemProps) {
  const opLabel = {
    read: 'read',
    edit: 'edit',
    create: 'create',
    delete: 'delete',
  };

  const opColor = {
    read: 'text-[#9A9A9A]',
    edit: 'text-[#2B8FFF]',
    create: 'text-[#10A37F]',
    delete: 'text-[#EC5F66]',
  };

  return (
    <div className="flex items-center gap-2 py-0.5 text-xs cursor-pointer hover:bg-[#F0F0F0] rounded px-1 transition-colors">
      <span className="flex-1 text-[#1F1F1F] truncate">{file}</span>
      <span className={`text-[10px] ${opColor[operation]}`}>[{opLabel[operation]}]</span>
    </div>
  );
}
