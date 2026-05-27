import { describe, expect, it } from 'vitest';
import { dedupeTeamRelayTurns } from './teamRelayDedupe';
import type { ChatMessage } from './types';

function relayUser(id: string, from: string, body: string, createdAt: string): ChatMessage {
  return {
    id,
    sessionID: 'ses_test',
    sessionId: 'ses_test',
    role: 'user',
    content: `[Team message from ${from}]: ${body}`,
    createdAt,
  };
}

describe('dedupeTeamRelayTurns', () => {
  it('collapses duplicate relay turns within window', () => {
    const t1 = '2026-05-26T10:00:00.000Z';
    const t2 = '2026-05-26T10:01:00.000Z';
    const turns = dedupeTeamRelayTurns([
      {
        id: 'a',
        user: relayUser('a', 'lead', '请认领 trtc-3', t1),
        assistants: [],
      },
      {
        id: 'b',
        user: relayUser('b', 'lead', '请认领 trtc-3', t2),
        assistants: [],
      },
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.id).toBe('a');
  });

  it('keeps distinct bodies', () => {
    const turns = dedupeTeamRelayTurns([
      {
        id: 'a',
        user: relayUser('a', 'lead', 'task-1', '2026-05-26T10:00:00.000Z'),
        assistants: [],
      },
      {
        id: 'b',
        user: relayUser('b', 'lead', 'task-2', '2026-05-26T10:01:00.000Z'),
        assistants: [],
      },
    ]);
    expect(turns).toHaveLength(2);
  });
});
