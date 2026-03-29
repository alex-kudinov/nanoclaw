import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  _initTestDatabase,
  getJob,
  getJobNames,
  updateJobRunState,
} from './db.js';
import { computeNextRunFrom, loadJobRegistry } from './job-registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeTmpRegistry(data: object): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-reg-'));
  const file = path.join(dir, 'jobs.json');
  fs.writeFileSync(file, JSON.stringify(data));
  return file;
}

function makeValidRegistry(
  overrides: Partial<{
    projects: Record<string, string>;
    jobs: object[];
  }> = {},
) {
  return {
    projects: {
      tandemweb: '/projects/tandemweb',
      ...overrides.projects,
    },
    jobs: overrides.jobs ?? [
      {
        name: 'daily-sync',
        description: 'Sync daily',
        project: 'tandemweb',
        script: 'tools/sync.sh',
        args: [],
        cron: '0 9 * * *',
        timezone: 'America/Chicago',
        retries: 0,
        retry_delay_ms: 60000,
        alert_level: 'alert',
        timeout_ms: 300000,
        enabled: true,
      },
    ],
  };
}

let tmpFiles: string[] = [];

beforeEach(() => {
  _initTestDatabase();
  tmpFiles = [];
});

afterEach(() => {
  for (const f of tmpFiles) {
    try {
      fs.unlinkSync(f);
      fs.rmdirSync(path.dirname(f));
    } catch {
      /* ignore */
    }
  }
});

// ---------------------------------------------------------------------------
// loadJobRegistry
// ---------------------------------------------------------------------------

describe('loadJobRegistry - valid registry', () => {
  it('creates jobs in the DB', () => {
    const file = writeTmpRegistry(makeValidRegistry());
    tmpFiles.push(file);

    loadJobRegistry(file);

    const job = getJob('daily-sync');
    expect(job).toBeDefined();
    expect(job!.name).toBe('daily-sync');
    expect(job!.description).toBe('Sync daily');
    expect(job!.project).toBe('tandemweb');
    expect(job!.script).toBe('tools/sync.sh');
    expect(job!.enabled).toBe(true);
  });

  it('sets project_root from projects map', () => {
    const file = writeTmpRegistry(makeValidRegistry());
    tmpFiles.push(file);

    loadJobRegistry(file);

    const job = getJob('daily-sync');
    expect(job!.project_root).toBe('/projects/tandemweb');
  });

  it('sets next_run for new jobs', () => {
    const file = writeTmpRegistry(makeValidRegistry());
    tmpFiles.push(file);

    loadJobRegistry(file);

    const job = getJob('daily-sync');
    expect(job!.next_run).not.toBeNull();
    // Should be a valid ISO timestamp
    expect(new Date(job!.next_run!).getTime()).toBeGreaterThan(Date.now());
  });

  it('loads multiple jobs', () => {
    const file = writeTmpRegistry(
      makeValidRegistry({
        jobs: [
          {
            name: 'job-alpha',
            description: 'Alpha job',
            project: 'tandemweb',
            script: 'tools/alpha.sh',
            args: [],
            cron: '0 8 * * *',
            timezone: 'UTC',
            enabled: true,
          },
          {
            name: 'job-beta',
            description: 'Beta job',
            project: 'tandemweb',
            script: 'tools/beta.sh',
            args: [],
            cron: '0 10 * * *',
            timezone: 'UTC',
            enabled: true,
          },
        ],
      }),
    );
    tmpFiles.push(file);

    loadJobRegistry(file);

    expect(getJob('job-alpha')).toBeDefined();
    expect(getJob('job-beta')).toBeDefined();
  });
});

describe('loadJobRegistry - invalid / edge-case input', () => {
  it('does not crash on invalid JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-reg-'));
    const file = path.join(dir, 'jobs.json');
    fs.writeFileSync(file, '{ this is not valid JSON }');
    tmpFiles.push(file);

    expect(() => loadJobRegistry(file)).not.toThrow();
  });

  it('does not crash when file does not exist', () => {
    expect(() =>
      loadJobRegistry('/tmp/definitely-does-not-exist.json'),
    ).not.toThrow();
  });

  it('skips jobs with unknown project', () => {
    const file = writeTmpRegistry({
      projects: { tandemweb: '/projects/tandemweb' },
      jobs: [
        {
          name: 'orphan-job',
          description: '',
          project: 'nonexistent-project',
          script: 'tools/x.sh',
          args: [],
          cron: '0 * * * *',
          timezone: 'UTC',
          enabled: true,
        },
      ],
    });
    tmpFiles.push(file);

    loadJobRegistry(file);

    expect(getJob('orphan-job')).toBeUndefined();
  });

  it('skips jobs with invalid cron expression', () => {
    const file = writeTmpRegistry({
      projects: { tandemweb: '/projects/tandemweb' },
      jobs: [
        {
          name: 'bad-cron-job',
          description: '',
          project: 'tandemweb',
          script: 'tools/x.sh',
          args: [],
          cron: 'not-a-cron',
          timezone: 'UTC',
          enabled: true,
        },
      ],
    });
    tmpFiles.push(file);

    loadJobRegistry(file);

    expect(getJob('bad-cron-job')).toBeUndefined();
  });
});

