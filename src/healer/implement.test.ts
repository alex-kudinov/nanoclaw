import { describe, it, expect, vi, beforeEach } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const slack = vi.hoisted(() => ({
  postIncidents: vi.fn(),
  getReactions: vi.fn(),
  getReplies: vi.fn(),
}));
const approval = vi.hoisted(() => ({
  emojiVerdict: vi.fn(),
  replyVerdict: vi.fn(),
}));
const rem = vi.hoisted(() => ({
  recordAction: vi.fn(),
  setStatus: vi.fn(),
  postIncidentThread: vi.fn(),
}));
const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
const fsm = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('../business-db.js', () => ({ query }));
vi.mock('./slack.js', () => slack);
vi.mock('./approval.js', () => approval);
vi.mock('./remediation.js', () => rem);
vi.mock('child_process', () => ({ spawn }));
vi.mock('fs', () => ({ default: fsm, ...fsm }));
vi.mock('os', () => ({
  default: { homedir: () => '/home' },
  homedir: () => '/home',
}));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  branchName,
  buildTask,
  extractPrUrl,
  runImplement,
} from './implement.js';

/** Default fs: the rotation files resolve to a valid token. */
function tokenFiles(p: string): string {
  if (p.includes('.claude-active-token')) return 'info\n';
  if (p.includes('.claude-tokens.json')) return '{"info":"sk-ant-oat01-test"}';
  return '';
}
import type { OpenIncident } from './remediation.js';

const codeBug: OpenIncident & {
  proposal_channel: string;
  proposal_ts: string;
} = {
  id: 42,
  source: 'sweeper:trafft',
  severity: 'error',
  occurrences: 7,
  status: 'diagnosed',
  raw_context: {},
  remediation_class: 'code_bug',
  diagnosis: '429 not backed off',
  proposed_fix: { kind: 'diff', summary: 'add retry-after', diff: '@@ ...' },
  confidence: 'high',
  cause_or_symptom: 'root_cause',
  evidence: ['trafft-sweeper.ts:120 — no Retry-After handling'],
  thread_ts: null,
  thread_channel: null,
  last_seen: '2026-06-23T00:00:00Z',
  proposal_channel: 'C1',
  proposal_ts: '1.1',
};

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [] });
  slack.postIncidents.mockReset().mockResolvedValue(true);
  slack.getReactions.mockReset().mockResolvedValue([]);
  slack.getReplies.mockReset().mockResolvedValue([]);
  approval.emojiVerdict.mockReset().mockReturnValue(null);
  approval.replyVerdict.mockReset().mockReturnValue(null);
  rem.recordAction.mockReset();
  rem.setStatus.mockReset();
  rem.postIncidentThread
    .mockReset()
    .mockResolvedValue({ channel: 'C1', ts: '1.2' });
  spawn.mockReset().mockReturnValue({ unref: vi.fn() });
  fsm.writeFileSync.mockReset();
  fsm.readFileSync.mockReset().mockImplementation(tokenFiles);
  process.env.HEALER_IMPLEMENT_ENABLED = '1';
  delete process.env.HEALER_QUIET;
});

describe('pure helpers', () => {
  it('branchName', () => {
    expect(branchName(42)).toBe('healer/fix-42');
  });
  it('buildTask forbids questions and pins the branch', () => {
    const t = buildTask(codeBug, 'healer/fix-42');
    expect(t).toContain('NON-INTERACTIVELY');
    expect(t).toContain('healer/fix-42');
    expect(t).toContain('DRAFT PR');
    expect(t).toMatch(/do NOT push to main/i);
  });
  it('extractPrUrl finds a PR link or returns null', () => {
    expect(
      extractPrUrl('see https://github.com/alex-kudinov/nanoclaw/pull/7 now'),
    ).toBe('https://github.com/alex-kudinov/nanoclaw/pull/7');
    expect(extractPrUrl('no link here')).toBeNull();
  });
});

describe('runImplement gating', () => {
  it('no-ops when HEALER_IMPLEMENT_ENABLED is unset', async () => {
    delete process.env.HEALER_IMPLEMENT_ENABLED;
    expect(await runImplement()).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('dispatch on operator 👍 (same approval signal as everything else)', () => {
  const armEligible = () =>
    query.mockImplementation((sql: string) =>
      sql.includes("'code_bug'") ? { rows: [codeBug] } : { rows: [] },
    );

  it('spawns the pipeline and flips to remediating on an approve verdict (👍/✅)', async () => {
    armEligible();
    approval.emojiVerdict.mockReturnValue('approve');
    expect(await runImplement()).toBe(1);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(rem.setStatus).toHaveBeenCalledWith(42, 'remediating');
  });

  it('ignores a code_bug with no approve verdict', async () => {
    armEligible(); // both verdicts default to null
    expect(await runImplement()).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('also triggers on an approve reply (apply/implement/yes)', async () => {
    armEligible();
    approval.replyVerdict.mockReturnValue('approve');
    expect(await runImplement()).toBe(1);
    expect(spawn).toHaveBeenCalled();
  });

  it('does NOT spawn (warns instead) when no active token is available', async () => {
    armEligible();
    approval.emojiVerdict.mockReturnValue('approve');
    fsm.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(await runImplement()).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
    expect(rem.postIncidentThread).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42 }),
      expect.stringContaining('no active Claude token'),
    );
  });
});

describe('pollResults', () => {
  const armFinished = (log: string) =>
    query.mockImplementation((sql: string) => {
      if (sql.includes('implement_dispatched'))
        return { rows: [{ id: 42, source: 'sweeper:trafft' }] };
      return { rows: [] };
    }) && fsm.readFileSync.mockReturnValue(log);

  it('reports a green draft PR and arms it for merge approval', async () => {
    armFinished(
      '...HEALER_IMPLEMENT_DONE:0\nhttps://github.com/alex-kudinov/nanoclaw/pull/9',
    );
    await runImplement();
    expect(rem.setStatus).toHaveBeenCalledWith(42, 'awaiting_approval');
    expect(rem.postIncidentThread).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42 }),
      expect.stringContaining('/pull/9'),
    );
  });

  it('flags a failed run as recurring', async () => {
    armFinished('boom\nHEALER_IMPLEMENT_DONE:1');
    await runImplement();
    expect(rem.setStatus).toHaveBeenCalledWith(
      42,
      'recurring',
      'still_failing',
    );
  });

  it('leaves a still-running pipeline untouched (no marker yet)', async () => {
    armFinished('dispatched, working...');
    await runImplement();
    expect(rem.setStatus).not.toHaveBeenCalled();
  });
});
