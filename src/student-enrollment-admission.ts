import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import {
  bookkeeperContractHash as hash,
  type BookkeeperEnrollmentState,
} from './bookkeeper-enrollment-contract.js';
import {
  parseEnrollmentIngressEnvelope,
  enrollmentIngressProofPayload,
  applyEnrollmentIngress,
  type EnrollmentIngressEnvelope,
  type EnrollmentIngressProof,
  type EnrollmentIngressAuthority,
  type EnrollmentIngressResult,
} from './student-enrollment-ingress.js';
import {
  captureOrder,
  openEnrollmentException,
  attachEnrollmentEvidence,
} from './student-enrollment-foundation.js';
import { persistEnrollmentDecision } from './student-enrollment-store.js';
import { guardEnrollmentStore } from './student-enrollment-store-mapping.js';
import type { EnrollmentStoreGuard } from './student-enrollment-store-mapping.js';

export const ENROLLMENT_ADMISSION_MODE = 'synthetic_only' as const;
const key = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,99}$/);
const transport = z.enum([
  'provider_event',
  'provider_read',
  'operator_decision',
]);
type Purpose = EnrollmentIngressProof['purpose'];
const channelSchema = z.enum([
  'website_stripe_checkout',
  'manual_stripe_payment',
  'plutio_invoice_or_contract',
  'check_ach_or_wire',
  'sponsored_cohort',
  'scholarship',
  'complimentary_owner_grant',
  'migration_or_correction',
]);
type Role = EnrollmentIngressProof['role'];
export interface EnrollmentIssuer {
  issuerId: string;
  actor: string;
  role: Role;
  transport: z.infer<typeof transport>;
  purposes: Purpose[];
  sourceScopes: string[];
  channels: EnrollmentIngressEnvelope['channel'][];
  key: Uint8Array;
}
export interface SignedEnrollmentStatement {
  issuerId: string;
  body: string;
  signature: string;
}
const statementSchema = z.strictObject({
  version: z.literal(1),
  audience: z.literal('enrollment_admission_v1'),
  issuerId: key,
  transport,
  channel: channelSchema,
  receiptId: key,
  proofKey: key,
  purpose: z.enum(['funding', 'commercial', 'participant', 'assignment']),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()),
});
const roles: Record<Role, Purpose[]> = {
  source_adapter: ['funding', 'commercial', 'participant'],
  finance_operator: ['funding'],
  enrollment_operator: ['commercial', 'participant', 'assignment'],
  owner_admin: ['funding', 'commercial', 'participant', 'assignment'],
};
declare const verifiedBrand: unique symbol;
export interface VerifiedEnrollmentAdmission {
  readonly [verifiedBrand]: true;
}
type AuthenticationRecord = {
  issuerId: string;
  transport: string;
  receiptId: string;
  bodySha256: string;
  actor: string;
  role: Role;
  purpose: Purpose;
  issuedAt: number;
  expiresAt: number;
};
type Verified = {
  envelope: EnrollmentIngressEnvelope;
  proofs: EnrollmentIngressProof[];
  authentication: AuthenticationRecord[];
};

/** Immutable shared ownership. Both synthetic legacy and new paths must use it;
 * a production pilot must first wire real legacy writers through the same gate.
 * Caller holds the canonical table locks in the store transaction. */
