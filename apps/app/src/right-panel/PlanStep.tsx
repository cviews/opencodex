interface PlanStepProps {
  title: string;
  status: 'completed' | 'current' | 'pending';
}

export function PlanStep({ title, status }: PlanStepProps) {
  const indicator = {
    completed: <span className="text-[#10A37F]">✓</span>,
    current: <span className="w-2 h-2 rounded-full bg-[#2B8FFF] inline-block" />,
    pending: <span className="text-[#9A9A9A]">○</span>,
  };

  const textClass = {
    completed: 'text-[var(--app-text-muted)] opacity-60',
    current: 'text-[var(--app-text)] font-medium',
    pending: 'text-[var(--app-text-muted)]',
  };

  return (
    <div className={`flex items-center gap-2 py-0.5 text-xs cursor-pointer hover:bg-[var(--app-hover)] rounded px-1 transition-colors ${textClass[status]}`}>
      {indicator[status]}
      <span>{title}</span>
    </div>
  );
}
