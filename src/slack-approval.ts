/**
 * Reaction/text approval normalization (shared, pure).
 *
 * A check-mark reaction (✅ ☑️ ✔️) on a Mr Gru message, or a message whose whole
 * body is just a check-mark, is treated as approval across every Slack channel.
 * slack.ts wires the events; this module holds the (testable) logic.
 */

/**
 * Slack reaction names that count as approval. Includes 👍 (`+1`/`thumbsup`) —
 * it is Slack's default one-click reaction, so the operator reaches for it first.
 */
export const CHECK_REACTIONS = new Set([
  'white_check_mark',
  'heavy_check_mark',
  'ballot_box_with_check',
  '+1', // 👍 — Slack's canonical name for thumbs up
  'thumbsup', // alias some clients send
]);

export function isCheckReaction(name: string): boolean {
  // Strip a skin-tone modifier (e.g. "+1::skin-tone-3") so 👍🏽 still counts.
  return CHECK_REACTIONS.has(name.replace(/::skin-tone-\d/, ''));
}

/** 👎 reaction names — used as an explicit "skip this" signal on a draft. */
export const THUMBS_DOWN_REACTIONS = new Set(['-1', 'thumbsdown']);

export function isThumbsDownReaction(name: string): boolean {
  return THUMBS_DOWN_REACTIONS.has(name.replace(/::skin-tone-\d/, ''));
}

// Unicode + :shortcode: forms of the approval marks (check-marks + thumbs up).
const CHECK_TOKENS = [
  '✅',
  '✔️',
  '✔',
  '☑️',
  '☑',
  '👍',
  ':white_check_mark:',
  ':heavy_check_mark:',
  ':ballot_box_with_check:',
  ':+1:',
  ':thumbsup:',
];

/** True when a message body is nothing but check-mark(s) — a bare approval. */
export function isApprovalOnlyText(text: string): boolean {
  let t = (text || '').trim();
  if (!t) return false;
  for (const tok of CHECK_TOKENS) t = t.split(tok).join('');
  return t.trim().length === 0;
}

/**
 * Host-action approval must be an unambiguous whole message. Free-form text is
 * left to the agent as feedback; only a bare check mark or exactly "Approved"
 * (with optional terminal punctuation) enters the host approval listeners.
 */
export function isExplicitApprovalText(text: string): boolean {
  return (
    isApprovalOnlyText(text) || /^\s*approved\s*[.!]?\s*$/i.test(text || '')
  );
}

/**
 * Decide which thread a reaction-approval should route into.
 *
 * A `reaction_added` event carries only the reacted message's own ts. Using that
 * as the injected message's `thread_ts` keys a fresh, EMPTY session (`group||<ts>`)
 * and the agent loses everything said before the reaction — e.g. a certificate
 * request made just before the operator 👍'd the email-lookup prompt. Instead we
 * resume the thread the reacted message actually lives in, taken from its stored
 * row: `undefined` (root) for a top-level message — which resumes the root
 * session that produced it, where the pre-reaction request still lives — or the
 * parent thread for a threaded reply. Falls back to the reacted ts only when the
 * message isn't in our store (nothing better to key on).
 */
export function resolveApprovalThreadTs(
  reacted: { chat_jid: string; thread_ts?: string } | undefined,
  jid: string,
  reactedTs: string,
): string | undefined {
  if (reacted && reacted.chat_jid === jid)
    return reacted.thread_ts || undefined;
  return reactedTs;
}

/** Build the explicit, agent-unambiguous approval message body. */
export function buildApprovalContent(opts: {
  reactor?: string;
  quoted?: string;
}): string {
  const who = opts.reactor ? ` by ${opts.reactor}` : '';
  let s = `✅ Approved${who}.`;
  if (opts.quoted) {
    const q =
      opts.quoted.length > 300 ? opts.quoted.slice(0, 300) + '…' : opts.quoted;
    s += `\n\nApproved message:\n> ${q.replace(/\n/g, '\n> ')}`;
  }
  return s;
}
