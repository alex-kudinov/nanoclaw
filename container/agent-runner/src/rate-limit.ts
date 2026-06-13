// Patterns for detecting Claude Code rate-limit / usage-limit responses.
// Used to decide whether to silently retry with the next pool token instead
// of surfacing the limit message to the user as if it were an agent reply.

export const RATE_LIMIT_PATTERNS: RegExp[] = [
  /rate.?limit/i,
  /limit.?reached/i,
  /too many requests/i,
  /overloaded/i,
  /\b529\b/,
  /you'?ve hit your (usage )?limit/i,
  /usage limit reached/i,
  /resets? (at )?\d{1,2}(:\d{2})?\s*[ap]m/i,
  /resets? [a-z]{3,9}\s+\d{1,2}/i,
];

export function detectRateLimit(text: string | null | undefined): boolean {
  if (!text) return false;
  return RATE_LIMIT_PATTERNS.some((p) => p.test(text));
}

// Patterns for detecting that a credential is no longer usable — the token was
// rejected (auth), the account's billing/credit pool is exhausted, or permission
// was revoked. Distinct from a rate-limit: a rate-limited token recovers when its
// window resets, but a credential-failed token does not — so the runner rotates
// past it and, once the whole pool is dead, falls back to the Anthropic API key.
// Post-2026-06-15 the subscription Agent SDK credit pool exhausts with a
// billing_error, which lands here. Numeric codes (401/402) are deliberately NOT
// matched bare — they false-positive on text like "401(k)"; the textual error
// types ("authentication_error", "billing_error", "unauthorized") are unambiguous.
// Only evaluated on turns that already failed (see runAgent), so a successful
// reply that happens to contain these words is never misclassified.
export const AUTH_FAILURE_PATTERNS: RegExp[] = [
  /authentication_error/i,
  /\bunauthorized\b/i,
  /invalid[\s_-]?(api[\s_-]?key|token|bearer|x-api-key|credentials?)/i,
  /not logged in/i,
  /oauth[^.]{0,40}not (supported|allowed|permitted)/i,
  /billing_error/i,
  /payment required/i,
  /(insufficient|exhausted|depleted|ran out of|no remaining)[^.]{0,25}(credit|balance|funds)/i,
  /credit[\s_-]?(balance|pool)?[^.]{0,25}(exhausted|depleted|empty|insufficient|used up)/i,
  /permission_error/i,
  /does not have permission/i,
];

export function detectAuthFailure(text: string | null | undefined): boolean {
  if (!text) return false;
  return AUTH_FAILURE_PATTERNS.some((p) => p.test(text));
}
