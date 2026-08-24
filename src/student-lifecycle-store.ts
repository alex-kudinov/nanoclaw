import crypto from 'crypto';
import type { PoolClient, QueryResultRow } from 'pg';

import { withAgentContext } from './business-db.js';
import {
  type LifecycleProjection,
  type PreparedCommunityLifecycleEnvelope,
  type ProjectionChange,
  defaultLifecycleProjection,
  reduceLifecycleProjection,
} from './student-lifecycle.js';

export interface LifecycleCatalogMatch {
  id: number;
  entryKey: string;
  catalogRevision: number;
  mappingScope:
    | 'access_family'
    | 'course_only'
    | 'exact_offer'
    | 'exact_cohort';
  policyVersion: string;
}

export type LifecycleMappingStatus =
  | 'unresolved_identity'
  | 'unknown_catalog'
  | 'ambiguous_catalog'
  | 'course_known_offer_ambiguous'
  | 'exact'
  | 'not_applicable';

export interface LifecycleEventRecord {
  id: number;
  duplicate: boolean;
}

export interface LifecycleEnrollmentRecord {
  id: number;
  version: number;
  projection: LifecycleProjection;
  policyVersion: string;
  catalogRevision: number | null;
}

export interface LifecycleProcessResult {
  eventId: number;
  duplicate: boolean;
  processingStatus: 'applied' | 'quarantined';
  partyId: number | null;
  enrollmentIds: number[];
  exceptionReason: string | null;
}

export interface StudentLifecycleRepository {
  findPartyByHeartbeatUser(
    communityId: string,
    userId: string,
  ): Promise<number | null>;
  findPartiesByEmail(email: string): Promise<number[]>;
  bindHeartbeatIdentity(input: {
    communityId: string;
    userId: string;
    partyId: number;
    sourceEventKey: string;
    evidenceSha256: string;
    boundAt: string;
  }): Promise<'bound' | 'existing' | 'conflict'>;
  findCatalogMatches(
    event: PreparedCommunityLifecycleEnvelope,
  ): Promise<LifecycleCatalogMatch[]>;
  insertEvent(input: {
    event: PreparedCommunityLifecycleEnvelope;
    webhookInboxId: number;
    partyId: number | null;
    catalog: LifecycleCatalogMatch | null;
    mappingStatus: LifecycleMappingStatus;
    processingStatus: 'normalized' | 'quarantined';
  }): Promise<LifecycleEventRecord>;
  markEvent(input: {
    eventId: number;
    partyId: number | null;
    catalog: LifecycleCatalogMatch | null;
    mappingStatus: LifecycleMappingStatus;
    processingStatus: 'applied' | 'quarantined';
  }): Promise<void>;
  ensureException(input: {
    eventId: number;
    sourceEventKey: string;
    reasonCode: string;
    evidenceSha256: string;
    observedAt: string;
  }): Promise<void>;
  listActiveEnrollmentsForUser(input: {
    communityId: string;
    userId: string;
    partyId: number;
  }): Promise<LifecycleEnrollmentRecord[]>;
  ensureEnrollment(input: {
    event: PreparedCommunityLifecycleEnvelope;
    partyId: number;
    catalog: LifecycleCatalogMatch;
  }): Promise<LifecycleEnrollmentRecord>;
  applyProjection(input: {
    enrollment: LifecycleEnrollmentRecord;
    next: LifecycleProjection;
    changes: ProjectionChange[];
    eventId: number;
    effectiveAt: string;
  }): Promise<number>;
  recordReconciliationRun(
    input: LifecycleReconciliationRunInput,
  ): Promise<{ id: number; duplicate: boolean }>;
  health(): Promise<StudentLifecycleHealth>;
}

