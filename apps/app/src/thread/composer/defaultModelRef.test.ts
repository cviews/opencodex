import { describe, expect, it, beforeEach } from 'vitest';
import {
  getCachedDefaultModelRef,
  getSessionModelRef,
  modelRefFromSessionModel,
  resolveOutgoingModelRef,
  setCachedDefaultModelRef,
  setSessionModelRef,
} from './defaultModelRef';

describe('resolveOutgoingModelRef', () => {
  beforeEach(() => {
    setCachedDefaultModelRef(null);
    setSessionModelRef('session-a', null);
  });

  it('prefers explicit editor model over session and global cache', () => {
    setCachedDefaultModelRef('provider/global-model');
    setSessionModelRef('session-a', 'provider/session-model');

    expect(
      resolveOutgoingModelRef('provider/explicit-model', 'session-a', {
        id: 'bound-model',
        providerID: 'provider',
      }),
    ).toBe('provider/explicit-model');
  });

  it('uses per-session override before session-bound and global default', () => {
    setCachedDefaultModelRef('provider/global-model');
    setSessionModelRef('session-a', 'provider/session-model');

    expect(
      resolveOutgoingModelRef(null, 'session-a', {
        id: 'bound-model',
        providerID: 'provider',
      }),
    ).toBe('provider/session-model');
  });

  it('falls back to session-bound model when no override exists', () => {
    setCachedDefaultModelRef('provider/global-model');

    expect(
      resolveOutgoingModelRef(null, 'session-a', {
        id: 'bound-model',
        providerID: 'provider',
      }),
    ).toBe('provider/bound-model');
  });

  it('falls back to global default when session has no model context', () => {
    setCachedDefaultModelRef('provider/global-model');

    expect(resolveOutgoingModelRef(null, 'session-a', null)).toBe('provider/global-model');
    expect(getCachedDefaultModelRef()).toBe('provider/global-model');
  });
});

describe('modelRefFromSessionModel', () => {
  it('builds provider/model refs from session model records', () => {
    expect(
      modelRefFromSessionModel({
        id: 'claude-sonnet-4',
        providerID: 'anthropic',
      }),
    ).toBe('anthropic/claude-sonnet-4');
  });

  it('returns null for incomplete session model records', () => {
    expect(modelRefFromSessionModel({ id: 'only-id' })).toBeNull();
    expect(getSessionModelRef('missing')).toBeNull();
  });
});
