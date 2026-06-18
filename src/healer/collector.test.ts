import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const store = vi.hoisted(() => ({
  getState: vi.fn(),
  setState: vi.fn(),
  upsertIncident: vi.fn(),
}));
const { postIncidents } = vi.hoisted(() => ({ postIncidents: vi.fn() }));
const { alert } = vi.hoisted(() => ({ alert: vi.fn() }));
const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }));
const { Database } = vi.hoisted(() => ({ Database: vi.fn() }));

vi.mock('../business-db.js', () => ({ query }));
vi.mock('./incident-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./incident-store.js')>();
  return { ...actual, ...store }; // keep real fingerprint/redact, stub IO
});
vi.mock('./slack.js', () => ({ postIncidents }));
vi.mock('./alert.js', () => ({ alert }));
vi.mock('child_process', () => ({ execFile }));
vi.mock('better-sqlite3', () => ({ default: Database }));
vi.mock('../config.js', () => ({ STORE_DIR: '/tmp/nc-store-test' }));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  collectJsonl,
  collectJobLogs,
  collectWatermarks,
  checkDaemon,
  reportFreshIncidents,
} from './collector.js';

const tmpJsonl = path.join(
  os.tmpdir(),
  `healer-collector-${process.pid}.jsonl`,
);

beforeEach(() => {
  query.mockReset();
  store.getState.mockReset();
  store.setState.mockReset();
  store.upsertIncident.mockReset().mockResolvedValue('inserted');
  postIncidents.mockReset().mockResolvedValue(true);
  alert.mockReset();
  execFile.mockReset().mockImplementation((_c, _a, _o, cb) => cb(null));
  Database.mockReset();
  process.env.HEALER_DAEMON_JSONL = tmpJsonl;
});
afterAll(() => {
  delete process.env.HEALER_DAEMON_JSONL;
  try {
    fs.rmSync(tmpJsonl);
  } catch {
    /* gone */
  }
});

describe('collectJsonl', () => {
  it('reads from the stored offset, upserts errors, and advances the offset', async () => {
    const line = JSON.stringify({
      level: 50,
      group: 'sales',
      msg: 'boom',
      err: { type: 'Error', message: 'kaboom' },
    });
    fs.writeFileSync(tmpJsonl, line + '\n');
    store.getState.mockResolvedValue(0);
    const n = await collectJsonl();
    expect(n).toBe(1);
    expect(store.upsertIncident).toHaveBeenCalledOnce();
    expect(store.setState).toHaveBeenCalledWith(
      'jsonl_offset',
      fs.statSync(tmpJsonl).size,
    );
  });

  it('resets the offset to 0 when the file was truncated', async () => {
    fs.writeFileSync(tmpJsonl, JSON.stringify({ level: 50, msg: 'x' }) + '\n');
    store.getState.mockResolvedValue(999_999); // offset > current size
    const n = await collectJsonl();
    expect(n).toBe(1); // re-read from start
  });
});

describe('collectJobLogs', () => {
  it('swallows a SQLite read failure and returns 0', async () => {
    Database.mockImplementation(function () {
      throw new Error('database is locked');
    });
    expect(await collectJobLogs()).toBe(0);
  });
});

describe('collectWatermarks', () => {
  it('upserts an incident per frozen/errored watermark', async () => {
    query.mockResolvedValue({
      rows: [
        { source: 'trafft', last_run_status: 'frozen', last_run_error: null },
      ],
    });
    expect(await collectWatermarks()).toBe(1);
    expect(store.upsertIncident).toHaveBeenCalledOnce();
  });
});

describe('reportFreshIncidents', () => {
  it('posts only error/critical incidents above the watermark and advances it', async () => {
    store.getState.mockResolvedValue(40);
    query.mockResolvedValue({
      rows: [
        {
          id: 41,
          source: 'minion:sales',
          severity: 'error',
          occurrences: 1,
          raw_context: { err_message: 'boom' },
        },
        {
          id: 42,
          source: 'sweeper:trafft',
          severity: 'warn',
          occurrences: 1,
          raw_context: {},
        },
        {
          id: 43,
          source: 'daemon',
          severity: 'critical',
          occurrences: 1,
          raw_context: {},
        },
      ],
    });
    const n = await reportFreshIncidents();
    expect(n).toBe(2); // error + critical, not the warn
    expect(postIncidents).toHaveBeenCalledOnce();
    expect(postIncidents.mock.calls[0][0]).toContain('minion:sales');
    expect(postIncidents.mock.calls[0][0]).not.toContain('sweeper:trafft');
    expect(store.setState).toHaveBeenCalledWith('last_fast_report_id', 43);
  });

  it('does nothing and keeps the watermark when there are no fresh incidents', async () => {
    store.getState.mockResolvedValue(99);
    query.mockResolvedValue({ rows: [] });
    expect(await reportFreshIncidents()).toBe(0);
    expect(postIncidents).not.toHaveBeenCalled();
    expect(store.setState).not.toHaveBeenCalled();
  });

  it('leaves the watermark unadvanced when the Slack post fails (retry next run)', async () => {
    store.getState.mockResolvedValue(0);
    query.mockResolvedValue({
      rows: [
        {
          id: 5,
          source: 'job:x',
          severity: 'error',
          occurrences: 1,
          raw_context: {},
        },
      ],
    });
    postIncidents.mockResolvedValue(false);
    expect(await reportFreshIncidents()).toBe(0);
    expect(store.setState).not.toHaveBeenCalled();
  });

  it('advances the watermark even when only warn/info are fresh (no post)', async () => {
    store.getState.mockResolvedValue(10);
    query.mockResolvedValue({
      rows: [
        {
          id: 11,
          source: 'sweeper:gf',
          severity: 'warn',
          occurrences: 1,
          raw_context: {},
        },
      ],
    });
    expect(await reportFreshIncidents()).toBe(0);
    expect(postIncidents).not.toHaveBeenCalled();
    expect(store.setState).toHaveBeenCalledWith('last_fast_report_id', 11);
  });
});

describe('checkDaemon', () => {
  it('on a stale heartbeat: records a critical incident, restarts (capped), alerts', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ last_beat: new Date(Date.now() - 5 * 60_000).toISOString() }],
      }) // SELECT last_beat (stale)
      .mockResolvedValueOnce({ rows: [{ restart_attempts: 0 }] }) // attempts
      .mockResolvedValueOnce({ rows: [] }); // UPDATE
    const down = await checkDaemon();
    expect(down).toBe(true);
    expect(store.upsertIncident).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'daemon', severity: 'critical' }),
    );
    expect(execFile).toHaveBeenCalledWith(
      'launchctl',
      expect.arrayContaining(['kickstart', '-k']),
      expect.anything(),
      expect.any(Function),
    );
    expect(postIncidents).toHaveBeenCalled();
  });

  it('does not restart past the cap (alert-only)', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ last_beat: new Date(Date.now() - 5 * 60_000).toISOString() }],
      })
      .mockResolvedValueOnce({ rows: [{ restart_attempts: 2 }] }); // at cap
    await checkDaemon();
    expect(execFile).not.toHaveBeenCalled();
    expect(postIncidents).toHaveBeenCalled();
  });

  it('returns false and resolves any open daemon incident when fresh', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ last_beat: new Date().toISOString() }],
      }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // resolve UPDATE
    expect(await checkDaemon()).toBe(false);
    expect(execFile).not.toHaveBeenCalled();
    expect(query.mock.calls[1][0]).toMatch(/SET status = 'resolved'/);
  });
});
