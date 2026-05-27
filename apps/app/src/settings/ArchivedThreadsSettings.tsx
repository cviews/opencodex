import { useState } from 'react';
import { ArchiveRestore, MessageSquare } from 'lucide-react';

interface ArchivedThread {
  id: string;
  title: string;
  archivedAt: string;
  messageCount: number;
}

const INITIAL_THREADS: ArchivedThread[] = [
  { id: '1', title: 'Fix login flow error handling', archivedAt: '2025-12-15', messageCount: 24 },
  { id: '2', title: 'Add dark mode toggle', archivedAt: '2025-12-18', messageCount: 12 },
  { id: '3', title: 'Refactor API client layer', archivedAt: '2025-12-20', messageCount: 38 },
];

export function ArchivedThreadsSettings() {
  const [threads, setThreads] = useState<ArchivedThread[]>(INITIAL_THREADS);

  const unarchive = (id: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-sm font-semibold text-[#D8DEE9]">Archived Threads</h3>

      <div className="flex flex-col gap-2">
        {threads.map((thread) => (
          <div
            key={thread.id}
            className="flex items-center gap-3 px-3 py-2.5 bg-[#2A2B2D] rounded-md border border-white/[0.06]"
          >
            <MessageSquare size={14} className="text-[#9EA1AA] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#D8DEE9] truncate">{thread.title}</p>
              <p className="text-xs text-[#9EA1AA]">
                {thread.archivedAt} · {thread.messageCount} messages
              </p>
            </div>
            <button
              type="button"
              onClick={() => unarchive(thread.id)}
              className="flex items-center gap-1 text-xs text-[#9EA1AA] hover:text-[#D8DEE9] transition-colors flex-shrink-0"
              title="Unarchive"
            >
              <ArchiveRestore size={12} />
              <span>Restore</span>
            </button>
          </div>
        ))}

        {threads.length === 0 && (
          <p className="text-xs text-[#9EA1AA] text-center py-6">
            No archived threads
          </p>
        )}
      </div>
    </div>
  );
}
