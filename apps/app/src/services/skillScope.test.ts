import { describe, expect, it } from 'vitest';
import {
  buildSlashCatalog,
  buildSkillLocationMap,
  catalogDirectoryCandidates,
  classifyCommandEntryScope,
  classifySkillScope,
  isSkillBackedCommand,
  mapCatalogToSkillRecords,
  normalizeSkillPath,
} from './skillScope';

const ctx = {
  home: '/Users/dev',
  config: '/Users/dev/.config/opencode',
  worktree: '/Users/dev/code/zmn/zmn-tgsp-app/zmn-tgsp-ios',
  directory: '/Users/dev/code/zmn/zmn-tgsp-app/zmn-tgsp-ios',
};

describe('classifySkillScope', () => {
  it('marks project .opencode skills as project', () => {
    expect(
      classifySkillScope(
        '/Users/dev/code/zmn/zmn-tgsp-app/zmn-tgsp-ios/.opencode/skills/build-ios/SKILL.md',
        ctx,
      ),
    ).toBe('project');
  });

  it('marks ~/.opencode skills as global', () => {
    expect(
      classifySkillScope(
        '/Users/dev/.opencode/skills/zmn-design-system/SKILL.md',
        ctx,
      ),
    ).toBe('global');
  });

  it('marks built-in skills as global', () => {
    expect(classifySkillScope('<built-in>', ctx)).toBe('global');
  });

  it('marks monorepo parent .opencode skills as project when workspace is a child repo', () => {
    expect(
      classifySkillScope(
        '/Users/dev/code/zmn/zmn-tgsp-app/.opencode/skills/build-ios/SKILL.md',
        {
          ...ctx,
          worktree: '/Users/dev/code/zmn/zmn-tgsp-app/zmn-tgsp-ios',
          directory: '/Users/dev/code/zmn/zmn-tgsp-app/zmn-tgsp-ios',
        },
      ),
    ).toBe('project');
  });

  it('normalizes file:// skill locations', () => {
    expect(
      classifySkillScope(
        'file:///Users/dev/code/zmn/zmn-tgsp-app/zmn-tgsp-ios/.opencode/skills/build-ios/SKILL.md',
        ctx,
      ),
    ).toBe('project');
  });
});