describe('loadJobRegistry - runtime state preservation', () => {
  it('preserves last_run and last_result on re-load', () => {
    const registry = makeValidRegistry();
    const file = writeTmpRegistry(registry);
    tmpFiles.push(file);

    // First load
    loadJobRegistry(file);

    // Simulate a completed run by directly updating runtime state via db
    updateJobRunState('daily-sync', {
      last_run: '2024-09-01T09:00:00.000Z',
      last_result: 'ok',
      last_duration_ms: 1200,
      last_output: 'done',
      next_run: '2024-09-02T09:00:00.000Z',
    });

    // Re-load registry
    loadJobRegistry(file);

    const job = getJob('daily-sync');
    expect(job!.last_run).toBe('2024-09-01T09:00:00.000Z');
    expect(job!.last_result).toBe('ok');
    expect(job!.last_duration_ms).toBe(1200);
  });
});

describe('loadJobRegistry - disable removed jobs', () => {
  it('disables a job that was removed from the registry', () => {
    // Load registry with two jobs
    const file = writeTmpRegistry(
      makeValidRegistry({
        jobs: [
          {
            name: 'keep-job',
            description: '',
            project: 'tandemweb',
            script: 'tools/keep.sh',
            args: [],
            cron: '0 9 * * *',
            timezone: 'UTC',
            enabled: true,
          },
          {
            name: 'remove-job',
            description: '',
            project: 'tandemweb',
            script: 'tools/remove.sh',
            args: [],
            cron: '0 9 * * *',
            timezone: 'UTC',
            enabled: true,
          },
        ],
      }),
    );
    tmpFiles.push(file);

    loadJobRegistry(file);
    expect(getJob('keep-job')!.enabled).toBe(true);
    expect(getJob('remove-job')!.enabled).toBe(true);

    // Overwrite registry with only one job
    fs.writeFileSync(
      file,
      JSON.stringify(
        makeValidRegistry({
          jobs: [
            {
              name: 'keep-job',
              description: '',
              project: 'tandemweb',
              script: 'tools/keep.sh',
              args: [],
              cron: '0 9 * * *',
              timezone: 'UTC',
              enabled: true,
            },
          ],
        }),
      ),
    );

    loadJobRegistry(file);

    expect(getJob('keep-job')!.enabled).toBe(true);
    expect(getJob('remove-job')!.enabled).toBe(false);
  });
});

describe('loadJobRegistry - cron change triggers next_run recompute', () => {
  it('recomputes next_run when cron expression changes', () => {
    const file = writeTmpRegistry(makeValidRegistry());
    tmpFiles.push(file);

    loadJobRegistry(file);
    const before = getJob('daily-sync')!.next_run;
    expect(before).not.toBeNull();

    // Update registry with a different cron
    fs.writeFileSync(
      file,
      JSON.stringify(
        makeValidRegistry({
          jobs: [
            {
              name: 'daily-sync',
              description: 'Sync daily',
              project: 'tandemweb',
              script: 'tools/sync.sh',
              args: [],
              cron: '0 18 * * *', // changed from 0 9 to 0 18
              timezone: 'America/Chicago',
              enabled: true,
            },
          ],
        }),
      ),
    );

    loadJobRegistry(file);

    const after = getJob('daily-sync')!.next_run;
    expect(after).not.toBeNull();
    // next_run must have been recomputed — new cron fires at 18:00, old at 09:00
    // They should produce different next_run values
    expect(after).not.toBe(before);
  });
});

// ---------------------------------------------------------------------------
// computeNextRunFrom
// ---------------------------------------------------------------------------

describe('computeNextRunFrom', () => {
  it('returns a valid ISO timestamp in the future', () => {
    const next = computeNextRunFrom('0 9 * * *', 'America/Chicago');
    expect(next).not.toBeNull();
    expect(typeof next).toBe('string');
    expect(new Date(next!).getTime()).toBeGreaterThan(Date.now());
  });

  it('accepts a custom fromDate', () => {
    const from = new Date('2024-01-01T00:00:00.000Z');
    const next = computeNextRunFrom('0 9 * * 1', 'UTC', from);
    expect(next).not.toBeNull();
    // Result must be after the fromDate
    expect(new Date(next!).getTime()).toBeGreaterThan(from.getTime());
  });

  it('returns null for invalid cron', () => {
    const next = computeNextRunFrom('not-a-cron', 'UTC');
    expect(next).toBeNull();
  });
});
