import { z } from 'zod';

import { IdentityControlPlaneError } from './errors.js';

export const ENVIRONMENTS = [
  'development',
  'test',
  'production',
  'legacy',
] as const;
export const EnvironmentSchema = z.enum(ENVIRONMENTS);
export type Environment = z.infer<typeof EnvironmentSchema>;

const time = z.iso.datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const bounded = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(
      (value) => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value),
      'IDENTITY_STRING_INVALID',
    );

export const ScopedReferenceSchema = z
  .object({
    provider: bounded(80),
    environment: EnvironmentSchema,
    scope: bounded(160),
    entityType: bounded(80),
    externalId: bounded(512),
  })
  .strict();
export type ScopedReference = z.infer<typeof ScopedReferenceSchema>;

export const EventEnvelopeSchema = z
  .object({
    kind: z.literal('identity_event_envelope'),
    schemaVersion: z.number().int().positive(),
    receiptId: z.string().uuid(),
    adapterKey: bounded(160),
    manifestVersion: z.number().int().positive(),
    sourceRef: ScopedReferenceSchema,
    relatedRefs: z.array(ScopedReferenceSchema).max(32).optional(),
    eventType: bounded(160),
    providerEventId: bounded(512).nullable().optional(),
    deduplicationKey: bounded(1024),
    providerSchemaVersion: bounded(80).nullable().optional(),
    sourceEffectiveAt: time.nullable().optional(),
    receivedAt: time,
    authenticity: z.enum([
      'verified',
      'relay_verified_provider_unverified',
      'unverified_hint',
      'rejected',
    ]),
    authenticityMethod: bounded(160).nullable().optional(),
    payloadSha256: sha256,
    rawPayloadRef: bounded(512).nullable().optional(),
    ordering: z
      .object({
        sequence: z
          .union([z.number().int(), bounded(160)])
          .nullable()
          .optional(),
        version: z
          .union([z.number().int(), bounded(160)])
          .nullable()
          .optional(),
        tieBreaker: bounded(512).nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export const RESOLUTION_STATUSES = [
  'resolved_exact_reference',
  'resolved_merge_lineage',
  'resolved_auth_subject',
  'resolved_claim_or_operation',
  'staged_candidate',
  'ambiguous',
  'not_found',
  'conflict',
  'ignored_stale',
] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

export const ResolutionDecisionSchema = z
  .object({
    kind: z.literal('identity_resolution_decision'),
    schemaVersion: z.number().int().positive(),
    decisionId: z.string().uuid(),
    resolverVersion: bounded(80),
    receiptId: z.string().uuid(),
    subjectRef: ScopedReferenceSchema,
    status: z.enum(RESOLUTION_STATUSES),
    partyId: z.number().int().positive().nullable().optional(),
    candidatePartyIds: z.array(z.number().int().positive()).max(100),
    exceptionId: z.number().int().positive().nullable().optional(),
    resolutionBasis: z
      .enum([
        'exact_external_reference',
        'accepted_merge_lineage',
        'accepted_auth_subject',
        'accepted_claim',
        'tandem_operation_correlation',
      ])
      .nullable()
      .optional(),
    shadow: z.literal(true),
    evidenceSha256: sha256,
    createdAt: time,
  })
  .strict()
  .superRefine((decision, context) => {
    const exact: Partial<Record<ResolutionStatus, string[]>> = {
      resolved_exact_reference: ['exact_external_reference'],
      resolved_merge_lineage: ['accepted_merge_lineage'],
      resolved_auth_subject: ['accepted_auth_subject'],
      resolved_claim_or_operation: [
        'accepted_claim',
        'tandem_operation_correlation',
      ],
    };
    const bases = exact[decision.status];
    if (bases) {
      if (
        !decision.partyId ||
        !decision.resolutionBasis ||
        !bases.includes(decision.resolutionBasis)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'RESOLUTION_BASIS_MISMATCH',
        });
      }
    } else if (decision.partyId != null || decision.resolutionBasis != null) {
      context.addIssue({
        code: 'custom',
        message: 'RESOLUTION_NONEXACT_PARTY_PROHIBITED',
      });
    }
    if (
      decision.status === 'not_found' &&
      decision.candidatePartyIds.length !== 0
    ) {
      context.addIssue({
        code: 'custom',
        message: 'RESOLUTION_NOT_FOUND_HAS_CANDIDATES',
      });
    }
    if (
      decision.status === 'ambiguous' &&
      decision.candidatePartyIds.length < 1
    ) {
      context.addIssue({
        code: 'custom',
        message: 'RESOLUTION_AMBIGUOUS_WITHOUT_CANDIDATE',
      });
    }
    if (
      new Set(decision.candidatePartyIds).size !==
      decision.candidatePartyIds.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'RESOLUTION_DUPLICATE_CANDIDATE',
      });
    }
  });
