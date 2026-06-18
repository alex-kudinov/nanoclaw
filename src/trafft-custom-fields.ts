/*
 * Trafft webhook custom-field extraction.
 *
 * Trafft delivers an appointment's booking-form answers as PHP-style bracket
 * keys flattened onto the top-level webhook payload, e.g.
 *   "customFields[0][label]": "What would you like to discuss?"
 *   "customFields[0][value]": "Scheduling a Session - PCC Exam Review"
 *   "customFieldItems[What would you like to discuss?]": "Scheduling a Session…"
 * The Trafft v2 API does NOT expose these (list/detail/bookings endpoints all
 * omit them — verified: /appointments/{id} → 405, ?customFields → rejected),
 * so the webhook payload is the only source. The host stored the whole payload
 * in interaction metadata.raw_payload but never parsed these keys, so the
 * booking notification and the booking→sales handoff dropped the customer's
 * stated reason ("discuss") and acquisition source ("how did you learn").
 *
 * Only `customFields[...]` / `customFieldItems[...]` are APPOINTMENT fields.
 * `customerCustomFields[...]` / `customerCustomFieldItems[...]` (on
 * customer_created events) are customer-PROFILE fields and are ignored here.
 */

export interface TrafftCustomField {
  label: string;
  value: string;
}

export interface ClassifiedCustomFields {
  /** "What would you like to discuss?" — the booking reason. */
  reason?: TrafftCustomField;
  /** "How did you learn about Tandem?" — the acquisition source. */
  source?: TrafftCustomField;
  /** Any custom field that is neither reason nor source. */
  other: TrafftCustomField[];
}

const INDEXED_LABEL = /^customFields\[(\d+)\]\[label\]$/;
const INDEXED_VALUE = /^customFields\[(\d+)\]\[value\]$/;
const ITEM = /^customFieldItems\[(.+)\]$/;

function str(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/** Collect the indexed `customFields[N][label]/[value]` pairs, ordered by N. */
function indexedPairs(p: Record<string, unknown>): TrafftCustomField[] {
  const byIndex = new Map<number, { label?: string; value?: string }>();
  const slot = (i: string) => byIndex.get(Number(i)) ?? {};
  for (const [k, v] of Object.entries(p)) {
    const ml = INDEXED_LABEL.exec(k);
    if (ml) {
      byIndex.set(Number(ml[1]), { ...slot(ml[1]), label: str(v) });
      continue;
    }
    const mv = INDEXED_VALUE.exec(k);
    if (mv) byIndex.set(Number(mv[1]), { ...slot(mv[1]), value: str(v) });
  }
  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, e]) => ({ label: e.label ?? '', value: e.value ?? '' }))
    .filter((f) => f.label);
}

/**
 * Parse APPOINTMENT custom fields from a flat Trafft webhook payload.
 * Prefers the ordered indexed form; fills gaps from `customFieldItems[label]`.
 * Deduplicates by label (case-insensitive); skips empty labels.
 */
export function extractTrafftCustomFields(
  payload: unknown,
): TrafftCustomField[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  const out: TrafftCustomField[] = [];
  const seen = new Set<string>();
  const push = (label: string, value: string) => {
    const key = label.toLowerCase();
    if (!label || seen.has(key)) return;
    seen.add(key);
    out.push({ label, value });
  };

  for (const f of indexedPairs(p)) push(f.label, f.value);
  for (const [k, v] of Object.entries(p)) {
    const m = ITEM.exec(k);
    if (m) push(str(m[1]), str(v));
  }
  return out;
}

const REASON_RE = /discuss|reason|help|topic|interest|goal|\bneed/i;
const SOURCE_RE =
  /how did you|hear|learn about|find us|found us|source|referr/i;

/**
 * Internal/hidden Trafft custom fields that must never surface in a channel
 * posting. "Tandem Customer ID" carries the Chaos fingerprint (cid) the
 * tandemcoach.co booking-link decoration writes; "cid" is the bare-label form
 * used by older configs and unit fixtures. These are plumbing, not customer
 * answers — chaos-booking.ts consumes them; the operator-facing notice must not.
 */
export const INTERNAL_FIELD_LABELS = ['tandem customer id', 'cid'];

/** True when a custom-field label is internal plumbing, not a customer answer. */
export function isInternalCustomField(label: string): boolean {
  return INTERNAL_FIELD_LABELS.includes(label.trim().toLowerCase());
}

/**
 * Split customer-facing custom fields into reason / source / other by label
 * semantics. Internal fields (see INTERNAL_FIELD_LABELS) are dropped entirely so
 * they never leak into a posting; `other` carries every remaining custom field,
 * so a new booking-form question shows up automatically without a code change.
 */
export function classifyCustomFields(
  fields: TrafftCustomField[],
): ClassifiedCustomFields {
  let reason: TrafftCustomField | undefined;
  let source: TrafftCustomField | undefined;
  const other: TrafftCustomField[] = [];
  for (const f of fields) {
    if (isInternalCustomField(f.label)) continue;
    if (!source && SOURCE_RE.test(f.label)) source = f;
    else if (!reason && REASON_RE.test(f.label)) reason = f;
    else other.push(f);
  }
  return { reason, source, other };
}
