import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const slack = vi.hoisted(() => ({
  getReactions: vi.fn(),
  getReplies: vi.fn(),
}));
const approval = vi.hoisted(() => ({
  emojiVerdict: vi.fn(),
  replyVerdict: vi.fn(),
}));
const rem = vi.hoisted(() => ({
  recordAction: vi.fn(),
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
import type { OpenIncident } from './remediation.js';

function tokenFiles(p: string): string {
  if (p.includes('.claude-active-token')) return 'info\n';
  if (p.includes('.claude-tokens.json')) return '{"info":"sk-ant-oat01-test"}';
  return '';
}

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
  proposed_fix: {
    kind: 'diff',
    summary: 'add retry-after',
    diff: '@@ ...',
    action_epoch: 'test-epoch',
    approval_nonce: 'nonce-42',
    approval_created_at: new Date().toISOString(),
  },
  confidence: 'high',
  cause_or_symptom: 'root_cause',
  evidence: ['trafft-sweeper.ts:120 — no Retry-After handling'],
  review: { refuted: false, reason: 'evidence confirmed' },
  thread_ts: null,
  thread_channel: null,
  last_seen: '2026-06-23T00:00:00Z',
  proposal_channel: 'C1',
  proposal_ts: '1.1',
};

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [] });
  slack.getReactions.mockReset().mockResolvedValue([]);
  slack.getReplies.mockReset().mockResolvedValue([]);
  approval.emojiVerdict.mockReset().mockReturnValue(null);
  approval.replyVerdict.mockReset().mockReturnValue(null);
  rem.recordAction.mockReset();
  rem.postIncidentThread
    .mockReset()
    .mockResolvedValue({ channel: 'C1', ts: '1.2' });
  spawn.mockReset().mockReturnValue({ unref: vi.fn() });
  fsm.writeFileSync.mockReset();
  fsm.readFileSync.mockReset().mockImplementation(tokenFiles);
  process.env.HEALER_IMPLEMENT_ENABLED = '1';
  process.env.HEALER_ACTIONS_ENABLED = '1';
  process.env.HEALER_ACTION_EPOCH = 'test-epoch';
  process.env.HEALER_OPERATOR_UIDS = 'U_ALEX';
  codeBug.proposed_fix = {
    kind: 'diff',
    summary: 'add retry-after',
    diff: '@@ ...',
    action_epoch: 'test-epoch',
    approval_nonce: 'nonce-42',
    approval_created_at: new Date().toISOString(),
  };
  codeBug.review = { refuted: false, reason: 'evidence confirmed' };
  delete process.env.HEALER_QUIET;
});

describe('pure helpers', () => {
  it('builds a bounded draft-PR task on the incident branch', () => {
    expect(branchName(42)).toBe('healer/fix-42');
    const task = buildTask(codeBug, 'healer/fix-42');
    expect(task).toContain('NON-INTERACTIVELY');
    expect(task).toContain('healer/fix-42');
    expect(task).toContain('DRAFT PR');
    expect(task).toMatch(/do NOT push to main/i);
  });

  it('extracts only a PR URL', () => {
    expect(
      extractPrUrl('see https://github.com/alex-kudinov/nanoclaw/pull/7 now'),
    ).toBe('https://github.com/alex-kudinov/nanoclaw/pull/7');
    expect(extractPrUrl('no link here')).toBeNull();
  });
});

describe('runImplement gating and claims', () => {
  function armEligible(options: { claim?: boolean } = {}): void {
    query.mockImplementation((sql: string) => {
      if (
        sql.includes("status = 'diagnosed' AND remediation_class = 'code_bug'")
      ) {
        return { rows: [codeBug] };
      }
      if (sql.includes("SET status = 'triaging'")) {
        return { rows: options.claim === false ? [] : [{ id: 42 }] };
      }
      return { rows: [] };
    });
  }

  it('no-ops unless both implementation and global action gates are armed', async () => {
    delete process.env.HEALER_IMPLEMENT_ENABLED;
    expect(await runImplement()).toBe(0);
    expect(query).not.toHaveBeenCalled();

    process.env.HEALER_IMPLEMENT_ENABLED = '1';
    delete process.env.HEALER_ACTIONS_ENABLED;
    expect(await runImplement()).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('ignores an expired or stale proposal binding', async () => {
    codeBug.proposed_fix = {
      ...codeBug.proposed_fix!,
      approval_created_at: '2020-01-01T00:00:00Z',
    };
    armEligible();
    approval.emojiVerdict.mockReturnValue({
      decision: 'approve',
      user: 'U_ALEX',
    });
    expect(await runImplement()).toBe(0);
    expect(slack.getReactions).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('atomically claims and dispatches on a named approve verdict', async () => {
    armEligible();
    approval.emojiVerdict.mockReturnValue({
      decision: 'approve',
      user: 'U_ALEX',
    });
    expect(await runImplement()).toBe(1);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(rem.recordAction).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        kind: 'implement_dispatched',
        approved_by: 'U_ALEX',
        approval_nonce: 'nonce-42',
      }),
    );
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("SET status = 'remediating'"),
      ),
    ).toBe(true);
  });

  it('does not dispatch when another poller already consumed the nonce', async () => {
    armEligible({ claim: false });
    approval.replyVerdict.mockReturnValue({
      decision: 'approve',
      user: 'U_ALEX',
    });
    expect(await runImplement()).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('re-checks trust after arming and refuses a newly refuted diagnosis', async () => {
    armEligible();
    approval.emojiVerdict.mockReturnValue({
      decision: 'approve',
      user: 'U_ALEX',
    });
    slack.getReactions.mockImplementation(async () => {
      codeBug.review = {
        refuted: true,
        reason: 'adversarial review found a symptom',
      };
      return [];
    });
    expect(await runImplement()).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("SET status = 'triaging'"),
      ),
    ).toBe(false);
  });

  it('leaves the proposal unclaimed when no active token is available', async () => {
    armEligible();
    approval.emojiVerdict.mockReturnValue({
      decision: 'approve',
      user: 'U_ALEX',
    });
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
  function armFinished(log: string): void {
    query.mockImplementation((sql: string) => {
      if (
        sql.trimStart().startsWith('SELECT id, source') &&
        sql.includes('implement_dispatched')
      ) {
        return { rows: [{ id: 42, source: 'sweeper:trafft' }] };
      }
      return { rows: [] };
    });
    fsm.readFileSync.mockReturnValue(log);
  }

  it('reports a green draft PR as needs_human, never as shell approval', async () => {
    armFinished(
      '...HEALER_IMPLEMENT_DONE:0\nhttps://github.com/alex-kudinov/nanoclaw/pull/9',
    );
    await runImplement();
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("SET status = 'needs_human'"),
      ),
    ).toBe(true);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("SET status = 'awaiting_approval'"),
      ),
    ).toBe(false);
    expect(rem.postIncidentThread).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42 }),
      expect.stringContaining('/pull/9'),
    );
  });

  it('flags a failed run as recurring and clears the old proposal binding', async () => {
    armFinished('boom\nHEALER_IMPLEMENT_DONE:1');
    await runImplement();
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("SET status = 'recurring'"),
      ),
    ).toBe(true);
  });

  it('leaves a still-running pipeline untouched', async () => {
    armFinished('dispatched, working...');
    await runImplement();
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('SET status =')),
    ).toBe(false);
  });
});
