import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error Plain ESM is the release builder under test.
import {
  buildFoundationsPublication,
  buildPublication,
  sha256Bytes,
} from '../../scripts/build-student-catalog-publication.mjs';

const require = createRequire(import.meta.url);
const root = process.cwd();
const tandemRoot = path.resolve(
  process.env.TANDEMWEB_PUBLICATION_ROOT ??
    path.join(root, '../tandemweb-mcs-publication-20260907'),
);
const manifest = require('../../facts/catalogs/student-foundations-publication-v1.json');
const schema = require('../../facts/catalogs/student-foundations-publication-v1.schema.json');
const entitlementSchema = require('../../facts/catalogs/student-entitlements-v2.schema.json');
const legacyManifest = require('../../facts/catalogs/student-catalog-publication-v1.json');
const legacySchema = require('../../facts/catalogs/student-catalog-publication-v1.schema.json');
const generated = require('../../facts/generated/student-foundations-publication-v1.scoped.json');
const temporary: string[] = [];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const hashFile = (file: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function build(
  value = clone(manifest),
  nanoclawRoot = root,
  tandemwebRoot = tandemRoot,
) {
  return buildFoundationsPublication({
    manifest: value,
    schema,
    entitlementSchema,
    nanoclawRoot,
    tandemwebRoot,
  });
}

function fixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'student-foundations-publication-'),
  );
  temporary.push(directory);
  const nanoclaw = path.join(directory, 'nanoclaw');
  const tandemweb = path.join(directory, 'tandemweb');
  for (const source of manifest.sources) {
    const from = source.root === 'nanoclaw' ? root : tandemRoot;
    const to = source.root === 'nanoclaw' ? nanoclaw : tandemweb;
    const destination = path.join(to, source.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(from, source.path), destination);
  }
  return { manifest: clone(manifest), nanoclaw, tandemweb };
}

function replaceSource(
  target: ReturnType<typeof fixture>,
  sourceKey: string,
  value: unknown,
) {
  const source = target.manifest.sources.find(
    (item: any) => item.source_key === sourceKey,
  );
  const base = source.root === 'nanoclaw' ? target.nanoclaw : target.tandemweb;
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(path.join(base, source.path), bytes);
  source.source_sha256 = sha256Bytes(bytes);
}

