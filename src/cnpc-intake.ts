import crypto from 'crypto';

import { withAgentContext } from './business-db.js';
import { resolveOrCreateParty } from './identity-join.js';

export const CNPC_INTAKE_WEBHOOK_ID = 'cnpc-coaching-intake';
export const CNPC_MATCH_PROMPT_VERSION = 'cnpc-match-v1';

const ORGANIZATION_TYPES = new Set([
  'nonprofit_501c3',
  'nonprofit_other_501c',
  'government',
  'for_profit',
  'unsure',
]);
const OPERATING_EXPENSE_BANDS = new Set([
  'under_250k',
  '250k_to_499999',
  '500k_plus',
  'unknown',
]);
const PROGRAM_TRACKS = new Set(['cnpc', 'eit', 'unsure']);
const COACHING_TYPES = new Set(['individual', 'team', 'both', 'unsure']);

export type CnpcEligibility = 'eligible' | 'ineligible' | 'needs_review';

export interface CnpcIntakeInput {
  submission_id: string;
  submitted_at: string;
  applicant: {
    first_name: string;
    last_name: string;
    email: string;
    lead_source?: string;
  };
  organization: {
    legal_name: string;
    website?: string;
    city?: string;
    state?: string;
    organization_type:
      | 'nonprofit_501c3'
      | 'nonprofit_other_501c'
      | 'government'
      | 'for_profit'
      | 'unsure';
    operating_expense_band:
      | 'under_250k'
      | '250k_to_499999'
      | '500k_plus'
      | 'unknown';
  };
  request: {
    program_track: 'cnpc' | 'eit' | 'unsure';
    coaching_type: 'individual' | 'team' | 'both' | 'unsure';
    why_coaching: string;
    first_choice_coach?: string;
    second_choice_coach?: string;
    anything_else?: string;
  };
  consent: boolean;
  source: {
    form_id: string;
    entry_id: string;
  };
}

export interface CnpcCandidate {
  coach_id: number;
  display_name: string;
  icf_credential: string | null;
  matching_summary: string | null;
  languages: string[];
  time_zones: string[];
  work_types: string[];
  public_profile_url: string | null;
  capacity_snapshot_id: number | null;
  current_client_count: number;
  available_slots_after_holds: number;
  profile_source_updated_at: string | null;
  capacity_observed_at: string | null;
}

export interface CnpcPreparedIntake {
  event_type: 'cnpc.intake.created';
  intake: {
    id: number;
    submission_id: string;
    submitted_at: string;
    applicant_name: string;
    applicant_email: string;
    lead_source: string | null;
    organization: CnpcIntakeInput['organization'];
    request: CnpcIntakeInput['request'];
    consent: boolean;
  };
  eligibility: {
    status: CnpcEligibility;
    reason: string;
  };
  pricing: {
    currency: 'USD';
    individual_price_cents: number | null;
    team_price_cents: number | null;
  };
  match_pool: {
    roster_version: string;
    candidate_count: number;
    candidates: CnpcCandidate[];
  };
}

export class CnpcIntakePayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CnpcIntakePayloadError';
  }
}

