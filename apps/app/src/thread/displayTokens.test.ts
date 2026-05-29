import { describe, expect, it } from 'vitest';
import type { DisplayTokenCatalog } from './displayTokenCatalog';
import { parseDisplaySegments } from './displayTokens';

const catalog: DisplayTokenCatalog = {
  slashNames: new Set(['plan', 'compress']),
  agentNames: new Set(['explore']),
  teamKeys: new Set(['myteam']),
  teamNames: new Set(['my team']),
  modelIds: new Set(['anthropic/claude-sonnet-4']),
  modelNames: new Set(['claude sonnet']),
};

describe('parseDisplaySegments whitelist', () => {
  it('does not chip Chinese slash in prose', () => {
    const text = '每条为一次通话/重连的房间摘要；转写、录像、评价请调 第 3 节 房间详情接口。';
    const segments = parseDisplaySegments(text, catalog);
    expect(segments).toEqual([{ type: 'text', value: text }]);
  });

  it('does not chip unknown slash or bare mention', () => {
    const text = 'see /unknown and @param in docs';
    const segments = parseDisplaySegments(text, catalog);
    expect(segments).toEqual([{ type: 'text', value: text }]);
  });

  it('chips known slash at line start and after space', () => {
    expect(parseDisplaySegments('/plan task', catalog)).toEqual([
      { type: 'mention', kind: 'skill', value: 'plan' },
      { type: 'text', value: ' task' },
    ]);
    expect(parseDisplaySegments('run /compress now', catalog)).toEqual([
      { type: 'text', value: 'run ' },
      { type: 'mention', kind: 'skill', value: 'compress' },
      { type: 'text', value: ' now' },
    ]);
  });

  it('chips structured tokens only when catalog matches', () => {
    expect(parseDisplaySegments('@agent explore', catalog)).toEqual([
      { type: 'mention', kind: 'agent', value: 'explore' },
    ]);
    expect(parseDisplaySegments('@agent missing', catalog)).toEqual([
      { type: 'text', value: '@agent missing' },
    ]);
    expect(parseDisplaySegments('@team myteam', catalog)).toEqual([
      { type: 'mention', kind: 'team', value: 'myteam' },
    ]);
  });

  it('always allows explicit file references', () => {
    expect(parseDisplaySegments('@file src/foo.ts', catalog)).toEqual([
      { type: 'reference', kind: 'file', value: 'src/foo.ts' },
    ]);
  });
});