afterEach(() => {
  for (const directory of temporary.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe('staged standalone Foundations publication', () => {
  it('rejects malformed profile CLI and requires checkout source for the staged profile', () => {
    const script = path.join(
      root,
      'scripts/build-student-catalog-publication.mjs',
    );
    for (const args of [
      ['--tandemweb-root', tandemRoot, '--check', '--profile'],
      ['--profile', 'foundations-test', '--check-nanoclaw'],
    ]) {
      const result = spawnSync(process.execPath, [script, ...args], {
        encoding: 'utf8',
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('argument_missing');
    }
    const result = spawnSync(
      process.execPath,
      [
        script,
        '--profile',
        'foundations-test',
        '--tandemweb-root',
        tandemRoot,
        '--check-nanoclaw',
      ],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
  });

  it('rejects malformed certificate UUIDs even with an updated source hash', () => {
    for (const field of ['campaign_id', 'detail_id']) {
      const target = fixture();
      const successor = JSON.parse(
        fs.readFileSync(
          path.join(
            target.nanoclaw,
            'facts/catalogs/student-entitlements-v2.json',
          ),
          'utf8',
        ),
      );
      successor.certificate_outcome[field] = 'not-a-uuid';
      replaceSource(target, 'entitlement_successor', successor);
      expect(() =>
        build(target.manifest, target.nanoclaw, target.tandemweb),
      ).toThrow('manifest_schema_invalid');
    }
  });

  it('emits exactly four typed locale routes without full-program inheritance', () => {
    const result = build();
    expect(result.publication).toEqual(generated);
    expect(
      result.publication.routes.map((route: any) => [
        route.offer_key,
        route.content_locale,
        route.entitlement.component_key,
      ]),
    ).toEqual([
      ['mcq-program-a-foundations', 'en-US', 'mcs.foundations'],
      ['mcs-foundations-fr', 'fr-FR', 'mcs.foundations.fr'],
      ['mcs-foundations-ja', 'ja-JP', 'mcs.foundations.ja'],
      ['mcs-foundations-es', 'es-419', 'mcs.foundations.es-419'],
    ]);
    expect(JSON.stringify(result.publication.routes)).not.toContain(
      'mcs-standard-path',
    );
    expect(JSON.stringify(result.publication.routes)).not.toContain(
      'mcs.certificate',
    );
    expect(
      result.publication.routes.every(
        (route: any) =>
          route.entitlement.enrollment_scope === 'standalone_course' &&
          route.delivery.requires_cohort_selection === false &&
          route.delivery.marker_policy === 'none' &&
          route.certificate.locale_academic_mapping_verified === false &&
          route.certificate.publication_status === 'held',
      ),
    ).toBe(true);
  });

  it('preserves the current default v2 outputs byte-for-byte', () => {
    const legacy = buildPublication({
      manifest: legacyManifest,
      schema: legacySchema,
      nanoclawRoot: root,
      tandemwebRoot: tandemRoot,
    });
    expect(legacy.bytes.nanoclaw).toBe(
      fs.readFileSync(
        path.join(
          root,
          'facts/generated/student-product-bindings-v2.scoped.json',
        ),
        'utf8',
      ),
    );
    expect(legacy.bytes.tandemweb).toBe(
      fs.readFileSync(
        path.join(
          tandemRoot,
          'data/generated/student-catalog-publication-v2.json',
        ),
        'utf8',
      ),
    );
  });

  it('is manifest-driven and accepts a complete configured fifth fixture route', () => {
    const target = fixture();
    const successor = JSON.parse(
      fs.readFileSync(
        path.join(
          target.nanoclaw,
          'facts/catalogs/student-entitlements-v2.json',
        ),
        'utf8',
      ),
    );
    const delivery = JSON.parse(
      fs.readFileSync(
        path.join(
          target.nanoclaw,
          'facts/catalogs/mcs-foundations-standalone-v1.json',
        ),
        'utf8',
      ),
    );
    const locales = JSON.parse(
      fs.readFileSync(
        path.join(
          target.nanoclaw,
          'facts/catalogs/mcs-foundations-locales.json',
        ),
        'utf8',
      ),
    );
    const checkout = JSON.parse(
      fs.readFileSync(
        path.join(target.tandemweb, 'data/checkout/products.json'),
        'utf8',
      ),
    );
    const offerKey = 'fixture-foundations-de';
    const group = '31000000-0000-4000-8000-000000000031';
    const course = '32000000-0000-4000-8000-000000000032';
    const cohort = '33000000-0000-4000-8000-000000000033';
    successor.component_additions.push({
      ...clone(successor.component_additions[0]),
      component_key: 'mcs.foundations.de',
      content_locale: 'de-DE',
      name: 'Mentor Coaching Grundlagen',
      heartbeat: {
        ...clone(successor.component_additions[0].heartbeat),
        access_group_ids: [group],
        course_ids: [course],
        cohort_ids: [cohort],
      },
    });
    successor.bundle_additions.push({
      bundle_key: 'mcs-foundations-de:v1',
      program_key: 'mcs-foundations',
      version: 1,
      components: [
        {
          component_key: 'mcs.foundations.de',
          inclusion: 'included',
          condition: null,
        },
      ],
    });
    successor.offer_additions.push({
      ...clone(successor.offer_additions[0]),
      offer_key: offerKey,
      content_locale: 'de-DE',
      bundle_key: 'mcs-foundations-de:v1',
      component_key: 'mcs.foundations.de',
      heartbeat_access_group_id: group,
      heartbeat_course_id: course,
      heartbeat_course_cohort_id: cohort,
    });
    delivery.routes.push({
      offer_key: offerKey,
      locale: 'de-DE',
      access_group_id: group,
      course_id: course,
      course_cohort_id: cohort,
    });
    locales.locales.push({
      language: 'German',
      locale: 'de-DE',
      title: 'Mentor Coaching Grundlagen',
      status: 'fixture',
      sales_url: 'https://example.test/de',
      checkout_product: offerKey,
    });
    checkout[offerKey] = {
      name: 'Mentor Coaching Grundlagen',
      program: 'mcq',
      price_cents: 29900,
      currency: 'usd',
      stripe_price_id: 'price_shared_fixture',
      heartbeat_group_id: group,
      heartbeat_access_url: `https://example.test/courses/c/${cohort}`,
      active: true,
    };
    replaceSource(target, 'entitlement_successor', successor);
    replaceSource(target, 'delivery_readback', delivery);
    replaceSource(target, 'locale_catalog', locales);
    replaceSource(target, 'checkout_catalog', checkout);
    target.manifest.population_keys.push(offerKey);
    target.manifest.routes.push({
      offer_key: offerKey,
      content_locale: 'de-DE',
      bundle_key: 'mcs-foundations-de:v1',
      component_key: 'mcs.foundations.de',
    });
    expect(
      build(target.manifest, target.nanoclaw, target.tandemweb).publication
        .routes,
    ).toHaveLength(5);
  });

  it('rejects incomplete population and shared-price route selection', () => {
    const missing = clone(manifest);
    missing.routes.pop();
    expect(() => build(missing)).toThrow('foundations_population_invalid');
    const providerSelected = clone(manifest);
    providerSelected.resolution_profile.shared_provider_identity_selects_route = true;
    expect(() => build(providerSelected)).toThrow('manifest_schema_invalid');
  });

  it('pins every declared source digest', () => {
    for (const source of manifest.sources) {
      const sourceRoot = source.root === 'nanoclaw' ? root : tandemRoot;
      expect(hashFile(path.join(sourceRoot, source.path))).toBe(
        source.source_sha256,
      );
    }
  });
});
