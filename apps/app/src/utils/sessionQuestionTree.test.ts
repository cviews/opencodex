import { describe, expect, it } from 'vitest';
import { pickQuestionForSessionTree } from './sessionQuestionTree';
import type { PendingQuestion } from '../types';

describe('pickQuestionForSessionTree', () => {
  const qA: PendingQuestion = {
    id: 'q-a',
    sessionId: 'session-a',
    title: 'Question A',
    options: [{ label: 'A1' }],
    multiSelect: false,
    allowCustom: false,
  };
  const qB: PendingQuestion = {
    id: 'q-b',
    sessionId: 'session-b',
    title: 'Question B',
    options: [{ label: 'B1' }],
    multiSelect: false,
    allowCustom: false,
  };

  it('returns question for active session tree only', () => {
    const picked = pickQuestionForSessionTree([qA, qB], 'session-a', [], []);
    expect(picked?.id).toBe('q-a');
  });

  it('does not fall back to another session question', () => {
    const picked = pickQuestionForSessionTree([qA], 'session-b', [], []);
    expect(picked).toBeNull();
  });

  it('does not show pending questions when no session is active', () => {
    const picked = pickQuestionForSessionTree([qA, qB], null, [], []);
    expect(picked).toBeNull();
  });
});
