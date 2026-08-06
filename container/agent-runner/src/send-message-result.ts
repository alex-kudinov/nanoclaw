const APPROVAL_CARD_MARKER =
  /^\s*\[(?:SALES REVIEW|CLIENT SUPPORT REVIEW|SUPPORT-DRAFT|FOLLOW-UP\s+#\d+)\]/m;

export function queuedMessageResult(
  text: string,
  targetGroup?: string,
): string {
  if (APPROVAL_CARD_MARKER.test(text)) {
    return 'Approval card submitted for host validation. This is not confirmation that it was posted. Do not claim it is awaiting approval; if the host rejects it, correct and repost the full card.';
  }
  if (targetGroup) return `Message sent to ${targetGroup}.`;
  return 'Message sent.';
}
