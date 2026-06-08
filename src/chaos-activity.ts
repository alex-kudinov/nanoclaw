/**
 * Chaos verified-visitor activity handler — host-side, zero LLM.
 *
 * A Chaos verified visitor is an ACTIVITY signal, not an inquiry: a tracking
 * record about a person, never a message that warrants a reply. This handler
 * mechanically records the party (+ a prospect role and a pipeline lead when
 * the party is net-new and the form warrants it) + an interaction row. No
 * container, no agent, no handoff. Mirrors booking-host-write.ts.
 *
 * Idempotency: net-new status is decided before party creation, so a returning
 * visitor never gets a second role or a duplicate lead; the interaction write
 * is deduped on (source_provider, source_id) = ('chaos', visitor_id).
 *
 * Plutio sync is auto-enqueued by fn_create_party's outbox path — no explicit
 * Plutio call here.
 */

import { withAgentContext, query } from './business-db.js';
import { resolveOrCreateParty } from './identity-join.js';
import { logger } from './logger.js';

/** Thrown when a payload is not a well-formed Chaos verified-visitor event. */
export class ChaosPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChaosPayloadError';
  }
}

export interface ChaosActivityInput {
  visitorId: string;
  email: string;
  displayName: string;
  formEventType: string | null;
  formElementId: string | null;
  formPage: string | null;
  intentSummary: string | null;
  emailValidatedAt: string | null;
}

export type ChaosDisposition = 'new-lead' | 'new-party' | 'returning';

export interface ChaosActivityResult {
  disposition: ChaosDisposition;
  partyId: number;
  pipelineEntryId: number | null;
  interactionId: number;
}

/** form_event_type values that warrant a pipeline lead for a net-new party. */
const LEAD_FORMS = new Set(['form_contact', 'form_lead_magnet']);

/**
 * business_v2.programs id 12 = 'general-inquiry'. A chaos capture's real
 * program is unknown at tracking time (form fields may be days stale), so the
 * neutral bucket is the honest, deterministic choice — sales reclassifies on
 * engagement.
 */
const GENERAL_INQUIRY_PROGRAM_ID = 12;

function asStr(v: unknown): string | null {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

/** Local-part of an email — display-name fallback when none was tracked. */
function localPart(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

/** Validate an unknown webhook/sweep payload into a typed ChaosActivityInput. */
export function parseChaosPayload(payload: unknown): ChaosActivityInput {
  if (!payload || typeof payload !== 'object') {
    throw new ChaosPayloadError('payload is not an object');
  }
  const p = payload as Record<string, unknown>;
  const email = asStr(p.email)?.toLowerCase() ?? null;
  const visitorId = asStr(p.visitor_id);
  if (!email) throw new ChaosPayloadError('missing required field: email');
  if (!visitorId) {
    throw new ChaosPayloadError('missing required field: visitor_id');
  }
  return {
    visitorId,
    email,
    displayName: asStr(p.display_name) ?? localPart(email),
    formEventType: asStr(p.form_event_type),
    formElementId: asStr(p.form_element_id),
    formPage: asStr(p.form_page),
    intentSummary: asStr(p.intent_summary),
    emailValidatedAt: asStr(p.email_validated_at),
  };
}

async function partyExists(email: string): Promise<boolean> {
  const r = await query<{ party_id: string | null }>(
    `SELECT business_v2.best_party_by_email($1::citext) AS party_id`,
    [email],
  );
  return r.rows.length > 0 && r.rows[0].party_id != null;
}

/** Tracking metadata recorded on every party / lead / interaction row. */
function chaosMetadata(input: ChaosActivityInput): Record<string, unknown> {
  return {
    source: 'chaos',
    chaos_visitor_id: input.visitorId,
    form_event_type: input.formEventType,
    form_element_id: input.formElementId,
    form_page: input.formPage,
    intent_summary: input.intentSummary,
  };
}

/**
 * Mechanically record a Chaos verified visitor. Zero LLM, no container, no
 * handoff. Safe to re-run for the same visitor (idempotent).
 */
export async function handleChaosActivity(
  payload: unknown,
): Promise<ChaosActivityResult> {
  const input = parseChaosPayload(payload);
  const meta = chaosMetadata(input);

  // Net-new is decided BEFORE party creation: a returning visitor must never
  // get a second prospect role or a duplicate pipeline lead.
  const isNew = !(await partyExists(input.email));

  const partyId = await resolveOrCreateParty({
    email: input.email,
    display_name: input.displayName,
    source_hint: 'chaos',
    metadata: meta,
    agent: 'chaos',
  });

  const wantsLead =
    isNew && input.formEventType != null && LEAD_FORMS.has(input.formEventType);

  return withAgentContext('chaos', async (client) => {
    if (isNew) {
      await client.query(
        `SELECT business_v2.fn_add_party_role($1, 'prospect')`,
        [partyId],
      );
    }

    let pipelineEntryId: number | null = null;
    if (wantsLead) {
      const r = await client.query<{ id: string }>(
        `SELECT business_v2.fn_create_pipeline_entry($1,$2,$3,$4,$5,$6::jsonb)::text AS id`,
        [
          partyId,
          GENERAL_INQUIRY_PROGRAM_ID,
          'new',
          0,
          'USD',
          JSON.stringify(meta),
        ],
      );
      pipelineEntryId = Number(r.rows[0].id);
    }

    const occurredAt = input.emailValidatedAt ?? new Date().toISOString();
    const interaction = await client.query<{ id: string }>(
      `SELECT business_v2.fn_log_interaction_dedup($1,$2,$3,$4,$5::timestamptz,$6::jsonb,$7,$8)::text AS id`,
      [
        partyId,
        'chaos',
        'inbound',
        'Chaos verified visitor',
        occurredAt,
        JSON.stringify(meta),
        'chaos',
        input.visitorId,
      ],
    );
    const interactionId = Number(interaction.rows[0].id);

    const disposition: ChaosDisposition = wantsLead
      ? 'new-lead'
      : isNew
        ? 'new-party'
        : 'returning';

    logger.info(
      {
        partyId,
        disposition,
        visitor_id: input.visitorId,
        pipeline_entry_id: pipelineEntryId,
        interaction_id: interactionId,
      },
      'chaos-activity: recorded (no agent spawn)',
    );

    return { disposition, partyId, pipelineEntryId, interactionId };
  });
}
