import { describe, it, expect, vi, beforeEach } from 'vitest';

const inv = vi.hoisted(() => ({ investigate: vi.fn(), refute: vi.fn() }));
const diag = vi.hoisted(() => ({ triage: vi.fn(), route: vi.fn() }));
const rem = vi.hoisted(() => ({
  loadOpen: vi.fn(),
  saveDiagnosis: vi.fn(),
  setStatus: vi.fn(),
  postIncidentThread: vi.fn(),
}));

vi.mock('./investigate.js', () => inv);
vi.mock('./diagnose.js', () => diag);
vi.mock('./remediation.js', () => rem);
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { diagnoseIncident, runDiagnose, synthesize } from './orchestrator.js';
import type { DiagnosisResult } from './trust.js';

const base = {
  id: 1,
  source: 'daemon',
  severity: 'error',
  occurrences: 4,
  status: 'new',
  raw_context: {},
  remediation_class: null,
  diagnosis: null,
  proposed_fix: null,
  confidence: null,
  cause_or_symptom: null,
  evidence: null,
  thread_ts: null,
  thread_channel: null,
  last_seen: '2026-06-24T00:00:00Z',
};
const verdict: DiagnosisResult = {
  root_cause: 'rc',
  klass: 'config',
  fix: { kind: 'command', summary: 's' },
  confidence: 'high',
  cause_or_symptom: 'root_cause',
  evidence: ['e'],
};
const HOLDS = { refuted: false, reason: 'holds up' };

beforeEach(() => {
  inv.investigate.mockReset();
  inv.refute.mockReset().mockResolvedValue(HOLDS);
  diag.triage.mockReset();
  diag.route.mockReset();
  rem.loadOpen.mockReset().mockResolvedValue([base]);
  rem.saveDiagnosis.mockReset();
  rem.setStatus.mockReset();
  rem.postIncidentThread
    .mockReset()
    .mockResolvedValue({ channel: 'C1', ts: '1.0' });
  delete process.env.HEALER_QUIET;
  delete process.env.HEALER_DIAGNOSE_ENABLED;
});

describe('diagnoseIncident — escalation policy (design §4)', () => {
  it('error severity → investigate + ALWAYS refute, persists (with review) + routes', async () => {
    inv.investigate.mockResolvedValue(verdict);
    expect(await diagnoseIncident(base)).toBe(true);
    expect(inv.investigate).toHaveBeenCalledTimes(1);
    expect(inv.refute).toHaveBeenCalledWith(base, verdict);
    expect(rem.saveDiagnosis).toHaveBeenCalledWith(1, verdict, {
      review: HOLDS,
    });
    expect(diag.route).toHaveBeenCalledWith(base, verdict);
    expect(diag.triage).not.toHaveBeenCalled();
  });

  it('falls back to triage (no refuter) when investigate returns null', async () => {
    inv.investigate.mockResolvedValue(null);
    diag.triage.mockResolvedValue(verdict);
    expect(await diagnoseIncident(base)).toBe(true);
    expect(inv.refute).not.toHaveBeenCalled();
    expect(rem.saveDiagnosis).toHaveBeenCalledWith(1, verdict, {});
  });

  it('info severity → triage only, never investigate or refute', async () => {
    diag.triage.mockResolvedValue(verdict);
    await diagnoseIncident({ ...base, severity: 'info' });
    expect(inv.investigate).not.toHaveBeenCalled();
    expect(inv.refute).not.toHaveBeenCalled();
    expect(diag.triage).toHaveBeenCalled();
  });

  it('roots the incident thread with a heads-up on escalation (but not for info)', async () => {
    inv.investigate.mockResolvedValue(verdict);
    await diagnoseIncident(base);
    expect(rem.postIncidentThread).toHaveBeenCalledWith(
      base,
      expect.stringContaining('Investigating'),
    );
    rem.postIncidentThread.mockClear();
    diag.triage.mockResolvedValue(verdict);
    await diagnoseIncident({ ...base, severity: 'info' });
    expect(rem.postIncidentThread).not.toHaveBeenCalled();
  });

  it('returns false (no persist) when neither brain yields a verdict', async () => {
    inv.investigate.mockResolvedValue(null);
    diag.triage.mockResolvedValue(null);
    expect(await diagnoseIncident(base)).toBe(false);
    expect(rem.saveDiagnosis).not.toHaveBeenCalled();
    expect(diag.route).not.toHaveBeenCalled();
  });

  it('reverts an escalated incident to new when diagnosis fails (no orphan in investigating)', async () => {
    inv.investigate.mockResolvedValue(null);
    diag.triage.mockResolvedValue(null);
    await diagnoseIncident(base);
    expect(rem.setStatus).toHaveBeenLastCalledWith(1, 'new');
  });

  it('walks the lifecycle states: investigating → adversarial_review (design §6)', async () => {
    inv.investigate.mockResolvedValue(verdict);
    await diagnoseIncident(base);
    expect(rem.setStatus).toHaveBeenNthCalledWith(1, 1, 'investigating');
    expect(rem.setStatus).toHaveBeenNthCalledWith(2, 1, 'adversarial_review');
  });

  it('info severity skips the investigating state (triage only)', async () => {
    diag.triage.mockResolvedValue(verdict);
    await diagnoseIncident({ ...base, severity: 'info' });
    expect(rem.setStatus).not.toHaveBeenCalled();
  });
});

