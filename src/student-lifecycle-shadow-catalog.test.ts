import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { planStudentLifecycleCatalog } from './student-lifecycle-shadow-catalog.js';
import {
  parseStudentLifecycleShadowManifest,
  studentLifecycleShadowManifestSha256,
} from './student-lifecycle-shadow-manifest.js';
const manifest = parseStudentLifecycleShadowManifest(
  JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        'facts/catalogs/student-lifecycle-community-shadow-v1.json',
      ),
      'utf8',
    ),
  ),
);

function exactCurrent() {
  const entry = manifest.catalog_entries[0];
  const digest = studentLifecycleShadowManifestSha256(manifest);
  return {
    entryKey: entry.entry_key,
    catalogRevision: manifest.catalog_revision,
    catalogSha256: digest,
    communityId: manifest.community_id,
    groupId: entry.heartbeat_group_id,
    courseId: entry.heartbeat_course_id,
    cohortId: entry.heartbeat_cohort_id,
    language: entry.language,
    mappingScope: entry.mapping_scope,
    lifecycleEnabled: true,
    policyVersion: manifest.policy_version,
    sourceRef: entry.source_ref,
    evidenceSha256: digest,
    effectiveFrom: manifest.effective_from,
    effectiveUntil: null,
  };
}

describe('Community lifecycle shadow catalog', () => {
  it('plans one insert for an empty catalog and exact replay as unchanged', () => {
    expect(planStudentLifecycleCatalog({ manifest, current: [] })).toEqual([
      {
        entryKey: manifest.catalog_entries[0].entry_key,
        disposition: 'insert',
      },
    ]);
    expect(
      planStudentLifecycleCatalog({ manifest, current: [exactCurrent()] }),
    ).toEqual([
      {
        entryKey: manifest.catalog_entries[0].entry_key,
        disposition: 'unchanged',
      },
    ]);
  });

  it('refuses same-key catalog drift', () => {
    expect(() =>
      planStudentLifecycleCatalog({
        manifest,
        current: [
          {
            ...exactCurrent(),
            cohortId: '11111111-1111-4111-8111-111111111111',
          },
        ],
      }),
    ).toThrow('student_lifecycle_catalog_conflict');
  });
});
