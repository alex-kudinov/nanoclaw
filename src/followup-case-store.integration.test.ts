import { createHash } from 'crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import {
  projectFollowupCaseWithClient,
  type ProjectFollowupCaseInput,
} from './followup-case-store.js';
import type { ProposalSignatureCase } from './followup-policy.js';

const TEST_DATABASE_URL = process.env.FOLLOWUP_CASE_TEST_DATABASE_URL;
const pool = TEST_DATABASE_URL
  ? new Pool({ connectionString: TEST_DATABASE_URL, max: 2 })
  : null;

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
    partyId: null,
    proposalStatus: 'pending',
    pendingAt: '2026-08-03T16:00:00.000Z',
    approvedAt: null,
    autoInvoiceId: null,
    projectId: null,
    recipientResolved: true,
    ownerResolved: true,
    publicLinkVerified: true,
    confirmedAttempts: 0,
    lastConfirmedAttemptAt: null,
    lastPresentationAt: null,
    ...overrides,
  };
}

function projection(
  caseInput: ProposalSignatureCase,
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

  it('enforces append-only events and exposes no agent grants', async () => {
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

    const grants = await pool!.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM information_schema.role_table_grants
        WHERE table_schema = 'business_v2'
          AND table_name IN (
            'company_followup_cases', 'company_followup_events'
          )
          AND grantee <> 'nanoclaw_admin'`,
    );
    expect(grants.rows[0].count).toBe('0');
  });
});
