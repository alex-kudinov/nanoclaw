import { describe, it, expect } from 'vitest';

import {
  parseJsonlErrors,
  jobRowToSeed,
  watermarkRowToSeed,
  isStale,
  isRestartNoise,
} from './sources.js';

describe('isRestartNoise', () => {
  it('matches restart-interruption collateral', () => {
    expect(isRestartNoise('Interrupted by restart')).toBe(true);
    expect(isRestartNoise('Interrupted by daemon restart')).toBe(true);
    expect(isRestartNoise('job killed on restart')).toBe(true);
  });
  it('does not match real failures or empty input', () => {
    expect(isRestartNoise('Script not found: /x/npx')).toBe(false);
    expect(isRestartNoise('429 Too Many Requests')).toBe(false);
    expect(isRestartNoise(null)).toBe(false);
    expect(isRestartNoise('')).toBe(false);
  });
});

describe('parseJsonlErrors restart suppression', () => {
  it('skips restart-collateral error lines', () => {
    const buf = [
      JSON.stringify({
        level: 50,
        msg: 'Interrupted by daemon restart',
        group: 'main',
      }),
      JSON.stringify({ level: 50, msg: 'real crash', group: 'main' }),
    ].join('\n');
    const seeds = parseJsonlErrors(buf);
    expect(seeds).toHaveLength(1);
    expect(seeds[0].raw_context.msg).toBe('real crash');
  });
});

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
      output: null,
      started_at: '2026-06-14T00:00:00Z',
    });
    expect(s.source).toBe('job:digest');
    expect(s.severity).toBe('error');
    expect(s.raw_context.exit_code).toBe(1);
    expect(s.raw_context.error).toBe('oops');
  });

  it('falls back to output when error is NULL (plain non-zero exit)', () => {
    const s = jobRowToSeed({
      job_name: 'calendar-refresh',
      status: 'fail',
      exit_code: 1,
      error: null,
      output:
        'Batch purge failed (HTTP 401)\nFAIL 1 /tmp/tandem-err/tandem-IbswPK.json',
      started_at: '2026-06-18T00:00:00Z',
    });
    expect(s.raw_context.error).toContain('HTTP 401');
  });

  it('fingerprints on status+exit_code, not the volatile output blob', () => {
    const base = {
      job_name: 'calendar-refresh',
      status: 'fail',
      exit_code: 1,
      error: null,
      started_at: '2026-06-18T00:00:00Z',
    };
    // Same logical failure, different random temp filename in the output tail.
    const a = jobRowToSeed({
      ...base,
      output: '... /tmp/tandem-err/tandem-IbswPK.json',
    });
    const b = jobRowToSeed({
      ...base,
      output: '... /tmp/tandem-err/tandem-Zq9aBc.json',
    });
    expect(a.fingerprint).toBe(b.fingerprint);
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

  it('carries last_run_at as evidence and keeps fingerprint stable', () => {
    const base = {
      source: 'trafft',
      last_run_status: 'error',
      last_run_error: 'x',
    };
    const withRun = watermarkRowToSeed({
      ...base,
      last_run_at: '2026-06-26T10:59:00Z',
    });
    expect(withRun.raw_context.last_run_at).toBe('2026-06-26T10:59:00Z');
    // last_run_at must not shift the fingerprint (else a re-run forks a dup).
    expect(withRun.fingerprint).toBe(watermarkRowToSeed(base).fingerprint);
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
