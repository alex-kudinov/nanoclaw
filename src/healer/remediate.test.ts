import { describe, it, expect, vi, beforeEach } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const rem = vi.hoisted(() => ({
  isActionable: vi.fn(),
  loadOpen: vi.fn(),
  proposeFix: vi.fn(),
  recordAction: vi.fn(),
  runShell: vi.fn(),
  setStatus: vi.fn(),
}));
vi.mock('../business-db.js', () => ({ query }));
vi.mock('./remediation.js', () => rem);
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { allowlist, runRemediate } from './remediate.js';

function transientInc(over = {}) {
  return {
    id: 1,
    source: 'sweeper:trafft',
    severity: 'error',
    occurrences: 2,
    status: 'diagnosed',
    raw_context: {},
    remediation_class: 'transient',
    diagnosis: 'blip',
    proposed_fix: { kind: 'rerun', summary: 's', command: 'echo p' },
    confidence: 'high',
    cause_or_symptom: 'root_cause',
    evidence: ['sweeper retry is idempotent'],
    review: { refuted: false, reason: 'evidence confirmed' },
    last_seen: new Date().toISOString(),
    ...over,
  };
}

/** Route the shared query mock by SQL shape. */
function queryByShape(
  attempts: number,
  actedAt: string | null,
  claim = true,
  actionKind: string | null = null,
) {
  query.mockImplementation((sql: string) => {
    if (sql.includes('restart_attempts FROM'))
      return { rows: [{ restart_attempts: attempts }] };
    if (sql.includes("applied_action->>'at'"))
      return { rows: [{ acted_at: actedAt, action_kind: actionKind }] };
    if (sql.includes("SET status = 'triaging'"))
      return { rows: claim ? [{ id: 1 }] : [] };
    return { rows: [] };
  });
}

beforeEach(() => {
  query.mockReset();
  rem.loadOpen.mockReset().mockResolvedValue([]);
  rem.isActionable.mockReset().mockReturnValue(true);
  rem.proposeFix.mockReset().mockResolvedValue(true);
  rem.recordAction.mockReset();
  rem.runShell.mockReset().mockResolvedValue({ ok: true, out: 'ok' });
  rem.setStatus.mockReset();
  delete process.env.HEALER_AUTO_REMEDIATE;
  delete process.env.HEALER_RERUN_ALLOWLIST;
  delete process.env.HEALER_QUIET;
  process.env.HEALER_ACTIONS_ENABLED = '1';
  process.env.HEALER_ACTION_EPOCH = 'test-epoch';
  process.env.HEALER_OPERATOR_UIDS = 'U_ALEX';
});

describe('allowlist', () => {
  it('parses JSON env', () => {
    process.env.HEALER_RERUN_ALLOWLIST = '{"a":"cmd"}';
    expect(allowlist()).toEqual({ a: 'cmd' });
  });
  it('defaults empty on bad JSON', () => {
    process.env.HEALER_RERUN_ALLOWLIST = 'not json';
    expect(allowlist()).toEqual({});
  });
});