export async function claimEnrollmentWriter(
  client: PoolClient,
  source: EnrollmentIngressEnvelope['funding']['source'],
  writer: 'legacy' | 'enrollment',
  policyKey: string,
  evidenceSha256: string,
  actor: string,
  at: string,
  guard: EnrollmentStoreGuard = guardEnrollmentStore,
): Promise<boolean> {
  await guard(client);
  const canonical = z
    .strictObject({
      scope: key,
      objectType: key,
      objectId: z.string().regex(/^[A-Za-z0-9._:-]{1,200}$/),
    })
    .parse(source);
  const validSource = /^stripe:(tandem|heartbeat)$/.test(canonical.scope)
    ? canonical.objectType === 'payment_intent' &&
      /^pi_[A-Za-z0-9_]+$/.test(canonical.objectId)
    : canonical.scope.startsWith('bank:')
      ? canonical.objectType === 'payment_receipt'
      : canonical.scope.startsWith('plutio:')
        ? canonical.objectType === 'invoice_payment'
        : canonical.scope.startsWith('owner:') &&
          canonical.objectType === 'grant';
  if (!validSource) throw new Error('noncanonical_writer_source');
  key.parse(policyKey);
  key.parse(actor);
  z.string()
    .regex(/^[0-9a-f]{64}$/)
    .parse(evidenceSha256);
  z.iso.datetime({ offset: true }).parse(at);
  const sourceKey = hash([source.scope, source.objectType, source.objectId]);
  await client.query(
    'LOCK TABLE business_v2.student_enrollment_writer_claims IN SHARE ROW EXCLUSIVE MODE',
  );
  const inserted = await client.query(
    `INSERT INTO business_v2.student_enrollment_writer_claims
    (source_key,source_scope,source_object_type,source_object_id,writer,policy_key,evidence_sha256,claimed_at,claimed_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(source_key) DO NOTHING RETURNING source_key`,
    [
      sourceKey,
      source.scope,
      source.objectType,
      source.objectId,
      writer,
      policyKey,
      evidenceSha256,
      at,
      actor,
    ],
  );
  const row = (
    await client.query(
      'SELECT * FROM business_v2.student_enrollment_writer_claims WHERE source_key=$1',
      [sourceKey],
    )
  ).rows[0];
  if (
    !row ||
    row.source_scope !== source.scope ||
    row.source_object_type !== source.objectType ||
    row.source_object_id !== source.objectId
  )
    throw new Error('writer_claim_corrupt');
  if (
    inserted.rowCount === 1 &&
    (row.writer !== writer ||
      row.policy_key !== policyKey ||
      row.evidence_sha256 !== evidenceSha256 ||
      row.claimed_by !== actor ||
      new Date(row.claimed_at).getTime() !== Date.parse(at))
  )
    throw new Error('writer_claim_readback_mismatch');
  return row.writer === writer && row.policy_key === policyKey;
}

async function recordAuthenticatedReceipts(
  client: PoolClient,
  records: AuthenticationRecord[],
  sourceKey: string,
): Promise<boolean> {
  await client.query(
    'LOCK TABLE business_v2.student_enrollment_authenticated_receipts IN SHARE ROW EXCLUSIVE MODE',
  );
  for (const r of records) {
    const old = (
      await client.query(
        'SELECT * FROM business_v2.student_enrollment_authenticated_receipts WHERE issuer_id=$1 AND receipt_id=$2',
        [r.issuerId, r.receiptId],
      )
    ).rows[0];
    if (
      old &&
      (old.body_sha256 !== r.bodySha256 ||
        old.source_key !== sourceKey ||
        old.role !== r.role ||
        old.actor !== r.actor ||
        old.purpose !== r.purpose)
    )
      return false;
  }
  for (const r of records) {
    await client.query(
      `INSERT INTO business_v2.student_enrollment_authenticated_receipts
    (issuer_id,receipt_id,body_sha256,source_key,transport,purpose,actor,role,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT(issuer_id,receipt_id) DO NOTHING`,
      [
        r.issuerId,
        r.receiptId,
        r.bodySha256,
        sourceKey,
        r.transport,
        r.purpose,
        r.actor,
        r.role,
        new Date(r.issuedAt).toISOString(),
        new Date(r.expiresAt).toISOString(),
      ],
    );
    const saved = (
      await client.query(
        'SELECT * FROM business_v2.student_enrollment_authenticated_receipts WHERE issuer_id=$1 AND receipt_id=$2',
        [r.issuerId, r.receiptId],
      )
    ).rows[0];
    if (
      !saved ||
      saved.body_sha256 !== r.bodySha256 ||
      saved.source_key !== sourceKey ||
      saved.transport !== r.transport ||
      saved.purpose !== r.purpose ||
      saved.actor !== r.actor ||
      saved.role !== r.role ||
      new Date(saved.issued_at).getTime() !== r.issuedAt ||
      new Date(saved.expires_at).getTime() !== r.expiresAt
    )
      throw new Error('authenticated_receipt_readback_mismatch');
  }
  return true;
}

