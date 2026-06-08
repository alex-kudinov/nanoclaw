/*
 * BOOKING HOST-WRITE — TABLE DECISION (T03a-pre)
 *
 * Target table: business_v2.interactions — written via the SECURITY DEFINER
 *   function business_v2.fn_log_interaction_dedup(...). Identity rows go to
 *   business_v2.parties via business_v2.fn_create_party (wrapped by
 *   identity-join.ts resolveOrCreateParty / resolveTrafftCustomer).
 *   NOT public.booking_events — that table is the LEGACY pre-cutover path
 *   (last row id 35, created 2026-04-13); the current booking agent
 *   (groups/booking/EXECUTION-STEPS.md Step 2, post the 2026-04-12 agent
 *   cutover to business_v2) writes ONLY fn_create_party + fn_log_interaction_dedup.
 * ON CONFLICT columns: none-direct — dedup is delegated to
 *   fn_log_interaction_dedup, which serializes on pg_advisory_xact_lock and
 *   keys on (source_provider, source_id) = ('trafft', appointmentId), backed
 *   by the partial index interactions_source_idx. The function is idempotent:
 *   a replayed booked event re-resolves the SAME interaction id. (No raw
 *   ON CONFLICT clause — the dedup function IS the conflict handling, exactly
 *   as the booking agent path does it.)
 * NOT NULL columns: business_v2.interactions NOT NULL set = id (seq default),
 *   channel, direction, occurred_at, metadata (default '{}'), created_at
 *   (default now()), updated_at (default now()), last_updated_by (set by the
 *   function to the agent GUC). fn_log_interaction_dedup supplies channel,
 *   direction, occurred_at, metadata, party_id, subject, source_provider,
 *   source_id; the rest are column defaults. The host call must pass:
 *   party_id, 'booking', 'inbound', subject, occurred_at(start), metadata,
 *   'trafft', appointmentId.
 * Interactions write: yes — the interaction row IS the booking write.
 *   public.booking_events is NOT replicated (legacy, scope discipline).
 *   The booking agent ALSO did a Plutio activity-log entry + a booking->sales
 *   handoff — both are surplus to the in-scope row write and are OUT of scope
 *   here (the handoff is removed by T03c; Plutio sync is auto-enqueued by
 *   resolveOrCreateParty's fn_create_party outbox path).
 * Evidence: agent_docs/nanoclaw-business-v2-schema.sql —
 *   CREATE TABLE business_v2.interactions lines 1022-1075;
 *   CREATE FUNCTION business_v2.fn_log_interaction_dedup lines 347-388
 *   (dedup advisory-lock + (source_provider,source_id) lookup at lines 360-372);
 *   CREATE FUNCTION business_v2.fn_create_party lines 155-217;
 *   partial index interactions_source_idx line 2547;
 *   GRANT ... TO nanoclaw_booking lines 3175 + 3230 (host role can call both).
 *   Live data: business_v2.interactions rows with channel='booking',
 *   source_provider='trafft', source_id=<appointmentId> (ids 317/410/168);
 *   booking agent procedure groups/booking/EXECUTION-STEPS.md Steps 2a/2b.
 */

import { extractEventKey } from './webhook-extractors.js';
import { withAgentContext } from './business-db.js';
import { resolveTrafftCustomer } from './identity-join.js';
import {
  extractTrafftCustomFields,
  type TrafftCustomField,
} from './trafft-custom-fields.js';
import { logger } from './logger.js';

/** Thrown when a payload is not a well-formed Trafft `booked` event. */
export class BookedPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookedPayloadError';
  }
}

/** Flat, validated shape of a Trafft `booked` webhook payload. */
export interface BookedInput {
  event_type: 'booked';
  /** Stable dedup key: `appt:<appointmentId>:booked`. */
  event_id: string;
  appointmentId: string;
  customerId?: string;
  customerEmail: string;
  customerFirstName?: string;
  customerLastName?: string;
  customerFullName?: string;
  customerPhone?: string;
  serviceName: string;
  employeeName?: string;
  status?: string;
  startDateTime: string;
  /**
   * Appointment booking-form answers (reason / source), parsed from the
   * bracket-notation keys Trafft flattens onto the payload. Empty for services
   * without a custom form. See trafft-custom-fields.ts.
   */
  customFields: TrafftCustomField[];
  /** Full raw payload, stored verbatim in interaction metadata. */
  rawPayload: Record<string, unknown>;
}

export interface BookingWriteResult {
  /** Primary key of the row Step B wrote (the interaction id). */
  booking_row_id: number;
  party_id: number;
  interaction_id: number;
}

