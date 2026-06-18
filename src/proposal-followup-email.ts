/**
 * Per-touch customized follow-up email copy, generated via the Claude Print
 * Bridge. Each touch has a distinct angle (see proposal-followup-cadence.ts);
 * the bridge writes a fresh subject + body in Tandem's voice rather than a
 * fill-in-the-blank template.
 */

import { bridgePrint, type BridgePrintOptions } from './claude-bridge.js';
import { PROPOSAL_FOLLOWUP_SENDER } from './config.js';
import type { TouchMeta } from './proposal-followup-cadence.js';

export interface EmailContext {
  firstName: string;
  touch: TouchMeta;
  proposalTitle: string;
  proposalUrl: string;
  sender?: string;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
}

const DEFAULT_SUBJECT = 'Re: Your Tandem Coaching proposal';

// Phrases that read as AI/boilerplate — kept out of client-facing copy.
const BANNED =
  'I hope this email finds you well, just circling back, just checking in, ' +
  'I wanted to reach out, per my last email, touching base, as per, ' +
  'I hope you are doing well, reaching out to follow up';

export function buildEmailPrompt(ctx: EmailContext): string {
  const sender = ctx.sender || PROPOSAL_FOLLOWUP_SENDER;
  return [
    `Write a short follow-up email to ${ctx.firstName} about an open coaching proposal ("${ctx.proposalTitle}") from Tandem Coaching that they have not yet signed.`,
    '',
    `This is follow-up #${ctx.touch.sequence} of 4. Angle for THIS email: ${ctx.touch.angle}`,
    '',
    'Rules:',
    `- Greet by first name ("Hi ${ctx.firstName},").`,
    '- Warm, direct, human, peer-to-peer. Under 130 words.',
    `- Exactly one call to action: link them to the proposal so they can read it and sign. Use this exact URL: ${ctx.proposalUrl}`,
    `- Sign off as ${sender}.`,
    `- Never use these phrases or anything like them: ${BANNED}.`,
    '- No marketing fluff, no emoji, no exclamation-point hype.',
    ctx.touch.sequence === 4
      ? '- This is the final email: be gracious, assume the timing may be wrong, and leave the door open without guilt-tripping.'
      : '- Make it easy to reply with a question or a yes.',
    '',
    'Return ONLY strict JSON, no prose, no code fence:',
    '{"subject": "...", "body": "..."}',
    'The subject should be a natural reply subject. The body is plain text with real line breaks (\\n).',
  ].join('\n');
}

/** Extract {subject, body} from the model output; fall back gracefully. */
export function parseEmailResponse(raw: string): GeneratedEmail {
  const text = (raw || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(
        text.slice(start, end + 1),
      ) as Partial<GeneratedEmail>;
      const body = typeof obj.body === 'string' ? obj.body.trim() : '';
      if (body) {
        const subject =
          typeof obj.subject === 'string' && obj.subject.trim()
            ? obj.subject.trim()
            : DEFAULT_SUBJECT;
        return { subject, body };
      }
    } catch {
      // fall through to raw-text fallback
    }
  }
  // Last resort: treat the whole output as the body (human reviews before send).
  return { subject: DEFAULT_SUBJECT, body: text };
}

type PrintFn = (opts: BridgePrintOptions) => Promise<string>;

export async function generateFollowupEmail(
  ctx: EmailContext,
  print: PrintFn = bridgePrint,
): Promise<GeneratedEmail> {
  const raw = await print({
    prompt: buildEmailPrompt(ctx),
    model: 'sonnet',
    meta: {
      minion: 'proposal-followup',
      action: `touch-${ctx.touch.sequence}`,
    },
  });
  return parseEmailResponse(raw);
}
