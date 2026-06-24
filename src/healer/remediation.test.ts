import { describe, it, expect, vi, beforeEach } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const { postIncidentsRef } = vi.hoisted(() => ({ postIncidentsRef: vi.fn() }));
const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock('../business-db.js', () => ({ query }));
vi.mock('./slack.js', () => ({ postIncidentsRef }));
vi.mock('child_process', () => ({ execFile }));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  proposeFix,
  saveDiagnosis,
  setStatus,
  runShell,
  type OpenIncident,
} from './remediation.js';

function inc(over: Partial<OpenIncident> = {}): OpenIncident {
  return {
    id: 7,
    source: 'sweeper:trafft',
    severity: 'error',
    occurrences: 3,
    status: 'diagnosed',
    raw_context: {},
    remediation_class: 'config',
    diagnosis: 'token expired',
    proposed_fix: { kind: 'command', summary: 'rerun', command: 'echo hi' },
    confidence: 'high',
    cause_or_symptom: 'root_cause',
    evidence: ['trafft-sweeper.ts:88 — 401 on token refresh'],
    last_seen: '2026-06-23T00:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [] });
  postIncidentsRef.mockReset().mockResolvedValue({ channel: 'C1', ts: '99.1' });
  execFile.mockReset();
});

describe('proposeFix', () => {
  it('arms approval (awaiting_approval) for an actionable command fix', async () => {
    expect(await proposeFix(inc())).toBe(true);
    const sql = query.mock.calls[0];
    expect(sql[1]).toEqual([7, 'C1', '99.1', 'awaiting_approval']);
  });

  it('posts a manual diff suggestion but stays diagnosed (no false ✅ path)', async () => {
    await proposeFix(
      inc({
        proposed_fix: {
          kind: 'diff',
          summary: 'edit file',
          diff: '@@ -1 +1 @@',
        },
      }),
    );
    expect(query.mock.calls[0][1][3]).toBe('diagnosed');
  });

  it('keeps a code_bug manual (diagnosed) even if the model returned a command', async () => {
    await proposeFix(
      inc({
        remediation_class: 'code_bug',
        proposed_fix: {
          kind: 'command',
          summary: 'revert',
          command: 'git revert x && git push',
        },
      }),
    );
    expect(query.mock.calls[0][1][3]).toBe('diagnosed'); // never awaiting_approval → never ✅-shelled
  });

  it('returns false and writes nothing when the Slack post fails', async () => {
    postIncidentsRef.mockResolvedValue(null);
    expect(await proposeFix(inc())).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('gate: a low-confidence command fix is NOT actionable → needs_human', async () => {
    await proposeFix(inc({ confidence: 'low' }));
    expect(query.mock.calls[0][1][3]).toBe('needs_human');
  });

  it('gate: a symptom-level command fix is NOT actionable → needs_human', async () => {
    await proposeFix(inc({ cause_or_symptom: 'symptom' }));
    expect(query.mock.calls[0][1][3]).toBe('needs_human');
  });

  it('a trustworthy code_bug stays diagnosed (👍-implement path stays open)', async () => {
    await proposeFix(inc({ remediation_class: 'code_bug' }));
    expect(query.mock.calls[0][1][3]).toBe('diagnosed');
  });

  it('untrustworthy proposals render as "needs a human look" with no apply CTA', async () => {
    await proposeFix(inc({ confidence: 'low' }));
    const text = postIncidentsRef.mock.calls[0][0] as string;
    expect(text).toContain('Needs a human look');
    expect(text).not.toContain('to apply');
    expect(text).not.toContain('auto-implement');
  });
});

describe('saveDiagnosis / setStatus', () => {
  it('persists the verdict + trust fields and flips to diagnosed', async () => {
    await saveDiagnosis(7, {
      root_cause: 'cause',
      klass: 'transient',
      fix: { kind: 'rerun', summary: 's' },
      confidence: 'high',
      cause_or_symptom: 'root_cause',
      evidence: ['e1'],
    });
    expect(query.mock.calls[0][1]).toEqual([
      7,
      'cause',
      'transient',
      JSON.stringify({ kind: 'rerun', summary: 's' }),
      'high',
      'root_cause',
      JSON.stringify(['e1']),
      null,
      null,
    ]);
  });

  it('defaults omitted trust fields to low/unknown/[] (un-investigated = untrusted)', async () => {
    await saveDiagnosis(7, {
      root_cause: 'c',
      klass: 'data',
      fix: { kind: 'none', summary: 's' },
    });
    const params = query.mock.calls[0][1];
    expect(params[4]).toBe('low');
    expect(params[5]).toBe('unknown');
    expect(params[6]).toBe(JSON.stringify([]));
  });

  it('persists the refuter review + investigation_log when supplied', async () => {
    await saveDiagnosis(
      7,
      { root_cause: 'c', klass: 'config', fix: { kind: 'none', summary: 's' } },
      { review: { refuted: true, reason: 'symptom' }, investigation_log: '/l' },
    );
    const params = query.mock.calls[0][1];
    expect(params[7]).toBe(
      JSON.stringify({ refuted: true, reason: 'symptom' }),
    );
    expect(params[8]).toBe('/l');
  });

  it('setStatus passes outcome through', async () => {
    await setStatus(7, 'resolved', 'verified_fixed');
    expect(query.mock.calls[0][1]).toEqual([7, 'resolved', 'verified_fixed']);
  });
});

describe('runShell', () => {
  it('resolves ok=true with an output tail', async () => {
    execFile.mockImplementation((_c, _a, _o, cb) => cb(null, 'done', ''));
    expect(await runShell('echo')).toEqual({ ok: true, out: 'done' });
  });

  it('resolves ok=false on error, never throws', async () => {
    execFile.mockImplementation((_c, _a, _o, cb) =>
      cb(new Error('x'), '', 'stderr'),
    );
    expect(await runShell('bad')).toEqual({ ok: false, out: 'stderr' });
  });
});