export type ResolutionDecision = z.infer<typeof ResolutionDecisionSchema>;

export const CREATION_BASES = [
  'none',
  'verified_tandem_registration',
  'explicit_purchase_seat',
  'accepted_invitation_claim',
  'operator_approved_decision',
] as const;
export const IdentityCandidateSchema = z
  .object({
    kind: z.literal('identity_candidate'),
    schemaVersion: z.number().int().positive(),
    candidateId: z.string().uuid(),
    subjectRef: ScopedReferenceSchema,
    status: z.enum([
      'open',
      'evidence_pending',
      'claim_available',
      'accepted',
      'rejected',
      'expired',
      'superseded',
    ]),
    creationBasis: z.enum(CREATION_BASES),
    partyMaterializationAllowed: z.boolean(),
    evidenceRefs: z.array(bounded(512)).max(100),
    createdAt: time,
    updatedAt: time,
  })
  .strict()
  .superRefine((candidate, context) => {
    if (
      candidate.partyMaterializationAllowed &&
      candidate.creationBasis === 'none'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'PARTY_CREATION_BASIS_INVALID',
      });
    }
    if (
      candidate.partyMaterializationAllowed &&
      candidate.status !== 'accepted'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'PARTY_CREATION_CANDIDATE_NOT_ACCEPTED',
      });
    }
  });
export type IdentityCandidate = z.infer<typeof IdentityCandidateSchema>;

export const AdapterManifestSchema = z
  .object({
    kind: z.literal('provider_adapter_manifest'),
    schemaVersion: z.number().int().positive(),
    adapterKey: bounded(160),
    manifestVersion: z.number().int().positive(),
    provider: bounded(80),
    environment: EnvironmentSchema,
    scope: bounded(160),
    status: z.enum(['draft', 'accepted', 'disabled', 'non_conformant']),
    entityTypes: z.array(bounded(80)).min(1).max(100),
    eventTypes: z.array(bounded(160)).max(200),
    authenticity: z
      .object({ method: bounded(160), providerVerified: z.boolean() })
      .strict(),
    deduplication: z.object({ keyStrategy: bounded(300) }).strict(),
    ordering: z.object({ strategy: bounded(300) }).strict(),
    readback: z
      .object({
        supported: z.boolean(),
        mode: z.enum([
          'none',
          'single',
          'incremental',
          'full',
          'single_and_full',
        ]),
      })
      .strict(),
    outboundOperations: z.array(bounded(160)).max(100),
    managedFields: z.array(bounded(160)).max(200),
    writesEnabled: z.literal(false),
    reconciliation: z
      .object({
        cadenceSeconds: z.number().int().min(60),
        freshnessSeconds: z.number().int().min(60),
        absenceRequiresCompleteSnapshot: z.literal(true),
      })
      .strict(),
  })
  .strict();
export type AdapterManifest = z.infer<typeof AdapterManifestSchema>;

export const DesiredProjectionSchema = z
  .object({
    kind: z.literal('provider_desired_projection'),
    schemaVersion: z.number().int().positive(),
    projectionKey: bounded(512),
    targetRef: ScopedReferenceSchema,
    managedObjectKey: bounded(512),
    desiredVersion: z.number().int().positive(),
    desiredSha256: sha256,
    authorityVersions: z.record(
      z.string(),
      z.union([z.number().int(), bounded(160)]),
    ),
    state: z.enum(['desired', 'held', 'superseded', 'retired']),
    createdAt: time,
    updatedAt: time,
  })
  .strict();
export type DesiredProjection = z.infer<typeof DesiredProjectionSchema>;

export const ShadowCommandSchema = z
  .object({
    kind: z.literal('provider_projection_command'),
    schemaVersion: z.number().int().positive(),
    commandId: z.string().uuid(),
    projectionKey: bounded(512),
    desiredVersion: z.number().int().positive(),
    idempotencyKey: bounded(512),
    status: z.enum(['simulated', 'superseded', 'blocked']),
    writesEnabled: z.literal(false),
    attemptCount: z.literal(0),
    providerOperationId: z.null(),
    nextAttemptAt: z.null(),
    lastErrorCode: bounded(160).nullable().optional(),
    createdAt: time,
    updatedAt: time,
  })
  .strict();
