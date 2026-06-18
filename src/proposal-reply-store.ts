/**
 * Postgres store for the inbound proposal-reply processor (business_v2). Runs as
 * the host admin role. SQL is isolated here; proposal-reply.ts / -actions.ts
 * depend only on the injected interfaces.
 */

import { query } from './business-db.js';
import type { PendingAction, ReplyCandidate } from './proposal-reply.js';

// Sentinel sequence used to stop a proposal's follow-ups (shared with closeout).
const STOP_SEQUENCE = 5;

interface CandidateRow {
  proposal_plutio_id: string;
  proposal_number: string;
  subject: string;
  recipient_email: string;
  party_id: number | null;
  thread_id: string | null;
}

/** Open (sent, not closed-out) proposals we follow up with this sender on. */
export async function findReplyCandidates(
  senderEmail: string,
): Promise<ReplyCandidate[]> {
  const res = await query<CandidateRow>(
    `SELECT DISTINCT ON (pf.proposal_plutio_id)
            pf.proposal_plutio_id, pf.proposal_number, pf.subject,
            pf.recipient_email, pf.party_id, pf.thread_id
       FROM business_v2.proposal_followups pf
      WHERE lower(pf.recipient_email) = lower($1)
        AND EXISTS (SELECT 1 FROM business_v2.proposal_followups s
                     WHERE s.proposal_plutio_id = pf.proposal_plutio_id
                       AND s.status = 'sent')
        AND NOT EXISTS (SELECT 1 FROM business_v2.proposal_followups c
                     WHERE c.proposal_plutio_id = pf.proposal_plutio_id
                       AND c.status = 'cancelled')
      ORDER BY pf.proposal_plutio_id, pf.sequence_no DESC`,
    [senderEmail],
  );
  return res.rows.map((r) => ({
    proposalId: r.proposal_plutio_id,
    number: r.proposal_number,
    subject: r.subject,
    recipientEmail: r.recipient_email,
    partyId: r.party_id,
    threadId: r.thread_id,
  }));
}

export async function hasOpenAction(proposalId: string): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM business_v2.proposal_actions
      WHERE proposal_plutio_id = $1 AND status IN ('pending', 'done') LIMIT 1`,
    [proposalId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function recordDeclineAction(
  c: ReplyCandidate,
  summary: string,
  slackTs: string,
): Promise<void> {
  await query(
    `INSERT INTO business_v2.proposal_actions
       (proposal_plutio_id, proposal_number, action, recipient_email,
        party_id, reply_summary, slack_ts, status)
     VALUES ($1, $2, 'decline', $3, $4, $5, $6, 'pending')`,
    [c.proposalId, c.number, c.recipientEmail, c.partyId, summary, slackTs],
  );
}

export async function getActionByTs(
  slackTs: string,
): Promise<PendingAction | null> {
  const res = await query<{
    id: number;
    proposal_plutio_id: string;
    proposal_number: string;
    recipient_email: string;
    party_id: number | null;
  }>(
    `SELECT id, proposal_plutio_id, proposal_number, recipient_email, party_id
       FROM business_v2.proposal_actions
      WHERE slack_ts = $1 AND status = 'pending' LIMIT 1`,
    [slackTs],
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    proposalId: r.proposal_plutio_id,
    proposalNumber: r.proposal_number,
    recipientEmail: r.recipient_email,
    partyId: r.party_id,
  };
}

export async function markActionDone(id: number): Promise<void> {
  await query(
    `UPDATE business_v2.proposal_actions
        SET status = 'done', resolved_at = NOW()
      WHERE id = $1 AND status = 'pending'`,
    [id],
  );
}

export async function markActionDismissed(id: number): Promise<void> {
  await query(
    `UPDATE business_v2.proposal_actions
        SET status = 'dismissed', resolved_at = NOW()
      WHERE id = $1 AND status = 'pending'`,
    [id],
  );
}

/** Stop a proposal's follow-ups by writing the cancelled closeout sentinel. */
export async function stopFollowups(
  proposalId: string,
  reason: string,
): Promise<void> {
  await query(
    `INSERT INTO business_v2.proposal_followups
       (proposal_plutio_id, sequence_no, subject, body, status, sent_at)
     VALUES ($1, $2, '[closeout]', $3, 'cancelled', NOW())
     ON CONFLICT (proposal_plutio_id, sequence_no) DO NOTHING`,
    [proposalId, STOP_SEQUENCE, reason],
  );
}
