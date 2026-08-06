/**
 * Model-authored completion recaps are never approval evidence. Card-posting
 * groups already expose the real card (or a host rejection) in Slack; a second
 * "posted / awaiting approval" line can only duplicate that state or, after a
 * rejection, falsely claim success.
 */
export function isApprovalCardSuccessRecap(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length > 500) return false;
  // A blocked or questioning turn is operator-visible progress, even when it
  // repeats words such as "draft" and "awaiting approval". Only suppress a
  // positive completion recap; never infer success through a negation.
  if (
    normalized.includes('?') ||
    /\bstill\b/i.test(normalized) ||
    /\b(?:not|cannot|can't|could not|couldn't|failed|failure|error|blocked|held|missing|nothing|waiting on|unable|needs? confirmation)\b/i.test(
      normalized,
    )
  ) {
    return false;
  }
  return /^(?=.*\b(?:draft|review card)\b)(?=.*\b(?:posted|ready|updated)\b)(?=.*\bawaiting approval\b).+$/i.test(
    normalized,
  );
}
