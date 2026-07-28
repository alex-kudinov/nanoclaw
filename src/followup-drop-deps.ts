/**
 * Database and Slack wiring for the host-side follow-up drop (followup-drop.ts).
 *
 * Split out of index.ts so both entry points — the 👎 reaction observer and the
 * typed-instruction observer — share one implementation, and so the SQL that
 * backs a "never contact them again" promise sits in one readable place.
 */

import { withAgentContext } from './business-db.js';
import { getMessageById } from './db.js';
import type { FollowupDropDeps, QueuedLead } from './followup-drop.js';

/** Minimal surface this module needs from the Slack channel. */
export interface DropSlack {
  sendMessage(
    jid: string,
    text: string,
    opts?: { threadTs?: string },
  ): Promise<unknown>;
}

const AGENT = 'operator-drop';

function toLead(row: Record<string, unknown>): QueuedLead {
  return {
    pipeline_entry_id: Number(row.pipeline_entry_id),
    party_id: Number(row.party_id),
    display_name: String(row.display_name ?? ''),
    primary_email: row.primary_email == null ? null : String(row.primary_email),
  };
}

export function makeFollowupDropDeps(slack: DropSlack): FollowupDropDeps {
  return {
    getCard: (id) => {
      const m = getMessageById(id);
      if (!m) return undefined;
      return {
        content: m.content,
        from_group: m.from_group,
        chat_jid: m.chat_jid,
      };
    },

    queue: () =>
      withAgentContext(AGENT, async (client) => {
        const r = await client.query(
          `SELECT pipeline_entry_id, party_id, display_name, primary_email
             FROM business_v2.v_sales_followup_queue`,
        );
        return r.rows.map(toLead);
      }),

    // Deliberately NOT restricted to the queue: a 👎 on yesterday's card must
    // still work after the lead has slipped out of today's queue.
    lookupEntry: (entryId) =>
      withAgentContext(AGENT, async (client) => {
        const r = await client.query(
          `SELECT pe.id AS pipeline_entry_id, pe.party_id, p.display_name,
                  p.primary_email
             FROM business_v2.pipeline_entries pe
             JOIN business_v2.parties p ON p.id = pe.party_id
            WHERE pe.id = $1`,
          [entryId],
        );
        return r.rowCount === 0 ? undefined : toLead(r.rows[0]);
      }),

    // Returns the entries the function actually parked, so the confirmation we
    // post is the database's answer and not our own intention. This is the
    // whole point of migration 113.
    dropParty: (partyId, reason) =>
      withAgentContext(AGENT, async (client) => {
        const r = await client.query(
          'SELECT entry_id FROM business_v2.fn_drop_followups($1, $2)',
          [partyId, reason],
        );
        return { entryIds: r.rows.map((row) => Number(row.entry_id)) };
      }),

    postThread: async (jid, slackTs, text) => {
      await slack.sendMessage(jid, text, { threadTs: slackTs });
    },
  };
}
