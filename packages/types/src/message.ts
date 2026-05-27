import { z } from 'zod';

/**
 * Message types aligned with OpenCode SDK Message shape.
 * SDK Message = UserMessage | AssistantMessage.
 *
 * We use a unified type that covers both roles, with role-specific
 * fields marked optional.
 */
export const MessageSchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  // User message fields
  parentID: z.string().optional(),
  parts: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
      }),
    )
    .optional(),
  // Assistant message fields
  modelID: z.string().optional(),
  providerID: z.string().optional(),
  mode: z.string().optional(),
  agent: z.string().optional(),
  cost: z.number().optional(),
  tokens: z
    .object({
      total: z.number().optional(),
      input: z.number(),
      output: z.number(),
      reasoning: z.number(),
      cache: z
        .object({
          read: z.number(),
          write: z.number(),
        })
        .optional(),
    })
    .optional(),
  finish: z.string().optional(),
  // Time fields (SDK uses numeric timestamps)
  time: z
    .object({
      created: z.number(),
      completed: z.number().optional(),
    })
    .optional(),
  // Legacy fields for backward compatibility with mock data
  sessionId: z.string().optional(),
  content: z.string().optional(),
  /** Assistant reasoning/thinking text captured from streaming or loaded parts */
  reasoningContent: z.string().optional(),
  /** UI-only: what the user typed, without expanded skill/agent/team MD */
  displayContent: z.string().optional(),
  /** Runtime tool invocations attached to assistant messages */
  toolCalls: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        status: z.enum(['pending', 'running', 'completed', 'error']),
        input: z.string().optional(),
        output: z.string().optional(),
        error: z.string().optional(),
      }),
    )
    .optional(),
  createdAt: z.string().optional(),
});

export type Message = z.infer<typeof MessageSchema>;
