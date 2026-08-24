import crypto from 'node:crypto';

import type { PoolClient, QueryResultRow } from 'pg';

import { reconcileCatalogSnapshot } from './student-lifecycle-reconciliation.js';
import { PostgresStudentLifecycleRepository } from './student-lifecycle-store.js';
import {
  type StudentLifecycleShadowCatalogEntry,
  type StudentLifecycleShadowManifest,
  studentLifecycleShadowManifestSha256,
} from './student-lifecycle-shadow-manifest.js';

export const STUDENT_LIFECYCLE_CATALOG_APPLY_CONFIRMATION =
  'NC-20260824-007-APPLY-CATALOG' as const;

export interface StudentLifecycleCatalogCurrentEntry {
  entryKey: string;
  catalogRevision: number;
  catalogSha256: string;
  communityId: string;
  groupId: string | null;
  courseId: string | null;
  cohortId: string | null;
  language: string;
  mappingScope: string;
  lifecycleEnabled: boolean;
  policyVersion: string;
  sourceRef: string;
  evidenceSha256: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
}

export interface StudentLifecycleCatalogPlanEntry {
  entryKey: string;
  disposition: 'insert' | 'unchanged';
}

export interface StudentLifecycleCatalogReport {
  mode: 'dry_run' | 'apply';
  manifestSha256: string;
  catalogRevision: number;
  planned: StudentLifecycleCatalogPlanEntry[];
  inserted: number;
  unchanged: number;
  receiptId: number | null;
  receiptDuplicate: boolean | null;
  actionAuthority: 'none';
  circle: false;
}

interface CatalogRow extends QueryResultRow {
  entry_key: string;
  catalog_revision: number;
  catalog_sha256: string;
  heartbeat_community_id: string;
  heartbeat_group_id: string | null;
  heartbeat_course_id: string | null;
  heartbeat_cohort_id: string | null;
  language: string;
  mapping_scope: string;
  lifecycle_enabled: boolean;
  policy_version: string;
  source_ref: string;
  evidence_sha256: string;
  effective_from: string;
  effective_until: string | null;
}

function expectedCurrentEntry(
  manifest: StudentLifecycleShadowManifest,
  entry: StudentLifecycleShadowCatalogEntry,
  manifestSha256: string,
): StudentLifecycleCatalogCurrentEntry {
  return {
    entryKey: entry.entry_key,
    catalogRevision: manifest.catalog_revision,
    catalogSha256: manifestSha256,
    communityId: manifest.community_id,
    groupId: entry.heartbeat_group_id,
    courseId: entry.heartbeat_course_id,
    cohortId: entry.heartbeat_cohort_id,
    language: entry.language,
    mappingScope: entry.mapping_scope,
    lifecycleEnabled: true,
    policyVersion: manifest.policy_version,
    sourceRef: entry.source_ref,
    evidenceSha256: manifestSha256,
    effectiveFrom: manifest.effective_from,
    effectiveUntil: null,
  };
}

function normalizeRow(row: CatalogRow): StudentLifecycleCatalogCurrentEntry {
  return {
    entryKey: row.entry_key,
    catalogRevision: Number(row.catalog_revision),
    catalogSha256: row.catalog_sha256,
    communityId: row.heartbeat_community_id,
    groupId: row.heartbeat_group_id,
    courseId: row.heartbeat_course_id,
    cohortId: row.heartbeat_cohort_id,
    language: row.language,
    mappingScope: row.mapping_scope,
    lifecycleEnabled: row.lifecycle_enabled,
    policyVersion: row.policy_version,
    sourceRef: row.source_ref,
    evidenceSha256: row.evidence_sha256,
    effectiveFrom: new Date(row.effective_from).toISOString(),
    effectiveUntil: row.effective_until
      ? new Date(row.effective_until).toISOString()
      : null,
  };
}

export function planStudentLifecycleCatalog(input: {
  manifest: StudentLifecycleShadowManifest;
  current: StudentLifecycleCatalogCurrentEntry[];
}): StudentLifecycleCatalogPlanEntry[] {
  const digest = studentLifecycleShadowManifestSha256(input.manifest);
  const currentByKey = new Map(
    input.current.map((entry) => [entry.entryKey, entry]),
  );
  return input.manifest.catalog_entries.map((entry) => {
    const expected = expectedCurrentEntry(input.manifest, entry, digest);
    const current = currentByKey.get(entry.entry_key);
    if (!current) return { entryKey: entry.entry_key, disposition: 'insert' };
    if (JSON.stringify(current) !== JSON.stringify(expected)) {
      throw new Error(`student_lifecycle_catalog_conflict:${entry.entry_key}`);
    }
    return { entryKey: entry.entry_key, disposition: 'unchanged' };
  });
}

