import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  loadStudentLifecycleShadowManifest,
  parseStudentLifecycleShadowManifest,
  STUDENT_LIFECYCLE_SHADOW_ACTIONS,
  studentLifecycleShadowManifestSha256,
} from './student-lifecycle-shadow-manifest.js';

const MANIFEST = path.join(
  process.cwd(),
  'facts/catalogs/student-lifecycle-community-shadow-v1.json',
);

describe('Community lifecycle shadow manifest', () => {
  it('loads the exact Community-only four-action manifest', () => {
    const manifest = loadStudentLifecycleShadowManifest(MANIFEST);
    expect(manifest.heartbeat_actions).toEqual(
      STUDENT_LIFECYCLE_SHADOW_ACTIONS,
    );
    expect(manifest.registrations).toHaveLength(4);
    expect(manifest.catalog_entries).toHaveLength(1);
    expect(manifest.circle).toBe(false);
    expect(manifest.action_consumers).toBe(false);
    expect(manifest.legacy_cutover).toBe(false);
    expect(studentLifecycleShadowManifestSha256(manifest)).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it('refuses Circle, consumer, and unapproved-action expansion', () => {
    const raw = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    expect(() =>
      parseStudentLifecycleShadowManifest({ ...raw, circle: true }),
    ).toThrow('shadow_manifest_boundary_invalid');
    expect(() =>
      parseStudentLifecycleShadowManifest({
        ...raw,
        heartbeat_actions: [...raw.heartbeat_actions, 'DIRECT_MESSAGE'],
      }),
    ).toThrow('shadow_manifest_actions_invalid');
  });

  it('refuses inferred or incomplete catalog mappings', () => {
    const raw = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    raw.catalog_entries[0].mapping_scope = 'course_only';
    expect(() => parseStudentLifecycleShadowManifest(raw)).toThrow(
      'shadow_manifest_catalog_invalid',
    );
  });
});
