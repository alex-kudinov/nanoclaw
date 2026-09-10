import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  createEnrollmentAdmission,
  ENROLLMENT_ADMISSION_MODE,
} from './student-enrollment-admission.js';
import {
  admissionFixture,
  signAdmissionFixtures,
} from '../scripts/enrollment-admission-fixtures.mjs';
import { runEnrollmentStoreDisposableProof } from '../scripts/verify-student-enrollment-store-disposable.mjs';

const now = Date.now();
const service = (f: ReturnType<typeof admissionFixture>) =>
  createEnrollmentAdmission({
    issuers: f.issuers,
    catalog: f.catalog,
    clock: f.clock,
    policyKey: 'policy:synthetic',
  });
describe('local authenticated enrollment admission', () => {
  it('remains synthetic-only', () =>
    expect(ENROLLMENT_ADMISSION_MODE).toBe('synthetic_only'));
  it.each(['provider_event', 'provider_read', 'operator_decision'] as const)(
    'authenticates registered %s mock receipts',
    (origin) => {
      const f = admissionFixture('valid', now, origin);
      expect(service(f).verify(f.envelope, f.statements)).toBeTruthy();
    },
  );
  it('rejects altered raw bytes before admission', () => {
    const f = admissionFixture('tamper', now);
    f.statements[0].body += ' ';
    expect(() => service(f).verify(f.envelope, f.statements)).toThrow(
      'unauthenticated_statement',
    );
  });
  it('rejects missing, malformed and wrong signatures', () => {
    for (const signature of ['', 'not-hex', 'f'.repeat(64)]) {
      const f = admissionFixture('signature', now);
      f.statements[0].signature = signature;
      expect(() => service(f).verify(f.envelope, f.statements)).toThrow(
        'unauthenticated_statement',
      );
    }
  });
  it('rejects unknown issuers and cross-account assertions', () => {
    const f = admissionFixture('issuer', now);
    const gate = service(f);
    f.statements[0].issuerId = 'issuer:unknown';
    expect(() => gate.verify(f.envelope, f.statements)).toThrow(
      'unauthenticated_statement',
    );
    const cross = admissionFixture('scope', now);
    cross.envelope.funding.source.scope = 'stripe:heartbeat';
    cross.statements = signAdmissionFixtures(
      cross.envelope,
      cross.issuers,
      now,
    );
    expect(() =>
      service(cross).verify(cross.envelope, cross.statements),
    ).toThrow('statement_binding_denied');
  });
  it('cannot rebind signed evidence to another payer, participant, offer or class', () => {
    for (const mutate of [
      (f: ReturnType<typeof admissionFixture>) => {
        f.envelope.funding.payerPartyId = 3;
      },
      (f: ReturnType<typeof admissionFixture>) => {
        f.envelope.seats[0].participantPartyId = 3;
      },
      (f: ReturnType<typeof admissionFixture>) => {
        f.envelope.commercial.offerKey = 'other';
      },
      (f: ReturnType<typeof admissionFixture>) => {
        f.envelope.seats[0].assignment!.poolKey = 'other';
      },
    ]) {
      const f = admissionFixture('binding', now);
      mutate(f);
      expect(() => service(f).verify(f.envelope, f.statements)).toThrow(
        'statement_binding_denied',
      );
    }
  });
  it('rejects receipt audience/transport/purpose changes even with a valid MAC', () => {
    for (const change of [
      { audience: 'another_app' },
      { transport: 'operator_decision' },
      { purpose: 'commercial' },
    ]) {
      const f = admissionFixture('typed', now);
      const data = { ...JSON.parse(f.statements[0].body), ...change };
      f.statements[0].body = JSON.stringify(data);
      f.statements[0].signature = createHmac('sha256', f.issuers[0].key)
        .update(f.statements[0].body)
        .digest('hex');
      expect(() => service(f).verify(f.envelope, f.statements)).toThrow();
    }
  });
  it('requires authenticated funding and denies duplicated or ambiguous proof keys', () => {
    const f = admissionFixture('keys', now);
    expect(() => service(f).verify(f.envelope, f.statements.slice(1))).toThrow(
      'authenticated_funding_required',
    );
    expect(() =>
      service(f).verify(f.envelope, [...f.statements, f.statements[0]]),
    ).toThrow('statement_binding_denied');
    f.envelope.seats[0].proofKey = f.envelope.funding.proofKey;
    expect(() => service(f).verify(f.envelope, f.statements)).toThrow(
      'ambiguous_proof_key',
    );
  });
  it('binds the routing channel even when only funding evidence is available', () => {
    const f = admissionFixture('channel', now);
    const gate = service(f);
    f.envelope.channel = 'migration_or_correction';
    expect(() => gate.verify(f.envelope, [f.statements[0]])).toThrow(
      'statement_binding_denied',
    );
  });
  it('enforces issuer role capability registration and does not accept caller-supplied roles', () => {
    const f = admissionFixture('role', now);
    f.issuers[0].purposes.push('assignment');
    expect(() => service(f)).toThrow('invalid_issuer_registration');
    const g = admissionFixture('rawrole', now);
    const data = { ...JSON.parse(g.statements[0].body), role: 'owner_admin' };
    g.statements[0].body = JSON.stringify(data);
    g.statements[0].signature = createHmac('sha256', g.issuers[0].key)
      .update(g.statements[0].body)
      .digest('hex');
    expect(() => service(g).verify(g.envelope, g.statements)).toThrow();
  });
  it('rejects future, expired and overlong assertions', () => {
    for (const [issuedAt, expiresAt] of [
      [now + 1, now + 300000],
      [now - 1, now],
      [now, now + 600001],
    ]) {
      const f = admissionFixture('time', now);
      const data = { ...JSON.parse(f.statements[0].body), issuedAt, expiresAt };
      f.statements[0].body = JSON.stringify(data);
      f.statements[0].signature = createHmac('sha256', f.issuers[0].key)
        .update(f.statements[0].body)
        .digest('hex');
      expect(() => service(f).verify(f.envelope, f.statements)).toThrow(
        'admission_expired_or_future',
      );
    }
  });
  it('keeps key/role/scope configuration private and immutable after construction', () => {
    const f = admissionFixture('config', now);
    const gate = service(f);
    f.issuers[0].key.fill(0);
    f.issuers[0].sourceScopes.length = 0;
    f.issuers[0].channels.length = 0;
    f.issuers[0].role = 'owner_admin';
    expect(gate.verify(f.envelope, f.statements)).toBeTruthy();
  });
  it('does not register provider keys as operators or reuse keys across issuers', () => {
    const f = admissionFixture('isolation', now);
    f.issuers[0].role = 'owner_admin';
    expect(() => service(f)).toThrow('invalid_issuer_transport_role');
    const g = admissionFixture('keyreuse', now);
    g.issuers[1].key = g.issuers[0].key;
    expect(() => service(g)).toThrow('issuer_key_reuse');
  });
  it('cannot register a provider for correction routing or a non-owner for grants', () => {
    const f = admissionFixture('routingrole', now);
    f.issuers[0].channels = ['migration_or_correction'];
    expect(() => service(f)).toThrow('invalid_issuer_channel');
    const g = admissionFixture('grantrole', now, 'operator_decision');
    g.issuers[0].channels = ['scholarship'];
    expect(() => service(g)).toThrow('invalid_issuer_channel');
  });
  it('rejects two different proofs using one issuer receipt ID in a bundle', () => {
    const f = admissionFixture('receiptid', now);
    const a = JSON.parse(f.statements[1].body),
      b = JSON.parse(f.statements[2].body);
    b.receiptId = a.receiptId;
    f.statements[2].body = JSON.stringify(b);
    f.statements[2].signature = createHmac('sha256', f.issuers[1].key)
      .update(f.statements[2].body)
      .digest('hex');
    expect(() => service(f).verify(f.envelope, f.statements)).toThrow(
      'statement_binding_denied',
    );
  });
  it('rejects forged, cross-service and expired certificates before opening a database', async () => {
    const f = admissionFixture('capability', now);
    const gate = service(f);
    let connections = 0;
    const pool = {
      connect: async () => {
        connections++;
        throw new Error('should not connect');
      },
    };
    await expect(gate.admit(pool, {} as never)).rejects.toThrow(
      'unverified_admission',
    );
    const other = service(f).verify(f.envelope, f.statements);
    await expect(gate.admit(pool, other)).rejects.toThrow(
      'unverified_admission',
    );
    const valid = gate.verify(f.envelope, f.statements);
    f.setClock(now + 300001);
    await expect(gate.admit(pool, valid)).rejects.toThrow(
      'admission_expired_or_future',
    );
    expect(connections).toBe(0);
  });
  it('runs authenticated admission and dual-writer races in disposable PostgreSQL', () => {
    const r = runEnrollmentStoreDisposableProof('admission') as any;
    expect(r.ok && r.dropped && r.emptyRollbackReapply).toBe(true);
    expect(r.worker).toMatchObject({
      authenticated: true,
      replay: true,
      aliases: true,
      legacyBlocked: true,
      dualWriterRace: true,
      atomicRollback: true,
      uncertainCommit: true,
      expiredBeforeWrite: true,
      policyConflict: true,
      noSecretsStored: true,
      rollbackRefused: true,
      receiptConflict: true,
      authenticatedGrant: true,
      partialSponsor: true,
      controlReadback: true,
      correctionReviewOnly: true,
      nonAdminGrants: 0,
    });
  }, 60000);
});
