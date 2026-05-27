import { z } from 'zod';

/**
 * Session type aligned with OpenCode SDK Session shape.
 * Fields map 1:1 to the SDK's Session type for seamless integration.
 */
export const SessionSchema = z.object({
  id: z.string(),
  slug: z.string().optional(),
  projectID: z.string().optional(),
  workspaceID: z.string().optional(),
  directory: z.string().optional(),
  path: z.string().optional(),
  parentID: z.string().optional(),
  title: z.string().optional(),
  agent: z.string().optional(),
  model: z
    .object({
      id: z.string(),
      providerID: z.string(),
      variant: z.string().optional(),
    })
    .optional(),
  version: z.string().optional(),
  cost: z.number().optional(),
  tokens: z
    .object({
      input: z.number(),
      output: z.number(),
      reasoning: z.number(),
      cache: z.object({
        read: z.number(),
        write: z.number(),
      }),
    })
    .optional(),
  time: z
    .object({
      created: z.number(),
      updated: z.number(),
      compacting: z.number().optional(),
      archived: z.number().optional(),
    })
    .optional(),
  // Legacy fields for backward compatibility with mock data
  cwd: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Session = z.infer<typeof SessionSchema>;