export interface LifecycleReconciliationRunInput {
  runKey: string;
  runType: 'registry' | 'catalog' | 'membership' | 'progress';
  scopeKey: string;
  catalogRevision: number | null;
  sourceSnapshotSha256: string;
  watermarkBefore: string | null;
  watermarkAfter: string | null;
  scopesExpected: number;
  scopesObserved: number;
  factsNew: number;
  factsUnchanged: number;
  factsConflicting: number;
  factsQuarantined: number;
  status: 'completed' | 'partial' | 'failed' | 'quarantined';
  errorCode: string | null;
  startedAt: string;
  completedAt: string;
}

export interface StudentLifecycleHealth {
  eventCount: number;
  activeEnrollmentCount: number;
  openExceptionCount: number;
  lastEventReceivedAt: string | null;
  lastReconciliationCompletedAt: string | null;
}

function catalogStatus(matches: LifecycleCatalogMatch[]): {
  catalog: LifecycleCatalogMatch | null;
  status:
    | 'unknown_catalog'
    | 'ambiguous_catalog'
    | 'course_known_offer_ambiguous'
    | 'exact';
} {
  if (matches.length === 0) return { catalog: null, status: 'unknown_catalog' };
  if (matches.length > 1) return { catalog: null, status: 'ambiguous_catalog' };
  const catalog = matches[0];
  return {
    catalog,
    status:
      catalog.mappingScope === 'exact_offer' ||
      catalog.mappingScope === 'exact_cohort'
        ? 'exact'
        : 'course_known_offer_ambiguous',
  };
}

function eventNeedsCatalog(event: PreparedCommunityLifecycleEnvelope): boolean {
  return event.action === 'GROUP_JOIN' || event.action === 'COURSE_COMPLETED';
}

function eventCanProject(event: PreparedCommunityLifecycleEnvelope): boolean {
  return (
    event.action === 'USER_JOIN' ||
    event.action === 'GROUP_JOIN' ||
    event.action === 'COURSE_COMPLETED'
  );
}

function unclassifiedCompletion(
  projection: LifecycleProjection,
  changes: ProjectionChange[],
): { projection: LifecycleProjection; changes: ProjectionChange[] } {
  if (projection.learning !== 'completed') return { projection, changes };
  return {
    projection: { ...projection, learning: 'completion_unclassified' },
    changes: changes.map((change) =>
      change.axis === 'learning'
        ? { ...change, next: 'completion_unclassified' }
        : change,
    ),
  };
}