describe('buildSlashCatalog', () => {
  const skills = [
    {
      name: 'build-ios',
      description: 'Build iOS skill',
      location: '/Users/dev/code/zmn/zmn-tgsp-app/.opencode/skills/build-ios/SKILL.md',
      content: 'skill body',
    },
    {
      name: 'zmn-design-system',
      description: 'Design system',
      location: '/Users/dev/.opencode/skills/zmn-design-system/SKILL.md',
    },
  ];

  it('lists skills and commands separately when both share a name', () => {
    const commands = [
      { name: 'build-ios', description: 'Build iOS command', source: 'command' as const },
      { name: 'init', description: 'Setup', source: 'command' as const },
    ];

    const items = buildSlashCatalog(commands, skills, {
      ...ctx,
      worktree: '/Users/dev/code/zmn/zmn-tgsp-app',
      directory: '/Users/dev/code/zmn/zmn-tgsp-app/zmn-tgsp-ios',
    }, new Set(['build-ios']));

    const buildIos = items.filter((item) => item.name === 'build-ios');
    expect(buildIos).toHaveLength(2);
    expect(buildIos.find((item) => item.entryId === 'skill:build-ios')).toMatchObject({
      source: 'skill',
      scope: 'project',
    });
    expect(buildIos.find((item) => item.entryId === 'command:build-ios')).toMatchObject({
      source: 'command',
      scope: 'project',
    });
  });

  it('does not duplicate pure global skills like zmn-app-result', () => {
    const skills = [
      {
        name: 'zmn-app-result',
        description: 'AppResult spec',
        location: '/Users/dev/.opencode/skills/zmn-app-result/SKILL.md',
        content: '# ZMN AppResult / HTTP 规范\n\nBody',
      },
    ];
    const commands = [
      {
        name: 'zmn-app-result',
        description: 'AppResult spec',
        source: 'skill' as const,
        template: '# ZMN AppResult / HTTP 规范\n\nBody',
      },
      {
        name: 'zmn-app-result',
        description: 'AppResult spec',
        template: '# ZMN AppResult / HTTP 规范\n\nBody',
      },
    ];

    const items = buildSlashCatalog(commands, skills, ctx);
    const matches = items.filter((item) => item.name === 'zmn-app-result');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ source: 'skill', entryId: 'skill:zmn-app-result' });
  });

  it('detects OpenCode skill mirrors even when source is missing', () => {
    const skill = {
      name: 'zmn-app-result',
      description: 'AppResult spec',
      location: '/Users/dev/.opencode/skills/zmn-app-result/SKILL.md',
      content: '# ZMN AppResult / HTTP 规范\n\nBody content here',
    };
    expect(
      isSkillBackedCommand(
        { name: 'zmn-app-result', template: skill.content },
        skill,
      ),
    ).toBe(true);
  });

  it('skips command.list skill registrations and keeps app.skills entries', () => {
    const commands = [
      { name: 'zmn-design-system', description: 'Dup', source: 'skill' as const },
    ];

    const items = buildSlashCatalog(commands, skills, ctx);
    const design = items.filter((item) => item.name === 'zmn-design-system');
    expect(design).toHaveLength(1);
    expect(design[0]).toMatchObject({ source: 'skill', scope: 'global' });
  });

  it('groups plugin commands under global when not in project commands dir', () => {
    const commands = [
      {
        name: 'handoff',
        description: '(builtin) Create a detailed context summary for continuing work in a new session',
        source: 'command' as const,
        template: 'handoff tpl',
      },
      {
        name: 'ralph-loop',
        description: '(builtin) Start self-referential development loop',
        source: 'command' as const,
      },
    ];

    const items = buildSlashCatalog(commands, skills, ctx, new Set(['build-ios']));
    expect(items.find((item) => item.entryId === 'command:handoff')).toMatchObject({
      source: 'command',
      scope: 'global',
    });
    expect(items.find((item) => item.entryId === 'command:ralph-loop')).toMatchObject({
      scope: 'global',
    });
  });

  it('maps catalog records with kind metadata', () => {
    const commands = [
      { name: 'build-ios', description: 'Build iOS command', source: 'command' as const, template: 'cmd tpl' },
    ];
    const items = buildSlashCatalog(commands, skills, ctx);
    const records = mapCatalogToSkillRecords(items, skills, commands);

    expect(records.find((r) => r.id === 'skill:build-ios')).toMatchObject({ kind: 'skill' });
    expect(records.find((r) => r.id === 'command:build-ios')).toMatchObject({
      kind: 'command',
      fullDescription: 'cmd tpl',
    });
  });
});

describe('classifyCommandEntryScope', () => {
  it('marks project command files as project scope', () => {
    expect(
      classifyCommandEntryScope('build-ios', 'command', new Map(), ctx, new Set(['build-ios'])),
    ).toBe('project');
  });

  it('uses paired skill location when skill exists', () => {
    const skillByName = new Map([
      ['build-ios', {
        name: 'build-ios',
        location: '/Users/dev/code/zmn/zmn-tgsp-app/.opencode/skills/build-ios/SKILL.md',
      }],
    ]);
    expect(
      classifyCommandEntryScope('build-ios', 'command', skillByName, ctx, new Set()),
    ).toBe('project');
  });

  it('defaults plugin commands to global when not in project commands dir', () => {
    expect(
      classifyCommandEntryScope('handoff', 'command', new Map(), ctx, new Set(['build-ios'])),
    ).toBe('global');
  });
});

describe('catalogDirectoryCandidates', () => {
  it('walks from child repo up to monorepo root', () => {
    expect(
      catalogDirectoryCandidates('/Users/dev/code/zmn/zmn-tgsp-app/zmn-tgsp-ios'),
    ).toEqual([
      '/Users/dev/code/zmn/zmn-tgsp-app/zmn-tgsp-ios',
      '/Users/dev/code/zmn/zmn-tgsp-app',
      '/Users/dev/code/zmn',
      '/Users/dev/code',
      '/Users/dev',
      '/Users',
    ]);
  });
});

describe('normalizeSkillPath', () => {
  it('strips trailing slashes', () => {
    expect(normalizeSkillPath('/tmp/foo/')).toBe('/tmp/foo');
  });
});

describe('buildSkillLocationMap', () => {
  it('indexes skill locations by name', () => {
    const map = buildSkillLocationMap([
      { name: 'build-ios', location: '/tmp/build-ios/SKILL.md' },
    ]);
    expect(map.get('build-ios')).toBe('/tmp/build-ios/SKILL.md');
  });
});
