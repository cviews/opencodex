import { useEffect, useRef, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';
import type { OpencodeClient } from '@opencode-ai/sdk/v2/client';
import { useProjectStore } from '../stores/project';
import { useSDK } from '../sdk/provider';
import {
  TERMINAL_MAX_HEIGHT,
  TERMINAL_MIN_HEIGHT,
  useTerminalStore,
  type TerminalTab,
} from '../stores/terminal';
import { getXtermTheme, useResolvedTheme } from '../hooks/useResolvedTheme';
import { useTerminalI18n } from '../hooks/useTerminalI18n';
import { terminalWebSocketURL } from '../services/terminalWebSocketUrl';
import { terminalWriter } from '../services/terminalWriter';
import {
  terminalClearError,
  terminalLogError,
  terminalLogInfo,
  terminalLogWarn,
} from '../services/terminalLog';

function focusTerminal(term: Terminal, container: HTMLElement) {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== container && !container.contains(active)) {
    active.blur();
  }
  term.focus();
  term.textarea?.focus();
  window.setTimeout(() => term.textarea?.focus(), 0);
}

function TerminalTabView({
  tab,
  isActive,
  client,
  serverUrl,
}: {
  tab: TerminalTab;
  isActive: boolean;
  client: OpencodeClient;
  serverUrl: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const projectPath = useProjectStore((s) => s.currentProject.path);
  const panelHeight = useTerminalStore((s) => s.height);
  const { isDark } = useResolvedTheme();

  const syncSizeRef = useRef<() => void>(() => {});

  const syncSize = useCallback(() => {
    const fitAddon = fitAddonRef.current;
    const term = xtermRef.current;
    if (!fitAddon || !term) return;

    fitAddon.fit();
    const cols = Math.max(term.cols, 2);
    const rows = Math.max(term.rows, 2);
    if (term.cols !== cols || term.rows !== rows) {
      term.resize(cols, rows);
    }
  }, []);

  syncSizeRef.current = syncSize;

  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;
    term.options.theme = getXtermTheme(isDark);
  }, [isDark]);

  useEffect(() => {
    if (!isActive || !projectPath) return;

    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let ws: WebSocket | undefined;
    let ptyId: string | undefined;
    let sizeTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingSize: { cols: number; rows: number } | undefined;
    let output: ReturnType<typeof terminalWriter> | undefined;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 1,
      fontSize: 13,
      lineHeight: 1.25,
      fontFamily: '"IBM Plex Mono", "SF Mono", Menlo, Monaco, Consolas, monospace',
      theme: getXtermTheme(isDark),
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const unicode11Addon = new Unicode11Addon();
    term.loadAddon(fitAddon);
    term.loadAddon(unicode11Addon);
    term.open(container);
    term.unicode.activeVersion = '11';
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    output = terminalWriter((data, done) => {
      term.write(data, done);
    });

    const scheduleServerResize = (cols: number, rows: number) => {
      pendingSize = { cols, rows };
      if (sizeTimer) clearTimeout(sizeTimer);
      sizeTimer = setTimeout(() => {
        sizeTimer = undefined;
        const size = pendingSize;
        pendingSize = undefined;
        if (!size || !ptyId || disposed) return;
        void client.pty
          .update({
            ptyID: ptyId,
            directory: projectPath,
            size,
          })
          .then((result) => {
            if (result.error) {
              terminalLogWarn('resize.failed', result.error, { ptyId, size, tabId: tab.id });
            }
          })
          .catch((err) => {
            terminalLogError('resize.exception', err, { ptyId, size, tabId: tab.id });
          });
      }, 100);
    };

    const connectWebSocket = async (id: string) => {
      terminalLogInfo('ws.connecting', { ptyId: id, serverUrl, projectPath, tabId: tab.id });

      const tokenResult = await client.pty.connectToken(
        { ptyID: id, directory: projectPath },
        {
          throwOnError: false,
          headers: { 'x-opencode-ticket': '1' },
        },
      );

      terminalLogInfo('ws.connectToken', {
        status: tokenResult.response.status,
        hasTicket: Boolean(tokenResult.data?.ticket),
        error: tokenResult.error,
        tabId: tab.id,
      });

      if (tokenResult.error) {
        terminalLogError('ws.connectToken.failed', tokenResult.error, {
          status: tokenResult.response.status,
          ptyId: id,
          tabId: tab.id,
        });
      }

      const ticket =
        tokenResult.response.status === 200 && tokenResult.data?.ticket
          ? tokenResult.data.ticket
          : undefined;

      const wsUrl = terminalWebSocketURL({
        baseUrl: serverUrl,
        ptyId: id,
        directory: projectPath,
        cursor: 0,
        ticket,
      });

      terminalLogInfo('ws.url', { wsUrl: wsUrl.replace(/ticket=[^&]+/, 'ticket=***'), tabId: tab.id });

      const socket = new WebSocket(wsUrl);
      socket.binaryType = 'arraybuffer';
      ws = socket;

      const decoder = new TextDecoder();

      socket.addEventListener('open', () => {
        if (disposed) return;
        terminalLogInfo('ws.open', { ptyId: id, tabId: tab.id });
        terminalClearError();
        syncSizeRef.current();
        scheduleServerResize(term.cols, term.rows);
        focusTerminal(term, container);
      });

      socket.addEventListener('message', (event) => {
        if (disposed) return;
        if (event.data instanceof ArrayBuffer) {
          const bytes = new Uint8Array(event.data);
          if (bytes[0] !== 0) return;
          try {
            const json = decoder.decode(bytes.subarray(1));
            const meta = JSON.parse(json) as { cursor?: unknown };
            const next = meta?.cursor;
            if (typeof next === 'number' && Number.isSafeInteger(next) && next >= 0) {
              // cursor sync from server control frame
            }
          } catch {
            // ignore invalid control frames
          }
          return;
        }
        const data = typeof event.data === 'string' ? event.data : '';
        if (!data) return;
        output?.push(data);
      });

      socket.addEventListener('error', (event) => {
        if (disposed) return;
        terminalLogError('ws.error', 'WebSocket error', { ptyId: id, tabId: tab.id, event: String(event) });
        term.writeln('\r\n\x1b[31mTerminal connection error\x1b[0m');
      });

      socket.addEventListener('close', (event) => {
        if (disposed) return;
        terminalLogWarn('ws.close', `code=${event.code} reason=${event.reason || '(none)'}`, {
          ptyId: id,
          tabId: tab.id,
          wasClean: event.wasClean,
        });
        if (event.code !== 1000) {
          term.writeln(`\r\n\x1b[31mTerminal disconnected (${event.code})\x1b[0m`);
        }
      });

      return () => {
        socket.close(1000);
      };
    };

    const cleanupFns: Array<() => void> = [];

    const run = async () => {
      terminalLogInfo('pty.create.start', { projectPath, tabId: tab.id, serverUrl });

      const createResult = await client.pty.create({
        directory: projectPath,
        cwd: projectPath,
      });

      if (disposed) return;

      terminalLogInfo('pty.create.result', {
        tabId: tab.id,
        status: createResult.response?.status,
        ptyId: createResult.data?.id,
        error: createResult.error,
      });

      if (createResult.error || !createResult.data?.id) {
        terminalLogError('pty.create.failed', createResult.error ?? 'missing pty id', {
          tabId: tab.id,
          status: createResult.response?.status,
          projectPath,
        });
        term.writeln('\r\n\x1b[31mFailed to create terminal session\x1b[0m');
        return;
      }

      ptyId = createResult.data.id;
      const closeSocket = await connectWebSocket(ptyId);
      if (disposed) {
        closeSocket?.();
        await client.pty.remove({ ptyID: ptyId, directory: projectPath });
        return;
      }

      let sendSkipLogged = false;
      const onData = term.onData((data) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(data);
        } else if (!sendSkipLogged) {
          sendSkipLogged = true;
          terminalLogWarn('ws.send.skipped', `readyState=${ws?.readyState ?? 'none'}`, {
            ptyId,
            tabId: tab.id,
          });
        }
      });

      const onResize = term.onResize(({ cols, rows }) => {
        scheduleServerResize(cols, rows);
      });

      const resizeObserver = new ResizeObserver(() => {
        syncSizeRef.current();
        scheduleServerResize(term.cols, term.rows);
      });
      resizeObserver.observe(container);

      focusTerminal(term, container);

      cleanupFns.push(() => {
        onData.dispose();
        onResize.dispose();
        resizeObserver.disconnect();
        closeSocket?.();
        if (ptyId) {
          void client.pty.remove({ ptyID: ptyId, directory: projectPath }).catch((err) => {
            terminalLogWarn('pty.remove.failed', err, { ptyId, tabId: tab.id });
          });
        }
      });
    };

    void run().catch((err) => {
      if (!disposed) {
        terminalLogError('start.failed', err, { tabId: tab.id, projectPath, serverUrl });
        term.writeln('\r\n\x1b[31mFailed to start terminal\x1b[0m');
      }
    });

    return () => {
      disposed = true;
      if (sizeTimer) clearTimeout(sizeTimer);
      for (const fn of cleanupFns) fn();
      if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
        ws.close(1000);
      }
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [isActive, projectPath, tab.id, tab.sessionKey, isDark, client, serverUrl]);

  useEffect(() => {
    if (!isActive) return;
    requestAnimationFrame(() => syncSizeRef.current());
  }, [isActive, panelHeight]);

  if (!isActive) return null;

  return (
    <div
      ref={containerRef}
      onPointerDown={() => {
        const term = xtermRef.current;
        const container = containerRef.current;
        if (term && container) focusTerminal(term, container);
      }}
      className="absolute inset-0 px-2 py-1 z-10 cursor-text select-text"
    />
  );
}