function admissionHold(
  state: BookkeeperEnrollmentState,
  e: EnrollmentIngressEnvelope,
  at: string,
  reasonCode: string,
): EnrollmentIngressResult {
  const digest = hash(e),
    orderKey = `admission-hold:${hash([e.intakeKey, digest, reasonCode])}`;
  if (state.enrollment.orders[orderKey])
    return { ...state, orderKey, disposition: 'duplicate' };
  let enrollment = captureOrder(state.enrollment, {
    orderKey,
    sourceChannel: e.channel,
    offerKey: null,
    bundleKey: null,
    bundleVersion: null,
    payerPartyId: null,
    seatCount: e.commercial.seatCount,
    financialClassification: 'unverified',
    policyRevision: 1,
    evidenceSha256: digest,
    effectiveAt: null,
    createdAt: at,
    updatedAt: at,
    updatedBy: 'enrollment-admission:host',
    sourceReference: {
      sourceScope: 'enrollment_admission',
      sourceObjectType: 'admission_hold',
      sourceObjectId: hash([e.intakeKey, digest, reasonCode]),
      idempotencyKey: orderKey,
      evidenceSha256: digest,
      observedAt: at,
      recordedAt: at,
      recordedBy: 'enrollment-admission:host',
    },
  }).state;
  enrollment = openEnrollmentException(enrollment, {
    exceptionKey: `${orderKey}:exception`,
    subjectType: 'order',
    subjectKey: orderKey,
    reasonCode,
    severity: 'high',
    ownerRole: 'owner_admin',
    evidenceSha256: digest,
    reviewAt: at,
    actor: 'enrollment-admission:host',
    occurredAt: at,
  });
  return {
    enrollment,
    capacity: state.capacity,
    orderKey,
    disposition: 'held',
  };
}

/** Local registered-issuer protocol, NOT a native provider webhook verifier.
 * Keys/catalog are injected trusted host configuration; tests use ephemeral keys
 * and provider/operator mocks. No network, credential file, or production pool. */
