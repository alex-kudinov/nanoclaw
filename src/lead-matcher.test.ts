import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./business-db.js', () => ({ query: vi.fn() }));
vi.mock('./logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { matchLead, type PipelineMatch } from './lead-matcher.js';
import { query } from './business-db.js';

const mockQuery = vi.mocked(query);

// ── Production-like fixtures ──────────────────────────────────────

/** Simulates a coaching inquiry lead that was emailed 2 days ago */
const activeLead: PipelineMatch = {
  pipeline_entry_id: 17,
  party_id: 10042,
  display_name: 'Jane Doe',
  stage: 'proposal',
  program_slug: 'coaching-inquiry',
  last_interaction_at: '2026-04-11T14:30:00+00:00',
  thread_id: '18f1a2b3c4d5e6f7',
};

/** Lead with no thread (contact form, no email sent yet) */
const noThreadLead: PipelineMatch = {
  pipeline_entry_id: 23,
  party_id: 10058,
  display_name: 'Bob Smith',
  stage: 'qualifying',
  program_slug: 'certification-inquiry',
  last_interaction_at: '2026-04-10T09:00:00+00:00',
  thread_id: null,
};

/** Lead in negotiating stage — still active */
const negotiatingLead: PipelineMatch = {
  pipeline_entry_id: 5,
  party_id: 10012,
  display_name: 'Alice Corp',
  stage: 'negotiating',
  program_slug: 'coaching-inquiry',
  last_interaction_at: '2026-04-09T16:45:00+00:00',
  thread_id: '19a2b3c4d5e6f789',
};

/** Lead in 'new' stage — just created by inbox */
const newLead: PipelineMatch = {
  pipeline_entry_id: 31,
  party_id: 10070,
  display_name: 'Seana Fairchild',
  stage: 'new',
  program_slug: 'certification-inquiry',
  last_interaction_at: '2026-04-13T08:30:00+00:00',
  thread_id: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('matchLead', () => {
  // ── Basic matching ──────────────────────────────────────────────

  it('returns PipelineMatch when query finds an active lead', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [activeLead] } as never);
    const result = await matchLead('Jane@Example.com');
    expect(result).toEqual(activeLead);
  });

  it('returns null when no pipeline entry matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    const result = await matchLead('nobody@example.com');
    expect(result).toBeNull();
  });

  it('returns lead with null thread_id (contact form leads)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [noThreadLead] } as never);
    const result = await matchLead('bob@example.com');
    expect(result).toEqual(noThreadLead);
    expect(result!.thread_id).toBeNull();
  });

  // ── Input validation ────────────────────────────────────────────

  it('lowercases the email parameter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await matchLead('UPPER@CASE.COM');
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [
      'upper@case.com',
    ]);
  });

  it('returns null for empty string', async () => {
    const result = await matchLead('');
    expect(result).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns null for null-ish input', async () => {
    const result = await matchLead(null as unknown as string);
    expect(result).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns null for non-string input', async () => {
    const result = await matchLead(42 as unknown as string);
    expect(result).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ── SQL correctness ─────────────────────────────────────────────

  it('uses business_v2 views, not legacy public.leads', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await matchLead('test@example.com');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('business_v2.v_active_pipeline');
    expect(sql).toContain('business_v2.best_party_by_email');
    expect(sql).not.toContain('FROM leads');
    expect(sql).not.toContain('public.leads');
  });

  it('filters on correct active stages', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await matchLead('test@example.com');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("'new'");
    expect(sql).toContain("'qualifying'");
    expect(sql).toContain("'proposal'");
    expect(sql).toContain("'negotiating'");
  });

  it('uses 60-day recency window', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await matchLead('test@example.com');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("INTERVAL '60 days'");
  });

  it('queries thread_id from interactions metadata, not pipeline columns', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await matchLead('test@example.com');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("metadata->>'thread_id'");
    expect(sql).toContain("i.channel = 'email'");
    expect(sql).toContain("i.direction = 'outbound'");
  });

  it('casts email parameter as citext for case-insensitive lookup', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await matchLead('test@example.com');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('$1::citext');
  });

  // ── Return shape: all fields from v_active_pipeline ─────────────

  it('returns pipeline_entry_id (not legacy id)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [activeLead] } as never);
    const result = await matchLead('jane@example.com');
    expect(result).toHaveProperty('pipeline_entry_id', 17);
    expect(result).not.toHaveProperty('id');
  });

  it('returns party_id for interaction logging', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [activeLead] } as never);
    const result = await matchLead('jane@example.com');
    expect(result).toHaveProperty('party_id', 10042);
  });

  it('returns program_slug for context', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [activeLead] } as never);
    const result = await matchLead('jane@example.com');
    expect(result).toHaveProperty('program_slug', 'coaching-inquiry');
  });

  it('returns display_name (not legacy name field)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [activeLead] } as never);
    const result = await matchLead('jane@example.com');
    expect(result).toHaveProperty('display_name', 'Jane Doe');
    expect(result).not.toHaveProperty('name');
  });

  it('returns stage (not legacy status field)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [activeLead] } as never);
    const result = await matchLead('jane@example.com');
    expect(result).toHaveProperty('stage', 'proposal');
    expect(result).not.toHaveProperty('status');
  });

  // ── Stage coverage: every active stage returns correctly ────────

  it('matches leads in "new" stage', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [newLead] } as never);
    const result = await matchLead('seana@example.com');
    expect(result).toEqual(newLead);
    expect(result!.stage).toBe('new');
  });

  it('matches leads in "qualifying" stage', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [noThreadLead] } as never);
    const result = await matchLead('bob@example.com');
    expect(result!.stage).toBe('qualifying');
  });

  it('matches leads in "proposal" stage', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [activeLead] } as never);
    const result = await matchLead('jane@example.com');
    expect(result!.stage).toBe('proposal');
  });

  it('matches leads in "negotiating" stage', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [negotiatingLead] } as never);
    const result = await matchLead('alice@corp.com');
    expect(result!.stage).toBe('negotiating');
  });

  // ── Error handling: retry + graceful degradation ────────────────

  it('retries once on DB error and returns result on success', async () => {
    mockQuery
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({ rows: [activeLead] } as never);
    const result = await matchLead('jane@example.com');
    expect(result).toEqual(activeLead);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('returns null on DB error after retry exhausted', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));
    const result = await matchLead('fail@example.com');
    expect(result).toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('returns null (not throw) on timeout errors', async () => {
    mockQuery.mockRejectedValue(new Error('query timeout'));
    const result = await matchLead('slow@example.com');
    expect(result).toBeNull();
  });

  // ── No legacy schema references ─────────────────────────────────

  it('does not reference follow_up_count (legacy field)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [activeLead] } as never);
    const result = await matchLead('jane@example.com');
    expect(result).not.toHaveProperty('follow_up_count');
  });

  it('does not reference message (legacy field)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [activeLead] } as never);
    const result = await matchLead('jane@example.com');
    expect(result).not.toHaveProperty('message');
  });
});