export async function processPreparedCommunityLifecycle(input: {
  repository: StudentLifecycleRepository;
  event: PreparedCommunityLifecycleEnvelope;
  webhookInboxId: number;
  transientEmail?: string | null;
}): Promise<LifecycleProcessResult> {
  const { repository, event } = input;
  let partyId: number | null = null;
  let identityConflict = false;

  if (event.heartbeat.user_id) {
    partyId = await repository.findPartyByHeartbeatUser(
      event.heartbeat.community_id,
      event.heartbeat.user_id,
    );
  }

  if (partyId === null && input.transientEmail) {
    const matches = await repository.findPartiesByEmail(input.transientEmail);
    if (matches.length === 1) {
      partyId = matches[0];
      if (event.heartbeat.user_id) {
        const binding = await repository.bindHeartbeatIdentity({
          communityId: event.heartbeat.community_id,
          userId: event.heartbeat.user_id,
          partyId,
          sourceEventKey: event.source_event_key,
          evidenceSha256: event.payload_sha256,
          boundAt: event.observed_at,
        });
        if (binding === 'conflict') {
          identityConflict = true;
          partyId = null;
        }
      }
    } else if (matches.length > 1) {
      identityConflict = true;
    }
  }

  const matches = eventNeedsCatalog(event)
    ? await repository.findCatalogMatches(event)
    : [];
  const mapping = eventNeedsCatalog(event)
    ? catalogStatus(matches)
    : { catalog: null, status: 'exact' as const };

  let reason: string | null = null;
  if (identityConflict) reason = 'identity_conflict';
  else if (partyId === null && eventCanProject(event))
    reason = 'needs_identity';
  else if (mapping.status === 'unknown_catalog') reason = 'unknown_catalog';
  else if (mapping.status === 'ambiguous_catalog') reason = 'ambiguous_catalog';

  const initialStatus = reason ? 'quarantined' : 'normalized';
  const initialMapping: LifecycleMappingStatus = !eventCanProject(event)
    ? 'not_applicable'
    : partyId === null
      ? 'unresolved_identity'
      : mapping.status;
  const inserted = await repository.insertEvent({
    event,
    webhookInboxId: input.webhookInboxId,
    partyId,
    catalog: mapping.catalog,
    mappingStatus: initialMapping,
    processingStatus: initialStatus,
  });

  if (inserted.duplicate) {
    return {
      eventId: inserted.id,
      duplicate: true,
      processingStatus: reason ? 'quarantined' : 'applied',
      partyId,
      enrollmentIds: [],
      exceptionReason: reason,
    };
  }

  if (reason) {
    await repository.ensureException({
      eventId: inserted.id,
      sourceEventKey: event.source_event_key,
      reasonCode: reason,
      evidenceSha256: event.payload_sha256,
      observedAt: event.observed_at,
    });
    await repository.markEvent({
      eventId: inserted.id,
      partyId,
      catalog: mapping.catalog,
      mappingStatus: initialMapping,
      processingStatus: 'quarantined',
    });
    return {
      eventId: inserted.id,
      duplicate: false,
      processingStatus: 'quarantined',
      partyId,
      enrollmentIds: [],
      exceptionReason: reason,
    };
  }

  const enrollmentIds: number[] = [];
  if (partyId !== null && event.action === 'USER_JOIN') {
    const enrollments = await repository.listActiveEnrollmentsForUser({
      communityId: event.heartbeat.community_id,
      userId: event.heartbeat.user_id!,
      partyId,
    });
    for (const enrollment of enrollments) {
      const reduced = reduceLifecycleProjection(enrollment.projection, event);
      if (reduced.changes.length > 0) {
        await repository.applyProjection({
          enrollment,
          next: reduced.projection,
          changes: reduced.changes,
          eventId: inserted.id,
          effectiveAt: event.observed_at,
        });
      }
      enrollmentIds.push(enrollment.id);
    }
  } else if (
    partyId !== null &&
    mapping.catalog &&
    (event.action === 'GROUP_JOIN' || event.action === 'COURSE_COMPLETED')
  ) {
    const enrollment = await repository.ensureEnrollment({
      event,
      partyId,
      catalog: mapping.catalog,
    });
    let reduced = reduceLifecycleProjection(enrollment.projection, event);
    if (
      event.action === 'COURSE_COMPLETED' &&
      mapping.status === 'course_known_offer_ambiguous'
    ) {
      reduced = unclassifiedCompletion(reduced.projection, reduced.changes);
    }
    if (reduced.changes.length > 0) {
      await repository.applyProjection({
        enrollment,
        next: reduced.projection,
        changes: reduced.changes,
        eventId: inserted.id,
        effectiveAt: event.observed_at,
      });
    }
    enrollmentIds.push(enrollment.id);
  }

  await repository.markEvent({
    eventId: inserted.id,
    partyId,
    catalog: mapping.catalog,
    mappingStatus: initialMapping,
    processingStatus: 'applied',
  });
  return {
    eventId: inserted.id,
    duplicate: false,
    processingStatus: 'applied',
    partyId,
    enrollmentIds,
    exceptionReason: null,
  };
}

type DbRow = QueryResultRow & Record<string, unknown>;

function asNumber(value: unknown): number {
  return Number(value);
}

function projectionFromRow(row: DbRow): LifecycleProjection {
  return {
    access: row.access_state as LifecycleProjection['access'],
    activation: row.activation_state as LifecycleProjection['activation'],
    learning: row.learning_state as LifecycleProjection['learning'],
    grading: row.grading_state as LifecycleProjection['grading'],
    feedback: row.feedback_state as LifecycleProjection['feedback'],
    certificate: row.certificate_state as LifecycleProjection['certificate'],
    finance: row.finance_state as LifecycleProjection['finance'],
    marketing_consent:
      row.marketing_consent_state as LifecycleProjection['marketing_consent'],
    contact_suppression:
      row.contact_suppression_state as LifecycleProjection['contact_suppression'],
  };
}

