import type { Message } from '@opencodex/types';
import type { ChatMessage } from './types';
import { t } from '../constants/i18n';

const AGENT_LABELS: Record<string, string> = {
  plan: t('mode_plan'),
  build: 'Build',
  'OpenCode-Builder': 'OpenCode Builder',
  'opencode-builder': 'OpenCode Builder',
};

export function formatAgentLabel(agent?: string | null): string | undefined {
  if (!agent) return undefined;
  return AGENT_LABELS[agent] ?? agent;
}

export function toChatMessage(msg: Message & { compactionSummary?: boolean }): ChatMessage {
  return {
    ...msg,
    agentName: formatAgentLabel(msg.agent),
    reasoningContent: msg.reasoningContent,
    toolCalls: msg.toolCalls,
    compactionSummary: msg.compactionSummary,
  };
}

export function isUserMessage(msg: ChatMessage): boolean {
  return msg.role === 'user';
}

export function isAssistantMessage(msg: ChatMessage): boolean {
  return msg.role === 'assistant';
}

export function hasCards(msg: ChatMessage): boolean {
  return (msg.cards?.length ?? 0) > 0;
}

export function hasToolCalls(msg: ChatMessage): boolean {
  return (msg.toolCalls?.length ?? 0) > 0;
}