describe('synthesize — adversarial reconciliation', () => {
  it('refuter clean → trust preserved, no tie-breaker spawned', async () => {
    const r = await synthesize(base, verdict, HOLDS);
    expect(r.verdict.confidence).toBe('high');
    expect(inv.investigate).not.toHaveBeenCalled();
  });

  it('refuted + confident tie-breaker → finding holds (adopts tie-breaker verdict)', async () => {
    const tieBreaker = { ...verdict, root_cause: 'rc-confirmed' };
    inv.investigate.mockResolvedValue(tieBreaker);
    const r = await synthesize(base, verdict, {
      refuted: true,
      reason: 'symptom?',
    });
    expect(inv.investigate).toHaveBeenCalledTimes(1);
    expect(r.verdict).toBe(tieBreaker);
    expect(r.verdict.confidence).toBe('high');
  });

  it('refuted + tie-breaker cannot confirm (null) → downgrade to low/unknown + dissent', async () => {
    inv.investigate.mockResolvedValue(null);
    const r = await synthesize(base, verdict, {
      refuted: true,
      reason: 'it is a symptom',
      better_cause: 'missing /dev/null mount',
    });
    expect(r.verdict.confidence).toBe('low');
    expect(r.verdict.cause_or_symptom).toBe('unknown');
    expect(r.verdict.evidence).toContain('REFUTED: it is a symptom');
    expect(r.verdict.evidence).toContain(
      'BETTER_CAUSE: missing /dev/null mount',
    );
    expect(r.review).toEqual({
      refuted: true,
      reason: 'it is a symptom',
      better_cause: 'missing /dev/null mount',
    });
  });

  it('refuted + tie-breaker agrees with refuter (untrustworthy) → downgrade', async () => {
    inv.investigate.mockResolvedValue({
      ...verdict,
      confidence: 'low',
      cause_or_symptom: 'symptom',
    });
    const r = await synthesize(base, verdict, {
      refuted: true,
      reason: 'symptom',
    });
    expect(r.verdict.confidence).toBe('low');
    expect(r.verdict.cause_or_symptom).toBe('unknown');
  });
});

describe('runDiagnose', () => {
  it('no-ops under HEALER_QUIET', async () => {
    process.env.HEALER_QUIET = '1';
    expect(await runDiagnose()).toBe(0);
    expect(rem.loadOpen).not.toHaveBeenCalled();
  });

  it('no-ops when HEALER_DIAGNOSE_ENABLED=0 (kill switch)', async () => {
    process.env.HEALER_DIAGNOSE_ENABLED = '0';
    expect(await runDiagnose()).toBe(0);
    expect(rem.loadOpen).not.toHaveBeenCalled();
  });

  it('honors the MAX_PER_RUN cap (synchronous base = 2)', async () => {
    inv.investigate.mockResolvedValue(verdict);
    await runDiagnose();
    expect(rem.loadOpen).toHaveBeenCalledWith('new', 2);
  });

  it('diagnoses each loaded incident', async () => {
    rem.loadOpen.mockResolvedValue([base, { ...base, id: 2 }]);
    inv.investigate.mockResolvedValue(verdict);
    expect(await runDiagnose()).toBe(2);
  });
});