function enrollmentFromRow(row: DbRow): LifecycleEnrollmentRecord {
  return {
    id: asNumber(row.id),
    version: asNumber(row.version),
    projection: projectionFromRow(row),
    policyVersion: String(row.policy_version ?? 'student-lifecycle-v1'),
    catalogRevision:
      row.catalog_revision === null || row.catalog_revision === undefined
        ? null
        : asNumber(row.catalog_revision),
  };
}

function exceptionFingerprint(
  sourceEventKey: string,
  reasonCode: string,
): string {
  return crypto
    .createHash('sha256')
    .update(`student-lifecycle-exception-v1\0${reasonCode}\0${sourceEventKey}`)
    .digest('hex');
}

export class PostgresStudentLifecycleRepository implements StudentLifecycleRepository {
  constructor(private readonly client: PoolClient) {}

  async findPartyByHeartbeatUser(
    communityId: string,
    userId: string,
  ): Promise<number | null> {
    const result = await this.client.query<{ party_id: string }>(
      `SELECT party_id::text
         FROM business_v2.student_lifecycle_identity_links
        WHERE workspace = 'community'
          AND heartbeat_community_id = $1::uuid
          AND heartbeat_user_id = $2::uuid
          AND binding_status = 'confirmed'`,
      [communityId, userId],
    );
    return result.rows[0] ? Number(result.rows[0].party_id) : null;
  }

  async findPartiesByEmail(email: string): Promise<number[]> {
    const result = await this.client.query<{ party_id: string }>(
      `SELECT DISTINCT party_id::text
         FROM (
           SELECT pe.party_id
             FROM business_v2.party_emails pe
            WHERE pe.email = $1::citext
           UNION
           SELECT p.id AS party_id
             FROM business_v2.parties p
            WHERE p.primary_email = $1::citext
              AND p.merged_into IS NULL
         ) matched
        ORDER BY party_id`,
      [email],
    );
    return result.rows.map((row) => Number(row.party_id));
  }

  async bindHeartbeatIdentity(input: {
    communityId: string;
    userId: string;
    partyId: number;
    sourceEventKey: string;
    evidenceSha256: string;
    boundAt: string;
  }): Promise<'bound' | 'existing' | 'conflict'> {
    const existing = await this.findPartyByHeartbeatUser(
      input.communityId,
      input.userId,
    );
    if (existing !== null)
      return existing === input.partyId ? 'existing' : 'conflict';
    const inserted = await this.client.query(
      `INSERT INTO business_v2.student_lifecycle_identity_links
         (workspace, heartbeat_community_id, heartbeat_user_id, party_id,
          source_event_key, evidence_sha256, bound_at)
       VALUES ('community', $1::uuid, $2::uuid, $3, $4, $5, $6::timestamptz)
       ON CONFLICT DO NOTHING`,
      [
        input.communityId,
        input.userId,
        input.partyId,
        input.sourceEventKey,
        input.evidenceSha256,
        input.boundAt,
      ],
    );
    if (inserted.rowCount === 1) return 'bound';
    const winner = await this.findPartyByHeartbeatUser(
      input.communityId,
      input.userId,
    );
    return winner === input.partyId ? 'existing' : 'conflict';
  }