function requiredString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CnpcIntakePayloadError(`${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new CnpcIntakePayloadError(
      `${field} exceeds maximum length ${maxLength}`,
    );
  }
  return trimmed;
}

function optionalString(
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return requiredString(value, field, maxLength);
}

function enumString<T extends string>(
  value: unknown,
  field: string,
  allowed: Set<string>,
): T {
  const parsed = requiredString(value, field, 80);
  if (!allowed.has(parsed)) {
    throw new CnpcIntakePayloadError(`${field} has unsupported value`);
  }
  return parsed as T;
}

function objectAt(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CnpcIntakePayloadError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function parseCnpcIntakePayload(payload: unknown): CnpcIntakeInput {
  const p = objectAt(payload, 'payload');
  const applicant = objectAt(p.applicant, 'applicant');
  const organization = objectAt(p.organization, 'organization');
  const request = objectAt(p.request, 'request');
  const source = objectAt(p.source, 'source');

  const submission_id = requiredString(p.submission_id, 'submission_id', 160);
  if (!/^[A-Za-z0-9:._-]+$/.test(submission_id)) {
    throw new CnpcIntakePayloadError(
      'submission_id may contain only letters, numbers, colon, dot, underscore, and hyphen',
    );
  }

  const submitted_at = requiredString(p.submitted_at, 'submitted_at', 80);
  if (!Number.isFinite(Date.parse(submitted_at))) {
    throw new CnpcIntakePayloadError('submitted_at must be an ISO timestamp');
  }

  const email = requiredString(applicant.email, 'applicant.email', 320)
    .toLowerCase()
    .trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CnpcIntakePayloadError('applicant.email is invalid');
  }
  if (typeof p.consent !== 'boolean') {
    throw new CnpcIntakePayloadError('consent must be a boolean');
  }

  return {
    submission_id,
    submitted_at: new Date(submitted_at).toISOString(),
    applicant: {
      first_name: requiredString(
        applicant.first_name,
        'applicant.first_name',
        120,
      ),
      last_name: requiredString(
        applicant.last_name,
        'applicant.last_name',
        120,
      ),
      email,
      lead_source: optionalString(
        applicant.lead_source,
        'applicant.lead_source',
        500,
      ),
    },
    organization: {
      legal_name: requiredString(
        organization.legal_name,
        'organization.legal_name',
        500,
      ),
      website: optionalString(
        organization.website,
        'organization.website',
        1000,
      ),
      city: optionalString(organization.city, 'organization.city', 200),
      state: optionalString(organization.state, 'organization.state', 200),
      organization_type: enumString(
        organization.organization_type,
        'organization.organization_type',
        ORGANIZATION_TYPES,
      ),
      operating_expense_band: enumString(
        organization.operating_expense_band,
        'organization.operating_expense_band',
        OPERATING_EXPENSE_BANDS,
      ),
    },
    request: {
      program_track: enumString(
        request.program_track,
        'request.program_track',
        PROGRAM_TRACKS,
      ),
      coaching_type: enumString(
        request.coaching_type,
        'request.coaching_type',
        COACHING_TYPES,
      ),
      why_coaching: requiredString(
        request.why_coaching,
        'request.why_coaching',
        12_000,
      ),
      first_choice_coach: optionalString(
        request.first_choice_coach,
        'request.first_choice_coach',
        300,
      ),
      second_choice_coach: optionalString(
        request.second_choice_coach,
        'request.second_choice_coach',
        300,
      ),
      anything_else: optionalString(
        request.anything_else,
        'request.anything_else',
        12_000,
      ),
    },
    consent: p.consent,
    source: {
      form_id: requiredString(source.form_id, 'source.form_id', 160),
      entry_id: requiredString(source.entry_id, 'source.entry_id', 160),
    },
  };
}

export function deriveCnpcEligibility(input: CnpcIntakeInput): {
  status: CnpcEligibility;
  reason: string;
} {
  if (!input.consent) {
    return { status: 'ineligible', reason: 'Required consent was not given.' };
  }
  if (input.organization.organization_type === 'for_profit') {
    return {
      status: 'ineligible',
      reason:
        'CNPC serves nonprofit and analogous public-service organizations.',
    };
  }
  if (
    input.organization.organization_type === 'unsure' ||
    input.organization.operating_expense_band === 'unknown' ||
    input.request.coaching_type === 'unsure' ||
    input.request.program_track === 'unsure'
  ) {
    return {
      status: 'needs_review',
      reason:
        'One or more eligibility or service-selection fields need review.',
    };
  }
  return {
    status: 'eligible',
    reason:
      'Organization type, consent, and service fields passed deterministic checks.',
  };
}

export function deriveCnpcPricing(
  band: CnpcIntakeInput['organization']['operating_expense_band'],
): {
  currency: 'USD';
  individual_price_cents: number | null;
  team_price_cents: number | null;
} {
  const prices = {
    under_250k: [30_000, 50_000],
    '250k_to_499999': [40_000, 70_000],
    '500k_plus': [60_000, 110_000],
  } as const;
  const pair = band === 'unknown' ? null : prices[band];
  return {
    currency: 'USD',
    individual_price_cents: pair?.[0] ?? null,
    team_price_cents: pair?.[1] ?? null,
  };
}

function requestedWorkTypes(input: CnpcIntakeInput): string[] {
  if (input.request.program_track === 'eit') {
    return ['executives_in_transition'];
  }
  if (input.request.coaching_type === 'team') return ['team_coaching'];
  if (input.request.coaching_type === 'both') {
    return ['regular_cnpc', 'team_coaching'];
  }
  return ['regular_cnpc'];
}

function rosterVersion(candidates: CnpcCandidate[]): string {
  const canonical = candidates.map((candidate) => ({
    id: candidate.coach_id,
    capacity: candidate.capacity_snapshot_id,
    available: candidate.available_slots_after_holds,
    profile_updated_at: candidate.profile_source_updated_at,
    capacity_observed_at: candidate.capacity_observed_at,
  }));
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex');
}

export async function prepareCnpcIntake(
  input: CnpcIntakeInput,
  webhookInboxId: number | null,
): Promise<CnpcPreparedIntake> {
  const applicantName = `${input.applicant.first_name} ${input.applicant.last_name}`;
  const partyId = await resolveOrCreateParty({
    email: input.applicant.email,
    display_name: applicantName,
    source_hint: 'wordpress',
    metadata: {
      cnpc_submission_id: input.submission_id,
      cnpc_form_id: input.source.form_id,
      cnpc_entry_id: input.source.entry_id,
    },
    agent: 'cnpc:host',
  });

  const eligibility = deriveCnpcEligibility(input);
  const pricing = deriveCnpcPricing(input.organization.operating_expense_band);
  const workflowStatus =
    eligibility.status === 'eligible'
      ? 'new'
      : eligibility.status === 'ineligible'
        ? 'ineligible'
        : 'needs_review';

  return withAgentContext('cnpc:host', async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO business_v2.cnpc_intakes (
         submission_id, webhook_inbox_id, applicant_party_id, submitted_at,
         organization_name, organization_website, organization_city,
         organization_state, organization_type, operating_expense_band,
         program_track, coaching_type, why_coaching, first_choice_coach,
         second_choice_coach, anything_else, lead_source, consent,
         eligibility_status, individual_price_cents, team_price_cents,
         workflow_status, source_form_id, source_entry_id, source_payload
       ) VALUES (
         $1,$2,$3,$4::timestamptz,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
         $16,$17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb
       )
       ON CONFLICT (submission_id) DO NOTHING
       RETURNING id::text`,
      [
        input.submission_id,
        webhookInboxId,
        partyId,
        input.submitted_at,
        input.organization.legal_name,
        input.organization.website ?? null,
        input.organization.city ?? null,
        input.organization.state ?? null,
        input.organization.organization_type,
        input.organization.operating_expense_band,
        input.request.program_track,
        input.request.coaching_type,
        input.request.why_coaching,
        input.request.first_choice_coach ?? null,
        input.request.second_choice_coach ?? null,
        input.request.anything_else ?? null,
        input.applicant.lead_source ?? null,
        input.consent,
        eligibility.status,
        pricing.individual_price_cents,
        pricing.team_price_cents,
        workflowStatus,
        input.source.form_id,
        input.source.entry_id,
        JSON.stringify(input),
      ],
    );

    let intakeId = Number(inserted.rows[0]?.id);
    if (!intakeId) {
      const existing = await client.query<{ id: string }>(
        `SELECT id::text
           FROM business_v2.cnpc_intakes
          WHERE submission_id = $1`,
        [input.submission_id],
      );
      intakeId = Number(existing.rows[0]?.id);
    }
    if (!intakeId) {
      throw new Error('cnpc intake insert did not return or resolve an id');
    }

    const matchable = eligibility.status === 'eligible';
    const candidateRows = matchable
      ? await client.query<CnpcCandidate>(
          `SELECT
             coach_id::integer,
             display_name,
             icf_credential,
             matching_summary,
             languages,
             time_zones,
             work_types,
             public_profile_url,
             capacity_snapshot_id::integer,
             COALESCE(current_client_count, 0)::integer AS current_client_count,
             available_slots_after_holds::integer,
             profile_source_updated_at::text,
             capacity_observed_at::text
           FROM business_v2.v_cnpc_match_pool
          WHERE work_types && $1::text[]
          ORDER BY current_client_count ASC,
                   available_slots_after_holds DESC,
                   display_name ASC
          LIMIT 50`,
          [requestedWorkTypes(input)],
        )
      : { rows: [] as CnpcCandidate[] };
    const candidates = candidateRows.rows;

    return {
      event_type: 'cnpc.intake.created',
      intake: {
        id: intakeId,
        submission_id: input.submission_id,
        submitted_at: input.submitted_at,
        applicant_name: applicantName,
        applicant_email: input.applicant.email,
        lead_source: input.applicant.lead_source ?? null,
        organization: input.organization,
        request: input.request,
        consent: input.consent,
      },
      eligibility,
      pricing,
      match_pool: {
        roster_version: rosterVersion(candidates),
        candidate_count: candidates.length,
        candidates,
      },
    };
  });
}
