import crypto from 'node:crypto';
import fs from 'node:fs';

import {
  HEARTBEAT_ACTIONS,
  type HeartbeatAction,
} from './student-lifecycle.js';

export const STUDENT_LIFECYCLE_SHADOW_MANIFEST_VERSION = 1 as const;
export const STUDENT_LIFECYCLE_SHADOW_ACTIONS = [
  'USER_JOIN',
  'USER_UPDATE',
  'GROUP_JOIN',
  'COURSE_COMPLETED',
] as const satisfies readonly HeartbeatAction[];

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[a-z0-9][a-z0-9._:-]{0,299}$/;

export interface StudentLifecycleShadowRegistration {
  action: (typeof STUDENT_LIFECYCLE_SHADOW_ACTIONS)[number];
  filter: Record<string, never>;
}

export interface StudentLifecycleShadowCatalogEntry {
  entry_key: string;
  heartbeat_group_id: string;
  heartbeat_course_id: string;
  heartbeat_cohort_id: string;
  language: string;
  mapping_scope: 'exact_cohort';
  lifecycle_enabled: true;
  source_ref: string;
}

export interface StudentLifecycleShadowManifest {
  schema_version: typeof STUDENT_LIFECYCLE_SHADOW_MANIFEST_VERSION;
  workspace: 'community';
  mode: 'shadow';
  owner: 'tandem-coaching-academy-operations';
  accountable_owner: 'alex-kudinov';
  community_id: string;
  catalog_revision: number;
  policy_version: string;
  effective_from: string;
  retention: {
    ingress_days: 30;
    failed_identity_days: 7;
    operational_months_after_close: 24;
  };
  heartbeat_actions: Array<(typeof STUDENT_LIFECYCLE_SHADOW_ACTIONS)[number]>;
  registrations: StudentLifecycleShadowRegistration[];
  catalog_entries: StudentLifecycleShadowCatalogEntry[];
  reconciliation: {
    cadence: 'daily';
    six_hour_scopes: [];
    required_run_types: Array<
      'registry' | 'catalog' | 'membership' | 'progress'
    >;
  };
  legacy_cutover: false;
  action_consumers: false;
  circle: false;
  excluded_actions: HeartbeatAction[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

export function studentLifecycleShadowManifestSha256(
  manifest: StudentLifecycleShadowManifest,
): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonical(manifest)), 'utf8')
    .digest('hex');
}

export function parseStudentLifecycleShadowManifest(
  value: unknown,
): StudentLifecycleShadowManifest {
  if (!isRecord(value)) throw new Error('shadow_manifest_not_object');
  const manifest = value as unknown as StudentLifecycleShadowManifest;
  if (
    manifest.schema_version !== 1 ||
    manifest.workspace !== 'community' ||
    manifest.mode !== 'shadow' ||
    manifest.owner !== 'tandem-coaching-academy-operations' ||
    manifest.accountable_owner !== 'alex-kudinov' ||
    !UUID.test(manifest.community_id) ||
    !Number.isInteger(manifest.catalog_revision) ||
    manifest.catalog_revision < 1 ||
    !KEY.test(manifest.policy_version) ||
    new Date(manifest.effective_from).toISOString() !== manifest.effective_from
  ) {
    throw new Error('shadow_manifest_identity_invalid');
  }
  if (
    manifest.retention?.ingress_days !== 30 ||
    manifest.retention.failed_identity_days !== 7 ||
    manifest.retention.operational_months_after_close !== 24
  ) {
    throw new Error('shadow_manifest_retention_invalid');
  }
  const expectedActions = [...STUDENT_LIFECYCLE_SHADOW_ACTIONS];
  if (
    JSON.stringify(manifest.heartbeat_actions) !==
    JSON.stringify(expectedActions)
  ) {
    throw new Error('shadow_manifest_actions_invalid');
  }
  if (
    !Array.isArray(manifest.registrations) ||
    JSON.stringify(manifest.registrations.map((entry) => entry.action)) !==
      JSON.stringify(expectedActions) ||
    manifest.registrations.some(
      (entry) =>
        !isRecord(entry.filter) || Object.keys(entry.filter).length > 0,
    )
  ) {
    throw new Error('shadow_manifest_registrations_invalid');
  }
  if (
    !Array.isArray(manifest.catalog_entries) ||
    manifest.catalog_entries.length < 1 ||
    manifest.catalog_entries.some(
      (entry) =>
        !KEY.test(entry.entry_key) ||
        !UUID.test(entry.heartbeat_group_id) ||
        !UUID.test(entry.heartbeat_course_id) ||
        !UUID.test(entry.heartbeat_cohort_id) ||
        !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(entry.language) ||
        entry.mapping_scope !== 'exact_cohort' ||
        entry.lifecycle_enabled !== true ||
        typeof entry.source_ref !== 'string' ||
        entry.source_ref.length < 1 ||
        entry.source_ref.length > 1000,
    )
  ) {
    throw new Error('shadow_manifest_catalog_invalid');
  }
  const entryKeys = new Set(
    manifest.catalog_entries.map((entry) => entry.entry_key),
  );
  if (entryKeys.size !== manifest.catalog_entries.length) {
    throw new Error('shadow_manifest_catalog_duplicate');
  }
  if (
    manifest.reconciliation?.cadence !== 'daily' ||
    !Array.isArray(manifest.reconciliation.six_hour_scopes) ||
    manifest.reconciliation.six_hour_scopes.length !== 0 ||
    JSON.stringify(manifest.reconciliation.required_run_types) !==
      JSON.stringify(['registry', 'catalog', 'membership', 'progress'])
  ) {
    throw new Error('shadow_manifest_reconciliation_invalid');
  }
  if (
    manifest.legacy_cutover !== false ||
    manifest.action_consumers !== false ||
    manifest.circle !== false
  ) {
    throw new Error('shadow_manifest_boundary_invalid');
  }
  const expectedExcluded = HEARTBEAT_ACTIONS.filter(
    (action) => !STUDENT_LIFECYCLE_SHADOW_ACTIONS.includes(action as never),
  );
  if (
    JSON.stringify(manifest.excluded_actions) !==
    JSON.stringify(expectedExcluded)
  ) {
    throw new Error('shadow_manifest_exclusions_invalid');
  }
  return manifest;
}

export function loadStudentLifecycleShadowManifest(
  filePath: string,
): StudentLifecycleShadowManifest {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  return parseStudentLifecycleShadowManifest(parsed);
}
