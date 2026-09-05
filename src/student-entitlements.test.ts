import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  defaultCatalogPath,
  defaultSchemaPath,
  loadAndValidateStudentEntitlementCatalog,
  validateStudentEntitlementCatalog,
} from '../scripts/validate-student-entitlements.mjs';

function catalogFixture(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(defaultCatalogPath, 'utf8'));
}

describe('student entitlement catalog', () => {
  it('is valid and keeps unknowns explicit', () => {
    expect(fs.existsSync(defaultSchemaPath)).toBe(true);
    const result = loadAndValidateStudentEntitlementCatalog();
    expect(result.findings).toEqual([]);
    expect(result.summary).toMatchObject({
      bundles: 6,
      offers: 7,
      conflicts: 6,
    });
    expect(result.summary.components).toBeGreaterThan(25);
    expect(result.summary.openQuestions).toBeGreaterThan(0);
  });

  it('does not grant marker-group creation or attach content to marker groups', () => {
    const catalog = catalogFixture() as any;
    expect(catalog.heartbeat_projection_policy.marker_groups).toMatchObject({
      membership_type: 'admin_controlled',
      visibility: 'hidden',
      content_attachments_allowed: false,
      paid_offer_allowed: false,
      catalog_revision_1_creation_authority: 'none',
    });
  });

  it('keeps purchase scope out of class-marker identity', () => {
    const catalog = catalogFixture() as any;
    expect(catalog.heartbeat_projection_policy.marker_groups.rules).toContain(
      'A full-program buyer and a module-only buyer attending the same class block share the same class marker.',
    );
    expect(
      catalog.heartbeat_projection_policy.marker_groups.naming.class_block,
    ).not.toContain('offer');
  });

  it('rejects markers on self-paced and individual components', () => {
    const catalog = catalogFixture() as any;
    const component = catalog.components.find(
      (entry: any) => entry.component_key === 'acc.individual-mentoring',
    );
    component.marker_policy = 'class_block';
    const result = validateStudentEntitlementCatalog(catalog);
    expect(result.ok).toBe(false);
    expect(result.findings).toContain(
      'component acc.individual-mentoring: marker cannot be used for individual, self-paced, access-only, or earned outcomes',
    );
  });

  it('keeps mentoring-on-mentoring marker-free and rejects individual types even when delivery is blended', () => {
    const catalog = catalogFixture() as any;
    const component = catalog.components.find(
      (entry: any) => entry.component_key === 'mcs.mentoring-on-mentoring',
    );
    expect(component).toMatchObject({
      component_type: 'individual_mentoring',
      delivery_mode: 'blended',
      marker_policy: 'none',
    });
    component.marker_policy = 'program_cohort';
    const result = validateStudentEntitlementCatalog(catalog);
    expect(result.ok).toBe(false);
    expect(result.findings).toContain(
      'component mcs.mentoring-on-mentoring: individual mentoring or supervision must not have a marker',
    );
  });

  it('rejects invalid typed vocabulary instead of treating the schema as decorative', () => {
    const catalog = catalogFixture() as any;
    catalog.components[0].component_type = 'magic_bundle';
    catalog.components[1].consumption_model = 'sometimes';
    catalog.offers[0].status = 'probably_active';
    catalog.bundles[0].components[0].inclusion = 'maybe';
    catalog.known_conflicts[0].disposition = 'ignored';
    catalog.known_conflicts[0].summary = '';
    const result = validateStudentEntitlementCatalog(catalog);
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        'component acc.module-1: invalid component_type',
        'component acc.module-2: invalid consumption_model',
        'offer acc-full: invalid status',
        'bundle acc-full:v1: acc.module-1 has invalid inclusion',
        'conflict authority.plutio-vs-company-os: invalid disposition',
        'conflict authority.plutio-vs-company-os: summary required',
      ]),
    );
  });

  it('rejects a bundle that names an unknown component', () => {
    const catalog = catalogFixture() as any;
    catalog.bundles[0].components.push({
      component_key: 'unknown.component',
      inclusion: 'included',
      condition: null,
    });
    const result = validateStudentEntitlementCatalog(catalog);
    expect(result.ok).toBe(false);
    expect(result.findings).toContain(
      'bundle acc-full:v1: unknown component unknown.component',
    );
  });

  it('rejects a full offer without a Heartbeat access group', () => {
    const catalog = catalogFixture() as any;
    catalog.offers[0].heartbeat_full_access_group_ids = [];
    const result = validateStudentEntitlementCatalog(catalog);
    expect(result.ok).toBe(false);
    expect(result.findings).toContain(
      'offer acc-full: full-access group required',
    );
  });

  it('records the Plutio authority conflict as resolved without deleting its evidence', () => {
    const catalog = catalogFixture() as any;
    const conflict = catalog.known_conflicts.find(
      (entry: any) => entry.conflict_id === 'authority.plutio-vs-company-os',
    );
    expect(conflict.disposition).toBe('resolved');
    expect(conflict.sources).toContain(
      'courses:community/icf/STUDENT-TRACKING-FRAMEWORK.md',
    );
    expect(catalog.authority.provider_projections).toContain(
      'Plutio student projects',
    );
  });
});
