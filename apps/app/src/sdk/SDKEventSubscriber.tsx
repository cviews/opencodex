import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSDK } from './provider';
import { getClient } from './client';
import { useSessionStore } from '../stores/session';
import { useMessageStore } from '../stores/message';
import { usePermissionStore } from '../stores/permission';
import { useAgentStore } from '../stores/agent';
import { useTeamStore } from '../stores/team';
import { isPendingSessionId } from '../utils/pendingSession';
import { useSettingsStore } from '../stores/settings';
import { useProjectStore } from '../stores/project';
import { opencodeAgent, opencodeTeam } from '../services/opencodeAdapter';

type AppState = 'connecting' | 'health-check' | 'initializing' | 'ready' | 'error';

function useIsDark() {
  const theme = useSettingsStore((s) => s.theme);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return theme === 'dark' || (theme === 'system' && prefersDark);
}

const LIGHT_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  width: '100vw',
  backgroundColor: '#F5F5F5',
  color: '#1F1F1F',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const DARK_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  width: '100vw',
  backgroundColor: '#1A1A1A',
  color: '#D8DEE9',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

function Spinner({ text, isDark }: { text: string; isDark: boolean }) {
  const style = isDark ? DARK_STYLE : LIGHT_STYLE;
  const borderColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)';
  const topColor = '#6c63ff';
  const textColor = isDark ? '#9EA1AA' : '#6B6B6B';
  return (
    <div style={style}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 40,
          height: 40,
          border: `3px solid ${borderColor}`,
          borderTopColor: topColor,
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 16px',
        }} />
        <div style={{ fontSize: 14, color: textColor }}>{text}</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorScreen({ message, onRetry, isDark }: { message: string; onRetry: () => void; isDark: boolean }) {
  const style = isDark ? DARK_STYLE : LIGHT_STYLE;
  const titleColor = isDark ? '#D8DEE9' : '#1F1F1F';
  const descColor = isDark ? '#9EA1AA' : '#6B6B6B';
  const codeBg = isDark ? '#252540' : '#EEEEEE';
  const codeColor = isDark ? '#808090' : '#6B6B6B';
  const btnBg = '#6c63ff';
  return (
    <div style={style}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: titleColor }}>⚠ 连接失败</div>
        <div style={{ fontSize: 13, color: descColor, marginBottom: 8 }}>
          无法连接到 OpenCode 服务，请检查服务是否正常运行。
        </div>
        <div style={{
          fontSize: 12,
          color: codeColor,
          marginBottom: 16,
          padding: '8px 12px',
          backgroundColor: codeBg,
          borderRadius: 6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {message}
        </div>
        <button
          onClick={onRetry}
          style={{
            padding: '8px 24px',
            backgroundColor: btnBg,
            color: '#fff',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          重新连接
        </button>
      </div>
    </div>
  );
}

function ProjectSwitchToast({ text }: { text: string }) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[200] -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-[#E5E5E5] bg-white/95 px-4 py-2 shadow-lg backdrop-blur-sm dark:border-[#444] dark:bg-[#2A2B2D]/95">
        <Loader2 size={14} className="animate-spin text-[#2B8FFF]" />
        <span className="text-sm text-[#1F1F1F] dark:text-[#E5E5E5]">{text}</span>
      </div>
    </div>
  );
}

async function runBackgroundInit(
  fetches: Array<Promise<unknown>>,
  activeSessionId: string | null,
) {
  if (activeSessionId && !isPendingSessionId(activeSessionId)) {
    fetches.push(useMessageStore.getState().loadMessages(activeSessionId));
  }
  await Promise.allSettled(fetches);
}

export function SDKEventSubscriber({ children }: { children: React.ReactNode }) {
  const { connected, reconnecting, serverUrl, error: sdkError, reconnect, restartWithDir } = useSDK();
  const isDark = useIsDark();
  const hasProject = useProjectStore((s) => s.hasProject);
  const currentProject = useProjectStore((s) => s.currentProject);
  const subscribeSessionEvents = useSessionStore((s) => s.subscribeToEvents);
  const subscribeMessageEvents = useMessageStore((s) => s.subscribeToEvents);
  const subscribePermissionEvents = usePermissionStore((s) => s.subscribeToEvents);
  const subscribeTeamEvents = useTeamStore((s) => s.subscribeToEvents);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const fetchSubAgents = useSessionStore((s) => s.fetchSubAgents);
  const fetchPendingPermissions = usePermissionStore((s) => s.fetchPendingPermissions);
  const fetchPendingQuestions = usePermissionStore((s) => s.fetchPendingQuestions);
  const fetchPermissionMode = usePermissionStore((s) => s.fetchPermissionMode);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const fetchTeams = useAgentStore((s) => s.fetchTeams);
  const fetchActiveTeams = useTeamStore((s) => s.fetchActiveTeams);
  const setCurrentTeamBySession = useTeamStore((s) => s.setCurrentTeamBySession);
  const teamModeEnabled = useTeamStore((s) => s.teamModeEnabled);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  const unsubRef = useRef<Array<() => void>>([]);
  const engineStartedRef = useRef(false);
  const reconnectPendingRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const [appState, setAppState] = useState<AppState>('connecting');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!hasProject) {
      setAppState('ready');
      setErrorMessage('');
      return;
    }

    const softReconnect = hasInitializedRef.current || reconnecting;

    if (!connected) {
      if (!serverUrl && currentProject.path && !engineStartedRef.current) {
        engineStartedRef.current = true;
        if (!softReconnect) {
          setAppState('connecting');
        }
        setErrorMessage('');
        restartWithDir(currentProject.path).catch(() => {});
        return;
      }

      if (serverUrl && !reconnectPendingRef.current) {
        reconnectPendingRef.current = true;
        reconnect();
      }

      if (sdkError) {
        setErrorMessage(sdkError);
        if (!softReconnect) {
          setAppState('error');
        }
      } else if (!softReconnect) {
        setAppState('connecting');
      }
      return;
    }

    let cancelled = false;

    const runHealthCheckAndInit = async () => {
      if (softReconnect) {
        setAppState('ready');
        setErrorMessage('');
      } else {
        setAppState('health-check');
        setErrorMessage('');
      }

      const client = getClient();
      if (!client) {
        if (!cancelled && !softReconnect) {
          setAppState('error');
          setErrorMessage('SDK 客户端未初始化');
        }
        return;
      }

      try {
        await client.global.health({ throwOnError: true });
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setErrorMessage('后端健康检查失败：' + msg);
          if (!softReconnect) {
            setAppState('error');
          }
        }
        return;
      }

      if (cancelled) return;

      if (!softReconnect) {
        setAppState('initializing');
      }

      unsubRef.current.forEach((unsub) => unsub());
      unsubRef.current = [];
      unsubRef.current.push(subscribeSessionEvents());
      unsubRef.current.push(subscribeMessageEvents());
      unsubRef.current.push(subscribePermissionEvents());
      unsubRef.current.push(subscribeTeamEvents());

      const fetches = [
        fetchSessions(),
        fetchSubAgents(),
        fetchPermissionMode(),
        fetchPendingPermissions(),
        fetchPendingQuestions(),
        fetchAgents(),
        fetchTeams(),
        fetchActiveTeams(),
      ];

      const activeSessionId = useSessionStore.getState().activeSessionId;

      if (softReconnect) {
        await runBackgroundInit(fetches, activeSessionId);
        if (!cancelled) {
          hasInitializedRef.current = true;
          setAppState('ready');
        }
        return;
      }

      const results = await Promise.allSettled([
        ...fetches,
        ...(activeSessionId && !isPendingSessionId(activeSessionId)
          ? [useMessageStore.getState().loadMessages(activeSessionId)]
          : []),
      ]);
      if (cancelled) return;

      const criticalResults = results.slice(0, 3);
      const allCriticalFailed = criticalResults.every((r) => r.status === 'rejected');

      if (allCriticalFailed) {
        const reasons = criticalResults
          .map((r) => (r as PromiseRejectedResult).reason)
          .map((r) => (r instanceof Error ? r.message : String(r)));
        setAppState('error');
        setErrorMessage(reasons.join('\n'));
      } else {
        hasInitializedRef.current = true;
        setAppState('ready');
      }
    };

    runHealthCheckAndInit();

    return () => {
      cancelled = true;
    };
  }, [connected, serverUrl, sdkError, hasProject, currentProject.path, reconnecting, reconnect, restartWithDir, subscribeSessionEvents, subscribeMessageEvents, subscribePermissionEvents, subscribeTeamEvents, fetchSessions, fetchSubAgents, fetchPermissionMode, fetchPendingPermissions, fetchPendingQuestions, fetchAgents, fetchTeams, fetchActiveTeams]);

  useEffect(() => {
    if (connected) {
      reconnectPendingRef.current = false;
    }
  }, [connected]);

  useEffect(() => {
    return () => {
      unsubRef.current.forEach((unsub) => unsub());
      unsubRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!hasProject || !connected || !teamModeEnabled || !activeSessionId) return;
    void opencodeTeam.prefetchTeamBySession(activeSessionId);
    void setCurrentTeamBySession(activeSessionId);
  }, [hasProject, connected, teamModeEnabled, activeSessionId, setCurrentTeamBySession]);

  const handleRetry = () => {
    useSessionStore.getState().setError(null);
    useAgentStore.getState().setError(null);
    usePermissionStore.getState().setError(null);
    engineStartedRef.current = false;
    setAppState('connecting');
    setErrorMessage('');
    if (currentProject.path) {
      restartWithDir(currentProject.path);
    } else {
      reconnect();
    }
  };

  if (!hasProject) {
    return <>{children}</>;
  }

  const showSoftToast = hasInitializedRef.current && (reconnecting || appState === 'health-check' || appState === 'initializing');

  if (hasInitializedRef.current) {
    return (
      <>
        {children}
        {showSoftToast && <ProjectSwitchToast text="正在切换项目..." />}
      </>
    );
  }

  switch (appState) {
    case 'connecting':
      return <Spinner text="正在连接 OpenCode 服务..." isDark={isDark} />;
    case 'health-check':
      return <Spinner text="正在检查后端服务..." isDark={isDark} />;
    case 'initializing':
      return <Spinner text="正在加载初始数据..." isDark={isDark} />;
    case 'error':
      return <ErrorScreen message={errorMessage} onRetry={handleRetry} isDark={isDark} />;
    case 'ready':
      return <>{children}</>;
  }
}
