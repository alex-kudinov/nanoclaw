import type { Pool, PoolClient } from 'pg';
import type { BookkeeperEnrollmentState } from './bookkeeper-enrollment-contract.js';
import {
  applyEnrollmentIngress,
  type EnrollmentIngressAuthority,
  type EnrollmentIngressResult,
} from './student-enrollment-ingress.js';
import {
  ENROLLMENT_STORE_TABLES,
  loadEnrollmentStore,
  persistEnrollmentStore,
  guardEnrollmentStore,
} from './student-enrollment-store-mapping.js';
import type { ProjectionDatabaseGuard } from './student-enrollment-projection-store.js';

export const ENROLLMENT_STORE_MODE = 'disposable_only' as const;
export { assertEnrollmentStoreDatabase } from './student-enrollment-store-mapping.js';
export class EnrollmentCommitUncertainError extends Error {
  readonly code = 'commit_outcome_unknown';
  constructor() {
    super(
      'Commit acknowledgement unavailable; reconcile by retrying the exact intake, never a new identity.',
    );
  }
}

/** Unwired v1. Only fixed-namespace disposable DBs on a Unix socket are allowed.
 * Pool must supply a fresh idle client. Proof/catalog authority remains HOST-only.
 * No source/provider acknowledgement is allowed before this promise resolves. */
export async function persistEnrollmentIngress(
  pool: Pick<Pool, 'connect'>,
  candidate: unknown,
  authority: EnrollmentIngressAuthority,
): Promise<EnrollmentIngressResult> {
  return persistEnrollmentDecision(pool, async (_client, state) =>
    applyEnrollmentIngress(state, candidate, authority),
  );
}

/** Trusted host composition seam, not a serialized or externally supplied callback.
 * The decision runs under the same locks/transaction and must preserve prior state. */
export async function persistEnrollmentDecision(
  pool: Pick<Pool, 'connect'>,
  decide: (
    client: PoolClient,
    state: BookkeeperEnrollmentState,
  ) => Promise<EnrollmentIngressResult>,
  databaseGuard: ProjectionDatabaseGuard = guardEnrollmentStore,
): Promise<EnrollmentIngressResult> {
  const client = await pool.connect();
  let began = false;
  let committing = false;
  let discard = false;
  try {
    // Outside BEGIN so this identity check cannot pin a stale serializable snapshot
    // while a competing intake still holds the table locks.
    await databaseGuard(client);
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    began = true;
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query(
      `LOCK TABLE ${ENROLLMENT_STORE_TABLES.map((t) => 'business_v2.' + t).join(',')} IN SHARE ROW EXCLUSIVE MODE`,
    );
    const before = await loadEnrollmentStore(client, databaseGuard);
    const result = await decide(client, before.state);
    await persistEnrollmentStore(client, before, result, databaseGuard);
    const readback = await loadEnrollmentStore(client, databaseGuard);
    committing = true;
    await client.query('COMMIT');
    began = false;
    return {
      ...readback.state,
      orderKey: result.orderKey,
      disposition: result.disposition,
    };
  } catch (error) {
    if (began)
      try {
        await client.query('ROLLBACK');
      } catch {
        discard = true;
      }
    if (committing) {
      discard = true;
      throw new EnrollmentCommitUncertainError();
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
