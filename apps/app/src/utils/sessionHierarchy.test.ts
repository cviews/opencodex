import { describe, expect, it } from 'vitest';
import { filterSessionsForProjectPath } from './sessionHierarchy';

describe('filterSessionsForProjectPath', () => {
  it('keeps sessions under the same directory path', () => {
    const sessions = [
      { id: 'a', directory: '/Users/dev/project-a' },
      { id: 'b', directory: '/Users/dev/project-b' },
    ];
    expect(filterSessionsForProjectPath(sessions, '/Users/dev/project-a')).toEqual([sessions[0]]);
  });

  it('matches by projectID when directory differs in casing', () => {
    const sessions = [{ id: 'a', directory: '/Users/dev/Proj', projectID: 'proj-1' }];
    expect(filterSessionsForProjectPath(sessions, '/users/dev/proj', 'proj-1')).toEqual(sessions);
  });
});
