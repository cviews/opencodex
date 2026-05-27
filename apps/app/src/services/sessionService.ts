import type { ContextUsageInfo } from '../types';
import { getClient } from '../sdk/client';
import { opencodeSettings } from './opencodeAdapter';
import { isPendingSessionId } from '../utils/pendingSession';

const FALLBACK_CONTEXT_LIMIT = 128000;

type AssistantTokens = {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
};

type ConfigModel = { limit?: { context?: number; output?: number } };
type ConfigProvider = { id: string; models: Record<string, ConfigModel> };

/** Same sum as opencode TUI (sidebar context / prompt usage). */
function sumTokensTui(tokens: AssistantTokens): number {
  return (
    tokens.input
    + tokens.output
    + tokens.reasoning
    + tokens.cache.read
    + tokens.cache.write
  );
}

async function fetchConfigProviders(): Promise<ConfigProvider[]> {
  const client = getClient();
  if (!client) return [];
  try {
    const resp = await client.config.providers();
    const data = resp.data as { providers?: ConfigProvider[] } | undefined;
    return data?.providers ?? [];
  } catch (err) {
    console.error('[sessionService] config.providers failed:', err);
    return [];
  }
}

function getContextLimitFromProviders(
  providers: ConfigProvider[],
  providerID: string,
  modelID: string,
): number | null {
  const provider = providers.find((p) => p.id === providerID);
  const limit = provider?.models[modelID]?.limit?.context;
  if (limit && limit > 0) return limit;
  return null;
}

type SessionMessageItem = {
  info?: {
    role?: string;
    providerID?: string;
    modelID?: string;
    tokens?: AssistantTokens;
  };
};

/** Match TUI: last assistant message with tokens.output > 0. */
function findUsageAssistant(
  messages: SessionMessageItem[],
): { tokens: AssistantTokens; providerID: string; modelID: string } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const info = messages[i].info;
    if (info?.role !== 'assistant' || !info.tokens || !info.providerID || !info.modelID) continue;
    if (info.tokens.output > 0) {
      return {
        tokens: info.tokens,
        providerID: info.providerID,
        modelID: info.modelID,
      };
    }
  }
  return null;
}

async function resolveDefaultModelRef(): Promise<{ providerID: string; modelID: string } | null> {
  const defaultModel = await opencodeSettings.fetchDefaultModel();
  if (defaultModel?.id.includes('/')) {
    const [providerID, modelID] = defaultModel.id.split('/');
    if (providerID && modelID) return { providerID, modelID };
  }
  return null;
}

export async function fetchSessionContext(sessionId: string): Promise<ContextUsageInfo> {
  if (isPendingSessionId(sessionId)) {
    return { percentage: 0, usedTokens: 0, totalTokens: FALLBACK_CONTEXT_LIMIT };
  }
  const client = getClient();
  if (!client) {
    return { percentage: 0, usedTokens: 0, totalTokens: FALLBACK_CONTEXT_LIMIT };
  }

  try {
    const [messagesResp, providers] = await Promise.all([
      client.session.messages({ sessionID: sessionId }),
      fetchConfigProviders(),
    ]);
    const messages = (messagesResp.data ?? []) as SessionMessageItem[];

    const usage = findUsageAssistant(messages);
    if (!usage) {
      const defaultRef = await resolveDefaultModelRef();
      const totalTokens = defaultRef
        ? getContextLimitFromProviders(providers, defaultRef.providerID, defaultRef.modelID)
          ?? FALLBACK_CONTEXT_LIMIT
        : FALLBACK_CONTEXT_LIMIT;
      return { percentage: 0, usedTokens: 0, totalTokens };
    }

    const usedTokens = sumTokensTui(usage.tokens);
    const totalTokens =
      getContextLimitFromProviders(providers, usage.providerID, usage.modelID)
      ?? FALLBACK_CONTEXT_LIMIT;
    const percentage =
      totalTokens > 0 ? Math.min(Math.round((usedTokens / totalTokens) * 100), 100) : 0;

    return { percentage, usedTokens, totalTokens };
  } catch (err) {
    console.error('[sessionService] fetchSessionContext failed:', err);
    return { percentage: 0, usedTokens: 0, totalTokens: FALLBACK_CONTEXT_LIMIT };
  }
}
