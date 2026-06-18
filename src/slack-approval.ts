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
