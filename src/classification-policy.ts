export type ClassificationDisposition =
  | 'lead'
  | 'support'
  | 'refund_support'
  | 'contador'
  | 'procurement'
  | 'archivarista'
  | 'chief'
  | 'classify_only';

export interface ClassificationPolicyEntry {
  disposition: ClassificationDisposition;
}

/**
 * Canonical host routing policy for every label Mailman may emit.
 *
 * PostgreSQL owns the live taxonomy metadata; this map owns executable routing.
 * Migration 141 reconciles the live label set with this source. Unknown labels
 * are never dispatched as though they were valid.
 */
export const CLASSIFICATION_POLICY = Object.freeze({
  'MrGru/association/event': { disposition: 'chief' },
  'MrGru/client/active': { disposition: 'support' },
  'MrGru/client/dormant': { disposition: 'support' },
  'MrGru/financial/bill': { disposition: 'contador' },
  'MrGru/financial/receipt': { disposition: 'classify_only' },
  'MrGru/financial/refund': { disposition: 'refund_support' },
  'MrGru/internal/cofounder': { disposition: 'chief' },
  'MrGru/internal/team': { disposition: 'classify_only' },
  'MrGru/lead/declined': { disposition: 'lead' },
  'MrGru/lead/hot': { disposition: 'lead' },
  'MrGru/lead/inquiry': { disposition: 'lead' },
  'MrGru/lead/offer': { disposition: 'lead' },
  'MrGru/lead/reply': { disposition: 'lead' },
  'MrGru/legal/contract': { disposition: 'chief' },
  'MrGru/legal/nda': { disposition: 'chief' },
  'MrGru/legal/notice': { disposition: 'chief' },
  'MrGru/meeting-assets/notes': { disposition: 'archivarista' },
  'MrGru/meeting-assets/recording': { disposition: 'archivarista' },
  'MrGru/meeting-assets/zoom': { disposition: 'archivarista' },
  'MrGru/newsletter/digest': { disposition: 'classify_only' },
  'MrGru/newsletter/general': { disposition: 'classify_only' },
  'MrGru/notification/calendar': { disposition: 'classify_only' },
  'MrGru/notification/monitoring': { disposition: 'classify_only' },
  'MrGru/notification/system': { disposition: 'classify_only' },
  'MrGru/other': { disposition: 'chief' },
  'MrGru/personal': { disposition: 'chief' },
  'MrGru/procurement/rfp': { disposition: 'procurement' },
  'MrGru/procurement/rfq': { disposition: 'procurement' },
  'MrGru/recruiting/applicant': { disposition: 'chief' },
  'MrGru/recruiting/outreach': { disposition: 'classify_only' },
  'MrGru/spam': { disposition: 'classify_only' },
  'MrGru/student/support': { disposition: 'support' },
  'MrGru/vendor/cold': { disposition: 'classify_only' },
  'MrGru/vendor/warm': { disposition: 'chief' },
} satisfies Record<string, ClassificationPolicyEntry>);

export type CanonicalClassificationLabel = keyof typeof CLASSIFICATION_POLICY;

export function canonicalClassificationLabel(
  label: string,
): CanonicalClassificationLabel | null {
  const trimmed = label.trim();
  const candidate = trimmed.startsWith('MrGru/') ? trimmed : `MrGru/${trimmed}`;
  return Object.prototype.hasOwnProperty.call(CLASSIFICATION_POLICY, candidate)
    ? (candidate as CanonicalClassificationLabel)
    : null;
}

export function classificationPolicyFor(
  label: string,
):
  | (ClassificationPolicyEntry & { label: CanonicalClassificationLabel })
  | null {
  const canonical = canonicalClassificationLabel(label);
  if (!canonical) return null;
  return { label: canonical, ...CLASSIFICATION_POLICY[canonical] };
}

export const CANONICAL_CLASSIFICATION_LABELS = Object.freeze(
  Object.keys(CLASSIFICATION_POLICY).sort() as CanonicalClassificationLabel[],
);
