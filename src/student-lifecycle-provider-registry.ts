import crypto from 'node:crypto';
import fs from 'node:fs';

import { reconcileRegistrySnapshot } from './student-lifecycle-reconciliation.js';
import type { StudentLifecycleRepository } from './student-lifecycle-store.js';
import { STUDENT_LIFECYCLE_SHADOW_ACTIONS } from './student-lifecycle-shadow-manifest.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

export interface LifecycleProviderRegistration {
  id: string;
  action: string;
  filter: Record<string, unknown>;
  destination_host: string;
  url_sha256: string;
}

export interface LifecycleProviderBaseline {
  schema_version: 1;
  workspace: 'community';
  captured_at: string;
  community_id: string;
  registrations: LifecycleProviderRegistration[];
}

export interface LifecycleProviderRegistryReport {
  phase: 'baseline' | 'shadow';
  baselineCount: number;
  shadowCount: number;
  totalCount: number;
  snapshotSha256: string;
  receiptId: number | null;
  receiptDuplicate: boolean | null;
  status: 'completed';
  legacyUnchanged: true;
  actions: string[];
  circle: false;
  actionAuthority: 'none';
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

function hash(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonical(value)), 'utf8')
    .digest('hex');
}

function assertRegistration(entry: LifecycleProviderRegistration): void {
  if (
    !UUID.test(entry.id) ||
    typeof entry.action !== 'string' ||
    !entry.filter ||
    Array.isArray(entry.filter) ||
    typeof entry.filter !== 'object' ||
    !/^[A-Za-z0-9.-]{1,253}$/.test(entry.destination_host) ||
    !SHA256.test(entry.url_sha256)
  ) {
    throw new Error('student_lifecycle_registry_entry_invalid');
  }
}

export function loadLifecycleProviderBaseline(
  filePath: string,
): LifecycleProviderBaseline {
  const value = JSON.parse(
    fs.readFileSync(filePath, 'utf8'),
  ) as LifecycleProviderBaseline;
  if (
    value.schema_version !== 1 ||
    value.workspace !== 'community' ||
    !UUID.test(value.community_id) ||
    new Date(value.captured_at).toISOString() !== value.captured_at ||
    !Array.isArray(value.registrations)
  ) {
    throw new Error('student_lifecycle_registry_baseline_invalid');
  }
  value.registrations.forEach(assertRegistration);
  if (
    new Set(value.registrations.map((entry) => entry.id)).size !==
    value.registrations.length
  ) {
    throw new Error('student_lifecycle_registry_duplicate_id');
  }
  return value;
}

export function loadLifecycleProviderSnapshot(
  filePath: string,
): LifecycleProviderRegistration[] {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  const value =
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'data' in parsed
      ? (parsed as { data: unknown }).data
      : parsed;
  if (!Array.isArray(value))
    throw new Error('student_lifecycle_registry_snapshot_invalid');
  const registrations = value as LifecycleProviderRegistration[];
  registrations.forEach(assertRegistration);
  if (
    new Set(registrations.map((entry) => entry.id)).size !==
    registrations.length
  ) {
    throw new Error('student_lifecycle_registry_duplicate_id');
  }
  return registrations;
}

export function compareLifecycleProviderRegistry(input: {
  baseline: LifecycleProviderBaseline;
  current: LifecycleProviderRegistration[];
  phase: 'baseline' | 'shadow';
  shadowDestinationHost?: string;
  shadowUrlSha256?: string;
}): Omit<LifecycleProviderRegistryReport, 'receiptId' | 'receiptDuplicate'> {
  const currentById = new Map(input.current.map((entry) => [entry.id, entry]));
  for (const baseline of input.baseline.registrations) {
    const observed = currentById.get(baseline.id);
    if (
      !observed ||
      JSON.stringify(canonical(observed)) !==
        JSON.stringify(canonical(baseline))
    ) {
      throw new Error(`student_lifecycle_legacy_registry_drift:${baseline.id}`);
    }
  }
  const baselineIds = new Set(
    input.baseline.registrations.map((entry) => entry.id),
  );
  const shadow = input.current.filter((entry) => !baselineIds.has(entry.id));
  if (input.phase === 'baseline') {
    if (shadow.length !== 0)
      throw new Error('student_lifecycle_unexpected_registry_addition');
  } else {
    if (
      !input.shadowDestinationHost ||
      !/^[A-Za-z0-9.-]{1,253}$/.test(input.shadowDestinationHost) ||
      !input.shadowUrlSha256 ||
      !SHA256.test(input.shadowUrlSha256)
    ) {
      throw new Error('student_lifecycle_shadow_registry_expectation_invalid');
    }
    if (shadow.length !== STUDENT_LIFECYCLE_SHADOW_ACTIONS.length) {
      throw new Error('student_lifecycle_shadow_registry_count_invalid');
    }
    const actions = shadow.map((entry) => entry.action).sort();
    const expected = [...STUDENT_LIFECYCLE_SHADOW_ACTIONS].sort();
    if (
      JSON.stringify(actions) !== JSON.stringify(expected) ||
      shadow.some(
        (entry) =>
          Object.keys(entry.filter).length !== 0 ||
          entry.destination_host !== input.shadowDestinationHost ||
          entry.url_sha256 !== input.shadowUrlSha256,
      )
    ) {
      throw new Error('student_lifecycle_shadow_registry_manifest_mismatch');
    }
  }
  return {
    phase: input.phase,
    baselineCount: input.baseline.registrations.length,
    shadowCount: shadow.length,
    totalCount: input.current.length,
    snapshotSha256: hash(input.current),
    status: 'completed',
    legacyUnchanged: true,
    actions: shadow.map((entry) => entry.action).sort(),
    circle: false,
    actionAuthority: 'none',
  };
}

export async function reconcileLifecycleProviderRegistry(input: {
  repository: Pick<StudentLifecycleRepository, 'recordReconciliationRun'>;
  baseline: LifecycleProviderBaseline;
  current: LifecycleProviderRegistration[];
  phase: 'baseline' | 'shadow';
  observedAt: string;
  shadowDestinationHost?: string;
  shadowUrlSha256?: string;
}): Promise<LifecycleProviderRegistryReport> {
  const compared = compareLifecycleProviderRegistry(input);
  const scopes = input.current.map((entry) => ({
    key: `heartbeat:webhook:${entry.id}`,
    sha256: hash(entry),
    disposition: input.baseline.registrations.some(
      (baseline) => baseline.id === entry.id,
    )
      ? ('unchanged' as const)
      : ('new' as const),
  }));
  const receipt = await reconcileRegistrySnapshot({
    repository: input.repository,
    snapshot: {
      runKey: `registry:community:${input.phase}:${compared.snapshotSha256.slice(0, 16)}`,
      runType: 'registry',
      scopeKey: 'heartbeat:community:webhooks',
      expectedScopeKeys: scopes.map((scope) => scope.key),
      observedScopes: scopes,
      watermarkBefore: null,
      watermarkCandidate: compared.snapshotSha256,
      startedAt: input.observedAt,
      completedAt: input.observedAt,
    },
  });
  return {
    ...compared,
    receiptId: receipt.receiptId,
    receiptDuplicate: receipt.duplicate,
  };
}
