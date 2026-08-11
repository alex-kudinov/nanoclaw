import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveOrCreateParty = vi.fn(async (_opts: unknown) => 12001);
vi.mock('./identity-join.js', () => ({
  resolveOrCreateParty: (opts: unknown) => resolveOrCreateParty(opts),
}));

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

import {
  CnpcIntakePayloadError,
  deriveCnpcEligibility,
  deriveCnpcPricing,
  parseCnpcIntakePayload,
  prepareCnpcIntake,
} from './cnpc-intake.js';

const validPayload = {
  submission_id: 'gf:47:9001',
  submitted_at: '2026-08-11T01:02:03.000Z',
  applicant: {
    first_name: 'Jordan',
    last_name: 'Rivera',
    email: 'JORDAN@example.org',
    lead_source: 'Referral',
  },
  organization: {
    legal_name: 'Community Example',
    website: 'https://example.org',
    city: 'Chicago',
    state: 'IL',
    organization_type: 'nonprofit_501c3',
    operating_expense_band: '250k_to_499999',
  },
  request: {
    program_track: 'cnpc',
    coaching_type: 'individual',
    why_coaching: 'Develop the leadership team through a transition.',
    first_choice_coach: 'Example Coach',
  },
  consent: true,
  source: { form_id: '47', entry_id: '9001' },
};

beforeEach(() => {
  vi.clearAllMocks();
  queryImpl = async (sql) => {
    if (sql.includes('INSERT INTO business_v2.cnpc_intakes')) {
      return { rows: [{ id: '501' }] };
    }
    if (sql.includes('FROM business_v2.v_cnpc_match_pool')) {
      return {
        rows: [
          {
            coach_id: 17,
            display_name: 'Coach Example',
            icf_credential: 'PCC',
            matching_summary: 'Leadership transitions and nonprofit teams.',
            languages: ['English'],
            time_zones: ['America/Chicago'],
            work_types: ['regular_cnpc'],
            public_profile_url: 'https://cnpc.coach/team/',
            capacity_snapshot_id: 81,
            current_client_count: 1,
            available_slots_after_holds: 2,
            profile_source_updated_at: '2026-08-01T00:00:00Z',
            capacity_observed_at: '2026-08-10T00:00:00Z',
          },
        ],
      };
    }
    return { rows: [] };
  };
});

describe('parseCnpcIntakePayload', () => {
  it('normalizes the stable n8n contract', () => {
    const parsed = parseCnpcIntakePayload(validPayload);
    expect(parsed.submission_id).toBe('gf:47:9001');
    expect(parsed.applicant.email).toBe('jordan@example.org');
    expect(parsed.organization.organization_type).toBe('nonprofit_501c3');
    expect(parsed.request.coaching_type).toBe('individual');
  });

  it('rejects a malformed email', () => {
    expect(() =>
      parseCnpcIntakePayload({
        ...validPayload,
        applicant: { ...validPayload.applicant, email: 'not-an-email' },
      }),
    ).toThrow(CnpcIntakePayloadError);
  });

  it('rejects unstable or unsafe submission ids', () => {
    expect(() =>
      parseCnpcIntakePayload({
        ...validPayload,
        submission_id: 'gf 47/9001',
      }),
    ).toThrow(/submission_id/);
  });

  it('rejects unsupported enum mappings instead of guessing', () => {
    expect(() =>
      parseCnpcIntakePayload({
        ...validPayload,
        organization: {
          ...validPayload.organization,
          organization_type: 'charity-ish',
        },
      }),
    ).toThrow(/unsupported value/);
  });
});

describe('CNPC deterministic policy', () => {
  it('derives the published price tier without model judgment', () => {
    expect(deriveCnpcPricing('under_250k')).toEqual({
      currency: 'USD',
      individual_price_cents: 30_000,
      team_price_cents: 50_000,
    });
    expect(deriveCnpcPricing('500k_plus')).toEqual({
      currency: 'USD',
      individual_price_cents: 60_000,
      team_price_cents: 110_000,
    });
  });

  it('routes for-profit and ambiguous organizations without model judgment', () => {
    const parsed = parseCnpcIntakePayload(validPayload);
    expect(deriveCnpcEligibility(parsed).status).toBe('eligible');
    expect(
      deriveCnpcEligibility({
        ...parsed,
        organization: {
          ...parsed.organization,
          organization_type: 'for_profit',
        },
      }).status,
    ).toBe('ineligible');
    expect(
      deriveCnpcEligibility({
        ...parsed,
        organization: {
          ...parsed.organization,
          operating_expense_band: 'unknown',
        },
      }).status,
    ).toBe('needs_review');
  });
});

describe('prepareCnpcIntake', () => {
  it('resolves identity, writes once, and returns a bounded match pool', async () => {
    const prepared = await prepareCnpcIntake(
      parseCnpcIntakePayload(validPayload),
      77,
    );
    expect(resolveOrCreateParty).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'jordan@example.org',
        source_hint: 'wordpress',
        agent: 'cnpc:host',
      }),
    );
    expect(prepared.intake.id).toBe(501);
    expect(prepared.eligibility.status).toBe('eligible');
    expect(prepared.pricing.individual_price_cents).toBe(40_000);
    expect(prepared.match_pool.candidate_count).toBe(1);
    expect(prepared.match_pool.candidates[0]).toMatchObject({
      coach_id: 17,
      available_slots_after_holds: 2,
    });
    expect(prepared.match_pool.roster_version).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not expose a match pool for an ineligible intake', async () => {
    const parsed = parseCnpcIntakePayload({
      ...validPayload,
      organization: {
        ...validPayload.organization,
        organization_type: 'for_profit',
      },
    });
    const prepared = await prepareCnpcIntake(parsed, 78);
    expect(prepared.eligibility.status).toBe('ineligible');
    expect(prepared.match_pool.candidates).toEqual([]);
  });

  it('reuses the canonical intake id on a retry', async () => {
    queryImpl = async (sql) => {
      if (sql.includes('INSERT INTO business_v2.cnpc_intakes')) {
        return { rows: [] };
      }
      if (sql.includes('WHERE submission_id = $1')) {
        return { rows: [{ id: '501' }] };
      }
      return { rows: [] };
    };
    const prepared = await prepareCnpcIntake(
      parseCnpcIntakePayload(validPayload),
      77,
    );
    expect(prepared.intake.id).toBe(501);
  });
});
