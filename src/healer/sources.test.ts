import { describe, it, expect } from 'vitest';

import {
  parseJsonlErrors,
  jobRowToSeed,
  watermarkRowToSeed,
  isStale,
} from './sources.js';

describe('parseJsonlErrors', () => {
  it('keeps level>=50, maps group->source, skips info and garbled lines', () => {
    const buf = [
      JSON.stringify({ level: 30, msg: 'info line' }),
      JSON.stringify({
        level: 50,
        msg: 'boom',
        group: 'sales',
        err: { type: 'Error', message: 'kaboom' },
      }),
      'not json at all',
      JSON.stringify({ level: 60, msg: 'fatal', err: { type: 'X' } }),
    ].join('\n');
    const seeds = parseJsonlErrors(buf);
    expect(seeds).toHaveLength(2);
    expect(seeds[0].source).toBe('minion:sales');
    expect(seeds[0].severity).toBe('error');
    expect(seeds[1].source).toBe('daemon');
    expect(seeds[1].severity).toBe('critical');
  });

  it('fingerprints two volatile-but-identical errors the same', () => {
    const line = (n: number) =>
      JSON.stringify({
        level: 50,
        group: 'x',
        msg: `failed ${n}`,
        err: { type: 'E', message: `failed ${n}` },
      });
    const seeds = parseJsonlErrors([line(1), line(2)].join('\n'));
    expect(seeds[0].fingerprint).toBe(seeds[1].fingerprint);
  });
});

describe('jobRowToSeed', () => {
  it('builds a job:<name> seed carrying exit code + error', () => {
    const s = jobRowToSeed({
      job_name: 'digest',
      status: 'fail',
      exit_code: 1,
      error: 'oops',
      started_at: '2026-06-14T00:00:00Z',
    });
    expect(s.source).toBe('job:digest');
    expect(s.severity).toBe('error');
    expect(s.raw_context.exit_code).toBe(1);
  });
});

describe('watermarkRowToSeed', () => {
  it('maps frozen->warn and error->error under sweeper:<source>', () => {
    expect(
      watermarkRowToSeed({
        source: 'trafft',
        last_run_status: 'frozen',
        last_run_error: null,
      }).severity,
    ).toBe('warn');
    const errSeed = watermarkRowToSeed({
      source: 'trafft',
      last_run_status: 'error',
      last_run_error: 'x',
    });
    expect(errSeed.severity).toBe('error');
    expect(errSeed.source).toBe('sweeper:trafft');
  });
});

describe('isStale', () => {
  it('treats a missing beat as stale', () => {
    expect(isStale(null, Date.now(), 1000)).toBe(true);
  });
  it('treats a recent beat as fresh', () => {
    expect(isStale(new Date(Date.now() - 500), Date.now(), 1000)).toBe(false);
  });
  it('treats an old beat as stale', () => {
    expect(isStale(new Date(Date.now() - 2000), Date.now(), 1000)).toBe(true);
  });
});
