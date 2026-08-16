/**
 * Phase 2 — per-source idempotency-key extractors.
 *
 * Given the source id (matches `data/webhooks.json`) and the payload as posted,
 * returns the (event_id, event_type) pair used to dedup against
 * business_v2.webhook_inbox.(source, event_id).
 *
 * Returning event_id=null disables idempotency for that envelope (every fire
 * gets its own row). Use only when no stable provider key is available.
 *
 * gmail-push has its own Pub/Sub retry semantics and bypasses /hook/:id, so
 * it is not handled here.
 */

type Payload = Record<string, unknown>;

export interface ExtractedKey {
  event_id: string | null;
  event_type: string | null;
}

const NONE: ExtractedKey = { event_id: null, event_type: null };

export function extractEventKey(
  source: string,
  payload: unknown,
): ExtractedKey {
  if (!payload || typeof payload !== 'object') return NONE;
  const p = payload as Payload;
  switch (source) {
    case 'trafft':
      return extractTrafft(p);
    case 'stripe-payment':
      return extractStripe(p);
    case 'course-recap':
      return extractCourseRecap(p);
    case 'contact-form':
      return extractContactForm(p);
    case 'zoom-class':
      return extractZoomClass(p);
    case 'chaos':
      return extractChaos(p);
    case 'form-submitted':
      return extractFormSubmitted(p);
    case 'cnpc-coaching-intake':
      return extractCnpcCoachingIntake(p);
    default:
      return NONE;
  }
}

/**
 * CNPC Gravity Forms intake. n8n must preserve one stable submission_id,
 * normally `gf:<form_id>:<entry_id>`, across all delivery retries.
 */
function extractCnpcCoachingIntake(p: Payload): ExtractedKey {
  const submissionId = asStr(p.submission_id);
  return {
    event_id: submissionId ? `cnpc:${submissionId}` : null,
    event_type: 'cnpc.intake.submitted',
  };
}

function asStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

/**
 * Trafft event types: booked, canceled, rescheduled, status_changed,
 * customer_created. n8n flattens the Trafft body and tags `event_type`.
 *
 *  booked / canceled  : one logical event per (appointmentId, event_type)
 *  rescheduled        : may fire multiple times for the same appt as the
 *                       customer moves it; include start time so each move
 *                       gets its own row.
 *  status_changed     : multiple statuses possible (approved, no_show, …);
 *                       include target status.
 *  customer_created   : one per customer.
 */
function extractTrafft(p: Payload): ExtractedKey {
  const event_type = asStr(p.event_type);
  const apptId = asStr(p.appointmentId);
  const custId = asStr(p.customerId);

  if (event_type === 'customer_created' && custId) {
    return { event_id: `cust:${custId}:created`, event_type };
  }
  if (event_type === 'status_changed' && apptId) {
    const status = asStr(p.status) ?? asStr(p.appointmentStatus) ?? 'unknown';
    return { event_id: `appt:${apptId}:status:${status}`, event_type };
  }
  if (event_type === 'rescheduled' && apptId) {
    const start =
      asStr(p.bookingStart) ??
      asStr(p.appointmentStart) ??
      asStr(p.start_date_time) ??
      asStr(p.appointmentStartDateTime) ??
      '';
    return { event_id: `appt:${apptId}:rescheduled:${start}`, event_type };
  }
  if ((event_type === 'booked' || event_type === 'canceled') && apptId) {
    return { event_id: `appt:${apptId}:${event_type}`, event_type };
  }
  return { event_id: null, event_type };
}

/**
 * Stripe: n8n sanitizes to {stripe_id, event_type} where stripe_id is the
 * payment_intent / checkout_session id (pi_* or cs_*). Multiple event types
 * can fire for the same pi_* (e.g. payment_intent.succeeded after
 * checkout.session.completed), so the key spans (id, type).
 */
function extractStripe(p: Payload): ExtractedKey {
  const stripe_id = asStr(p.stripe_id);
  const event_type = asStr(p.event_type);
  const provider_event_id = asStr(p.event_id);
  const refund_id = asStr(p.refund_id);
  if (provider_event_id && event_type) {
    const suffix = refund_id ? `:${refund_id}` : '';
    return {
      event_id: `stripe:${provider_event_id}${suffix}`,
      event_type,
    };
  }
  if (stripe_id && event_type) {
    return { event_id: `stripe:${stripe_id}:${event_type}`, event_type };
  }
  return { event_id: null, event_type };
}

