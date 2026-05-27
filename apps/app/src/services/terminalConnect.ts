const DEFAULT_TIMEOUT_MS = 15_000;

type TerminalWsEvent = {
  type: 'message' | 'close' | 'error';
  channelId: string;
  binary?: boolean;
  data?: string | ArrayBuffer;
  code?: number;
  reason?: string;
};

type ElectronTerminalAPI = {
  terminalConnect?: (wsUrl: string) => Promise<{ channelId: string }>;
  terminalSend?: (channelId: string, data: string) => Promise<{ ok: boolean }>;
  terminalDisconnect?: (channelId: string) => Promise<{ ok: boolean }>;
  onTerminalWsEvent?: (callback: (event: TerminalWsEvent) => void) => () => void;
};

export const TERMINAL_SOCKET_CONNECTING = 0;
export const TERMINAL_SOCKET_OPEN = 1;
export const TERMINAL_SOCKET_CLOSING = 2;
export const TERMINAL_SOCKET_CLOSED = 3;

export interface TerminalSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: 'message' | 'close' | 'error',
    listener: (event: MessageEvent | CloseEvent | Event) => void,
  ): void;
  removeEventListener(
    type: 'message' | 'close' | 'error',
    listener: (event: MessageEvent | CloseEvent | Event) => void,
  ): void;
}

function getElectronTerminalAPI(): ElectronTerminalAPI | undefined {
  return (window as unknown as Record<string, unknown>)['electronAPI'] as ElectronTerminalAPI | undefined;
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(label + '超时（' + String(Math.round(ms / 1000)) + ' 秒）'));
    }, ms);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function connectTerminalWebSocketInBrowser(
  wsUrl: string,
  timeoutMs: number,
): Promise<TerminalSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';

    let settled = false;
    const finish = (handler: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      handler();
    };

    const timer = window.setTimeout(() => {
      finish(() => {
        socket.close();
        reject(new Error(buildWebSocketTimeoutMessage(timeoutMs)));
      });
    }, timeoutMs);

    socket.addEventListener(
      'open',
      () => {
        finish(() => resolve(wrapNativeWebSocket(socket)));
      },
      { once: true },
    );

    socket.addEventListener(
      'error',
      () => {
        finish(() => reject(new Error('WebSocket 连接失败')));
      },
      { once: true },
    );
  });
}

function wrapNativeWebSocket(socket: WebSocket): TerminalSocket {
  return {
    get readyState() {
      return socket.readyState;
    },
    send(data: string) {
      socket.send(data);
    },
    close(code?: number, reason?: string) {
      socket.close(code, reason);
    },
    addEventListener(type, listener) {
      socket.addEventListener(type, listener as EventListener);
    },
    removeEventListener(type, listener) {
      socket.removeEventListener(type, listener as EventListener);
    },
  };
}

function normalizeBridgeMessageData(data: unknown): string | ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Uint8Array) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }
  if (typeof data === 'string') return data;
  return null;
}

