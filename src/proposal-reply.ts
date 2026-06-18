/**
 * Inbound proposal-reply processor (host-side, approval-gated).
 *
 * When a client replies to a proposal follow-up, classify the intent (bridge):
 *  - declined  → post a 👍/👎 card to #gru-sales; 👍 sets Plutio = declined +
 *                stops follow-ups. (Gated: an intent misread must not silently
 *                kill a live deal.)
 *  - accepted  → stop follow-ups + post a "confirm/sign in Plutio" notice.
 *  - question / other → do nothing; the email flows through the normal pipeline.
 *
 * Side effects are injected so the logic is unit-testable without Gmail, the
 * bridge, Postgres, Plutio, or Slack. Wiring lives in index.ts.
 */

import { bridgePrint, type BridgePrintOptions } from './claude-bridge.js';

export type ReplyIntent = 'declined' | 'accepted' | 'question' | 'other';

export interface ReplyCandidate {
  proposalId: string;
  number: string;
  subject: string;
  recipientEmail: string;
  partyId: number | null;
  threadId: string | null;
}

export interface ReplyClassification {
  intent: ReplyIntent;
  proposalId: string | null;
}

export interface PendingAction {
  id: number;
  proposalId: string;
  proposalNumber: string;
  recipientEmail: string;
  partyId: number | null;
}

function snippet(body: string, max = 160): string {
  const s = (body || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export function buildClassifyPrompt(
  body: string,
  candidates: ReplyCandidate[],
): string {
  const list = candidates
    .map(
      (c) => `- id=${c.proposalId} number=${c.number} subject="${c.subject}"`,
    )
    .join('\n');
  return [
    'A client replied to a follow-up about a coaching proposal. Classify their intent.',
    '',
    'Open proposals we follow up with them on:',
    list,
    '',
    'Their reply:',
    '"""',
    snippet(body, 1500),
    '"""',
    '',
    'intent is exactly one of:',
    '- declined = they will NOT proceed / passing / not moving forward.',
    '- accepted = they clearly agree to proceed / move forward / sign.',
    '- question = they ask something or raise a condition (e.g. want a discount, more info) — NOT a final yes/no.',
    '- other = unrelated, auto-reply, out of office.',
    'If declined or accepted AND you can tell which proposal it concerns, set proposalId to that id; otherwise null.',
    '',
    'Return ONLY strict JSON: {"intent":"...","proposalId":"..."|null}',
  ].join('\n');
}

const VALID_INTENTS: ReplyIntent[] = [
  'declined',
  'accepted',
  'question',
  'other',
];

export function parseClassification(raw: string): ReplyClassification {
  const text = (raw || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1)) as {
        intent?: string;
        proposalId?: string | null;
      };
      const intent = VALID_INTENTS.includes(obj.intent as ReplyIntent)
        ? (obj.intent as ReplyIntent)
        : 'other';
      const proposalId =
        typeof obj.proposalId === 'string' && obj.proposalId.trim()
          ? obj.proposalId.trim()
          : null;
      return { intent, proposalId };
    } catch {
      // fall through
    }
  }
  return { intent: 'other', proposalId: null };
}

type PrintFn = (opts: BridgePrintOptions) => Promise<string>;

export async function classifyReply(
  body: string,
  candidates: ReplyCandidate[],
  print: PrintFn = bridgePrint,
): Promise<ReplyClassification> {
  const raw = await print({
    prompt: buildClassifyPrompt(body, candidates),
    model: 'sonnet',
    meta: { minion: 'proposal-reply', action: 'classify' },
  });
  return parseClassification(raw);
}

/** Resolve which candidate a reply concerns: thread match → model pick → sole. */
export function pickProposal(
  candidates: ReplyCandidate[],
  inboundThreadId: string | undefined,
  cls: ReplyClassification,
): ReplyCandidate | null {
  if (inboundThreadId) {
    const m = candidates.find(
      (c) => c.threadId && c.threadId === inboundThreadId,
    );
    if (m) return m;
  }
  if (cls.proposalId) {
    const m = candidates.find((c) => c.proposalId === cls.proposalId);
    if (m) return m;
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export function buildDeclineCard(c: ReplyCandidate, body: string): string {
  return [
    `📭 *Likely decline* — ${c.recipientEmail} replied re: ${c.number}`,
    `> ${snippet(body)}`,
    '_React ✅ to set Plutio = declined + stop follow-ups, or 👎 to ignore._',
  ].join('\n');
}

export function buildAcceptNotice(c: ReplyCandidate): string {
  return [
    `🎉 *Likely acceptance* — ${c.recipientEmail} replied re: ${c.number}.`,
    'Stopped follow-ups. Confirm and get it signed in Plutio.',
  ].join('\n');
}

export interface InboundReplyDeps {
  findCandidates(senderEmail: string): Promise<ReplyCandidate[]>;
  classify(
    body: string,
    candidates: ReplyCandidate[],
  ): Promise<ReplyClassification>;
  hasOpenAction(proposalId: string): Promise<boolean>;
  recordDeclineAction(
    c: ReplyCandidate,
    summary: string,
    slackTs: string,
  ): Promise<void>;
  stopFollowups(proposalId: string, reason: string): Promise<void>;
  postCard(text: string): Promise<string | undefined>;
  postNotice(text: string): Promise<void>;
}

export type ReplyOutcome =
  | 'none'
  | 'declined-carded'
  | 'accepted'
  | 'ambiguous'
  | 'already-actioned';

/**
 * Decide and act on an inbound reply. Never throws to the caller path; returns
 * an outcome for logging. Does NOT swallow the email — the normal inbound
 * pipeline still runs so a human can reply.
 */
export async function handleInboundReply(
  input: { senderEmail: string; threadId?: string; body: string },
  deps: InboundReplyDeps,
): Promise<ReplyOutcome> {
  const candidates = await deps.findCandidates(input.senderEmail);
  if (candidates.length === 0) return 'none';

  const cls = await deps.classify(input.body, candidates);
  if (cls.intent !== 'declined' && cls.intent !== 'accepted') return 'none';

  const proposal = pickProposal(candidates, input.threadId, cls);
  if (!proposal) {
    await deps.postNotice(
      `⚠️ ${input.senderEmail} replied (looks like ${cls.intent}) but has ${candidates.length} open proposals (${candidates
        .map((c) => c.number)
        .join(', ')}). Handle manually.`,
    );
    return 'ambiguous';
  }

  if (cls.intent === 'accepted') {
    await deps.stopFollowups(
      proposal.proposalId,
      'client accepted by email; awaiting signature',
    );
    await deps.postNotice(buildAcceptNotice(proposal));
    return 'accepted';
  }

  // declined
  if (await deps.hasOpenAction(proposal.proposalId)) return 'already-actioned';
  const ts = await deps.postCard(buildDeclineCard(proposal, input.body));
  if (!ts) return 'declined-carded';
  await deps.recordDeclineAction(proposal, snippet(input.body), ts);
  return 'declined-carded';
}
