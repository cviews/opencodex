interface DiffBlockProps {
  content: string;
}

export function DiffBlock({ content }: DiffBlockProps) {
  const lines = content.split('\n');

  return (
    <div className="message-code-block my-3 overflow-hidden rounded-lg border border-[var(--color-msg-border)]">
      <div className="flex items-center border-b border-[var(--color-msg-border)] bg-[var(--color-msg-code-header)] px-3 py-1.5">
        <span className="font-mono text-[12px] text-[var(--color-msg-muted)]">diff</span>
      </div>

      <div className="overflow-x-auto bg-[var(--color-msg-code-bg)]">
        <pre className="p-4 font-mono text-[13px] leading-[1.6] whitespace-pre">
          {lines.map((line, idx) => (
            <DiffLine key={idx} line={line} />
          ))}
        </pre>
      </div>
    </div>
  );
}

function DiffLine({ line }: { line: string }) {
  if (line.startsWith('--- ') || line.startsWith('+++ ')) {
    return <div className="text-[var(--color-msg-muted)]">{line}</div>;
  }

  if (line.startsWith('@@')) {
    return <div className="bg-[var(--color-msg-accent)]/5 px-1 text-[var(--color-msg-accent)]">{line}</div>;
  }

  if (line.startsWith('-')) {
    return <div className="bg-[rgba(229,83,75,0.08)] px-1 text-[#E5534B]">{line}</div>;
  }

  if (line.startsWith('+')) {
    return <div className="bg-[rgba(57,150,57,0.08)] px-1 text-[#399639]">{line}</div>;
  }

  return <div className="text-[var(--color-msg-text)]">{line}</div>;
}