  async findCatalogMatches(
    event: PreparedCommunityLifecycleEnvelope,
  ): Promise<LifecycleCatalogMatch[]> {
    const result = await this.client.query<{
      id: string;
      entry_key: string;
      catalog_revision: number;
      mapping_scope: LifecycleCatalogMatch['mappingScope'];
      policy_version: string;
    }>(
      `SELECT id::text, entry_key, catalog_revision, mapping_scope, policy_version
         FROM business_v2.student_lifecycle_catalog_entries
        WHERE workspace = 'community'
          AND heartbeat_community_id = $1::uuid
          AND lifecycle_enabled = true
          AND effective_from <= $4::timestamptz
          AND (effective_until IS NULL OR effective_until > $4::timestamptz)
          AND ($2::uuid IS NULL OR heartbeat_group_id = $2::uuid)
          AND ($3::uuid IS NULL OR heartbeat_course_id = $3::uuid)
        ORDER BY mapping_scope DESC, id`,
      [
        event.heartbeat.community_id,
        event.heartbeat.group_id,
        event.heartbeat.course_id,
        event.observed_at,
      ],
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      entryKey: row.entry_key,
      catalogRevision: row.catalog_revision,
      mappingScope: row.mapping_scope,
      policyVersion: row.policy_version,
    }));
  }

  async insertEvent(input: {
    event: PreparedCommunityLifecycleEnvelope;
    webhookInboxId: number;
    partyId: number | null;
    catalog: LifecycleCatalogMatch | null;
    mappingStatus: LifecycleMappingStatus;
    processingStatus: 'normalized' | 'quarantined';
  }): Promise<LifecycleEventRecord> {
    const event = input.event;
    const values = [
      event.schema_version,
      event.delivery_id,
      event.action,
      event.source_event_key,
      event.event_name,
      event.observed_at,
      input.webhookInboxId,
      input.partyId,
      input.catalog?.id ?? null,
      event.heartbeat.community_id,
      event.heartbeat.user_id,
      event.heartbeat.group_id,
      event.heartbeat.course_id,
      event.heartbeat.cohort_id,
      event.heartbeat.lesson_id,
      event.heartbeat.invitation_id,
      event.heartbeat.event_id,
      event.heartbeat.channel_id,
      event.heartbeat.thread_id,
      event.heartbeat.chat_id,
      event.heartbeat.message_id,
      event.heartbeat.document_id,
      event.identity_fingerprint,
      event.payload_sha256,
      input.mappingStatus,
      input.processingStatus,
      JSON.stringify(event.facts),
    ];
    const result = await this.client.query<{ id: string }>(
      `INSERT INTO business_v2.student_lifecycle_events
         (schema_version, workspace, delivery_id, source_system, source_action,
          source_event_key, event_name, observed_at, webhook_inbox_id, party_id,
          catalog_entry_id, heartbeat_community_id, heartbeat_user_id,
          heartbeat_group_id, heartbeat_course_id, heartbeat_cohort_id,
          heartbeat_lesson_id, heartbeat_invitation_id, heartbeat_event_id,
          heartbeat_channel_id, heartbeat_thread_id, heartbeat_chat_id,
          heartbeat_message_id, heartbeat_document_id, identity_fingerprint,
          payload_sha256, relay_authenticity, provider_authenticity,
          mapping_status, processing_status, facts)
       VALUES
         ($1, 'community', $2::uuid, 'heartbeat', $3, $4, $5, $6::timestamptz,
          $7, $8, $9, $10::uuid, $11::uuid, $12::uuid, $13::uuid, $14::uuid,
          $15::uuid, $16::uuid, $17::uuid, $18::uuid, $19::uuid, $20::uuid,
          $21::uuid, $22::uuid, $23, $24, 'hmac_verified',
          'source_asserted_unreconciled', $25, $26, $27::jsonb)
       ON CONFLICT (source_event_key) DO NOTHING
       RETURNING id::text`,
      values,
    );
    if (result.rows[0])
      return { id: Number(result.rows[0].id), duplicate: false };
    const existing = await this.client.query<{
      id: string;
      source_action: string;
      payload_sha256: string;
    }>(
      `SELECT id::text, source_action, payload_sha256
         FROM business_v2.student_lifecycle_events
        WHERE source_event_key = $1`,
      [event.source_event_key],
    );
    if (
      !existing.rows[0] ||
      existing.rows[0].source_action !== event.action ||
      existing.rows[0].payload_sha256 !== event.payload_sha256
    ) {
      throw new Error('student_lifecycle_source_event_conflict');
    }
    return { id: Number(existing.rows[0].id), duplicate: true };
  }

  async markEvent(input: {
    eventId: number;
    partyId: number | null;
    catalog: LifecycleCatalogMatch | null;
    mappingStatus: LifecycleMappingStatus;
    processingStatus: 'applied' | 'quarantined';
  }): Promise<void> {
    await this.client.query(
      `UPDATE business_v2.student_lifecycle_events
          SET party_id = $2,
              catalog_entry_id = $3,
              mapping_status = $4,
              processing_status = $5
        WHERE id = $1`,
      [
        input.eventId,
        input.partyId,
        input.catalog?.id ?? null,
        input.mappingStatus,
        input.processingStatus,
      ],
    );
  }

  async ensureException(input: {
    eventId: number;
    sourceEventKey: string;
    reasonCode: string;
    evidenceSha256: string;
    observedAt: string;
  }): Promise<void> {
    const fingerprint = exceptionFingerprint(
      input.sourceEventKey,
      input.reasonCode,
    );
    await this.client.query(
      `INSERT INTO business_v2.student_lifecycle_exceptions
         (fingerprint, workspace, event_id, reason_code, severity, status,
          owner_group, evidence_sha256, first_seen_at, last_seen_at, review_due_at)
       VALUES
         ($1, 'community', $2, $3, 'p1', 'open', 'chief', $4,
          $5::timestamptz, $5::timestamptz, $5::timestamptz + interval '24 hours')
       ON CONFLICT (fingerprint) DO UPDATE
         SET event_id = EXCLUDED.event_id,
             occurrence_count =
               business_v2.student_lifecycle_exceptions.occurrence_count + 1,
             last_seen_at = GREATEST(
               business_v2.student_lifecycle_exceptions.last_seen_at,
               EXCLUDED.last_seen_at
             ),
             evidence_sha256 = EXCLUDED.evidence_sha256,
             status = 'open',
             resolution_code = NULL,
             resolution_receipt_sha256 = NULL,
             resolved_at = NULL,
             updated_at = now()`,
      [
        fingerprint,
        input.eventId,
        input.reasonCode,
        input.evidenceSha256,
        input.observedAt,
      ],
    );
  }

  async listActiveEnrollmentsForUser(input: {
    communityId: string;
    userId: string;
    partyId: number;
  }): Promise<LifecycleEnrollmentRecord[]> {
    const result = await this.client.query<DbRow>(
      `SELECT e.*,
              c.policy_version,
              c.catalog_revision
         FROM business_v2.student_lifecycle_enrollments e
         LEFT JOIN business_v2.student_lifecycle_catalog_entries c
           ON c.id = e.catalog_entry_id
        WHERE e.workspace = 'community'
          AND e.heartbeat_community_id = $1::uuid
          AND e.heartbeat_user_id = $2::uuid
          AND e.party_id = $3
          AND e.ended_at IS NULL
        ORDER BY e.id
        FOR UPDATE OF e`,
      [input.communityId, input.userId, input.partyId],
    );
    return result.rows.map(enrollmentFromRow);
  }

  async ensureEnrollment(input: {
    event: PreparedCommunityLifecycleEnvelope;
    partyId: number;
    catalog: LifecycleCatalogMatch;
  }): Promise<LifecycleEnrollmentRecord> {
    const event = input.event;
    const enrollmentKey = `hb:v1:community:enrollment:${event.heartbeat.user_id}:${input.catalog.entryKey}`;
    await this.client.query(
      `INSERT INTO business_v2.student_lifecycle_enrollments
         (enrollment_key, workspace, party_id, heartbeat_community_id,
          heartbeat_user_id, heartbeat_group_id, heartbeat_course_id,
          heartbeat_cohort_id, catalog_entry_id, started_at)
       VALUES
         ($1, 'community', $2, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
          $7::uuid, $8, $9::timestamptz)
       ON CONFLICT (enrollment_key) DO NOTHING`,
      [
        enrollmentKey,
        input.partyId,
        event.heartbeat.community_id,
        event.heartbeat.user_id,
        event.heartbeat.group_id,
        event.heartbeat.course_id,
        event.heartbeat.cohort_id,
        input.catalog.id,
        event.observed_at,
      ],
    );
    const result = await this.client.query<DbRow>(
      `SELECT e.*,
              c.policy_version,
              c.catalog_revision
         FROM business_v2.student_lifecycle_enrollments e
         JOIN business_v2.student_lifecycle_catalog_entries c
           ON c.id = e.catalog_entry_id
        WHERE e.enrollment_key = $1
        FOR UPDATE OF e`,
      [enrollmentKey],
    );
    return enrollmentFromRow(result.rows[0]);
  }

  async applyProjection(input: {
    enrollment: LifecycleEnrollmentRecord;
    next: LifecycleProjection;
    changes: ProjectionChange[];
    eventId: number;
    effectiveAt: string;
  }): Promise<number> {
    const nextVersion = input.enrollment.version + 1;
    const updated = await this.client.query<{ version: number }>(
      `UPDATE business_v2.student_lifecycle_enrollments
          SET version = version + 1,
              access_state = $3,
              activation_state = $4,
              learning_state = $5,
              grading_state = $6,
              feedback_state = $7,
              certificate_state = $8,
              finance_state = $9,
              marketing_consent_state = $10,
              contact_suppression_state = $11,
              last_event_id = $12,
              updated_at = now()
        WHERE id = $1 AND version = $2
        RETURNING version`,
      [
        input.enrollment.id,
        input.enrollment.version,
        input.next.access,
        input.next.activation,
        input.next.learning,
        input.next.grading,
        input.next.feedback,
        input.next.certificate,
        input.next.finance,
        input.next.marketing_consent,
        input.next.contact_suppression,
        input.eventId,
      ],
    );
    if (updated.rowCount !== 1 || updated.rows[0].version !== nextVersion) {
      throw new Error('student_lifecycle_projection_version_conflict');
    }
    for (const change of input.changes) {
      await this.client.query(
        `INSERT INTO business_v2.student_lifecycle_state_history
           (enrollment_id, enrollment_version, axis, previous_value, next_value,
            reason_code, event_id, policy_version, catalog_revision, effective_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)`,
        [
          input.enrollment.id,
          nextVersion,
          change.axis,
          change.previous,
          change.next,
          change.reason,
          input.eventId,
          input.enrollment.policyVersion,
          input.enrollment.catalogRevision,
          input.effectiveAt,
        ],
      );
    }
    return nextVersion;
  }

  async recordReconciliationRun(
    input: LifecycleReconciliationRunInput,
  ): Promise<{ id: number; duplicate: boolean }> {
    const result = await this.client.query<{ id: string }>(
      `INSERT INTO business_v2.student_lifecycle_reconciliation_runs
         (run_key, workspace, run_type, scope_key, catalog_revision,
          source_snapshot_sha256, watermark_before, watermark_after,
          scopes_expected, scopes_observed, facts_new, facts_unchanged,
          facts_conflicting, facts_quarantined, status, error_code,
          started_at, completed_at)
       VALUES
         ($1, 'community', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16::timestamptz, $17::timestamptz)
       ON CONFLICT (run_key) DO NOTHING
       RETURNING id::text`,
      [
        input.runKey,
        input.runType,
        input.scopeKey,
        input.catalogRevision,
        input.sourceSnapshotSha256,
        input.watermarkBefore,
        input.watermarkAfter,
        input.scopesExpected,
        input.scopesObserved,
        input.factsNew,
        input.factsUnchanged,
        input.factsConflicting,
        input.factsQuarantined,
        input.status,
        input.errorCode,
        input.startedAt,
        input.completedAt,
      ],
    );
    if (result.rows[0])
      return { id: Number(result.rows[0].id), duplicate: false };
    const existing = await this.client.query<{
      id: string;
      run_type: LifecycleReconciliationRunInput['runType'];
      scope_key: string;
      catalog_revision: number | null;
      source_snapshot_sha256: string;
      watermark_before: string | null;
      watermark_after: string | null;
      scopes_expected: number;
      scopes_observed: number;
      facts_new: number;
      facts_unchanged: number;
      facts_conflicting: number;
      facts_quarantined: number;
      status: LifecycleReconciliationRunInput['status'];
      error_code: string | null;
      started_at: Date;
      completed_at: Date | null;
    }>(
      `SELECT id::text, run_type, scope_key, catalog_revision,
              source_snapshot_sha256, watermark_before, watermark_after,
              scopes_expected, scopes_observed, facts_new, facts_unchanged,
              facts_conflicting, facts_quarantined, status, error_code,
              started_at, completed_at
         FROM business_v2.student_lifecycle_reconciliation_runs
        WHERE run_key = $1`,
      [input.runKey],
    );
    const row = existing.rows[0];
    if (
      !row ||
      row.run_type !== input.runType ||
      row.scope_key !== input.scopeKey ||
      row.catalog_revision !== input.catalogRevision ||
      row.source_snapshot_sha256 !== input.sourceSnapshotSha256 ||
      row.watermark_before !== input.watermarkBefore ||
      row.watermark_after !== input.watermarkAfter ||
      row.scopes_expected !== input.scopesExpected ||
      row.scopes_observed !== input.scopesObserved ||
      row.facts_new !== input.factsNew ||
      row.facts_unchanged !== input.factsUnchanged ||
      row.facts_conflicting !== input.factsConflicting ||
      row.facts_quarantined !== input.factsQuarantined ||
      row.status !== input.status ||
      row.error_code !== input.errorCode ||
      row.started_at.toISOString() !== input.startedAt ||
      row.completed_at?.toISOString() !== input.completedAt
    ) {
      throw new Error('student_lifecycle_reconciliation_run_conflict');
    }
    return { id: Number(existing.rows[0].id), duplicate: true };
  }

  async health(): Promise<StudentLifecycleHealth> {
    const result = await this.client.query<{
      event_count: string;
      active_enrollment_count: string;
      open_exception_count: string;
      last_event_received_at: Date | null;
      last_reconciliation_completed_at: Date | null;
    }>('SELECT * FROM business_v2.v_student_lifecycle_health');
    const row = result.rows[0];
    return {
      eventCount: Number(row.event_count),
      activeEnrollmentCount: Number(row.active_enrollment_count),
      openExceptionCount: Number(row.open_exception_count),
      lastEventReceivedAt: row.last_event_received_at?.toISOString() ?? null,
      lastReconciliationCompletedAt:
        row.last_reconciliation_completed_at?.toISOString() ?? null,
    };
  }
}

export async function recordPreparedCommunityLifecycle(input: {
  event: PreparedCommunityLifecycleEnvelope;
  webhookInboxId: number;
  transientEmail?: string | null;
}): Promise<LifecycleProcessResult> {
  return withAgentContext('student-lifecycle', async (client) =>
    processPreparedCommunityLifecycle({
      repository: new PostgresStudentLifecycleRepository(client),
      event: input.event,
      webhookInboxId: input.webhookInboxId,
      transientEmail: input.transientEmail,
    }),
  );
}

export async function readStudentLifecycleHealth(): Promise<StudentLifecycleHealth> {
  return withAgentContext('student-lifecycle-health', async (client) =>
    new PostgresStudentLifecycleRepository(client).health(),
  );
}

export async function recordStudentLifecycleReconciliationRun(
  input: LifecycleReconciliationRunInput,
): Promise<{ id: number; duplicate: boolean }> {
  return withAgentContext('student-lifecycle-reconciliation', async (client) =>
    new PostgresStudentLifecycleRepository(client).recordReconciliationRun(
      input,
    ),
  );
}