export function createEnrollmentAdmission(config: {
  issuers: EnrollmentIssuer[];
  policyKey: string;
  catalog: Omit<EnrollmentIngressAuthority['catalog'], 'occurredAt'>;
  clock: () => number;
  /** Production supplies its separately guarded transaction facade here. */
  persistDecision?: typeof persistEnrollmentDecision;
  /** Production may add a stricter atomic policy budget around the same claim. */
  claimWriter?: typeof claimEnrollmentWriter;
  /** Production may replace the local preview outbox with reviewed target envelopes. */
  finalizeDecision?: (input: {
    client: PoolClient;
    envelope: EnrollmentIngressEnvelope;
    result: EnrollmentIngressResult;
    occurredAt: string;
  }) => Promise<EnrollmentIngressResult>;
}) {
  const policyKey = key.parse(config.policyKey);
  const catalog = structuredClone(config.catalog);
  const clock = config.clock;
  const persistDecision = config.persistDecision ?? persistEnrollmentDecision;
  const claimWriter = config.claimWriter ?? claimEnrollmentWriter;
  const issuers = new Map<string, EnrollmentIssuer>();
  const issuerKeys = new Set<string>();
  for (const input of config.issuers) {
    key.parse(input.issuerId);
    key.parse(input.actor);
    transport.parse(input.transport);
    const channels = z.array(channelSchema).min(1).max(8).parse(input.channels);
    if (
      issuers.has(input.issuerId) ||
      !Object.hasOwn(roles, input.role) ||
      input.key.byteLength < 32 ||
      input.purposes.length === 0 ||
      input.purposes.some((p) => !roles[input.role].includes(p)) ||
      input.sourceScopes.length === 0
    )
      throw new Error('invalid_issuer_registration');
    if (
      (input.transport === 'operator_decision') ===
      (input.role === 'source_adapter')
    )
      throw new Error('invalid_issuer_transport_role');
    if (
      (channels.includes('migration_or_correction') &&
        input.transport !== 'operator_decision') ||
      (channels.some(
        (c) => c === 'scholarship' || c === 'complimentary_owner_grant',
      ) &&
        input.role !== 'owner_admin')
    )
      throw new Error('invalid_issuer_channel');
    const keyFingerprint = createHash('sha256').update(input.key).digest('hex');
    if (issuerKeys.has(keyFingerprint)) throw new Error('issuer_key_reuse');
    issuerKeys.add(keyFingerprint);
    input.sourceScopes.forEach((s) => key.parse(s));
    issuers.set(input.issuerId, {
      ...input,
      purposes: [...input.purposes],
      sourceScopes: [...input.sourceScopes],
      channels,
      key: Buffer.from(input.key),
    });
  }
  const certificates = new WeakMap<object, Verified>();
  const checkTime = (r: { issuedAt: number; expiresAt: number }) => {
    const now = clock();
    if (
      !Number.isSafeInteger(now) ||
      r.issuedAt > now ||
      r.expiresAt <= now ||
      r.expiresAt <= r.issuedAt ||
      r.expiresAt - r.issuedAt > 600_000
    )
      throw new Error('admission_expired_or_future');
  };
  return Object.freeze({
    verify(
      candidate: unknown,
      signed: SignedEnrollmentStatement[],
    ): VerifiedEnrollmentAdmission {
      const e = parseEnrollmentIngressEnvelope(candidate);
      if (!Array.isArray(signed) || signed.length === 0 || signed.length > 202)
        throw new Error('invalid_statement_count');
      const expected = new Map<
        string,
        { purpose: Purpose; payload: unknown }
      >();
      const add = (proofKey: string, purpose: Purpose, index = 0) => {
        if (expected.has(proofKey)) throw new Error('ambiguous_proof_key');
        expected.set(proofKey, {
          purpose,
          payload: enrollmentIngressProofPayload(e, purpose, index),
        });
      };
      add(e.funding.proofKey, 'funding');
      add(e.commercial.proofKey, 'commercial');
      e.seats.forEach((s, i) => {
        if (s.proofKey) add(s.proofKey, 'participant', i);
        if (s.assignment) add(s.assignment.proofKey, 'assignment', i);
      });
      const proofs: EnrollmentIngressProof[] = [],
        authentication: AuthenticationRecord[] = [];
      const seen = new Set<string>();
      const seenReceipts = new Set<string>();
      for (const item of signed) {
        const issuer = issuers.get(item.issuerId);
        if (
          !issuer ||
          typeof item.body !== 'string' ||
          Buffer.byteLength(item.body) > 65536 ||
          !/^([0-9a-f]{64})$/.test(item.signature)
        )
          throw new Error('unauthenticated_statement');
        const mac = createHmac('sha256', issuer.key).update(item.body).digest();
        if (!timingSafeEqual(mac, Buffer.from(item.signature, 'hex')))
          throw new Error('unauthenticated_statement');
        let decoded: unknown;
        try {
          decoded = JSON.parse(item.body);
        } catch {
          throw new Error('invalid_statement');
        }
        const statement = statementSchema.parse(decoded);
        checkTime(statement);
        const target = expected.get(statement.proofKey);
        if (
          statement.issuerId !== issuer.issuerId ||
          statement.transport !== issuer.transport ||
          statement.channel !== e.channel ||
          !issuer.channels.includes(e.channel) ||
          !issuer.purposes.includes(statement.purpose) ||
          !issuer.sourceScopes.includes(e.funding.source.scope) ||
          !target ||
          target.purpose !== statement.purpose ||
          hash(target.payload) !== hash(statement.payload) ||
          seen.has(statement.proofKey) ||
          seenReceipts.has(`${issuer.issuerId}\0${statement.receiptId}`)
        )
          throw new Error('statement_binding_denied');
        seen.add(statement.proofKey);
        seenReceipts.add(`${issuer.issuerId}\0${statement.receiptId}`);
        proofs.push({
          proofKey: statement.proofKey,
          purpose: statement.purpose,
          payloadSha256: hash(statement.payload),
          actor: issuer.actor,
          role: issuer.role,
          observedAt: new Date(statement.issuedAt).toISOString(),
        });
        authentication.push({
          issuerId: issuer.issuerId,
          transport: issuer.transport,
          receiptId: statement.receiptId,
          bodySha256: hash(statement),
          actor: issuer.actor,
          role: issuer.role,
          purpose: statement.purpose,
          issuedAt: statement.issuedAt,
          expiresAt: statement.expiresAt,
        });
      }
      if (!seen.has(e.funding.proofKey))
        throw new Error('authenticated_funding_required');
      const certificate = Object.freeze({}) as VerifiedEnrollmentAdmission;
      certificates.set(certificate, { envelope: e, proofs, authentication });
      return certificate;
    },
    async admit(
      pool: Pick<Pool, 'connect'>,
      certificate: VerifiedEnrollmentAdmission,
    ): Promise<EnrollmentIngressResult> {
      const verified = certificates.get(certificate);
      if (!verified) throw new Error('unverified_admission');
      verified.authentication.forEach(checkTime);
      return persistDecision(pool, async (client, state) => {
        verified.authentication.forEach(checkTime);
        const at = new Date(clock()).toISOString();
        const e = verified.envelope;
        let result: EnrollmentIngressResult;
        if (
          !(await recordAuthenticatedReceipts(
            client,
            verified.authentication,
            hash([
              e.funding.source.scope,
              e.funding.source.objectType,
              e.funding.source.objectId,
            ]),
          ))
        )
          result = admissionHold(
            state,
            e,
            at,
            'authenticated_receipt_conflict',
          );
        else if (e.channel === 'migration_or_correction')
          result = admissionHold(
            state,
            e,
            at,
            'correction_requires_resolution',
          );
        else if (
          !(await claimWriter(
            client,
            e.funding.source,
            'enrollment',
            policyKey,
            hash(verified.authentication),
            'enrollment-admission:host',
            at,
          ))
        )
          result = admissionHold(state, e, at, 'writer_ownership_conflict');
        else
          result = applyEnrollmentIngress(state, e, {
            proofs: verified.proofs,
            catalog: { ...catalog, occurredAt: at },
          });
        // Preserve authentication provenance without persisting keys or signatures.
        if (result.disposition !== 'duplicate')
          for (const auth of verified.authentication) {
            const evidenceKey = `admission-auth:${hash([e.intakeKey, auth.issuerId, auth.receiptId, auth.bodySha256])}`;
            if (!result.enrollment.evidence[evidenceKey])
              result.enrollment = attachEnrollmentEvidence(result.enrollment, {
                evidenceKey,
                subjectType: 'order',
                subjectKey: result.orderKey,
                evidenceType: `authenticated_${auth.transport}`,
                sourceReferenceKey: null,
                evidenceSha256: auth.bodySha256,
                observedAt: new Date(auth.issuedAt).toISOString(),
                recordedAt: at,
                recordedBy: auth.actor,
              });
          }
        return config.finalizeDecision
          ? config.finalizeDecision({
              client,
              envelope: e,
              result,
              occurredAt: at,
            })
          : result;
      });
    },
  });
}
