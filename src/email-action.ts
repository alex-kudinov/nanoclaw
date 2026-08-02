import crypto from 'crypto';

export const EMAIL_ACTION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EmailActionState =
  | 'approved'
  | 'handoff_routed'
  | 'mailman_started'
  | 'executing'
  | 'confirmed'
  | 'blocked'
  | 'uncertain'
  | 'attention_required';

export interface EmailActionIdentity {
  actionId: string;
  approvedContentSha256?: string;
}

/**
 * Bind the exact operator-approved subject and body. Length prefixes make the
 * encoding unambiguous even when either field contains newlines or NUL-like
 * text. The body is the parsed sendable body, not the surrounding Slack card.
 */
export function hashApprovedEmailContent(
  subject: string,
  body: string,
): string {
  return crypto
    .createHash('sha256')
    .update(String(Buffer.byteLength(subject, 'utf8')))
    .update('\0')
    .update(subject)
    .update('\0')
    .update(String(Buffer.byteLength(body, 'utf8')))
    .update('\0')
    .update(body)
    .digest('hex');
}

export function newEmailActionId(): string {
  return crypto.randomUUID();
}

export function isEmailActionId(value: string | undefined): value is string {
  return Boolean(value && EMAIL_ACTION_ID_RE.test(value));
}
