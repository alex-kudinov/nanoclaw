/**
 * Postgres-backed store for proposal_followups (business_v2). Runs as the host
 * admin role, so it writes the base table directly (container agents cannot).
 * SQL is isolated here; the orchestration logic in proposal-followup.ts depends
 * only on the FollowupStore / approval interfaces.
 */

import { query } from './business-db.js';
import { PROPOSAL_FOLLOWUP_CHANNEL_JID } from './config.js';
import type {
  DraftRecord,
  FollowupState,
  FollowupStore,
  PendingDraft,
  SuppressionRecord,
} from './proposal-followup.js';

interface StateRow {
  sequence_no: number;
  status: string;
  sent_at: Date | null;
}

// Sentinel sequence number used to record a proposal-level auto-cancel.
const CLOSEOUT_SEQUENCE = 5;

export function computeState(rows: StateRow[]): FollowupState {
  let lastSentSequence = 0;
  let firstFollowupAt: Date | null = null;
  let lastSentAt: Date | null = null;
  let hasPendingApproval = false;
  let closedOut = false;
  const existingSequences = new Set<number>();
  for (const r of rows) {
    existingSequences.add(r.sequence_no);
    if (r.status === 'pending_approval') hasPendingApproval = true;
    if (r.status === 'cancelled') closedOut = true;
    if (r.status === 'sent') {
      if (r.sequence_no > lastSentSequence) lastSentSequence = r.sequence_no;
      if (r.sequence_no === 1 && r.sent_at) firstFollowupAt = r.sent_at;
      if (r.sent_at && (!lastSentAt || r.sent_at > lastSentAt)) {
        lastSentAt = r.sent_at;
      }
    }
  }
  return {
    lastSentSequence,
    firstFollowupAt,
    lastSentAt,
    hasPendingApproval,
    closedOut,
    existingSequences,
  };
}

export const pgFollowupStore: FollowupStore = {
  async getState(proposalId: string): Promise<FollowupState> {
    const res = await query<StateRow>(
      `SELECT sequence_no, status, sent_at
         FROM business_v2.proposal_followups
        WHERE proposal_plutio_id = $1`,
      [proposalId],
    );
    return computeState(res.rows);
  },

  async recordDraft(d: DraftRecord): Promise<void> {
    await query(
      `INSERT INTO business_v2.proposal_followups
         (proposal_plutio_id, proposal_number, sequence_no, recipient_email,
          recipient_name, party_id, subject, body, proposal_url,
          slack_channel, slack_ts, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending_approval')
       ON CONFLICT (proposal_plutio_id, sequence_no) DO NOTHING`,
      [
        d.proposalId,
        d.proposalNumber,
        d.sequence,
        d.recipientEmail,
        d.recipientName,
        d.partyId,
        d.subject,
        d.body,
        d.url,
        PROPOSAL_FOLLOWUP_CHANNEL_JID,
        d.slackTs,
      ],
    );
  },

  async recordCloseout(proposalId: string): Promise<void> {
    await query(
      `INSERT INTO business_v2.proposal_followups
         (proposal_plutio_id, sequence_no, subject, body, status, sent_at)
       VALUES ($1, $2, '[closeout]',
               'auto-cancelled: no response after the full follow-up cadence',
               'cancelled', NOW())
       ON CONFLICT (proposal_plutio_id, sequence_no) DO NOTHING`,
      [proposalId, CLOSEOUT_SEQUENCE],
    );
  },

  async expireStale(days: number): Promise<number> {
    const res = await query(
      `UPDATE business_v2.proposal_followups
          SET status = 'expired'
        WHERE status = 'pending_approval'
          AND created_at < NOW() - make_interval(days => $1)`,
      [days],
    );
    return res.rowCount ?? 0;
  },

  async recordSuppression(s: SuppressionRecord): Promise<void> {
    // Upsert keyed by proposal so a signed/declined proposal stops being
    // refreshed and ages out of the de-dup window (view uses last_seen_open_at).
    await query(
      `INSERT INTO business_v2.email_followup_suppressions
         (proposal_plutio_id, party_id, email, reason, last_seen_open_at)
       VALUES ($1, $2, $3, 'open_proposal', NOW())
       ON CONFLICT (proposal_plutio_id) DO UPDATE
         SET party_id = EXCLUDED.party_id,
             email = EXCLUDED.email,
             last_seen_open_at = NOW()`,
      [s.proposalId, s.partyId, s.email || null],
    );
  },
};

/** Look up a pending draft by the Slack ts a ✅ landed on. */
export async function getPendingByTs(
  slackTs: string,
): Promise<PendingDraft | null> {
  const res = await query<{
    id: number;
    proposal_plutio_id: string;
    sequence_no: number;
    recipient_email: string;
    subject: string;
    body: string;
    party_id: number | null;
    thread_id: string | null;
  }>(
    `SELECT id, proposal_plutio_id, sequence_no, recipient_email,
            subject, body, party_id, thread_id
       FROM business_v2.proposal_followups
      WHERE slack_ts = $1 AND status = 'pending_approval'
      LIMIT 1`,
    [slackTs],
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    proposalId: r.proposal_plutio_id,
    sequence: r.sequence_no,
    recipientEmail: r.recipient_email,
    subject: r.subject,
    body: r.body,
    partyId: r.party_id,
    threadId: r.thread_id,
  };
}

/** Mark a pending draft cancelled (operator 👎-skipped it). */
export async function markCancelled(id: number): Promise<void> {
  await query(
    `UPDATE business_v2.proposal_followups
        SET status = 'cancelled'
      WHERE id = $1 AND status = 'pending_approval'`,
    [id],
  );
}

/** Mark a draft sent after the email goes out (stores Gmail ids for reply match). */
export async function markSent(
  id: number,
  messageId: string,
  threadId?: string,
): Promise<void> {
  await query(
    `UPDATE business_v2.proposal_followups
        SET status = 'sent', sent_at = NOW(),
            gmail_message_id = $2, thread_id = $3
      WHERE id = $1`,
    [id, messageId || null, threadId || null],
  );
}
