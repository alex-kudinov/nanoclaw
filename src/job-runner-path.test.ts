import { describe, expect, it } from 'vitest';

import { resolveJobScriptPath } from './job-runner.js';

describe('job script release binding', () => {
  it('binds internal compiled jobs to the immutable code root', () => {
    expect(
      resolveJobScriptPath(
        {
          project: 'nanoclaw',
          project_root: '/operations/nanoclaw',
          script: 'dist/procurement-caleprocure-job.js',
        },
        '/releases/abc123',
      ),
    ).toBe('/releases/abc123/dist/procurement-caleprocure-job.js');
  });

  it('keeps non-internal jobs rooted in their registered project', () => {
    expect(
      resolveJobScriptPath(
        {
          project: 'other',
          project_root: '/projects/other',
          script: 'dist/task.js',
        },
        '/releases/abc123',
      ),
    ).toBe('/projects/other/dist/task.js');
  });

  it('rejects a compiled internal job that escapes the release root', () => {
    expect(() =>
      resolveJobScriptPath(
        {
          project: 'nanoclaw',
          project_root: '/operations/nanoclaw',
          script: 'dist/../../outside.js',
        },
        '/releases/abc123',
      ),
    ).toThrow('escapes the release root');
  });
});