export type ShadowCommand = z.infer<typeof ShadowCommandSchema>;

export const ReconciliationRunSchema = z
  .object({
    kind: z.literal('provider_reconciliation_run'),
    schemaVersion: z.number().int().positive(),
    runId: z.string().uuid(),
    adapterKey: bounded(160),
    manifestVersion: z.number().int().positive(),
    provider: bounded(80),
    environment: EnvironmentSchema,
    scope: bounded(160),
    mode: z.enum(['full', 'incremental', 'single_readback']),
    status: z.enum(['running', 'complete', 'incomplete', 'failed']),
    complete: z.boolean(),
    watermark: bounded(512).nullable().optional(),
    observedCount: z.number().int().nonnegative(),
    normalizedCount: z.number().int().nonnegative(),
    duplicateCount: z.number().int().nonnegative().optional(),
    heldCount: z.number().int().nonnegative().optional(),
    snapshotSha256: sha256.nullable(),
    startedAt: time,
    completedAt: time.nullable().optional(),
    freshUntil: time.nullable(),
  })
  .strict()
  .superRefine((run, context) => {
    const validComplete =
      run.status === 'complete' &&
      run.complete &&
      Boolean(run.completedAt && run.snapshotSha256 && run.freshUntil);
    if (run.status === 'complete' ? !validComplete : run.complete) {
      context.addIssue({
        code: 'custom',
        message: 'SNAPSHOT_COMPLETENESS_INVALID',
      });
    }
  });
export type ReconciliationRun = z.infer<typeof ReconciliationRunSchema>;

export const DriftItemSchema = z
  .object({
    kind: z.literal('provider_drift_item'),
    schemaVersion: z.number().int().positive(),
    driftId: z.string().uuid(),
    targetRef: ScopedReferenceSchema,
    classification: z.enum([
      'missing_managed_state',
      'unexpected_provider_state',
      'stale_event',
      'unknown_reference',
      'reference_collision',
      'payer_learner_conflict',
      'uncertain_acceptance',
      'readback_mismatch',
      'provider_unreadable',
      'incomplete_snapshot',
      'deletion',
      'test_live_collision',
      'manifest_drift',
    ]),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    status: z.enum(['open', 'repair_queued', 'held', 'resolved', 'superseded']),
    repairEligibility: z.enum([
      'automatic',
      'readback_first',
      'operator_required',
      'prohibited',
    ]),
    absenceBased: z.boolean(),
    reconciliationRunId: z.string().uuid().nullable().optional(),
    firstSeenAt: time,
    lastSeenAt: time,
    owner: bounded(160),
  })
  .strict()
  .superRefine((drift, context) => {
    if (drift.absenceBased && !drift.reconciliationRunId) {
      context.addIssue({
        code: 'custom',
        message: 'ABSENCE_RECONCILIATION_RUN_REQUIRED',
      });
    }
  });
export type DriftItem = z.infer<typeof DriftItemSchema>;

export const SynchronizationScoreboardSchema = z
  .object({
    kind: z.literal('synchronization_scoreboard'),
    schemaVersion: z.number().int().positive(),
    generatedAt: time,
    globalState: z.enum(['healthy', 'degraded', 'blocked']),
    blockingReasons: z.array(bounded(160)).max(200),
    scopes: z
      .array(
        z
          .object({
            provider: bounded(80),
            environment: EnvironmentSchema,
            scope: bounded(160),
            state: z.enum(['healthy', 'degraded', 'blocked']),
            lastCompleteSnapshotAt: time.nullable(),
            freshUntil: time.nullable(),
            openDrift: z.number().int().nonnegative(),
            oldestOpenDriftSeconds: z.number().int().nonnegative(),
            uncertainCommands: z.number().int().nonnegative(),
            blockedCommands: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
export type SynchronizationScoreboard = z.infer<
  typeof SynchronizationScoreboardSchema
>;

export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new IdentityControlPlaneError(
      issue?.message || 'IDENTITY_CONTRACT_INVALID',
      { path: issue?.path.join('.') || '$' },
    );
  }
  return result.data;
}
