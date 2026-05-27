import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { initClient, getClient, disposeClient } from './client';
import { startRouter } from './eventRouter';
import { setEventInstanceDirectory } from './eventDirectory';
import { useProjectStore } from '../stores/project';
import { invalidateOpenCodeServerUrlCache } from '../services/serverUrlCache';
import { opencodePermission, opencodeSlash } from '../services/opencodeAdapter';
import { debugError, debugLog, debugWarn } from '../utils/debugLog';

interface EngineRestartResult {
  state: 'running' | 'error' | 'idle';
  url?: string;
  cwd?: string;
  error?: string;
  switched?: boolean;
}

interface ElectronAPIShape {
  serverUrl?: () => Promise<string | null>;
  engineRestartWithDir?: (directory: string) => Promise<EngineRestartResult | null>;
}

function getElectronAPI(): ElectronAPIShape | undefined {
  return (window as unknown as Record<string, unknown>)['electronAPI'] as ElectronAPIShape | undefined;
}

interface SDKContextValue {
  client: ReturnType<typeof getClient>;
  serverUrl: string | null;
  connected: boolean;
  reconnecting: boolean;
  error: string | null;
  reconnect: () => void;
  updateServerUrl: (url: string) => void;
  restartWithDir: (directory: string) => Promise<string | null>;
}

const SDKContext = createContext<SDKContextValue>({
  client: null,
  serverUrl: null,
  connected: false,
  reconnecting: false,
  error: null,
  reconnect: () => {},
  updateServerUrl: () => {},
  restartWithDir: async () => null,
});

export function useSDK(): SDKContextValue {
  return useContext(SDKContext);
}

export function SDKProvider({ children, initialUrl }: { children: ReactNode; initialUrl?: string }) {
  const [serverUrl, setServerUrl] = useState<string | null>(initialUrl ?? null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRouterRef = useRef<(() => void) | null>(null);
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;

  useEffect(() => {
    const electronAPI = getElectronAPI();

    if (electronAPI?.serverUrl && !initialUrl) {
      electronAPI
        .serverUrl()
        .then((url: string | null) => {
          if (url) setServerUrl(url);
        })
        .catch((err: Error) => {
          setError(err.message);
        });
    }
  }, [initialUrl]);

  const connect = useCallback(async (url: string) => {
    try {
      if (stopRouterRef.current) {
        stopRouterRef.current();
        stopRouterRef.current = null;
      }

      const c = initClient(url);
      invalidateOpenCodeServerUrlCache();

      setConnected(true);
      setError(null);
      setReconnecting(false);
      debugLog('sdk.connected', { url });

      return c;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setConnected(false);
      setError(message);
      debugError('sdk.connection-failed', message);
      return null;
    }
  }, []);

  const updateServerUrl = useCallback((url: string) => {
    setServerUrl(url);
  }, []);

  const restartWithDir = useCallback(async (directory: string): Promise<string | null> => {
    const electronAPI = getElectronAPI();

    if (!electronAPI?.engineRestartWithDir) {
      debugWarn('sdk.engineRestartWithDir-unavailable', 'engineRestartWithDir not available');
      return null;
    }

    try {
      setReconnecting(true);
      setError(null);
      const result = await electronAPI.engineRestartWithDir(directory);
      if (!result) {
        setReconnecting(false);
        setConnected(false);
        return null;
      }
      if (result.state === 'running' && result.url) {
        invalidateOpenCodeServerUrlCache();
        const currentUrl = serverUrlRef.current;
        const sameServer = result.switched || result.url === currentUrl;

        if (sameServer) {
          if (!getClient()) {
            await connect(result.url);
          } else {
            setConnected(true);
          }
        } else {
          setServerUrl(result.url);
        }
        setReconnecting(false);
        return result.url;
      }
      setReconnecting(false);
      setConnected(false);
      if (result.state === 'error') {
        setError(result.error || 'Engine restart failed');
      }
      return null;
    } catch (err: unknown) {
      setReconnecting(false);
      setConnected(false);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return null;
    }
  }, [connect]);

  const reconnect = useCallback(() => {
    if (serverUrl) {
      setConnected(false);
      setError(null);
      connect(serverUrl);
    }
  }, [serverUrl, connect]);

  const projectPath = useProjectStore((s) => s.currentProject.path);

  useEffect(() => {
    if (!serverUrl) return;

    connect(serverUrl);

    return () => {
      if (stopRouterRef.current) {
        stopRouterRef.current();
        stopRouterRef.current = null;
      }
      disposeClient();
      setConnected(false);
    };
  }, [serverUrl, connect]);

  useEffect(() => {
    if (!connected || !projectPath?.trim()) return;
    void opencodePermission.fetchInstanceDirectory(projectPath.trim()).then((directory) => {
      const resolved =
        (projectPath.trim() && projectPath.trim() !== '/' ? projectPath.trim() : undefined)
        || (directory && directory !== '/' ? directory : undefined);
      if (resolved) setEventInstanceDirectory(resolved);
    });
    opencodeSlash.prefetchSlashCatalog();
    if (stopRouterRef.current) {
      stopRouterRef.current();
    }
    stopRouterRef.current = startRouter();
    return () => {
      if (stopRouterRef.current) {
        stopRouterRef.current();
        stopRouterRef.current = null;
      }
    };
  }, [connected, projectPath]);

  return (
    <SDKContext.Provider
      value={{
        client: getClient(),
        serverUrl,
        connected,
        reconnecting,
        error,
        reconnect,
        updateServerUrl,
        restartWithDir,
      }}
    >
      {children}
    </SDKContext.Provider>
  );
}
