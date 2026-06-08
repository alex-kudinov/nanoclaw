/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config.js', () => ({ DATA_DIR: '/tmp/nc-test/data' }));
vi.mock('./env.js', () => ({
  readEnvFile: vi.fn(() => ({
    STRIPE_RESTRICTED_KEY: 'rk_test',
    SHEETS_ROSTER_ID: 'sheet123',
    SHEETS_PAYMENTS_ID: 'paylog456',
  })),
}));
const { logInfo, logDebug } = vi.hoisted(() => ({
  logInfo: vi.fn(),
  logDebug: vi.fn(),
}));
vi.mock('./logger.js', () => ({
  logger: { info: logInfo, warn: vi.fn(), error: vi.fn(), debug: logDebug },
}));

let execFileImpl: any;
vi.mock('child_process', () => ({
  execFile: vi.fn((...args: any[]) => execFileImpl(...args)),
}));

import { runNameReaper } from './contador-name-reaper.js';

beforeEach(() => {
  logInfo.mockClear();
  logDebug.mockClear();
  execFileImpl = (_f: string, _a: string[], _o: any, cb: any) =>
    cb(null, {
      stdout: '[BACKFILL-NAMES] done — fixed 0, unresolvable 0\n',
      stderr: '',
    });
});

describe('runNameReaper', () => {
  it('invokes backfill-names.cjs in --apply mode', async () => {
    const { execFile } = await import('child_process');
    await runNameReaper();
    const call = vi.mocked(execFile).mock.calls.at(-1)!;
    expect(call[0]).toBe(process.execPath);
    expect((call[1] as string[])[0]).toMatch(/backfill-names\.cjs$/);
    expect((call[1] as string[])[1]).toBe('--apply');
  });

  it('passes Sheets/psql env to the child', async () => {
    const { execFile } = await import('child_process');
    await runNameReaper();
    const opts = vi.mocked(execFile).mock.calls.at(-1)![2] as any;
    expect(opts.env.SHEETS_SA_JSON).toMatch(/sheets-service-account\.json$/);
    expect(opts.env.PGDATABASE).toBe('nanoclaw_business');
    expect(opts.env.PATH).toContain('postgresql@16/bin');
    expect(opts.env.STRIPE_RESTRICTED_KEY).toBe('rk_test');
    expect(opts.env.SHEETS_PAYMENTS_ID).toBe('paylog456');
  });

  it('logs at info only when names were repaired', async () => {
    execFileImpl = (_f: string, _a: string[], _o: any, cb: any) =>
      cb(null, {
        stdout: '[BACKFILL-NAMES] done — fixed 3, unresolvable 2\n',
        stderr: '',
      });
    await runNameReaper();
    expect(logInfo).toHaveBeenCalledOnce();
    expect(logDebug).not.toHaveBeenCalled();
  });

  it('logs at debug when there was nothing to repair', async () => {
    await runNameReaper();
    expect(logDebug).toHaveBeenCalledOnce();
    expect(logInfo).not.toHaveBeenCalled();
  });

  it('propagates a script failure', async () => {
    execFileImpl = (_f: string, _a: string[], _o: any, cb: any) =>
      cb(new Error('[BACKFILL-NAMES] FATAL: psql down'), {
        stdout: '',
        stderr: '',
      });
    await expect(runNameReaper()).rejects.toThrow(/BACKFILL-NAMES/);
  });
});
