import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

// The generator is intentionally plain ESM so the same bytes run from a fresh
// immutable release without a TypeScript loader.
// @ts-expect-error JavaScript module is the production source under test.
import {
  buildPublication,
  canonicalJson,
  sha256Bytes,
  validateManifestSchema,
  validateManifestBeforeReads,
} from '../../scripts/build-student-catalog-publication.mjs';

const require = createRequire(import.meta.url);
const {
  compileProductBindings,
  resolveProductIdentity,
} = require('./lib/product-identity.cjs');
const repoRoot = process.cwd();
const tandemwebRoot = path.resolve(
  process.env.TANDEMWEB_PUBLICATION_ROOT ??
    path.join(repoRoot, '../tandemweb-mcs-publication-20260907'),
);
const sourceManifest = require('../../facts/catalogs/student-catalog-publication-v1.json');
const publicationSchema = require('../../facts/catalogs/student-catalog-publication-v1.schema.json');
const entitlementCatalog = require('../../facts/catalogs/student-entitlements-v1.json');
const supervisionProgram = require('../../facts/catalogs/coaching-supervision-mastery.json');
const manualBindings = require('../../facts/catalogs/student-product-bindings-v1.json');
const generatedBindings = require('../../facts/generated/student-product-bindings-v2.scoped.json');
const temporaryRoots: string[] = [];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function hashFile(file: string): string {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');
}

function makeFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'student-catalog-publication-'),
  );
  temporaryRoots.push(root);
  const nanoclaw = path.join(root, 'nanoclaw');
  const tandemweb = path.join(root, 'tandemweb');
  for (const source of sourceManifest.sources) {
    const fromRoot = source.root === 'nanoclaw' ? repoRoot : tandemwebRoot;
    const toRoot = source.root === 'nanoclaw' ? nanoclaw : tandemweb;
    const destination = path.join(toRoot, source.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(fromRoot, source.path), destination);
  }
  return { manifest: clone(sourceManifest), nanoclaw, tandemweb };
}

function replaceSource(
  fixture: ReturnType<typeof makeFixture>,
  sourceKey: string,
  value: unknown,
) {
  const source = fixture.manifest.sources.find(
    (item: any) => item.source_key === sourceKey,
  );
  const root =
    source.root === 'nanoclaw' ? fixture.nanoclaw : fixture.tandemweb;
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(path.join(root, source.path), bytes);
  source.source_sha256 = sha256Bytes(bytes);
  for (const relation of fixture.manifest.relationships) {
    if (relation.source_ref === source.path)
      relation.source_sha256 = source.source_sha256;
  }
}

function build(fixture = makeFixture()) {
  return buildPublication({
    manifest: fixture.manifest,
    schema: publicationSchema,
    nanoclawRoot: fixture.nanoclaw,
    tandemwebRoot: fixture.tandemweb,
  });
}

