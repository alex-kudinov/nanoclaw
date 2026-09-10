import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { DATA_DIR } from './config.js';
import { readEnvFile } from './env.js';
import type { ReleaseIdentity } from './release-integrity.js';
import type { StudentEnrollmentPilotConfig } from './student-enrollment-production.js';

function decodeKey(value: string | undefined): Uint8Array | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.startsWith('base64:')) return Buffer.from(raw.slice(7), 'base64');
  return Buffer.from(raw, 'utf8');
}

export function resolveStudentEnrollmentPilotConfig(
  release: ReleaseIdentity,
): StudentEnrollmentPilotConfig {
  const env = readEnvFile([
    'STUDENT_ENROLLMENT_PILOT_ENABLED',
    'STUDENT_ENROLLMENT_PILOT_ACTIVATION_EPOCH',
    'STUDENT_ENROLLMENT_PILOT_EXPECTED_RELEASE_COMMIT',
    'STUDENT_ENROLLMENT_PILOT_PREFLIGHT_RECEIPT_SHA256',
    'STUDENT_ENROLLMENT_PILOT_MARKER_GROUP_ID',
    'STUDENT_ENROLLMENT_PILOT_PROVIDER_EVENT_KEY',
    'STUDENT_ENROLLMENT_PILOT_PROVIDER_READ_KEY',
    'STUDENT_ENROLLMENT_PILOT_OWNER_DECISION_KEY',
  ]);
  const enabled = env.STUDENT_ENROLLMENT_PILOT_ENABLED === '1';
  const codeRoot = process.env.NANOCLAW_CODE_ROOT || process.cwd();
  const catalogPath = path.join(
    codeRoot,
    'facts/catalogs/student-entitlements-v1.json',
  );
  const bytes = fs.readFileSync(catalogPath);
  const catalog = JSON.parse(bytes.toString('utf8')) as {
    bundles: Array<{
      bundle_key: string;
      components: Array<{
        component_key: string;
        inclusion: 'included' | 'conditional' | 'earned_on_completion';
      }>;
    }>;
  };
  const bundle = catalog.bundles.find(
    (item) => item.bundle_key === 'coaching-supervision-mastery:v1',
  );
  if (!bundle) throw new Error('enrollment_pilot_catalog_bundle_missing');
  const markerGroupId = env.STUDENT_ENROLLMENT_PILOT_MARKER_GROUP_ID || null;
  const preflight =
    env.STUDENT_ENROLLMENT_PILOT_PREFLIGHT_RECEIPT_SHA256 || null;
  const ready = enabled && Boolean(markerGroupId && preflight);
  return {
    enabled,
    activationEpoch: env.STUDENT_ENROLLMENT_PILOT_ACTIVATION_EPOCH || null,
    expectedReleaseCommit:
      env.STUDENT_ENROLLMENT_PILOT_EXPECTED_RELEASE_COMMIT || null,
    release,
    databaseName: 'nanoclaw_business',
    databaseRole: 'nanoclaw_admin',
    preflightReceiptSha256: preflight,
    markerGroupId,
    markerGroupName: 'class:supervision:live-practicum:2026-10-07:inaugural',
    providerEventKey: decodeKey(
      env.STUDENT_ENROLLMENT_PILOT_PROVIDER_EVENT_KEY,
    ),
    providerReadKey: decodeKey(env.STUDENT_ENROLLMENT_PILOT_PROVIDER_READ_KEY),
    ownerDecisionKey: decodeKey(
      env.STUDENT_ENROLLMENT_PILOT_OWNER_DECISION_KEY,
    ),
    catalogEvidenceSha256: createHash('sha256').update(bytes).digest('hex'),
    components: bundle.components.map((component) => ({
      componentKey: component.component_key,
      state: component.inclusion,
      requiresAssignment:
        component.component_key === 'supervision.live-practicum',
    })),
    readiness: [
      {
        target: 'student_roster',
        disposition: 'required',
        reviewedAdapter: true,
        destinationKey: 'student-roster:1796552584:css',
        applyPath: 'google_sheets.values.update exact assignment-owned row',
        readbackPath: 'google_sheets.values.get exact A:M row',
        rollbackSemantics: 'restore receipt-owned A:M preimage only',
        reconciliationSemantics: 'exact normalized row hash',
        permissionReady: ready,
        activationReady: ready,
      },
      {
        target: 'heartbeat',
        disposition: 'required',
        reviewedAdapter: true,
        destinationKey: markerGroupId
          ? `heartbeat:main:fa5f5f09-a10e-4dfd-8bf2-0451f7cffa83:${markerGroupId}`
          : null,
        applyPath: 'documented server API exact group membership writes',
        readbackPath: 'documented server API exact user group-ID readback',
        rollbackSemantics: 'remove receipt-owned memberships only',
        reconciliationSemantics: 'exact two-group membership readback',
        permissionReady: ready,
        activationReady: ready,
      },
      {
        target: 'encharge',
        disposition: 'not_applicable',
        reviewedAdapter: false,
        destinationKey: null,
        applyPath: null,
        readbackPath: null,
        rollbackSemantics: null,
        reconciliationSemantics: null,
        permissionReady: false,
        activationReady: false,
      },
      {
        target: 'plutio',
        disposition: 'not_applicable',
        reviewedAdapter: false,
        destinationKey: null,
        applyPath: null,
        readbackPath: null,
        rollbackSemantics: null,
        reconciliationSemantics: null,
        permissionReady: false,
        activationReady: false,
      },
    ],
  };
}

export function studentEnrollmentPreimageDirectory(): string {
  return path.join(DATA_DIR, 'student-enrollment-projection-preimages');
}
