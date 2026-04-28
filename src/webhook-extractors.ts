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

export function extractEventKey(source: string, payload: unknown): ExtractedKey {
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
    default:
      return NONE;
  }
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
