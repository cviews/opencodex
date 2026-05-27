import type { Message } from '@zmn-codex/types';
import type { MessageCard, ToolCall } from '../types';

export type { MessageCard, ToolCall };

export type ChatMessage = Message & {
  thinking?: boolean;
  agentName?: string;
  reasoningContent?: string;
  cards?: MessageCard[];
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
  /** Compaction summary message — show in activity rail only, not as assistant body. */
  compactionSummary?: boolean;
};
