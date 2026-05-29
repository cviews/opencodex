import { describe, expect, it } from 'vitest';
import { formatDisplayPath, inferUserHomeFromPath, setCachedUserHome } from './displayPath';

describe('formatDisplayPath', () => {
  it('shortens paths under the user home directory', () => {
    expect(
      formatDisplayPath('/Users/alice/code/opencodex', '/Users/alice'),
    ).toBe('~/code/opencodex');
  });

  it('returns ~ for the home directory itself', () => {
    expect(formatDisplayPath('/Users/alice', '/Users/alice')).toBe('~');
  });

  it('leaves paths outside home unchanged', () => {
    expect(
      formatDisplayPath('/opt/projects/demo', '/Users/alice'),
    ).toBe('/opt/projects/demo');
  });

  it('preserves paths that already use tilde', () => {
    expect(formatDisplayPath('~/.config/opencode', '/Users/alice')).toBe('~/.config/opencode');
  });
});

describe('inferUserHomeFromPath', () => {
  it('detects macOS home from project path', () => {
    expect(inferUserHomeFromPath('/Users/alice/dev/app')).toBe('/Users/alice');
  });

  it('uses cached home when set', () => {
    setCachedUserHome('/Users/bob');
    expect(formatDisplayPath('/Users/bob/Documents')).toBe('~/Documents');
    setCachedUserHome(null);
  });
});
