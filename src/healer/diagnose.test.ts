import { describe, it, expect, vi, beforeEach } from 'vitest';

const { askRouter } = vi.hoisted(() => ({ askRouter: vi.fn() }));
const rem = vi.hoisted(() => ({
  loadOpen: vi.fn(),
  proposeFix: vi.fn(),
  saveDiagnosis: vi.fn(),
  setStatus: vi.fn(),
}));
const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock('./router.js', () => ({ askRouter, diagnoseModel: () => 'claude' }));
vi.mock('./remediation.js', () => rem);
vi.mock('../business-db.js', () => ({ query: vi.fn() }));
vi.mock('child_process', () => ({ execFile }));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { parseDiagnosis, route, sourceKey, triage } from './diagnose.js';

describe('sourceKey', () => {
  it('strips the source prefix to scope the log tail', () => {
    expect(sourceKey('minion:main')).toBe('main');
    expect(sourceKey('job:plutio-outbox-reaper')).toBe('plutio-outbox-reaper');
    expect(sourceKey('minion:#gru-inbox')).toBe('#gru-inbox');
    expect(sourceKey('daemon')).toBe('daemon');
  });
});

const base = {
  id: 1,
  source: 'minion:main',
  severity: 'error',
  occurrences: 9,
  status: 'new',
  raw_context: { error: 'boom' },
  remediation_class: null,
  diagnosis: null,
  proposed_fix: null,
  confidence: null,
  cause_or_symptom: null,
  evidence: null,
  thread_ts: null,
  thread_channel: null,
  last_seen: '2026-06-23T00:00:00Z',
};

beforeEach(() => {
  askRouter.mockReset();
  rem.loadOpen.mockReset().mockResolvedValue([base]);
  rem.proposeFix.mockReset().mockResolvedValue(true);
  rem.saveDiagnosis.mockReset();
  rem.setStatus.mockReset();
  execFile
    .mockReset()
    .mockImplementation((_c, _a, _o, cb) => cb(null, 'abc commit', ''));
  delete process.env.HEALER_QUIET;
  process.env.HEALER_DAEMON_JSONL = '/nonexistent-healer-test.jsonl'; // daemonLogTail → ''
});

describe('parseDiagnosis', () => {
  const good = (extra = '') =>
    `${extra}{"root_cause":"x","remediation_class":"code_bug","fix":{"kind":"diff","summary":"s"}}${extra}`;

  it('parses a clean object', () => {
    expect(parseDiagnosis(good())).toMatchObject({
      klass: 'code_bug',
      root_cause: 'x',
    });
  });
  it('parses JSON embedded in prose', () => {
    expect(parseDiagnosis(good('here you go: '))?.klass).toBe('code_bug');
  });
  it('rejects invalid JSON', () => {
    expect(parseDiagnosis('{not json')).toBeNull();
  });
  it('rejects an unknown class', () => {
    expect(
      parseDiagnosis('{"root_cause":"x","remediation_class":"weird","fix":{}}'),
    ).toBeNull();
  });
  it('rejects a missing root_cause', () => {
    expect(
      parseDiagnosis('{"remediation_class":"config","fix":{}}'),
    ).toBeNull();
  });
  it('coerces an unknown fix.kind to none', () => {
    const p = parseDiagnosis(
      '{"root_cause":"x","remediation_class":"data","fix":{"kind":"zap"}}',
    );
    expect(p?.fix.kind).toBe('none');
  });

  it('defaults absent trust fields to low/unknown/[] (un-investigated = untrusted)', () => {
    const p = parseDiagnosis(good());
    expect(p?.confidence).toBe('low');
    expect(p?.cause_or_symptom).toBe('unknown');
    expect(p?.evidence).toEqual([]);
  });
  it('reads trust fields when the model supplies valid ones', () => {
    const p = parseDiagnosis(
      '{"root_cause":"x","remediation_class":"config","fix":{"kind":"command","summary":"s"},"confidence":"high","cause_or_symptom":"root_cause","evidence":["log:1 token 401"]}',
    );
    expect(p?.confidence).toBe('high');
    expect(p?.cause_or_symptom).toBe('root_cause');
    expect(p?.evidence).toEqual(['log:1 token 401']);
  });
  it('coerces invalid trust values back to the untrusted defaults', () => {
    const p = parseDiagnosis(
      '{"root_cause":"x","remediation_class":"data","fix":{"kind":"none","summary":"s"},"confidence":"super","cause_or_symptom":"maybe","evidence":"nope"}',
    );
    expect(p?.confidence).toBe('low');
    expect(p?.cause_or_symptom).toBe('unknown');
    expect(p?.evidence).toEqual([]);
  });
});

describe('triage (fallback one-shot brain)', () => {
  it('returns the parsed verdict from the router, defaulting trust to low', async () => {
    askRouter.mockResolvedValue(
      '{"root_cause":"rc","remediation_class":"config","fix":{"kind":"command","summary":"s","command":"echo"}}',
    );
    const dx = await triage(base);
    expect(dx?.klass).toBe('config');
    expect(dx?.confidence).toBe('low'); // one-shot can't investigate → untrusted
  });

  it('returns null on a router outage (no reply)', async () => {
    askRouter.mockResolvedValue(null);
    expect(await triage(base)).toBeNull();
  });

  it('returns null on an unparseable reply', async () => {
    askRouter.mockResolvedValue('I think the token expired, sorry');
    expect(await triage(base)).toBeNull();
  });
});

describe('route (class → action, carrying trust onto the incident)', () => {
  const dx = (klass: string, kind = 'command') => ({
    root_cause: 'rc',
    klass: klass as never,
    fix: { kind: kind as never, summary: 's', command: 'echo' },
    confidence: 'high' as const,
    cause_or_symptom: 'root_cause' as const,
    evidence: ['e'],
  });

  it('transient: neither proposes nor escalates (auto path owns it)', async () => {
    await route(base, dx('transient', 'rerun'));
    expect(rem.proposeFix).not.toHaveBeenCalled();
    expect(rem.setStatus).not.toHaveBeenCalled();
  });

  it('external_outage: escalates to wont_fix, no proposal', async () => {
    await route(base, dx('external_outage', 'none'));
    expect(rem.setStatus).toHaveBeenCalledWith(1, 'wont_fix', 'escalated');
    expect(rem.proposeFix).not.toHaveBeenCalled();
  });

  it('config: proposes, carrying the verdict trust fields onto the incident', async () => {
    await route(base, dx('config'));
    expect(rem.proposeFix).toHaveBeenCalledTimes(1);
    expect(rem.proposeFix.mock.calls[0][0]).toMatchObject({
      remediation_class: 'config',
      confidence: 'high',
      cause_or_symptom: 'root_cause',
      diagnosis: 'rc',
    });
  });
});
