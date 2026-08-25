import {
  RelationshipContextContractError,
  type AdapterHealthReceipt,
  type AdapterManifestV1,
  type BoundedCollectionRequest,
  type BoundedWebhookInput,
  type ObservationBatch,
  type PersonEnrichmentAdapterV1,
  sha256Json,
} from './relationship-context-contract.js';

export const REFERENCE_LMS_FACTS = [
  'learning.enrollment.status@1',
  'learning.progress.percent@1',
  'learning.completion@1',
] as const;

const manifest: AdapterManifestV1 = {
  manifestVersion: 1,
  adapterKey: 'reference_lms',
  adapterVersion: '1.0.0',
  sourceSystem: 'reference_lms',
  supportedScopes: ['fixture-primary'],
  externalReferenceTypes: ['person', 'course', 'enrollment'],
  factTypes: [...REFERENCE_LMS_FACTS],
  identityClaimTypes: ['provider_user_id', 'verified_email_candidate'],
  collectionModes: ['webhook', 'snapshot'],
  projectionTargets: ['learning'],
  privacyClasses: ['internal', 'restricted_identifier'],
  credentialHandle: null,
  healthPolicy: 'fixture_no_network',
  conformanceSuite: 'person_enrichment_adapter_v1',
};

interface FixturePayload {
  user_id: string;
  course_id: string;
  enrollment_id: string;
  status: 'active' | 'completed' | 'withdrawn';
  progress_percent: number;
  completed_at?: string | null;
  identity_fingerprint?: string | null;
}

function parseFixture(value: Record<string, unknown>): FixturePayload {
  const string = (key: string, max = 200): string => {
    const item = value[key];
    if (typeof item !== 'string' || !item || item.length > max) {
      throw new RelationshipContextContractError(
        'reference_lms_fixture_invalid',
      );
    }
    return item;
  };
  const status = value.status;
  const progress = value.progress_percent;
  if (
    !['active', 'completed', 'withdrawn'].includes(String(status)) ||
    typeof progress !== 'number' ||
    !Number.isFinite(progress) ||
    progress < 0 ||
    progress > 100
  ) {
    throw new RelationshipContextContractError('reference_lms_fixture_invalid');
  }
  const completedAt = value.completed_at;
  if (
    completedAt != null &&
    (typeof completedAt !== 'string' ||
      !Number.isFinite(Date.parse(completedAt)))
  ) {
    throw new RelationshipContextContractError('reference_lms_fixture_invalid');
  }
  const identityFingerprint = value.identity_fingerprint;
  if (
    identityFingerprint != null &&
    (typeof identityFingerprint !== 'string' ||
      !/^[0-9a-f]{64}$/.test(identityFingerprint))
  ) {
    throw new RelationshipContextContractError('reference_lms_fixture_invalid');
  }
  return {
    user_id: string('user_id'),
    course_id: string('course_id'),
    enrollment_id: string('enrollment_id'),
    status: status as FixturePayload['status'],
    progress_percent: progress,
    completed_at:
      completedAt == null ? null : new Date(completedAt).toISOString(),
    identity_fingerprint: identityFingerprint ?? null,
  };
}

function batch(payload: FixturePayload, observedAt: string): ObservationBatch {
  const scope = 'fixture-primary';
  const sourceRef = {
    provider: 'reference_lms',
    scope,
    entityType: 'person',
    externalId: payload.user_id,
  } as const;
  const fact = (
    factType: (typeof REFERENCE_LMS_FACTS)[number],
    value: Record<string, unknown>,
    recordType: 'enrollment' | 'course',
    recordId: string,
    effectiveAt: string | null = null,
  ) => ({
    factType,
    sourceFactKey: `${factType}:${recordId}`,
    subject: sourceRef,
    value,
    sourceSystem: 'reference_lms',
    sourceScope: scope,
    sourceRecordType: recordType,
    sourceRecordId: recordId,
    sourceEventId: null,
    effectiveAt,
    observedAt,
    verifiedAt: null,
    freshUntil: new Date(Date.parse(observedAt) + 26 * 3_600_000).toISOString(),
    confidence: 'provider_asserted' as const,
    conflictState: 'none' as const,
    privacyClass: 'internal' as const,
    factSchemaVersion: 1,
  });
  const facts = [
    fact(
      'learning.enrollment.status@1',
      {
        enrollment_id: payload.enrollment_id,
        course_id: payload.course_id,
        status: payload.status,
      },
      'enrollment',
      payload.enrollment_id,
    ),
    fact(
      'learning.progress.percent@1',
      {
        enrollment_id: payload.enrollment_id,
        course_id: payload.course_id,
        percent: payload.progress_percent,
      },
      'enrollment',
      payload.enrollment_id,
    ),
  ];
  if (payload.completed_at) {
    facts.push(
      fact(
        'learning.completion@1',
        {
          enrollment_id: payload.enrollment_id,
          course_id: payload.course_id,
          completed: true,
        },
        'course',
        payload.course_id,
        payload.completed_at,
      ),
    );
  }
  return {
    adapterKey: manifest.adapterKey,
    adapterVersion: manifest.adapterVersion,
    sourceSystem: manifest.sourceSystem,
    sourceScope: scope,
    complete: true,
    watermark: sha256Json(payload),
    externalReferences: [
      sourceRef,
      {
        provider: 'reference_lms',
        scope,
        entityType: 'course',
        externalId: payload.course_id,
      },
      {
        provider: 'reference_lms',
        scope,
        entityType: 'enrollment',
        externalId: payload.enrollment_id,
      },
    ],
    identityCandidates: [
      {
        kind: 'provider_user_id',
        fingerprint: sha256Json({ scope, user_id: payload.user_id }),
        verified: true,
        effectiveAt: observedAt,
        sourceRef,
      },
      ...(payload.identity_fingerprint
        ? [
            {
              kind: 'verified_email_candidate' as const,
              fingerprint: payload.identity_fingerprint,
              verified: true,
              effectiveAt: observedAt,
              sourceRef,
            },
          ]
        : []),
    ],
    facts,
    errors: [],
  };
}

export class ReferenceLmsAdapter implements PersonEnrichmentAdapterV1 {
  describe(): AdapterManifestV1 {
    return structuredClone(manifest);
  }

  validateConfig(config: unknown): { ok: true } | { ok: false; code: string } {
    if (
      !config ||
      typeof config !== 'object' ||
      Array.isArray(config) ||
      Object.keys(config).length !== 0
    ) {
      return { ok: false, code: 'reference_lms_config_must_be_empty' };
    }
    return { ok: true };
  }

  normalizeWebhook(input: BoundedWebhookInput): ObservationBatch {
    if (input.scope !== 'fixture-primary') {
      throw new RelationshipContextContractError(
        'reference_lms_scope_unsupported',
      );
    }
    return batch(parseFixture(input.payload), input.observedAt);
  }

  collectSnapshot(input: BoundedCollectionRequest): ObservationBatch {
    if (input.scope !== 'fixture-primary' || input.limit !== 1) {
      throw new RelationshipContextContractError(
        'reference_lms_snapshot_request_invalid',
      );
    }
    throw new RelationshipContextContractError(
      'reference_lms_snapshot_fixture_required',
    );
  }

  health(): AdapterHealthReceipt {
    return {
      adapterKey: manifest.adapterKey,
      sourceScope: manifest.supportedScopes[0],
      status: 'healthy',
      observedAt: new Date(0).toISOString(),
      errorCode: null,
    };
  }
}