async function readCurrent(
  client: PoolClient,
  entryKeys: string[],
): Promise<StudentLifecycleCatalogCurrentEntry[]> {
  const result = await client.query<CatalogRow>(
    `SELECT entry_key, catalog_revision, catalog_sha256,
            heartbeat_community_id::text, heartbeat_group_id::text,
            heartbeat_course_id::text, heartbeat_cohort_id::text,
            language, mapping_scope, lifecycle_enabled, policy_version,
            source_ref, evidence_sha256, effective_from::text,
            effective_until::text
       FROM business_v2.student_lifecycle_catalog_entries
      WHERE entry_key = ANY($1::text[])
      ORDER BY entry_key`,
    [entryKeys],
  );
  return result.rows.map(normalizeRow);
}

export async function runStudentLifecycleCatalog(input: {
  client: PoolClient;
  manifest: StudentLifecycleShadowManifest;
  mode: 'dry_run' | 'apply';
  observedAt: string;
}): Promise<StudentLifecycleCatalogReport> {
  const digest = studentLifecycleShadowManifestSha256(input.manifest);
  const keys = input.manifest.catalog_entries.map((entry) => entry.entry_key);
  if (input.mode === 'apply') {
    await input.client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('student-lifecycle-shadow-catalog:v1', 0))",
    );
  }
  let current = await readCurrent(input.client, keys);
  const planned = planStudentLifecycleCatalog({
    manifest: input.manifest,
    current,
  });
  if (input.mode === 'dry_run') {
    return {
      mode: 'dry_run',
      manifestSha256: digest,
      catalogRevision: input.manifest.catalog_revision,
      planned,
      inserted: 0,
      unchanged: planned.filter((entry) => entry.disposition === 'unchanged')
        .length,
      receiptId: null,
      receiptDuplicate: null,
      actionAuthority: 'none',
      circle: false,
    };
  }

  let inserted = 0;
  for (const entry of input.manifest.catalog_entries) {
    if (
      !planned.some(
        (plan) =>
          plan.entryKey === entry.entry_key && plan.disposition === 'insert',
      )
    )
      continue;
    const result = await input.client.query(
      `INSERT INTO business_v2.student_lifecycle_catalog_entries
         (entry_key, catalog_revision, catalog_sha256, workspace,
          heartbeat_community_id, heartbeat_group_id, heartbeat_course_id,
          heartbeat_cohort_id, language, mapping_scope, lifecycle_enabled,
          policy_version, source_ref, evidence_sha256, effective_from)
       VALUES
         ($1, $2, $3, 'community', $4::uuid, $5::uuid, $6::uuid, $7::uuid,
          $8, 'exact_cohort', true, $9, $10, $3, $11::timestamptz)
       ON CONFLICT (entry_key) DO NOTHING`,
      [
        entry.entry_key,
        input.manifest.catalog_revision,
        digest,
        input.manifest.community_id,
        entry.heartbeat_group_id,
        entry.heartbeat_course_id,
        entry.heartbeat_cohort_id,
        entry.language,
        input.manifest.policy_version,
        entry.source_ref,
        input.manifest.effective_from,
      ],
    );
    inserted += result.rowCount ?? 0;
  }
  current = await readCurrent(input.client, keys);
  planStudentLifecycleCatalog({ manifest: input.manifest, current });
  const receipt = await reconcileCatalogSnapshot({
    repository: new PostgresStudentLifecycleRepository(input.client),
    snapshot: {
      runKey: `catalog:community:r${input.manifest.catalog_revision}:${digest.slice(0, 16)}:${crypto.createHash('sha256').update(JSON.stringify(planned)).digest('hex').slice(0, 16)}`,
      runType: 'catalog',
      scopeKey: 'heartbeat:community:catalog',
      catalogRevision: input.manifest.catalog_revision,
      expectedScopeKeys: keys,
      observedScopes: keys.map((key) => ({
        key,
        sha256: digest,
        disposition:
          planned.find((entry) => entry.entryKey === key)!.disposition ===
          'insert'
            ? 'new'
            : 'unchanged',
      })),
      watermarkBefore: null,
      watermarkCandidate: digest,
      startedAt: input.observedAt,
      completedAt: input.observedAt,
    },
  });
  return {
    mode: 'apply',
    manifestSha256: digest,
    catalogRevision: input.manifest.catalog_revision,
    planned,
    inserted,
    unchanged: planned.length - inserted,
    receiptId: receipt.receiptId,
    receiptDuplicate: receipt.duplicate,
    actionAuthority: 'none',
    circle: false,
  };
}
