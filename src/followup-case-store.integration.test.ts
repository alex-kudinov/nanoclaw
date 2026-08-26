import { createHash } from 'crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import {
  projectFollowupCaseWithClient,
  type ProjectFollowupCaseInput,
} from './followup-case-store.js';
import type {
  FollowupCase,
  ProposalSignatureCase,
  ReceivableCase,
} from './followup-policy.js';

const TEST_DATABASE_URL = process.env.FOLLOWUP_CASE_TEST_DATABASE_URL;
const pool = TEST_DATABASE_URL
  ? new Pool({ connectionString: TEST_DATABASE_URL, max: 2 })
  : null;
const RELATIONSHIP_OWNER = {
  principalKey: 'team:tandem',
  assignmentId: '2',
  decisionRef:
    '.program/decisions/decision-relationship-owner-tandem-team-2026-08-26.json',
  managingSystem: 'tandem_os',
  actionAuthority: 'none',
} as const;

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function proposal(
  overrides: Partial<ProposalSignatureCase> = {},
): ProposalSignatureCase {
  return {
    lane: 'proposal_signature',
    sourceKey: 'plutio-proposal:integration-1',
    observedAt: '2026-08-11T16:00:00.000Z',
    sourceEvidenceComplete: true,
    sourceIdentityConflict: false,
    pendingAction: false,
    uncertainDelivery: false,
    suppressed: false,
    relationshipOwner: RELATIONSHIP_OWNER,
    partyId: null,
    proposalStatus: 'pending',
    pendingAt: '2026-08-03T16:00:00.000Z',
    approvedAt: null,
    autoInvoiceId: null,
    projectId: null,
    recipientResolved: true,
    publicLinkVerified: true,
    confirmedAttempts: 0,
    lastConfirmedAttemptAt: null,
    lastPresentationAt: null,
    ...overrides,
  };
}

function projection(
  caseInput: FollowupCase,
  overrides: Partial<ProjectFollowupCaseInput> = {},
): ProjectFollowupCaseInput {
  return {
    sourceSystem: 'plutio',
    sourceEventKey: `snapshot:${caseInput.observedAt}`,
    idempotencyKey: `followup:${caseInput.observedAt}`,
    sourceFingerprint: sha('source-v1'),
    actor: 'followup-integration:host',
    occurredAt: caseInput.observedAt,
    case: caseInput,
    ...overrides,
  };
}

afterAll(async () => {
  await pool?.end();
});