/**
 * Course recap: payload has {enrich_dir, transcript_note, summary_file}.
 * transcript_note is the canonical per-session identifier when present;
 * fall back to summary_file path. Both are unique per meeting.
 */
function extractCourseRecap(p: Payload): ExtractedKey {
  const key = asStr(p.transcript_note) ?? asStr(p.summary_file);
  return {
    event_id: key ? `recap:${key}` : null,
    event_type: 'session-recap',
  };
}

/**
 * GravityForms: n8n's contact-form workflow strips the GF entry_id before
 * forwarding; we only see {name, email, company, message, submitted_at}.
 * Returning null disables idempotency — duplicate form submissions are
 * legitimate (people resubmit) and there's no stable provider key.
 *
 * TODO: ask n8n to forward GF entry_id so we can dedup intentional retries.
 */
function extractContactForm(_p: Payload): ExtractedKey {
  return { event_id: null, event_type: 'lead-submission' };
}

/**
 * Zoom recording.completed — n8n forwards the Zoom envelope verbatim
 * ({ event, payload: { account_id, object: { uuid, ... } } }), so the
 * recording UUID lives at p.payload.object.uuid. The recording UUID is
 * stable per recording and survives Zoom's at-least-once redelivery,
 * so it's the right idempotency key for the push-mode sweeper lane.
 */
/**
 * Chaos verified-visitor event id. Exported so the push path (extractChaos)
 * and the reconciler sweep path (chaos-reconciler.ts) build a byte-identical
 * key — a JSON-number visitor_id and a jq-emitted string visitor_id must
 * collapse to the same string or the reaper's event_id dedup would not fire.
 */
export function chaosVisitorEventId(visitorId: unknown): string | null {
  const n = Math.trunc(Number(visitorId));
  return Number.isFinite(n) && n > 0 ? `chaos:visitor:${n}:verified` : null;
}

const CHAOS_EVENT_TYPES = new Set([
  'form_contact',
  'form_lead_magnet',
  'form_newsletter',
  'verified',
]);

/**
 * Chaos: a verified website visitor pushed via Chaos forward queue → n8n.
 * Payload carries visitor_id (int) and form_event_type (string|null). The
 * idempotency key is per visitor — a visitor verifies exactly once — so a
 * re-delivered forward row collapses to the same event_id. event_type is the
 * form category, coerced to 'verified' when absent or unrecognized.
 */
function extractChaos(p: Payload): ExtractedKey {
  const event_id = chaosVisitorEventId(p.visitor_id);
  const raw = asStr(p.form_event_type) ?? 'verified';
  const event_type = CHAOS_EVENT_TYPES.has(raw) ? raw : 'verified';
  return { event_id, event_type };
}

/**
 * Generic form-submitted (chaos-tracker "any form was submitted" pipe).
 * Chaos-tracker mints a fresh submission_id per click, so a triple-click sends
 * three envelopes with three distinct submission_ids — keying on submission_id
 * alone would not dedup them. The user-intent key is (visitor, form, minute):
 * the same visitor hitting the same form within a minute is one logical
 * submission. The minute bucket is UTC, computed from received_at if present
 * else now(); a submission landing across a minute boundary at most causes one
 * extra row, which is acceptable.
 */
function extractFormSubmitted(p: Payload): ExtractedKey {
  const visitor = asStr(p.visitor_id);
  const subtype =
    asStr(p.form_event_subtype) ?? asStr(p.form_page) ?? 'unknown';
  if (!visitor) return { event_id: null, event_type: 'form-submitted' };
  const tsRaw = asStr(p.received_at) ?? asStr(p.submitted_at);
  const ms = tsRaw ? Date.parse(tsRaw) : Date.now();
  const bucket = Math.floor((Number.isFinite(ms) ? ms : Date.now()) / 60000);
  return {
    event_id: `form:${visitor}:${subtype}:${bucket}`,
    event_type: 'form-submitted',
  };
}

function extractZoomClass(p: Payload): ExtractedKey {
  const inner =
    p.payload && typeof p.payload === 'object' ? (p.payload as Payload) : p;
  const obj =
    inner.object && typeof inner.object === 'object'
      ? (inner.object as Payload)
      : null;
  const uuid = asStr(obj?.uuid ?? null);
  const event_type =
    asStr(p.event) ?? asStr(inner.event) ?? 'recording.completed';
  return uuid
    ? { event_id: `recording:${uuid}`, event_type }
    : { event_id: null, event_type };
}