function connectTerminalWebSocketViaElectron(
  wsUrl: string,
  timeoutMs: number,
): Promise<TerminalSocket> {
  const api = getElectronTerminalAPI();
  if (!api?.terminalConnect || !api.onTerminalWsEvent) {
    return Promise.reject(new Error('Electron 终端桥接不可用'));
  }

  const terminalConnect = api.terminalConnect;
  const onTerminalWsEvent = api.onTerminalWsEvent;
  const terminalSend = api.terminalSend;
  const terminalDisconnect = api.terminalDisconnect;

  return new Promise((resolve, reject) => {
    let channelId: string | null = null;
    let readyState = TERMINAL_SOCKET_CONNECTING;
    let settled = false;
    let removeBridgeListener: (() => void) | undefined;

    const listeners: {
      message: Array<(event: MessageEvent) => void>;
      close: Array<(event: CloseEvent) => void>;
      error: Array<(event: Event) => void>;
    } = {
      message: [],
      close: [],
      error: [],
    };

    const finish = (handler: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      handler();
    };

    const timer = window.setTimeout(() => {
      finish(() => {
        if (channelId) {
          void terminalDisconnect?.(channelId);
        }
        removeBridgeListener?.();
        reject(new Error(buildWebSocketTimeoutMessage(timeoutMs)));
      });
    }, timeoutMs);

    removeBridgeListener = onTerminalWsEvent((event) => {
      if (!channelId || event.channelId !== channelId) return;

      if (event.type === 'message') {
        const data = normalizeBridgeMessageData(event.data);
        if (data == null) return;
        const messageEvent = { data } as MessageEvent;
        for (const listener of listeners.message) listener(messageEvent);
        return;
      }

      if (event.type === 'close') {
        readyState = TERMINAL_SOCKET_CLOSED;
        const closeEvent = {
          code: event.code ?? 1000,
          reason: event.reason ?? '',
          wasClean: (event.code ?? 1000) === 1000,
        } as CloseEvent;
        for (const listener of listeners.close) listener(closeEvent);
        removeBridgeListener?.();
        return;
      }

      if (event.type === 'error') {
        for (const listener of listeners.error) listener(new Event('error'));
      }
    });

    void terminalConnect(wsUrl)
      .then(({ channelId: nextChannelId }) => {
        finish(() => {
          channelId = nextChannelId;
          readyState = TERMINAL_SOCKET_OPEN;
          resolve({
            get readyState() {
              return readyState;
            },
            send(data: string) {
              if (!channelId || readyState !== TERMINAL_SOCKET_OPEN) return;
              void terminalSend?.(channelId, data);
            },
            close(code = 1000, reason = '') {
              if (!channelId) return;
              readyState = TERMINAL_SOCKET_CLOSING;
              void terminalDisconnect?.(channelId);
              readyState = TERMINAL_SOCKET_CLOSED;
              const closeEvent = { code, reason, wasClean: code === 1000 } as CloseEvent;
              for (const listener of listeners.close) listener(closeEvent);
              removeBridgeListener?.();
            },
            addEventListener(type, listener) {
              if (type === 'message') listeners.message.push(listener as (event: MessageEvent) => void);
              if (type === 'close') listeners.close.push(listener as (event: CloseEvent) => void);
              if (type === 'error') listeners.error.push(listener as (event: Event) => void);
            },
            removeEventListener(type, listener) {
              if (type === 'message') {
                listeners.message = listeners.message.filter((item) => item !== listener);
              }
              if (type === 'close') {
                listeners.close = listeners.close.filter((item) => item !== listener);
              }
              if (type === 'error') {
                listeners.error = listeners.error.filter((item) => item !== listener);
              }
            },
          });
        });
      })
      .catch((error: unknown) => {
        finish(() => {
          removeBridgeListener?.();
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      });
  });
}

function buildWebSocketTimeoutMessage(timeoutMs: number): string {
  return (
    'WebSocket 连接超时（' +
    String(Math.round(timeoutMs / 1000)) +
    ' 秒）。请尝试重新切换项目或重启应用。'
  );
}

export function connectTerminalWebSocket(
  wsUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<TerminalSocket> {
  const api = getElectronTerminalAPI();
  if (api?.terminalConnect && api.onTerminalWsEvent) {
    return connectTerminalWebSocketViaElectron(wsUrl, timeoutMs);
  }
  return connectTerminalWebSocketInBrowser(wsUrl, timeoutMs);
}

export async function resolveFreshServerUrl(serverUrl: string): Promise<string> {
  const electronAPI = (window as unknown as Record<string, unknown>)['electronAPI'] as
    | { serverUrl?: () => Promise<string | null> }
    | undefined;

  if (!electronAPI?.serverUrl) return serverUrl;

  try {
    const url = await withTimeout(electronAPI.serverUrl(), 3_000, '读取服务地址');
    if (url) return url;
  } catch {
    /* fall back to cached url */
  }

  return serverUrl;
}

export const TERMINAL_CONNECT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
export const TERMINAL_HEALTH_TIMEOUT_MS = 5_000;
export const TERMINAL_TOKEN_TIMEOUT_MS = 10_000;
