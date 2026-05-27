import { useState } from 'react';
import { Plus, Server, Trash2 } from 'lucide-react';

interface MCPServer {
  id: string;
  name: string;
  url: string;
  status: 'connected' | 'disconnected';
}

const INITIAL_SERVERS: MCPServer[] = [
  { id: '1', name: 'playwright', url: 'http://localhost:3001', status: 'connected' },
  { id: '2', name: 'github', url: 'http://localhost:3002', status: 'disconnected' },
];

export function IntegrationsSettings() {
  const [servers, setServers] = useState<MCPServer[]>(INITIAL_SERVERS);

  const removeServer = (id: string) => {
    setServers((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-sm font-semibold text-[#D8DEE9]">Integrations</h3>

      {/* MCP Servers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-medium text-[#9EA1AA]">MCP Servers</label>
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-[#2B8FFF] hover:text-[#5AAFFF] transition-colors"
          >
            <Plus size={12} />
            <span>Add server</span>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {servers.map((server) => (
            <div
              key={server.id}
              className="flex items-center gap-3 px-3 py-2 bg-[#2A2B2D] rounded-md border border-white/[0.06]"
            >
              <Server size={14} className="text-[#9EA1AA] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#D8DEE9] truncate">{server.name}</p>
                <p className="text-xs text-[#9EA1AA] truncate">{server.url}</p>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  server.status === 'connected'
                    ? 'bg-[#10A37F]/20 text-[#10A37F]'
                    : 'bg-white/[0.06] text-[#9EA1AA]'
                }`}
              >
                {server.status}
              </span>
              <button
                type="button"
                onClick={() => removeServer(server.id)}
                className="text-[#9EA1AA] hover:text-red-400 transition-colors flex-shrink-0"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}

          {servers.length === 0 && (
            <p className="text-xs text-[#9EA1AA] text-center py-4">
              No MCP servers configured
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
