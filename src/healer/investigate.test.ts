import { describe, it, expect, vi, beforeEach } from 'vitest';

const { runAgenticClaude } = vi.hoisted(() => ({ runAgenticClaude: vi.fn() }));
const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }));

vi.mock('./agentic.js', () => ({ runAgenticClaude }));
vi.mock('child_process', () => ({ execFile }));
vi.mock('../business-db.js', () => ({ query: vi.fn() }));
vi.mock('./slack.js', () => ({
  postIncidents: vi.fn(),
  postIncidentsRef: vi.fn(),
}));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  buildInvestigatePrompt,
  buildRefutePrompt,
  investigate,
  parseInvestigation,
  parseRefutation,
  refute,
} from './investigate.js';
import type { OpenIncident } from './remediation.js';
import type { DiagnosisResult } from './trust.js';

const inc: OpenIncident = {
  id: 561558,
  source: 'daemon',
  severity: 'error',
  occurrences: 4,
  status: 'new',
  raw_context: { error: 'contador-name-reaper spawns backfill-names.cjs' },
  remediation_class: null,
  diagnosis: null,
  proposed_fix: null,
  confidence: null,
  cause_or_symptom: null,
  evidence: null,
  last_seen: '2026-06-24T00:00:00Z',
};

const goodVerdict = JSON.stringify({
  root_cause: 'backfill-names.cjs hardcodes /workspace/extra path',
  remediation_class: 'code_bug',
  fix: { kind: 'diff', summary: 'resolve path relative to repo root' },
  confidence: 'high',
  cause_or_symptom: 'root_cause',
  evidence: ['tools/contador/backfill-names.cjs:12 — hardcoded /workspace/extra'],
});

beforeEach(() => {
  runAgenticClaude.mockReset();
  execFile
    .mockReset()
    .mockImplementation((_c, _a, _o, cb) => cb(null, 'abc commit\n', ''));
  delete process.env.HEALER_INVESTIGATE_BASH;
});

describe('parseInvestigation', () => {
  it('parses a valid evidenced verdict', () => {
    expect(parseInvestigation(goodVerdict)).toMatchObject({
      klass: 'code_bug',
      confidence: 'high',
      cause_or_symptom: 'root_cause',
    });
  });
  it('returns null on invalid JSON', () => {
    expect(parseInvestigation('not json')).toBeNull();
  });
  it('returns null when root_cause is missing', () => {
    expect(
      parseInvestigation('{"remediation_class":"code_bug","fix":{}}'),
    ).toBeNull();
  });
  it('defaults trust fields to untrusted when absent', () => {
    const p = parseInvestigation(
      '{"root_cause":"x","remediation_class":"data","fix":{"kind":"none","summary":"s"}}',
    );
    expect(p?.confidence).toBe('low');
    expect(p?.cause_or_symptom).toBe('unknown');
  });
});

describe('buildInvestigatePrompt', () => {
  it('instructs investigation, read-only safety, and the JSON schema', () => {
    const p = buildInvestigatePrompt(inc, 'abc commit');
    expect(p).toContain('INVESTIGATE before you conclude');
    expect(p).toContain('ROOT CAUSE from SYMPTOM');
    expect(p).toMatch(/READ-ONLY/);
    expect(p).toContain('Never use Write or Edit');
    expect(p).toContain('"cause_or_symptom"');
  });
});

describe('investigate', () => {
  it('returns the parsed verdict on a clean agentic run', async () => {
    runAgenticClaude.mockResolvedValue({ ok: true, stdout: goodVerdict });
    const dx = await investigate(inc);
    expect(dx?.klass).toBe('code_bug');
    expect(dx?.confidence).toBe('high');
  });

  it('returns null when the agentic run fails (no token / timeout)', async () => {
    runAgenticClaude.mockResolvedValue({ ok: false, stdout: '' });
    expect(await investigate(inc)).toBeNull();
  });

  it('returns null when the run succeeds but output is unparseable', async () => {
    runAgenticClaude.mockResolvedValue({ ok: true, stdout: 'I think it broke' });
    expect(await investigate(inc)).toBeNull();
  });

  it('is read-only by default; opts into Bash only with HEALER_INVESTIGATE_BASH=1', async () => {
    runAgenticClaude.mockResolvedValue({ ok: true, stdout: goodVerdict });
    await investigate(inc);
    expect(runAgenticClaude.mock.calls[0][1].allowedTools).toBe('Read Grep Glob');

    runAgenticClaude.mockClear();
    process.env.HEALER_INVESTIGATE_BASH = '1';
    await investigate(inc);
    expect(runAgenticClaude.mock.calls[0][1].allowedTools).toBe(
      'Read Grep Glob Bash',
    );
  });
});

const dx: DiagnosisResult = {
  root_cause: 'backfill-names.cjs hardcodes /workspace/extra',
  klass: 'code_bug',
  fix: { kind: 'diff', summary: 'fix path' },
  confidence: 'high',
  cause_or_symptom: 'root_cause',
  evidence: ['tools/contador/backfill-names.cjs:12'],
};

describe('parseRefutation', () => {
  it('reads a refuting verdict with a better cause', () => {
    expect(
      parseRefutation('{"refuted":true,"reason":"it is a symptom","better_cause":"missing mount"}'),
    ).toEqual({ refuted: true, reason: 'it is a symptom', better_cause: 'missing mount' });
  });
  it('reads a confirming verdict (refuted=false)', () => {
    expect(parseRefutation('{"refuted":false,"reason":"holds up"}')).toEqual({
      refuted: false,
      reason: 'holds up',
    });
  });
  it('defaults to NOT refuted on unparseable output (verdict stands)', () => {
    expect(parseRefutation('the diagnosis seems fine to me').refuted).toBe(false);
  });
  it('omits better_cause when not a non-empty string', () => {
    expect(parseRefutation('{"refuted":true,"reason":"x","better_cause":""}')).toEqual({
      refuted: true,
      reason: 'x',
    });
  });
});

describe('buildRefutePrompt', () => {
  it('presents the verdict + evidence and asks to disprove, read-only', () => {
    const p = buildRefutePrompt(inc, dx);
    expect(p).toContain('DISPROVE');
    expect(p).toContain('ROOT CAUSE or merely a SYMPTOM');
    expect(p).toContain('backfill-names.cjs:12');
    expect(p).toContain('Never use Write or Edit');
    expect(p).toContain('"refuted"');
  });
});

describe('refute', () => {
  it('returns the parsed refutation on a clean run', async () => {
    runAgenticClaude.mockResolvedValue({
      ok: true,
      stdout: '{"refuted":true,"reason":"symptom"}',
    });
    expect(await refute(inc, dx)).toEqual({ refuted: true, reason: 'symptom' });
  });
  it('verdict stands (not refuted) when the refuter run fails', async () => {
    runAgenticClaude.mockResolvedValue({ ok: false, stdout: '' });
    expect((await refute(inc, dx)).refuted).toBe(false);
  });
});