export function EmbeddedTerminal() {
  const { isDark } = useResolvedTheme();
  const { t, tabLabel } = useTerminalI18n();
  const { client, serverUrl, connected } = useSDK();
  const { height, tabs, activeTabId, addTab, closeTab, setActiveTab, setHeight, lastError, setLastError } =
    useTerminalStore();

  const handleResizeStart = (event: React.MouseEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      setHeight(startHeight + delta);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const shellTheme = getXtermTheme(isDark);
  const canConnect = connected && client && serverUrl;

  return (
    <div
      className="shrink-0 flex flex-col border-t border-[#E5E5E5] dark:border-[#444444] bg-white dark:bg-[#2D2D2D]"
      style={{ height }}
    >
      <div
        className="h-1 cursor-row-resize bg-transparent hover:bg-[#2B8FFF]/30 transition-colors"
        onMouseDown={handleResizeStart}
        aria-hidden
      />

      <div className="flex items-center gap-1 px-2 py-1 border-b border-[#E5E5E5] dark:border-[#444444] bg-white dark:bg-[#2D2D2D]">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={`group flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-md text-xs transition-colors ${
                isActive
                  ? 'bg-[#F5F5F5] dark:bg-[#3A3A3A] text-[#1F1F1F] dark:text-[#E5E5E5]'
                  : 'text-[#6B6B6B] dark:text-[#9A9A9A] hover:bg-[#F5F5F5] dark:hover:bg-[#3A3A3A]'
              }`}
            >
              <button type="button" onClick={() => setActiveTab(tab.id)} className="truncate max-w-[120px]">
                {tabLabel(tab.index)}
              </button>
              <button
                type="button"
                onClick={() => closeTab(tab.id)}
                className="p-0.5 rounded opacity-60 hover:opacity-100 hover:bg-[#E5E5E5] dark:hover:bg-[#505050] transition-colors"
                aria-label={`${t('terminal.closeTab')} ${tabLabel(tab.index)}`}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={addTab}
          className="p-1 rounded-md text-[#9A9A9A] hover:text-[#1F1F1F] dark:hover:text-[#E5E5E5] hover:bg-[#F5F5F5] dark:hover:bg-[#3A3A3A] transition-colors"
          aria-label={t('terminal.newTab')}
        >
          <Plus size={14} />
        </button>
      </div>

      <div
        className="relative flex-1 min-h-0 embedded-terminal"
        style={{ backgroundColor: shellTheme.background }}
      >
        {lastError ? (
          <div className="absolute inset-x-0 top-0 z-20 flex items-start gap-2 bg-[#FEE2E2] dark:bg-[#7F1D1D]/90 text-[#991B1B] dark:text-[#FECACA] px-3 py-2 text-xs border-b border-[#FECACA]/50">
            <span className="flex-1 break-all font-mono">{lastError}</span>
            <button
              type="button"
              className="shrink-0 underline opacity-80 hover:opacity-100"
              onClick={() => setLastError(null)}
            >
              关闭
            </button>
          </div>
        ) : null}
        {!canConnect ? (
          <div className="flex h-full items-center justify-center text-xs text-[#9A9A9A]">
            等待 opencode 服务连接...
          </div>
        ) : (
          tabs.map((tab) => (
            <TerminalTabView
              key={`${tab.id}-${tab.sessionKey}`}
              tab={tab}
              isActive={tab.id === activeTabId}
              client={client}
              serverUrl={serverUrl}
            />
          ))
        )}
      </div>
    </div>
  );
}

export { TERMINAL_MIN_HEIGHT, TERMINAL_MAX_HEIGHT };
