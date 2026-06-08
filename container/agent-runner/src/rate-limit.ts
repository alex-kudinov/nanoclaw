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
