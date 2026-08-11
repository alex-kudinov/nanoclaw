import { beforeEach, describe, expect, it, vi } from 'vitest';

let queryImpl: (
  sql: string,
  params: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;
vi.mock('./business-db.js', () => ({
  withAgentContext: async (
    _agent: string,
    fn: (client: { query: typeof queryImpl }) => Promise<unknown>,
  ) =>
    fn({ query: (sql: string, params: unknown[]) => queryImpl(sql, params) }),
}));

import type { CnpcPreparedIntake } from './cnpc-intake.js';
import {
  type CnpcMatchResult,
  CnpcMatchResultError,
  parseAndValidateCnpcMatchResult,
  recordCnpcMatchResult,
  stripCnpcMatchResult,
} from './cnpc-match-result.js';

const prepared: CnpcPreparedIntake = {
  event_type: 'cnpc.intake.created',
  intake: {
    id: 501,
    submission_id: 'gf:47:9001',
    submitted_at: '2026-08-11T01:02:03.000Z',
    applicant_name: 'Jordan Rivera',
    applicant_email: 'jordan@example.org',
    lead_source: null,
    organization: {
      legal_name: 'Community Example',
      organization_type: 'nonprofit_501c3',
      operating_expense_band: 'under_250k',
    },
    request: {
      program_track: 'cnpc',
      coaching_type: 'individual',
      why_coaching: 'Leadership transition',
    },
    consent: true,
  },
  eligibility: { status: 'eligible', reason: 'passed' },
  pricing: {
    currency: 'USD',
    individual_price_cents: 30000,
    team_price_cents: 50000,
  },
  match_pool: {
    roster_version: 'a'.repeat(64),
    candidate_count: 3,
    candidates: [
      {
        coach_id: 11,
        display_name: 'Coach One',
        icf_credential: 'PCC',
        matching_summary: 'Nonprofit leaders',
        languages: ['English'],
        time_zones: ['America/Chicago'],
        work_types: ['regular_cnpc'],
        public_profile_url: null,
        capacity_snapshot_id: 101,
        current_client_count: 1,
        available_slots_after_holds: 2,
        profile_source_updated_at: null,
        capacity_observed_at: '2026-08-10T00:00:00Z',
      },
      {
        coach_id: 12,
        display_name: 'Coach Two',
        icf_credential: 'ACC',
        matching_summary: 'Transitions',
        languages: ['English'],
        time_zones: ['America/New_York'],
        work_types: ['regular_cnpc'],
        public_profile_url: null,
        capacity_snapshot_id: 102,
        current_client_count: 0,
        available_slots_after_holds: 1,
        profile_source_updated_at: null,
        capacity_observed_at: '2026-08-10T00:00:00Z',
      },
      {
        coach_id: 13,
        display_name: 'Coach Three',
        icf_credential: 'PCC',
        matching_summary: 'Team development',
        languages: ['English'],
        time_zones: ['America/Denver'],
        work_types: ['regular_cnpc'],
        public_profile_url: null,
        capacity_snapshot_id: 103,
        current_client_count: 2,
        available_slots_after_holds: 1,
        profile_source_updated_at: null,
        capacity_observed_at: '2026-08-10T00:00:00Z',
      },
    ],
  },
};

const result: CnpcMatchResult = {
  intake_id: 501,
  roster_version: 'a'.repeat(64),
  recommendations: [
    {
      coach_id: 11,
      rank: 1,
      fit_score: 92,
      recommendation_role: 'primary',
      reasons: ['Relevant nonprofit leadership experience'],
    },
    {
      coach_id: 12,
      rank: 2,
      fit_score: 87,
      recommendation_role: 'alternate',
      reasons: ['Strong transition focus'],
    },
    {
      coach_id: 13,
      rank: 3,
      fit_score: 79,
      recommendation_role: 'backup',
      reasons: ['Available backup with aligned experience'],
    },
  ],
};

function output(value: unknown): string {
  return `<cnpc_match_result>\n${JSON.stringify(value)}\n</cnpc_match_result>\nVisible review`;
}

beforeEach(() => {
  queryImpl = async (sql) => {
    if (sql.includes('INSERT INTO business_v2.cnpc_match_runs')) {
      return { rows: [{ id: '701' }] };
    }
    return { rows: [] };
  };
});

describe('CNPC match result boundary', () => {
  it('accepts only candidates from the host-provided roster version', () => {
    expect(parseAndValidateCnpcMatchResult(output(result), prepared)).toEqual(
      result,
    );
  });

  it('strips the machine receipt before human delivery', () => {
    expect(stripCnpcMatchResult(output(result))).toBe('Visible review');
  });

  it('rejects a hallucinated coach id', () => {
    const invalid = {
      ...result,
      recommendations: [{ ...result.recommendations[0], coach_id: 9999 }],
    };
    expect(() =>
      parseAndValidateCnpcMatchResult(output(invalid), prepared),
    ).toThrow(CnpcMatchResultError);
  });

  it('rejects a stale roster version', () => {
    expect(() =>
      parseAndValidateCnpcMatchResult(
        output({ ...result, roster_version: 'b'.repeat(64) }),
        prepared,
      ),
    ).toThrow(/roster_version/);
  });

  it('persists the validated ranking and advances the intake to review', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    queryImpl = async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO business_v2.cnpc_match_runs')) {
        return { rows: [{ id: '701' }] };
      }
      return { rows: [] };
    };
    const runId = await recordCnpcMatchResult(result, prepared);
    expect(runId).toBe(701);
    expect(
      calls.filter((call) =>
        call.sql.includes('INSERT INTO business_v2.cnpc_match_candidates'),
      ),
    ).toHaveLength(3);
    expect(
      calls.some((call) =>
        call.sql.includes("workflow_status = 'match_review'"),
      ),
    ).toBe(true);
  });

  it('rejects changed match bytes for the same intake and roster version', async () => {
    queryImpl = async (sql) => {
      if (sql.includes('INSERT INTO business_v2.cnpc_match_runs')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT id::text, result_sha256')) {
        return { rows: [{ id: '701', result_sha256: 'b'.repeat(64) }] };
      }
      return { rows: [] };
    };
    await expect(recordCnpcMatchResult(result, prepared)).rejects.toThrow(
      /replay changed bytes/,
    );
  });
});