function resolve(
  compiled: any,
  input: Record<string, unknown>,
  productMapRows: string[][] = [['Product Name', 'Roster Tab', 'Column']],
) {
  return resolveProductIdentity(
    compiled,
    {
      account: 'tandem',
      productName: 'display label',
      productIds: [],
      priceIds: [],
      ...input,
    },
    productMapRows,
  );
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

describe('student catalog publication generator', () => {
  it('builds byte-identical payloads twice and preserves supervision while adding scoped MCS coverage', () => {
    const fixture = makeFixture();
    const first = build(fixture);
    const second = build(fixture);

    expect(first.bytes).toEqual(second.bytes);
    expect(first.nanoclaw).toEqual(generatedBindings);
    expect(
      first.nanoclaw.routes
        .map(
          ({ provider_identity: _, resolution_profile: __, ...route }: any) =>
            route.offer_key.startsWith('supervision-') ? route : null,
        )
        .filter(Boolean),
    ).toEqual(manualBindings.routes);
    expect(first.envelope.output_sha256.nanoclaw).toBe(
      sha256Bytes(first.bytes.nanoclaw),
    );
    expect(first.envelope.output_sha256.tandemweb).toBe(
      sha256Bytes(first.bytes.tandemweb),
    );
    expect(canonicalJson(first.tandemweb.routes)).not.toContain('prepared_at');
  });

  it('preserves inaugural and regular identity, price role, roster target, and active state', () => {
    const built = build();
    const inaugural = built.tandemweb.routes[0];
    const regular = built.tandemweb.routes[1];

    expect(inaugural).toMatchObject({
      offer_key: 'supervision-inaugural',
      active: true,
      declared_total: { currency: 'usd', amount_cents: 399600 },
      direct_price_id: null,
      cohort_eligibility: {
        required: true,
        program: 'supervision',
        allowed_start_dates: ['2026-10-07'],
        excluded_start_dates: [],
      },
      installment_plan: {
        count: 4,
        amount_cents: 99900,
        total_cents: 399600,
        stripe_price_id: 'price_1Tvz3MA7hTBWpVVqhF708kPv',
        stripe_price_role: 'installment_subscription_default_price',
      },
      roster_projection: { tab: 'CSS', column: 'Coaching Supervision Mastery' },
    });
    expect(regular).toMatchObject({
      offer_key: 'supervision-regular',
      active: true,
      declared_total: { currency: 'usd', amount_cents: 479600 },
      direct_price_id: null,
      installment_plan: {
        count: 4,
        amount_cents: 119900,
        total_cents: 479600,
        stripe_price_id: 'price_1Tvz3MA7hTBWpVVq9gL3v49F',
      },
      cohort_eligibility: {
        required: true,
        program: 'supervision',
        allowed_start_dates: [],
        excluded_start_dates: ['2026-10-07'],
      },
    });
    expect(built.tandemweb.evidence_limits).toEqual({
      native_price_amount_verified: false,
      native_price_recurrence_verified: false,
      heartbeat_group_course_attachment_verified: false,
      heartbeat_learner_access_verified: false,
      heartbeat_progress_verified: false,
      heartbeat_class_assignment_verified: false,
      heartbeat_completion_verified: false,
      global_strict_publication_eligible: false,
    });
  });

  it('publishes the exact current ALT MCS family while retaining primary legacy scope', () => {
    const built = build();
    const route = built.tandemweb.routes.find(
      (item: any) => item.offer_key === 'mcs-full',
    );
    expect(route).toMatchObject({
      active: true,
      declared_total: { currency: 'usd', amount_cents: 299700 },
      direct_price_id: null,
      cohort_eligibility: {
        required: true,
        program: 'mcs-practicum',
        context_role: 'delivery_assignment',
        allowed_start_dates: [],
        excluded_start_dates: [],
      },
      installment_plan: {
        count: 3,
        interval: 'month',
        amount_cents: 99900,
        total_cents: 299700,
        stripe_price_id: 'price_1TkYJfA7hTBWpVVqm502swAb',
      },
      native_identity: {
        namespace: 'stripe:alt',
        account_id: 'acct_1G1wKzA7hTBWpVVq',
        product_id: 'prod_Uk2OvW03ZwxmAj',
        default_price_id: 'price_1TkYJfA7hTBWpVVqm502swAb',
      },
      entitlement: {
        bundle_key: 'mcs-standard-path:v1',
        bundle_version: 1,
        enrollment_scope: 'cohort_program',
      },
      roster_projection: { tab: 'MCS', column: 'MCS Practicum' },
    });
    expect(built.nanoclaw.legacy_scopes).toEqual([
      {
        offer_key: 'mcs-full',
        stripe_account: 'heartbeat',
        provider_identity: {
          product_ids: ['prod_UWzqD2zowB8apy'],
          price_ids: [],
        },
        fallback: 'product_map',
      },
    ]);
  });

  it('derives cohort dates from the digest-pinned canonical sources', () => {
    const fixture = makeFixture();
    const program = clone(supervisionProgram);
    const checkout = JSON.parse(
      fs.readFileSync(
        path.join(tandemwebRoot, 'data/checkout/products.json'),
        'utf8',
      ),
    );
    program.checkout_expectations[0].cohort_start_dates = ['2027-01-06'];
    program.checkout_expectations[1].cohort_excluded_start_dates = [
      '2027-01-06',
    ];
    checkout['supervision-inaugural'].cohort_start_dates = ['2027-01-06'];
    checkout['supervision-regular'].cohort_excluded_start_dates = [
      '2027-01-06',
    ];
    replaceSource(fixture, 'supervision_program', program);
    replaceSource(fixture, 'checkout_catalog', checkout);

    const built = build(fixture);
    expect(
      built.tandemweb.routes[0].cohort_eligibility.allowed_start_dates,
    ).toEqual(['2027-01-06']);
    expect(
      built.tandemweb.routes[1].cohort_eligibility.excluded_start_dates,
    ).toEqual(['2027-01-06']);
  });

  it('preserves exact current resolver behavior for resolved, conflict, and legacy paths', () => {
    const compiled = compileProductBindings(
      entitlementCatalog,
      generatedBindings,
    );
    const inaugural = entitlementCatalog.offers.find(
      (offer: any) => offer.offer_key === 'supervision-inaugural',
    );
    const regular = entitlementCatalog.offers.find(
      (offer: any) => offer.offer_key === 'supervision-regular',
    );
    const matchingMap = [
      ['Product Name', 'Roster Tab', 'Column'],
      ['display label', 'CSS', 'Coaching Supervision Mastery'],
    ];

    for (const input of [
      { offerKey: inaugural.offer_key },
      { productIds: inaugural.stripe_product_ids },
      {
        productIds: inaugural.stripe_product_ids,
        priceIds: inaugural.stripe_price_ids,
      },
      {
        offerKey: regular.offer_key,
        productIds: regular.stripe_product_ids,
        priceIds: regular.stripe_price_ids,
      },
    ]) {
      expect(resolve(compiled, input, matchingMap)).toMatchObject({
        status: 'resolved',
        rows: [
          [
            'offer:' +
              (input.offerKey ??
                (input.productIds === regular.stripe_product_ids
                  ? regular.offer_key
                  : inaugural.offer_key)),
            'CSS',
            'Coaching Supervision Mastery',
          ],
        ],
        revision: 2,
      });
    }

    expect(
      resolve(compiled, {
        account: 'heartbeat',
        productIds: inaugural.stripe_product_ids,
      }),
    ).toMatchObject({
      status: 'conflict',
      code: 'product_identity_scope_conflict',
    });
    expect(
      resolve(compiled, {
        offerKey: inaugural.offer_key,
        productIds: ['prod_unknown'],
      }),
    ).toMatchObject({
      status: 'conflict',
      code: 'product_identity_conflict',
    });
    expect(
      resolve(compiled, {
        offerKey: inaugural.offer_key,
        priceIds: regular.stripe_price_ids,
      }),
    ).toMatchObject({
      status: 'conflict',
      code: 'product_identity_conflict',
    });
    expect(
      resolve(compiled, { offerKey: inaugural.offer_key, incomplete: true }),
    ).toMatchObject({
      status: 'conflict',
      code: 'product_identity_conflict',
    });
    expect(
      resolve(compiled, { offerKey: inaugural.offer_key }, [
        ['Product Name', 'Roster Tab', 'Column'],
        ['display label', 'ACC', 'M1'],
      ]),
    ).toMatchObject({
      status: 'conflict',
      code: 'product_projection_conflict',
    });
    const legacy = ['Legacy offer', '(not a student)', 'n/a'];
    expect(
      resolve(
        compiled,
        {
          offerKey: null,
          productName: legacy[0],
          productIds: ['prod_never_registered'],
        },
        [['Product Name', 'Roster Tab', 'Column'], legacy],
      ),
    ).toMatchObject({
      status: 'legacy',
      rows: [legacy],
    });
  });

  it('rejects path traversal and unapproved source references before any file read', () => {
    for (const candidate of [
      '../../.env',
      '/Users/example/.ssh/id_ed25519',
      'facts\\..\\.env',
    ]) {
      const manifest = clone(sourceManifest);
      manifest.sources.find(
        (source: any) => source.source_key === 'checkout_catalog',
      ).path = candidate;
      expect(() => validateManifestBeforeReads(manifest)).toThrowError(
        expect.objectContaining({ code: 'source_ref_not_allowed' }),
      );
    }
  });

  it('rejects an allowed source path that resolves through a symlink before reading it', () => {
    const fixture = makeFixture();
    const source = fixture.manifest.sources.find(
      (item: any) => item.source_key === 'checkout_catalog',
    );
    const sourcePath = path.join(fixture.tandemweb, source.path);
    const harmlessOutside = path.join(
      path.dirname(fixture.tandemweb),
      'outside-fixture.json',
    );
    fs.writeFileSync(harmlessOutside, '{}\n');
    fs.unlinkSync(sourcePath);
    fs.symlinkSync(harmlessOutside, sourcePath);
    expect(() => build(fixture)).toThrowError(
      expect.objectContaining({ code: 'source_symlink_not_allowed' }),
    );
  });

  it('rejects duplicate keys, bad relationship references, versions, hashes, and stronger-than-evidence status', () => {
    const variants = [
      [
        'duplicate_relationship_key',
        (manifest: any) =>
          manifest.relationships.push(clone(manifest.relationships[0])),
      ],
      [
        'relationship_source_unknown',
        (manifest: any) =>
          (manifest.relationships[0].source_ref =
            'facts/catalogs/not-approved.json'),
      ],
      [
        'relationship_source_mismatch',
        (manifest: any) =>
          (manifest.relationships[0].source_version = 'receipt:wrong'),
      ],
      [
        'relationship_source_mismatch',
        (manifest: any) =>
          (manifest.relationships[0].source_sha256 = '0'.repeat(64)),
      ],
      [
        'relationship_status_exceeds_evidence',
        (manifest: any) =>
          (manifest.relationships.find(
            (relation: any) => relation.evidence_class === 'existence_only',
          ).relationship_status = 'accepted'),
      ],
    ] as const;

    for (const [code, mutate] of variants) {
      const manifest = clone(sourceManifest);
      mutate(manifest);
      expect(() => validateManifestBeforeReads(manifest)).toThrowError(
        expect.objectContaining({ code }),
      );
    }
  });

  it('enforces the checked-in schema before semantic generation', () => {
    const additional = clone(sourceManifest);
    additional.unreviewed = true;
    expect(() =>
      validateManifestSchema(publicationSchema, additional),
    ).toThrowError(
      expect.objectContaining({ code: 'manifest_schema_invalid' }),
    );

    const missing = clone(sourceManifest);
    delete missing.relationships[0].owner;
    expect(() =>
      validateManifestSchema(publicationSchema, missing),
    ).toThrowError(
      expect.objectContaining({ code: 'manifest_schema_invalid' }),
    );

    const invalidType = clone(sourceManifest);
    invalidType.relationships[0].relationship_type = 'offer_grants_everything';
    expect(() =>
      validateManifestSchema(publicationSchema, invalidType),
    ).toThrowError(
      expect.objectContaining({ code: 'manifest_schema_invalid' }),
    );
  });

  it('rejects missing account evidence and evidence claims beyond the accepted holds', () => {
    const missingAlias = makeFixture();
    missingAlias.manifest.relationships =
      missingAlias.manifest.relationships.filter(
        (relation: any) =>
          relation.relationship_type !== 'consumer_account_alias',
      );
    expect(() => build(missingAlias)).toThrowError(
      expect.objectContaining({ code: 'relationship_cardinality_invalid' }),
    );

    const mismatchedAlias = makeFixture();
    mismatchedAlias.manifest.relationships.find(
      (relation: any) =>
        relation.relationship_type === 'consumer_account_alias',
    ).target.object_id = 'acct_wrong';
    expect(() => build(mismatchedAlias)).toThrowError(
      expect.objectContaining({
        code: 'consumer_account_alias_evidence_invalid',
      }),
    );

    const overstated = clone(sourceManifest);
    overstated.holds.heartbeat_learner_access_verified = true;
    expect(() => validateManifestBeforeReads(overstated)).toThrowError(
      expect.objectContaining({ code: 'evidence_hold_invalid' }),
    );

    const renamed = clone(sourceManifest);
    delete renamed.holds.heartbeat_completion_verified;
    renamed.holds.customer_action_verified = false;
    expect(() => validateManifestBeforeReads(renamed)).toThrowError(
      expect.objectContaining({ code: 'evidence_hold_invalid' }),
    );
  });

  it('rejects lossy many-to-many, interval, and consumer-specific lowering', () => {
    const manyProducts = makeFixture();
    const second = clone(
      manyProducts.manifest.relationships.find(
        (relation: any) =>
          relation.relationship_type === 'offer_uses_product' &&
          relation.object_id === 'supervision-inaugural',
      ),
    );
    second.relationship_key = 'offer:supervision-inaugural:second-product';
    second.target.object_id = 'prod_second';
    manyProducts.manifest.relationships.push(second);
    expect(() => build(manyProducts)).toThrowError(
      expect.objectContaining({ code: 'unsafe_lowering_many_to_many' }),
    );

    const interval = makeFixture();
    interval.manifest.relationships.find(
      (relation: any) => relation.relationship_type === 'offer_uses_product',
    ).effective_from = '2026-09-07T00:00:00Z';
    expect(() => build(interval)).toThrowError(
      expect.objectContaining({ code: 'unsafe_lowering_interval' }),
    );

    const scoped = makeFixture();
    scoped.manifest.relationships.find(
      (relation: any) => relation.relationship_type === 'offer_uses_product',
    ).consumer_keys = ['nanoclaw-scoped-v2'];
    expect(() => build(scoped)).toThrowError(
      expect.objectContaining({ code: 'unsafe_lowering_consumer_scope' }),
    );
  });

  it('rejects source digest, revision, checkout state, direct-price role, and roster drift', () => {
    const badDigest = makeFixture();
    fs.appendFileSync(
      path.join(badDigest.tandemweb, 'data/checkout/products.json'),
      '\n',
    );
    expect(() => build(badDigest)).toThrowError(
      expect.objectContaining({ code: 'source_digest_mismatch' }),
    );

    const badRevision = makeFixture();
    const bindings = clone(manualBindings);
    bindings.entitlement_catalog_revision = 2;
    replaceSource(badRevision, 'binding_catalog', bindings);
    expect(() => build(badRevision)).toThrowError(
      expect.objectContaining({ code: 'catalog_revision_mismatch' }),
    );

    const activeDrift = makeFixture();
    const checkout = JSON.parse(
      fs.readFileSync(
        path.join(tandemwebRoot, 'data/checkout/products.json'),
        'utf8',
      ),
    );
    const activeCheckout = clone(checkout);
    activeCheckout['supervision-regular'].active = false;
    replaceSource(activeDrift, 'checkout_catalog', activeCheckout);
    expect(() => build(activeDrift)).toThrowError(
      expect.objectContaining({ code: 'checkout_source_mismatch' }),
    );

    const cohortDrift = makeFixture();
    const cohortCheckout = clone(checkout);
    cohortCheckout['supervision-regular'].cohort_excluded_start_dates = [];
    replaceSource(cohortDrift, 'checkout_catalog', cohortCheckout);
    expect(() => build(cohortDrift)).toThrowError(
      expect.objectContaining({ code: 'checkout_cohort_eligibility_invalid' }),
    );

    const directPrice = makeFixture();
    const directCheckout = clone(checkout);
    directCheckout['supervision-inaugural'].stripe_price_id =
      'price_1Tvz3MA7hTBWpVVqhF708kPv';
    replaceSource(directPrice, 'checkout_catalog', directCheckout);
    expect(() => build(directPrice)).toThrowError(
      expect.objectContaining({ code: 'checkout_direct_price_role_invalid' }),
    );

    const rosterDrift = makeFixture();
    const rosterBindings = clone(manualBindings);
    rosterBindings.routes[0].roster_targets[0] = { tab: 'ACC', column: 'M1' };
    replaceSource(rosterDrift, 'binding_catalog', rosterBindings);
    expect(() => build(rosterDrift)).toThrowError(
      expect.objectContaining({ code: 'nanoclaw_compatibility_mismatch' }),
    );
  });

  it('rejects MCS native price amount, recurrence, product, and account drift', () => {
    const mutations = [
      (evidence: any) =>
        (evidence.native_provider_readback.stripe.alt_price.unit_amount_cents += 1),
      (evidence: any) =>
        (evidence.native_provider_readback.stripe.alt_price.interval = 'year'),
      (evidence: any) =>
        (evidence.native_provider_readback.stripe.alt_price.product_id =
          'prod_other'),
      (evidence: any) =>
        (evidence.native_provider_readback.stripe.alt_product.account =
          'primary'),
    ];
    for (const mutate of mutations) {
      const fixture = makeFixture();
      const evidence = JSON.parse(
        fs.readFileSync(
          path.join(
            fixture.nanoclaw,
            'docs/reports/NC-20260907-007-MCS-SOURCE-EVIDENCE.json',
          ),
          'utf8',
        ),
      );
      mutate(evidence);
      replaceSource(fixture, 'mcs_source_evidence', evidence);
      expect(() => build(fixture)).toThrowError(
        expect.objectContaining({ code: 'native_product_evidence_invalid' }),
      );
    }
  });

  it('keeps generated tracked output hashes exact', () => {
    const built = build();
    expect(
      hashFile(
        path.join(
          repoRoot,
          'facts/generated/student-product-bindings-v2.scoped.json',
        ),
      ),
    ).toBe(built.envelope.output_sha256.nanoclaw);
    expect(
      hashFile(
        path.join(
          tandemwebRoot,
          'data/generated/student-catalog-publication-v2.json',
        ),
      ),
    ).toBe(built.envelope.output_sha256.tandemweb);
  });
});
