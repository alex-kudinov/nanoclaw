import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import {
  assertEnrollmentStoreDatabase,
  persistEnrollmentIngress,
  ENROLLMENT_STORE_MODE,
} from './student-enrollment-store.js';
import { runEnrollmentStoreDisposableProof } from '../scripts/verify-student-enrollment-store-disposable.mjs';

describe('local atomic enrollment store', () => {
  it.each([
    'nanoclaw_business',
    'postgres',
    'nc_student_enrollment_store_prod',
    'nc_student_enrollment_store_123',
  ])('rejects unsafe target %s', (name) => {
    expect(() => assertEnrollmentStoreDatabase(name)).toThrow(
      'store_non_disposable_database',
    );
  });
  it('has no production activation switch', () =>
    expect(ENROLLMENT_STORE_MODE).toBe('disposable_only'));
  it('refuses a production client before any transaction or write', async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        return { rows: [{ database: 'nanoclaw_business', address: null }] };
      },
      release: () => {},
    } as unknown as PoolClient;
    const pool = { connect: async () => client };
    await expect(
      persistEnrollmentIngress(pool, null, null as never),
    ).rejects.toThrow('store_non_disposable_database');
    expect(calls).toEqual([
      'SELECT current_database() AS database, inet_server_addr() AS address',
    ]);
  });
  it('persists canonical state atomically under real PostgreSQL races and failures', () => {
    const result = runEnrollmentStoreDisposableProof() as any;
    expect(result.ok).toBe(true);
    expect(result.dropped).toBe(true);
    expect(result.emptyRollbackReapply).toBe(true);
    expect(result.worker).toMatchObject({
      roundtrip: { accepted: true, replayed: true, unchanged: true },
      race: { occupied: 1, committed: 1, available: 0 },
      aliasRace: { orders: 1, enrollments: 1 },
      rollback: { noPartialRows: true, retryAccepted: true },
      uncertainCommit: { reportedUnknown: true, retryDuplicate: true },
      sponsor: { materialized: 1, unassigned: 1 },
      projectionVersion: { state: 'held', version: 1 },
      grant: { accepted: true },
      quarantine: { durable: true, replayed: true },
      deliveryColumns: { preserved: true, activeLeaseRefused: true },
      appendOnly: { deleteRefused: true, evidenceRewriteRefused: true },
      staleVersion: { refused: true },
      fullMapping: {
        syntheticReceipt: true,
        linkedEvidence: true,
        waitlist: true,
      },
      schema: { tables: 20, nonAdminGrants: 0, populatedRollbackRefused: true },
    });
  }, 60000);
});
