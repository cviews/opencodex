import { useState, useEffect } from 'react';
import { useSessionStore } from '../stores/session';
import { fetchSessionContext } from '../services/sessionService';
import { on, extractEventPayload } from '../sdk/eventRouter';
import { isPendingSessionId } from '../utils/pendingSession';
import type { ContextUsageInfo } from '../types';

const DEFAULT_CONTEXT: ContextUsageInfo = { percentage: 0, usedTokens: 0, totalTokens: 128000 };

export function useSessionContext(): ContextUsageInfo {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const [sessionContext, setSessionContext] = useState<ContextUsageInfo>(DEFAULT_CONTEXT);

  useEffect(() => {
    if (!activeSessionId || isPendingSessionId(activeSessionId)) {
      setSessionContext(DEFAULT_CONTEXT);
      return;
    }
    fetchSessionContext(activeSessionId).then(setSessionContext);
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId || isPendingSessionId(activeSessionId)) return;

    const refresh = () => fetchSessionContext(activeSessionId).then(setSessionContext);

    const unsubSession = on('session.updated', (event) => {
      const payload = extractEventPayload(event);
      const sid = payload.sessionID as string | undefined;
      if (sid === activeSessionId) refresh();
    });

    const unsubMessage = on('message.updated', (event) => {
      const payload = extractEventPayload(event);
      const sid = payload.sessionID as string | undefined;
      if (sid === activeSessionId) refresh();
    });

    return () => {
      unsubSession();
      unsubMessage();
    };
  }, [activeSessionId]);

  return sessionContext;
}