function asStr(v: unknown): string | undefined {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length ? t : undefined;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

/**
 * Validate an unknown webhook payload into a typed BookedInput. Reads the
 * FLAT top-level keys that webhook-extractors.extractTrafft uses; reuses
 * extractEventKey for the event_type / event_id derivation.
 */
export function parseBookedPayload(payload: unknown): BookedInput {
  if (!payload || typeof payload !== 'object') {
    throw new BookedPayloadError('payload is not an object');
  }
  const p = payload as Record<string, unknown>;
  const key = extractEventKey('trafft', p);
  if (key.event_type !== 'booked' || !key.event_id) {
    throw new BookedPayloadError(
      `not a valid booked event (event_type=${key.event_type}, event_id=${key.event_id})`,
    );
  }
  const appointmentId = asStr(p.appointmentId);
  const customerEmail = asStr(p.customerEmail);
  const serviceName = asStr(p.serviceName);
  const startDateTime =
    asStr(p.appointmentStartDateTime) ?? asStr(p.appointmentStartDate);
  const missing: string[] = [];
  if (!appointmentId) missing.push('appointmentId');
  if (!customerEmail) missing.push('customerEmail');
  if (!serviceName) missing.push('serviceName');
  if (!startDateTime) missing.push('appointmentStartDateTime');
  if (missing.length) {
    throw new BookedPayloadError(
      `missing required field(s): ${missing.join(', ')}`,
    );
  }
  return {
    event_type: 'booked',
    event_id: key.event_id,
    appointmentId: appointmentId as string,
    customerId: asStr(p.customerId),
    customerEmail: customerEmail as string,
    customerFirstName: asStr(p.customerFirstName),
    customerLastName: asStr(p.customerLastName),
    customerFullName: asStr(p.customerFullName),
    customerPhone: asStr(p.customerPhone),
    serviceName: serviceName as string,
    employeeName: asStr(p.employeeFullName),
    status: asStr(p.appointmentStatus),
    startDateTime: startDateTime as string,
    customFields: extractTrafftCustomFields(p),
    rawPayload: p,
  };
}

const TRANSIENT_PG_CODES = new Set(['40001', '40P01']);

function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  if (code && (TRANSIENT_PG_CODES.has(code) || code === 'ECONNRESET')) {
    return true;
  }
  const msg = (err as Error).message ?? '';
  return msg.includes('ECONNRESET');
}

/**
 * Mechanically resolve identity and write the booking interaction row.
 * No LLM. See the TABLE DECISION header for the chosen target + dedup.
 */
export async function bookingHostWrite(
  input: BookedInput,
): Promise<BookingWriteResult> {
  // Step A — party resolution. Separate idempotent commit (resolveTrafftCustomer
  // opens its own connection); NOT rolled back if Step B fails — a replay
  // re-resolves the same party_id via fn_create_party's email idempotency.
  const party_id = await resolveTrafftCustomer(
    {
      customerId: input.customerId,
      customerEmail: input.customerEmail,
      customerFirstName: input.customerFirstName,
      customerLastName: input.customerLastName,
      customerFullName: input.customerFullName,
    },
    { agent: 'booking' },
  );

  // Step B — interaction row in one transaction. Dedup is delegated to
  // fn_log_interaction_dedup (idempotent on (source_provider, source_id)).
  const metadata = {
    trafft_appointment_id: input.appointmentId,
    service: input.serviceName,
    employee: input.employeeName ?? null,
    status: input.status ?? null,
    event_type: input.event_type,
    customer_phone: input.customerPhone ?? null,
    // Clean, queryable custom fields so the booking→sales handoff agent reads
    // reason/source directly instead of re-parsing raw_payload bracket keys.
    custom_fields: input.customFields,
    raw_payload: input.rawPayload,
  };

  const runStepB = (): Promise<number> =>
    withAgentContext('booking', async (client) => {
      const r = await client.query<{ id: string }>(
        `SELECT business_v2.fn_log_interaction_dedup($1,$2,$3,$4,$5::timestamptz,$6::jsonb,$7,$8)::text AS id`,
        [
          party_id,
          'booking',
          'inbound',
          `${input.serviceName} booking`,
          input.startDateTime,
          JSON.stringify(metadata),
          'trafft',
          input.appointmentId,
        ],
      );
      return Number(r.rows[0].id);
    });

  let interaction_id: number;
  try {
    interaction_id = await runStepB();
  } catch (err) {
    if (!isTransientError(err)) {
      logger.error(
        { err, event_id: input.event_id },
        'bookingHostWrite: Step B failed (non-transient)',
      );
      throw err;
    }
    await new Promise((r) => setTimeout(r, 1000));
    try {
      interaction_id = await runStepB();
    } catch (retryErr) {
      logger.error(
        { err: retryErr, event_id: input.event_id },
        'bookingHostWrite: Step B failed after retry',
      );
      throw retryErr;
    }
  }

  return { booking_row_id: interaction_id, party_id, interaction_id };
}