describe('remediateTransient gating', () => {
  it('proposes (no auto-run) when auto-remediate is OFF', async () => {
    rem.loadOpen.mockImplementation((s: string) =>
      s === 'diagnosed' ? [transientInc()] : [],
    );
    queryByShape(0, null);
    await runRemediate();
    expect(rem.runShell).not.toHaveBeenCalled();
    expect(rem.proposeFix).toHaveBeenCalledTimes(1);
  });

  it('auto-runs an allowlisted source when armed and under the breaker', async () => {
    process.env.HEALER_AUTO_REMEDIATE = '1';
    process.env.HEALER_RERUN_ALLOWLIST =
      '{"sweeper:trafft":"echo token=secret-command-token"}';
    rem.runShell.mockResolvedValue({
      ok: true,
      out: 'Bearer secret-output-token',
    });
    rem.loadOpen.mockImplementation((s: string) =>
      s === 'diagnosed' ? [transientInc()] : [],
    );
    queryByShape(0, null);
    await runRemediate();
    expect(rem.runShell).toHaveBeenCalledWith(
      'echo token=secret-command-token',
    );
    expect(rem.recordAction).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        command: 'echo token=<redacted>',
        out: 'Bearer <redacted>',
      }),
    );
    expect(rem.setStatus).toHaveBeenCalledWith(1, 'remediating');
  });

  it('does not auto-run when the global action gate is off', async () => {
    delete process.env.HEALER_ACTIONS_ENABLED;
    process.env.HEALER_AUTO_REMEDIATE = '1';
    process.env.HEALER_RERUN_ALLOWLIST = '{"sweeper:trafft":"echo rerun"}';
    rem.loadOpen.mockImplementation((s: string) =>
      s === 'diagnosed' ? [transientInc()] : [],
    );
    queryByShape(0, null);
    await runRemediate();
    expect(rem.runShell).not.toHaveBeenCalled();
  });

  it('does not rerun when another poller already claimed the incident', async () => {
    process.env.HEALER_AUTO_REMEDIATE = '1';
    process.env.HEALER_RERUN_ALLOWLIST = '{"sweeper:trafft":"echo rerun"}';
    rem.loadOpen.mockImplementation((s: string) =>
      s === 'diagnosed' ? [transientInc()] : [],
    );
    queryByShape(0, null, false);
    const { acted } = await runRemediate();
    expect(acted).toBe(0);
    expect(rem.runShell).not.toHaveBeenCalled();
  });

  it('never auto-runs a diagnosis that failed the final trust gate', async () => {
    process.env.HEALER_AUTO_REMEDIATE = '1';
    process.env.HEALER_RERUN_ALLOWLIST = '{"sweeper:trafft":"echo rerun"}';
    rem.isActionable.mockReturnValue(false);
    rem.loadOpen.mockImplementation((s: string) =>
      s === 'diagnosed' ? [transientInc()] : [],
    );
    queryByShape(0, null);
    await runRemediate();
    expect(rem.runShell).not.toHaveBeenCalled();
    expect(rem.proposeFix).toHaveBeenCalled();
  });

  it('proposes instead of auto-running a non-allowlisted source even when armed', async () => {
    process.env.HEALER_AUTO_REMEDIATE = '1';
    rem.loadOpen.mockImplementation((s: string) =>
      s === 'diagnosed' ? [transientInc()] : [],
    );
    queryByShape(0, null);
    await runRemediate();
    expect(rem.runShell).not.toHaveBeenCalled();
    expect(rem.proposeFix).toHaveBeenCalledTimes(1);
  });
});

describe('verifyRemediating', () => {
  it('resolves an incident that stayed quiet past the verify window', async () => {
    const actedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    rem.loadOpen.mockImplementation((s: string) =>
      s === 'remediating'
        ? [
            transientInc({
              status: 'remediating',
              last_seen: new Date(Date.now() - 20 * 60_000).toISOString(),
            }),
          ]
        : [],
    );
    queryByShape(1, actedAt);
    const { closed } = await runRemediate();
    expect(closed).toBe(1);
    expect(rem.setStatus).toHaveBeenCalledWith(1, 'resolved', 'verified_fixed');
  });

  it('escalates to recurring + proposes once the breaker cap is hit', async () => {
    const actedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    rem.loadOpen.mockImplementation((s: string) =>
      s === 'remediating'
        ? [
            transientInc({
              status: 'remediating',
              last_seen: new Date().toISOString(),
            }),
          ]
        : [],
    );
    queryByShape(2, actedAt);
    await runRemediate();
    expect(rem.setStatus).toHaveBeenCalledWith(1, 'recurring', 'still_failing');
    expect(rem.proposeFix).toHaveBeenCalled();
  });

  it('reopens for one more auto-rerun when recurred but under the cap', async () => {
    const actedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    rem.loadOpen.mockImplementation((s: string) =>
      s === 'remediating'
        ? [
            transientInc({
              status: 'remediating',
              last_seen: new Date().toISOString(),
            }),
          ]
        : [],
    );
    queryByShape(0, actedAt);
    await runRemediate();
    expect(rem.setStatus).toHaveBeenCalledWith(1, 'diagnosed');
  });

  it('leaves detached implementation runs for their completion poller', async () => {
    const actedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    rem.loadOpen.mockImplementation((s: string) =>
      s === 'remediating'
        ? [
            transientInc({
              status: 'remediating',
              last_seen: new Date(Date.now() - 20 * 60_000).toISOString(),
            }),
          ]
        : [],
    );
    queryByShape(0, actedAt, true, 'implement_dispatched');
    const { closed } = await runRemediate();
    expect(closed).toBe(0);
    expect(rem.setStatus).not.toHaveBeenCalled();
  });
});