describe.skipIf(!pool)('follow-up case store integration', () => {
  it('creates one case/event, no-ops unchanged observation, and versions changed evidence', async () => {
    const firstInput = projection(proposal());
    const first = await projectFollowupCaseWithClient(pool!, firstInput);
    expect(first).toMatchObject({
      applied: true,
      duplicate: false,
      item: {
        version: 0,
        disposition: 'ready',
        reasonCode: 'proposal_touch_1_due',
        sequence: 1,
        relationshipOwnerPrincipalKey: 'team:tandem',
        relationshipOwnerAssignmentId: '2',
        relationshipOwnerDecisionRef:
          '.program/decisions/decision-relationship-owner-tandem-team-2026-08-26.json',
      },
    });

    const replay = await projectFollowupCaseWithClient(pool!, firstInput);
    expect(replay).toMatchObject({
      applied: false,
      duplicate: true,
      item: { id: first.item.id, version: 0 },
    });

    const laterUnchangedCase = proposal({
      observedAt: '2026-08-12T16:00:00.000Z',
    });
    const laterUnchanged = await projectFollowupCaseWithClient(
      pool!,
      projection(laterUnchangedCase, {
        sourceEventKey: 'snapshot:unchanged-next-day',
        idempotencyKey: 'followup:unchanged-next-day',
      }),
    );
    expect(laterUnchanged).toMatchObject({
      applied: false,
      duplicate: true,
      item: { id: first.item.id, version: 0 },
    });

    const changedCase = proposal({
      observedAt: '2026-08-13T16:00:00.000Z',
      pendingAction: true,
    });
    const changed = await projectFollowupCaseWithClient(
      pool!,
      projection(changedCase, {
        sourceEventKey: 'snapshot:pending-action',
        idempotencyKey: 'followup:pending-action',
        sourceFingerprint: sha('source-v2'),
      }),
    );
    expect(changed).toMatchObject({
      applied: true,
      duplicate: false,
      item: {
        id: first.item.id,
        version: 1,
        disposition: 'waiting',
        reasonCode: 'action_or_approval_pending',
      },
    });

    const counts = await pool!.query<{
      cases: string;
      events: string;
    }>(
      `SELECT
         (SELECT count(*) FROM business_v2.company_followup_cases)::text cases,
         (SELECT count(*) FROM business_v2.company_followup_events)::text events`,
    );
    expect(counts.rows[0]).toEqual({ cases: '1', events: '2' });
  });

  it('persists a future cadence sequence without making it actionable', async () => {
    const waitingCase = proposal({
      sourceKey: 'plutio-proposal:integration-waiting',
      observedAt: '2026-08-04T16:00:00.000Z',
    });
    const result = await projectFollowupCaseWithClient(
      pool!,
      projection(waitingCase, {
        sourceEventKey: 'snapshot:waiting-cadence',
        idempotencyKey: 'followup:waiting-cadence',
      }),
    );
    expect(result).toMatchObject({
      applied: true,
      item: {
        disposition: 'waiting',
        reasonCode: 'cadence_not_due',
        nextAction: 'none',
        sequence: 1,
      },
    });
  });

  it('projects missing owner as blocked and rejects ownerless waiting state', async () => {
    const draft: ReceivableCase = {
      lane: 'receivable',
      sourceKey: 'plutio-invoice:ownerless-draft',
      observedAt: '2026-08-14T16:00:00.000Z',
      sourceEvidenceComplete: true,
      sourceIdentityConflict: false,
      pendingAction: false,
      uncertainDelivery: false,
      suppressed: false,
      relationshipOwner: null,
      partyId: null,
      invoiceStatus: 'draft',
      dueAt: '2026-08-20T16:00:00.000Z',
      outstandingAmount: 500,
      currency: 'USD',
      paymentReconciled: true,
      collectionApproved: false,
      specialHandling: false,
      recipientResolved: true,
      confirmedAttempts: 0,
      lastConfirmedAttemptAt: null,
    };
    const projected = await projectFollowupCaseWithClient(
      pool!,
      projection(draft, {
        sourceEventKey: 'snapshot:ownerless-draft',
        idempotencyKey: 'followup:ownerless-draft',
      }),
    );
    expect(projected).toMatchObject({
      item: {
        disposition: 'blocked',
        reasonCode: 'relationship_owner_unresolved',
        relationshipOwnerPrincipalKey: null,
        relationshipOwnerAssignmentId: null,
      },
    });
    await expect(
      pool!.query(
        `UPDATE business_v2.company_followup_cases
            SET disposition = 'waiting',
                reason_code = 'invoice_not_issued',
                block_code = NULL
          WHERE id = $1`,
        [projected.item.id],
      ),
    ).rejects.toThrow('company_followup_cases_relationship_owner_required_chk');
  });

  it('rejects stale changed evidence and conflicting idempotency', async () => {
    const staleCase = proposal({
      observedAt: '2026-08-12T16:00:00.000Z',
      suppressed: true,
    });
    await expect(
      projectFollowupCaseWithClient(
        pool!,
        projection(staleCase, {
          sourceEventKey: 'snapshot:stale-change',
          idempotencyKey: 'followup:stale-change',
          sourceFingerprint: sha('source-stale'),
        }),
      ),
    ).rejects.toThrow('stale or conflicting observation');

    const conflicting = projection(
      proposal({
        observedAt: '2026-08-11T16:00:00.000Z',
        publicLinkVerified: false,
      }),
      { sourceFingerprint: sha('conflict') },
    );
    await expect(
      projectFollowupCaseWithClient(pool!, conflicting),
    ).rejects.toThrow('idempotency identity conflicts');
  });

  it('enforces append-only owner/event evidence and exposes no agent grants', async () => {
    const event = await pool!.query<{ id: string }>(
      `SELECT id::text FROM business_v2.company_followup_events ORDER BY id LIMIT 1`,
    );
    await expect(
      pool!.query(
        `UPDATE business_v2.company_followup_events
            SET reason_code = reason_code
          WHERE id = $1`,
        [event.rows[0].id],
      ),
    ).rejects.toThrow('append-only');

    const assignments = await pool!.query<{
      id: string;
      scope_key: string;
      principal_key: string;
      action_authority: string;
    }>(
      `SELECT a.id::text, a.scope_key, a.principal_key, p.action_authority
         FROM business_v2.relationship_owner_assignments a
         JOIN business_v2.relationship_owner_principals p
           ON p.principal_key = a.principal_key
        ORDER BY a.scope_key`,
    );
    expect(assignments.rows).toHaveLength(3);
    expect(
      assignments.rows.every(
        (row) =>
          row.principal_key === 'team:tandem' &&
          row.action_authority === 'none',
      ),
    ).toBe(true);
    await expect(
      pool!.query(
        `INSERT INTO business_v2.relationship_owner_assignments
           (scope_type, scope_key, principal_key, decision_ref, effective_from,
            supersedes_assignment_id, assignment_fingerprint)
         VALUES
           ('followup_lane', 'receivable', 'team:tandem',
            '.program/decisions/decision-relationship-owner-tandem-team-2026-08-26.json',
            '2026-08-27T13:44:52+00:00', NULL, $1)`,
        ['0'.repeat(64)],
      ),
    ).rejects.toThrow(
      'relationship owner assignment must supersede the exact current scope assignment',
    );
    await expect(
      pool!.query(
        `UPDATE business_v2.relationship_owner_assignments
            SET principal_key = principal_key
          WHERE id = $1`,
        [assignments.rows[0].id],
      ),
    ).rejects.toThrow('append-only');

    const grants = await pool!.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM information_schema.role_table_grants
        WHERE table_schema = 'business_v2'
          AND table_name IN (
            'company_followup_cases', 'company_followup_events',
            'relationship_owner_principals',
            'relationship_owner_assignments'
          )
          AND grantee <> 'nanoclaw_admin'`,
    );
    expect(grants.rows[0].count).toBe('0');
  });

  it('serializes concurrent assignment changes for one exact lane', async () => {
    const first = await pool!.connect();
    const second = await pool!.connect();
    try {
      const current = await first.query<{ id: string }>(
        `SELECT id::text
           FROM business_v2.relationship_owner_assignments
          WHERE scope_type = 'followup_lane'
            AND scope_key = 'receivable'
          ORDER BY effective_from DESC, id DESC
          LIMIT 1`,
      );
      const currentId = current.rows[0].id;

      await first.query('BEGIN');
      const inserted = await first.query<{ id: string }>(
        `INSERT INTO business_v2.relationship_owner_assignments
           (scope_type, scope_key, principal_key, decision_ref, effective_from,
            supersedes_assignment_id, assignment_fingerprint)
         VALUES
           ('followup_lane', 'receivable', 'team:tandem',
            '.program/decisions/decision-relationship-owner-tandem-team-2026-08-26.json',
            '2026-08-27T13:44:52+00:00', $1, $2)
         RETURNING id::text`,
        [currentId, '1'.repeat(64)],
      );

      await second.query('BEGIN');
      let settled = false;
      const concurrent = second
        .query(
          `INSERT INTO business_v2.relationship_owner_assignments
             (scope_type, scope_key, principal_key, decision_ref,
              effective_from, supersedes_assignment_id,
              assignment_fingerprint)
           VALUES
             ('followup_lane', 'receivable', 'team:tandem',
              '.program/decisions/decision-relationship-owner-tandem-team-2026-08-26.json',
              '2026-08-28T13:44:52+00:00', $1, $2)`,
          [currentId, '2'.repeat(64)],
        )
        .then(
          () => ({ ok: true, error: null }),
          (error: Error) => ({ ok: false, error }),
        )
        .finally(() => {
          settled = true;
        });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(settled).toBe(false);
      await first.query('COMMIT');

      const result = await concurrent;
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain(
        'relationship owner assignment must supersede the exact current scope assignment',
      );
      expect(inserted.rows[0].id).not.toBe(currentId);
      await second.query('ROLLBACK');
    } finally {
      first.release();
      second.release();
    }
  });
});
