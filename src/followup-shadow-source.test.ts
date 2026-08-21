import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import type { QueryResult, QueryResultRow } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';

import {
  readFollowupActionEvidence,
  readFollowupShadowSources,
  SALES_SHADOW_SQL,
  type FollowupShadowQueryPort,
  type FollowupShadowSourceDependencies,
} from './followup-shadow-source.js';

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

function fakeQuery(): FollowupShadowQueryPort {
  return async <T extends QueryResultRow>(
    sql: string,
  ): Promise<QueryResult<T>> => {
    if (sql === SALES_SHADOW_SQL) {
      return result([
        {
          pipeline_entry_id: '42',
          party_id: '10',
          stage: 'qualifying',
          active_entry_count: 2,
          thread_id: 'thread-1',
          thread_pipeline_entry_id: null,
          last_outbound_at: '2026-08-14T16:00:00.000Z',
          last_inbound_at: '2026-08-13T16:00:00.000Z',
          confirmed_attempts: 0,
          last_confirmed_attempt_at: null,
          suppressed: false,
          operator_decision: 'none',
        },
      ] as unknown as T[]);
    }
    if (sql.includes('FROM business_v2.company_followup_cases')) {
      return result([] as T[]);
    }
    if (sql.includes('FROM business_v2.plutio_refs')) {
      return result([{ party_id: '10', suppressed: false }] as unknown as T[]);
    }
    if (sql.includes('best_party_by_email')) {
      return result([{ party_id: '10', suppressed: false }] as unknown as T[]);
    }
    if (sql.includes('FROM business_v2.parties')) {
      return result([{ party_id: '10', suppressed: false }] as unknown as T[]);
    }
    if (sql.includes('FROM business_v2.proposal_followups')) {
      return result([
        {
          confirmed_attempts: 0,
          last_confirmed_attempt_at: null,
          last_presentation_at: '2026-08-15T16:00:00.000Z',
          pending_action: false,
          uncertain_delivery: false,
          suppressed: false,
          public_link_verified: false,
        },
      ] as unknown as T[]);
    }
    throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
  };
}

function dependencies(
  overrides: Partial<FollowupShadowSourceDependencies> = {},
): FollowupShadowSourceDependencies {
  return {
    query: fakeQuery(),
    listProposals: async () => [
      {
        id: 'proposal-1',
        status: 'pending',
        pendingAt: '2026-08-01T16:00:00.000Z',
        approvedAt: null,
        autoInvoiceId: null,
        projectId: null,
        clientId: 'person-1',
      },
    ],
    listInvoices: async () => [
      {
        id: 'invoice-1',
        status: 'overdue',
        dueAt: '2026-08-01T16:00:00.000Z',
        totalAmount: 500,
        paidAmount: 0,
        outstandingAmount: 500,
        currency: 'USD',
        clientId: 'person-1',
      },
    ],
    resolveRecipient: async () => ({
      email: 'transient@example.com',
      firstName: '',
      lastName: '',
    }),
    readActions: () => ({
      sales: new Map(),
      proposals: new Map(),
    }),
    ...overrides,
  };
}

describe('follow-up shadow source reconciliation', () => {
  it('blocks duplicate Sales identity and preserves truthful owner/payment gaps', async () => {
    const output = await readFollowupShadowSources(
      '2026-08-21T16:00:00.000Z',
      dependencies(),
    );
    expect(output.sourceErrors).toEqual([]);
    expect(output.observations).toHaveLength(3);
    const cases = output.observations.map((item) => item.case);
    expect(cases).toContainEqual(
      expect.objectContaining({
        lane: 'sales_conversation',
        sourceIdentityConflict: true,
        hasOpenProposal: true,
      }),
    );
    expect(cases).toContainEqual(
      expect.objectContaining({
        lane: 'proposal_signature',
        partyId: '10',
        ownerResolved: false,
        publicLinkVerified: false,
      }),
    );
    expect(cases).toContainEqual(
      expect.objectContaining({
        lane: 'receivable',
        partyId: '10',
        paymentReconciled: false,
        ownerResolved: false,
      }),
    );
    expect(JSON.stringify(output)).not.toContain('transient@example.com');
  });

  it('makes proposal-source failure block Sales instead of assuming no open proposal', async () => {
    const output = await readFollowupShadowSources(
      '2026-08-21T16:00:00.000Z',
      dependencies({
        listProposals: async () => {
          throw new Error('unavailable');
        },
      }),
    );
    expect(output.sourceErrors).toContainEqual({
      source: 'plutio_proposals',
      code: 'read_failed',
    });
    expect(output.observations[0].case).toMatchObject({
      lane: 'sales_conversation',
      sourceEvidenceComplete: false,
      hasOpenProposal: false,
    });
  });
});

const tempPaths: Array<{ directory: string; file: string }> = [];

afterEach(() => {
  while (tempPaths.length > 0) {
    const item = tempPaths.pop()!;
    unlinkSync(item.file);
    rmdirSync(item.directory);
  }
});

describe('follow-up action evidence', () => {
  it('binds only exact Sales and proposal action references without customer fields', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'followup-actions-'));
    const file = path.join(directory, 'messages.db');
    tempPaths.push({ directory, file });
    const database = new Database(file);
    database.exec(
      `CREATE TABLE pending_sends (
         group_folder TEXT NOT NULL,
         lead_ref TEXT,
         state TEXT NOT NULL
       )`,
    );
    const insert = database.prepare(
      'INSERT INTO pending_sends (group_folder, lead_ref, state) VALUES (?, ?, ?)',
    );
    insert.run('sales', 'Lead #42', 'approved');
    insert.run('sales', 'Proposal proposal-1 follow-up #1', 'uncertain');
    insert.run('sales', 'Lead #42 extra', 'approved');
    insert.run('chief', 'Lead #99', 'approved');
    database.close();

    const evidence = readFollowupActionEvidence(file);
    expect(evidence.sales.get('42')).toEqual({
      pending: true,
      uncertain: false,
    });
    expect(evidence.sales.has('99')).toBe(false);
    expect(evidence.proposals.get('proposal-1')).toEqual({
      pending: false,
      uncertain: true,
    });
  });
});
