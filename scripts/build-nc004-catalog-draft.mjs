#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));

const baseline = read(
  'docs/reports/NC-20260907-004-LOCAL-CATALOG-BASELINE.json',
);
const roster = read(
  'docs/reports/NC-20260907-004-B1-STUDENT-ROSTER-SNAPSHOT.json',
);
const heartbeat = read(
  'docs/reports/NC-20260907-004-B1-HEARTBEAT-MAIN-SNAPSHOT.json',
);
const providers = read(
  'docs/reports/NC-20260907-004-B2-PROVIDER-CATALOG-SNAPSHOT.json',
);
const sourceAuthority = read(
  'docs/reports/NC-20260907-004-C-SOURCE-AUTHORITY-SNAPSHOT.json',
);
const publishingDiscovery = read(
  'docs/reports/NC-20260907-004-C-PUBLISHING-DISCOVERY-SUPPLEMENT.json',
);
const catalog = read('facts/catalogs/student-entitlements-v1.json');
const bindings = read('facts/catalogs/student-product-bindings-v1.json');

const offerByKey = new Map(
  catalog.offers.map((item) => [item.offer_key, item]),
);
const bundleByKey = new Map(
  catalog.bundles.map((item) => [item.bundle_key, item]),
);
const componentByKey = new Map(
  catalog.components.map((item) => [item.component_key, item]),
);
const groupById = new Map(
  heartbeat.native_inventory.groups.map((item) => [item.id, item]),
);
const courseById = new Map(
  heartbeat.native_inventory.courses.map((item) => [item.id, item]),
);
const routeByOffer = new Map(
  bindings.routes.map((item) => [item.offer_key, item]),
);
const sourceCourseById = new Map(
  sourceAuthority.curriculum_and_bundles.course_records
    .filter((item) => item.heartbeat_course_id)
    .map((item) => [item.heartbeat_course_id, item]),
);
const blocksByKey = new Map(
  sourceAuthority.schedule_delivery_and_pool.accepted_source_evidence.delivery_blocks.map(
    (item) => [item.delivery_block_key, item],
  ),
);

const pushMap = (map, key, value) => {
  const current = map.get(key) ?? [];
  current.push(value);
  map.set(key, current);
};

const stripeByOffer = new Map();
for (const item of providers.stripe.declared_entitlement_product_checks
  .references) {
  pushMap(stripeByOffer, item.offer_key, {
    source_namespace: item.namespace,
    account_id: item.account_id,
    product_id: item.native_product_id,
    native_exists: item.fetch_ok && item.product_id_roundtrip_match,
    native_active: item.native_active,
    native_default_price_id: item.native_default_price_id,
    native_verified_product_price_relationship:
      item.default_price_matches_declared === true
        ? {
            product_id: item.native_product_id,
            price_id: item.native_default_price_id,
            source_namespace: item.namespace,
            account_id: item.account_id,
            relationship_type: 'native_default_price_exact_match',
          }
        : null,
    default_price_status:
      item.default_price_matches_declared === true
        ? 'exact_match'
        : item.default_price_value_class === 'null'
          ? 'native_null'
          : 'unverified',
    relationship_type: 'catalog_declared_product_reference',
    meaning_status: 'native_identity_verified_offer_meaning_declared',
  });
}
for (const item of providers.stripe.safe_label_matches) {
  const existing = stripeByOffer.get(item.matched_offer_slug) ?? [];
  if (existing.some((value) => value.product_id === item.product_id)) continue;
  pushMap(stripeByOffer, item.matched_offer_slug, {
    source_namespace: item.source_namespace,
    account_id: item.account_id,
    product_id: item.product_id,
    native_exists: true,
    native_active: item.active,
    native_default_price_id: item.default_price_structure.price_id,
    native_verified_product_price_relationship: null,
    default_price_status: item.default_price_structure.price_id
      ? 'observed'
      : 'native_null_or_unexposed',
    relationship_type: 'exact_safe_label_candidate',
    meaning_status: 'candidate_not_offer_binding',
  });
}

const pageRefsByOffer = new Map();
for (const [offerSlug, sources] of Object.entries(
  publishingDiscovery.site_wide_static_scan.references_by_active_offer,
)) {
  for (const source of sources) {
    pushMap(pageRefsByOffer, offerSlug, {
      page_dir: source.page_dir,
      catalog_live_path: source.catalog_live_path,
      file: source.file,
      file_sha256: source.sha256,
      relationship_status:
        'static_source_reference_not_deployed_dom_verification',
    });
  }
}

const rosterByLabel = new Map();
for (const item of roster.product_map.rows) {
  pushMap(rosterByLabel, item.product_label, {
    roster_tab: item.roster_tab,
    roster_column: item.roster_column,
  });
}

const scheduleByOffer = {
  'mcs-cohort-sept-thursday': ['mcs-practicum:2026-09-24'],
  'mcs-cohort-sept-friday': ['mcs-practicum:2026-09-25'],
  'mcs-full': [
    'mcs-practicum:2026-09-24',
    'mcs-practicum:2026-09-25',
    'mcs-practicum:2027-01-07',
    'mcs-practicum:2027-01-08',
  ],
};

const treatmentFor = (offerSlug) => {
  if (offerSlug.includes('free')) return 'grant_free_access';
  if (
    /group-mentoring|group-supervision|individual-mentoring|recording-review|exam-prep|^mentor-|^mcq-eval-/.test(
      offerSlug,
    )
  ) {
    return 'component_service_fulfillment';
  }
  return 'enrollment';
};

const localeFor = (offerSlug) => {
  if (offerSlug.endsWith('-es')) return 'es';
  if (offerSlug.endsWith('-ja')) return 'ja';
  return 'en';
};

const partyRoleBoundary = {
  payer_identity: 'not_collected_in_this_audit',
  participant_identity: 'not_collected_in_this_audit',
  relationship_status: 'not_evidenced_and_never_assumed_same',
  invariant:
    'Payer, purchaser, sponsor, participant, and student are distinct roles unless exact accepted evidence links them.',
};

const componentKeysForBundle = (bundle) =>
  (bundle?.components ?? []).map((item) =>
    typeof item === 'string' ? item : item.component_key,
  );

const records = [];
for (const checkout of baseline.sanitized_checkout_entries) {
  const offer = offerByKey.get(checkout.offer_slug);
  const bundle = offer ? bundleByKey.get(offer.bundle_key) : null;
  const componentKeys = componentKeysForBundle(bundle);
  const components = componentKeys
    .map((key) => componentByKey.get(key))
    .filter(Boolean);
  const courseIds = [
    ...new Set(components.flatMap((item) => item.heartbeat.course_ids)),
  ];
  const route = routeByOffer.get(checkout.offer_slug);
  const disposition = offer
    ? 'source_bound'
    : checkout.active
      ? 'unresolved'
      : 'legacy_dispositioned';
  const treatment = treatmentFor(checkout.offer_slug);
  const stripe = stripeByOffer.get(checkout.offer_slug) ?? [];
  const entitlementOfferDeclaredPriceRefs = (offer?.stripe_price_ids ?? []).map(
    (priceId) => ({
      price_id: priceId,
      declaration_scope:
        'entitlement_offer_unscoped_not_product_or_account_association',
      relationship_status: 'catalog_source_declared_unverified_association',
    }),
  );
  const checkoutDeclaredPriceRefs = [
    ...(checkout.native_price_id
      ? [
          {
            price_id: checkout.native_price_id,
            source_field: 'stripe_price_id',
            relationship_status:
              'checkout_source_declared_not_product_or_price_verified',
          },
        ]
      : []),
    ...(checkout.installments?.native_price_id
      ? [
          {
            price_id: checkout.installments.native_price_id,
            source_field: 'installments.stripe_price_id',
            relationship_status:
              'checkout_source_declared_not_product_or_price_verified',
          },
        ]
      : []),
  ];
  const heartbeatGroups = checkout.heartbeat_group_ids.map((id) => ({
    id,
    native_exists: groupById.has(id),
    native_label: groupById.get(id)?.name ?? null,
    relationship_type: 'checkout_declared_access_destination',
  }));
  const evidenceNeeded = [];
  if (!offer) evidenceNeeded.push('accepted versioned offer and bundle');
  if (!route) evidenceNeeded.push('typed canonical route');
  if (heartbeatGroups.some((item) => !item.native_exists)) {
    evidenceNeeded.push('authoritative exact Heartbeat group ID');
  }
  if (stripe.length === 0) {
    evidenceNeeded.push('account-scoped native Stripe product relationship');
  }
  if (stripe.some((item) => item.default_price_status !== 'exact_match')) {
    evidenceNeeded.push(
      'native price amount, recurrence, or explicit non-default price relationship',
    );
  }
  if (courseIds.some((id) => !sourceCourseById.has(id))) {
    evidenceNeeded.push(
      'correct managed manifest, service allowance, procedure, or schedule source',
    );
  }
  if (!rosterByLabel.has(checkout.product_label)) {
    evidenceNeeded.push(
      'exact Product Map label or explicit no-roster disposition',
    );
  }

  records.push({
    record_id: 'checkout:' + checkout.offer_slug,
    record_semantics: 'source_record_not_canonical_offer_or_order',
    source_kind: 'checkout',
    offer_slug: checkout.offer_slug,
    canonical_offer_link: offer
      ? { status: 'accepted_same_key', offer_key: offer.offer_key }
      : checkout.offer_slug.startsWith('mcs-cohort-')
        ? { status: 'candidate_variant_link', offer_key: 'mcs-full' }
        : { status: 'unresolved', offer_key: null },
    product_label: checkout.product_label,
    active: checkout.active,
    locale: localeFor(checkout.offer_slug),
    program: checkout.program,
    treatment,
    disposition,
    sale_mode:
      checkout.price_cents === 0
        ? 'free'
        : checkout.installments?.enabled
          ? 'one_time_or_installment'
          : 'one_time',
    commercial_terms: {
      currency: checkout.currency,
      price_cents: checkout.price_cents,
      installments: checkout.installments,
      regional_pricing: checkout.regional_pricing,
      frozen_source:
        'local working-tree checkout; not deployed or native price proof',
    },
    entitlement: {
      offer_present: Boolean(offer),
      status: offer?.status ?? null,
      bundle_key: offer?.bundle_key ?? null,
      bundle_version: bundle?.version ?? null,
      component_keys: componentKeys,
    },
    relationships: {
      party_roles: partyRoleBoundary,
      checkout_declared_price_refs: checkoutDeclaredPriceRefs,
      entitlement_offer_declared_price_refs: entitlementOfferDeclaredPriceRefs,
      stripe,
      heartbeat_groups: heartbeatGroups,
      heartbeat_courses: courseIds.map((id) => ({
        id,
        native_exists: courseById.has(id),
        native_label: courseById.get(id)?.name ?? null,
        source_course_present: sourceCourseById.has(id),
        relationship_type: 'bundle_component_declared_course',
      })),
      roster: rosterByLabel.get(checkout.product_label) ?? [],
      publishing_sources: pageRefsByOffer.get(checkout.offer_slug) ?? [],
      schedule: (scheduleByOffer[checkout.offer_slug] ?? []).map((key) =>
        blocksByKey.get(key),
      ),
      plutio: { status: 'no_offer_or_agreement_mapping_exposed' },
    },
    coverage_axes: {
      source_verification: offer
        ? 'checkout_catalog_overlap_verified'
        : 'checkout_source_only',
      proposed_disposition: disposition,
      runtime_migration_coverage: route
        ? 'catalog_route_declared_not_runtime_verified'
        : 'not_covered',
      publication_policy: {
        observed_local_state: checkout.active ? 'active' : 'inactive',
        deployed_identity: 'unverified',
        current_exemption_or_enforcement: 'none_conferred_by_this_audit',
        proposed_new_or_changed_publication:
          'hold_pending_owner_acceptance_and_required_evidence',
        proposal_enforcement_status: 'not_applied_or_verified',
      },
    },
    owner:
      treatment === 'component_service_fulfillment'
        ? 'academy_operations'
        : 'academy_product_owner',
    safe_hold: checkout.active
      ? 'Preserve observed current behavior without granting an exemption or allowlist. Propose holding new canonical admission, binding expansion, or changed publication until missing evidence closes; this policy is not applied or enforced.'
      : 'Observe the local inactive state without inferring retirement. Any proposed hold on reactivation is not applied or enforced.',
    evidence_needed: [...new Set(evidenceNeeded)],
    review_trigger:
      'source owner supplies missing exact relationship or publication scope changes',
  });
}

const mcsOffer = offerByKey.get('mcs-full');
const mcsBundle = bundleByKey.get(mcsOffer.bundle_key);
const mcsComponentKeys = componentKeysForBundle(mcsBundle);
const mcsComponents = mcsComponentKeys
  .map((key) => componentByKey.get(key))
  .filter(Boolean);
records.push({
  record_id: 'entitlement:mcs-full',
  record_semantics: 'catalog_offer_record_not_order',
  source_kind: 'entitlement_only',
  offer_slug: 'mcs-full',
  canonical_offer_link: { status: 'accepted_same_key', offer_key: 'mcs-full' },
  product_label: 'MCS program-wide entitlement offer',
  active: true,
  locale: 'en',
  program: 'mcs',
  treatment: 'enrollment',
  disposition: 'unresolved',
  sale_mode: 'agreement_unresolved',
  commercial_terms: {
    currency: mcsOffer.currency,
    price_cents: mcsOffer.price_cents,
    installments: null,
    regional_pricing: null,
    frozen_source: 'entitlement catalog plus dated checkout variants',
  },
  entitlement: {
    offer_present: true,
    status: mcsOffer.status,
    bundle_key: mcsOffer.bundle_key,
    bundle_version: mcsBundle.version,
    component_keys: mcsComponentKeys,
  },
  relationships: {
    party_roles: partyRoleBoundary,
    checkout_declared_price_refs: [],
    entitlement_offer_declared_price_refs: mcsOffer.stripe_price_ids.map(
      (priceId) => ({
        price_id: priceId,
        declaration_scope:
          'entitlement_offer_unscoped_not_product_or_account_association',
        relationship_status: 'catalog_source_declared_unverified_association',
      }),
    ),
    stripe: stripeByOffer.get('mcs-full') ?? [],
    heartbeat_groups: mcsOffer.heartbeat_full_access_group_ids.map((id) => ({
      id,
      native_exists: groupById.has(id),
      native_label: groupById.get(id)?.name ?? null,
      relationship_type: 'catalog_declared_full_access',
    })),
    heartbeat_courses: [
      ...new Set(mcsComponents.flatMap((item) => item.heartbeat.course_ids)),
    ].map((id) => ({
      id,
      native_exists: courseById.has(id),
      native_label: courseById.get(id)?.name ?? null,
      source_course_present: sourceCourseById.has(id),
      relationship_type: 'bundle_component_declared_course',
    })),
    roster: [],
    publishing_sources: [],
    schedule: scheduleByOffer['mcs-full'].map((key) => blocksByKey.get(key)),
    checkout_variants: ['mcs-cohort-sept-thursday', 'mcs-cohort-sept-friday'],
    plutio: { status: 'no_offer_or_agreement_mapping_exposed' },
  },
  coverage_axes: {
    source_verification:
      'catalog_offer_native_products_verified_checkout_variant_relationship_unresolved',
    proposed_disposition: 'unresolved',
    runtime_migration_coverage: 'not_covered',
    publication_policy: {
      observed_local_state: 'absent_from_checkout',
      deployed_identity: 'unverified',
      current_exemption_or_enforcement: 'none_conferred_by_this_audit',
      proposed_new_or_changed_publication:
        'hold_pending_owner_acceptance_and_required_evidence',
      proposal_enforcement_status: 'not_applied_or_verified',
    },
  },
  owner: 'academy_and_finance_owner',
  safe_hold:
    'Preserve both Stripe product references in their observed namespaces and the dated checkout source records. The proposal to hold new binding or publication is not applied; do not flatten accounts or infer one universal offer-variant relationship.',
  evidence_needed: [
    'owner-accepted program-wide offer versus dated checkout-variant relationship',
    'agreement and payment-plan semantics',
    'typed per-product Stripe namespace references',
    'exact roster and schedule projection route',
  ],
  review_trigger:
    'owner decision on MCS offer, variant, and agreement semantics',
});

for (const source of roster.product_map.non_student_sentinels) {
  const slug = source.product_label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  records.push({
    record_id: 'roster-non-student:' + slug,
    record_semantics: 'source_counterpart_not_offer_or_order',
    source_kind: 'roster_source_only',
    offer_slug: null,
    canonical_offer_link: { status: 'not_applicable', offer_key: null },
    product_label: source.product_label,
    active: null,
    locale: 'en',
    program: 'services',
    treatment: 'non_student_sale',
    disposition: 'legacy_dispositioned',
    sale_mode: 'unverified',
    commercial_terms: null,
    entitlement: {
      offer_present: false,
      status: null,
      bundle_key: null,
      bundle_version: null,
      component_keys: [],
    },
    relationships: {
      party_roles: partyRoleBoundary,
      checkout_declared_price_refs: [],
      entitlement_offer_declared_price_refs: [],
      stripe: [],
      heartbeat_groups: [],
      heartbeat_courses: [],
      roster: [
        {
          roster_tab: source.roster_tab,
          roster_column: source.roster_column,
          relationship_type: 'native_non_student_sentinel',
        },
      ],
      publishing_sources: [],
      schedule: [],
      plutio: { status: 'no_offer_or_agreement_mapping_exposed' },
    },
    coverage_axes: {
      source_verification: 'native_product_map_sentinel',
      proposed_disposition: 'legacy_dispositioned',
      runtime_migration_coverage: 'not_applicable',
      publication_policy: {
        observed_local_state: 'source_only_not_checkout',
        deployed_identity: 'unverified',
        current_exemption_or_enforcement: 'none_conferred_by_this_audit',
        proposed_new_or_changed_publication:
          'hold_outside_student_flows_pending_owner_acceptance',
        proposal_enforcement_status: 'not_applied_or_verified',
      },
    },
    owner: 'services_owner',
    safe_hold:
      'Keep outside student enrollment, entitlement, roster, and capacity flows.',
    evidence_needed: [
      'service fulfillment authority only if this source-only label becomes sellable',
    ],
    review_trigger:
      'a new checkout or provider sale references this exact label',
  });
}

const french = publishingDiscovery.french_counterpart;
records.push({
  record_id: 'locale-source:mcs-foundations-fr',
  record_semantics: 'source_counterpart_not_offer_or_order',
  source_kind: 'locale_course_source_only',
  offer_slug: null,
  canonical_offer_link: { status: 'unresolved', offer_key: null },
  product_label: french.source_title,
  active: null,
  locale: 'fr',
  program: 'mcq',
  treatment: 'unresolved',
  disposition: 'unresolved',
  sale_mode: 'not_observed',
  commercial_terms: null,
  entitlement: {
    offer_present: false,
    status: null,
    bundle_key: null,
    bundle_version: null,
    component_keys: [],
  },
  relationships: {
    party_roles: partyRoleBoundary,
    checkout_declared_price_refs: [],
    entitlement_offer_declared_price_refs: [],
    stripe: [],
    heartbeat_groups: french.native_group_candidate
      ? [
          {
            id: french.native_group_candidate.id,
            native_exists: true,
            native_label: french.native_group_candidate.name,
            relationship_type: 'exact_label_candidate_attachment_unverified',
          },
        ]
      : [],
    heartbeat_courses: [
      {
        id: french.heartbeat_course_id,
        native_exists: french.native_course_exists,
        native_label: french.native_course_label,
        source_course_present: true,
        relationship_type: 'source_manifest_declared_course',
      },
    ],
    roster: [],
    publishing_sources: [],
    schedule: [],
    plutio: { status: 'no_offer_or_agreement_mapping_exposed' },
  },
  coverage_axes: {
    source_verification:
      'course_source_and_native_course_exist_sellable_offer_unobserved',
    proposed_disposition: 'unresolved',
    runtime_migration_coverage: 'not_covered',
    publication_policy: {
      observed_local_state: 'course_source_only_no_checkout_or_page_source',
      deployed_identity: 'unverified',
      current_exemption_or_enforcement: 'none_conferred_by_this_audit',
      proposed_new_or_changed_publication:
        'hold_sellable_offer_inference_pending_owner_acceptance',
      proposal_enforcement_status: 'not_applied_or_verified',
    },
  },
  owner: 'academy_product_and_course_source',
  safe_hold:
    'Preserve the French learning counterpart as source evidence without inferring a sellable offer. Any proposal to hold offer creation or publication is not applied or enforced.',
  evidence_needed: [
    'accepted sellable or non-sellable disposition',
    'authoritative access-group attachment if delivery coverage is claimed',
    'checkout, commercial terms, and publishing source only if a sellable offer is accepted',
  ],
  review_trigger:
    'owner classifies the French counterpart or a checkout or page source appears',
});

records.sort((a, b) => a.record_id.localeCompare(b.record_id));
const countBy = (field) =>
  Object.fromEntries(
    [...new Set(records.map((item) => item[field]))]
      .sort()
      .map((value) => [
        String(value),
        records.filter((item) => item[field] === value).length,
      ]),
  );

const sourceSnapshots = [
  'docs/reports/NC-20260907-004-LOCAL-CATALOG-BASELINE.json',
  'docs/reports/NC-20260907-004-B1-STUDENT-ROSTER-SNAPSHOT.json',
  'docs/reports/NC-20260907-004-B1-HEARTBEAT-MAIN-SNAPSHOT.json',
  'docs/reports/NC-20260907-004-B2-PROVIDER-CATALOG-SNAPSHOT.json',
  'docs/reports/NC-20260907-004-C-SOURCE-AUTHORITY-SNAPSHOT.json',
  'docs/reports/NC-20260907-004-C-PUBLISHING-DISCOVERY-SUPPLEMENT.json',
];
const inventory = {
  artifact_id: 'NC-20260907-004-catalog-disposition-draft',
  generated_at_utc: new Date().toISOString(),
  status: 'unapplied_review_draft',
  source_snapshots: sourceSnapshots,
  privacy: { person_or_student_rows: 0, raw_provider_payloads: 0 },
  counts: {
    records: records.length,
    checkout_records: records.filter((item) => item.source_kind === 'checkout')
      .length,
    active_checkout_records: records.filter(
      (item) => item.source_kind === 'checkout' && item.active,
    ).length,
    inactive_checkout_records: records.filter(
      (item) => item.source_kind === 'checkout' && !item.active,
    ).length,
    source_only_records: records.filter(
      (item) => item.source_kind !== 'checkout',
    ).length,
    accepted_catalog_offer_keys: catalog.offers.length,
    canonical_order_records: 0,
    candidate_variant_links: records.filter(
      (item) => item.canonical_offer_link.status === 'candidate_variant_link',
    ).length,
    records_with_explicit_party_role_boundary: records.filter(
      (item) =>
        item.relationships.party_roles.relationship_status ===
        'not_evidenced_and_never_assumed_same',
    ).length,
    treatments: countBy('treatment'),
    dispositions: countBy('disposition'),
    active_with_exactly_one_treatment: records.filter(
      (item) =>
        item.source_kind === 'checkout' && item.active && item.treatment,
    ).length,
    active_with_exactly_one_disposition: records.filter(
      (item) =>
        item.source_kind === 'checkout' && item.active && item.disposition,
    ).length,
    active_local_checkout_observations: records.filter(
      (item) =>
        item.source_kind === 'checkout' &&
        item.active &&
        item.coverage_axes.publication_policy.observed_local_state === 'active',
    ).length,
    checkout_declared_price_refs: records.flatMap(
      (item) => item.relationships.checkout_declared_price_refs,
    ).length,
    entitlement_offer_declared_price_refs: records.flatMap(
      (item) => item.relationships.entitlement_offer_declared_price_refs,
    ).length,
    heartbeat_checkout_group_refs: records
      .filter((item) => item.source_kind === 'checkout')
      .flatMap((item) => item.relationships.heartbeat_groups).length,
    heartbeat_checkout_group_refs_native: records
      .filter((item) => item.source_kind === 'checkout')
      .flatMap((item) => item.relationships.heartbeat_groups)
      .filter((item) => item.native_exists).length,
    stripe_account_scoped_relationships: records.flatMap(
      (item) => item.relationships.stripe,
    ).length,
    roster_exact_label_mappings: records
      .filter((item) => item.source_kind === 'checkout')
      .flatMap((item) => item.relationships.roster).length,
  },
  records,
  global_limits: [
    'Plutio exposes no offer or agreement line-item binding in the supported sanitized reads.',
    'Six declared Stripe products have native default_price:null; amount, recurrence, and non-default price collections remain unavailable.',
    'Heartbeat group and course list surfaces do not prove group-to-course attachment.',
    'Public page reads do not prove exact deployed checkout slug attributes or source commit.',
    'CoachGrader assessment facts do not prove enrollment, entitlement, completion, or certificate state.',
  ],
};

const activeUnresolved = records
  .filter(
    (item) =>
      item.source_kind === 'checkout' &&
      item.active &&
      item.disposition === 'unresolved',
  )
  .map((item) => item.offer_slug);
const mcsStripe = stripeByOffer.get('mcs-full') ?? [];
const proposal = {
  proposal_id: 'NC-20260907-004-unapplied-catalog-binding-proposal',
  generated_at_utc: new Date().toISOString(),
  status: 'proposal_only_not_applied',
  targets: [
    {
      path: 'facts/catalogs/student-entitlements-v1.json',
      base_sha256: baseline.sources.entitlement_catalog.sha256,
      proposed_next_revision: 2,
    },
    {
      path: 'facts/catalogs/student-product-bindings-v1.json',
      base_sha256: baseline.sources.product_bindings.sha256,
      proposed_next_revision: 2,
    },
  ],
  invariants: [
    'No canonical or provider mutation in NC-20260907-004.',
    'Preserve one agreement and order across installments and many receipts.',
    'Preserve provider account or community namespace on every native reference.',
    'Do not infer group-to-course attachment, payer-to-participant, or schedule assignment.',
    'Preserve committed-seat simple sync with no temporary checkout holds or live checkout dependency.',
  ],
  proposed_changes: [
    {
      id: 'P-01',
      target:
        'entitlement catalog component systems.individual-exam-preparation',
      change:
        'Retain the historical invalid group UUID as unresolved provenance, preserve the promised component and exact course ID, and record the current near-match group only as candidate evidence. Do not erase the component or promote a replacement UUID.',
      apply_gate:
        'supported source-verification evidence establishes the exact group and attachment',
    },
    {
      id: 'P-02',
      target: 'product binding schema revision 2',
      change:
        'Replace one offer-level stripe_account field with stripe_product_refs carrying source_namespace, account_id, product_id, relationship_type, and evidence per reference. Preserve offer-level price arrays as unscoped declarations and create a product-to-price association only where native evidence verifies it; never form a Cartesian product.',
      example_for_mcs_full: mcsStripe.map((item) => ({
        source_namespace: item.source_namespace,
        account_id: item.account_id,
        product_id: item.product_id,
        default_price_status: item.default_price_status,
      })),
      apply_gate:
        'schema review and deterministic namespace uniqueness validation',
    },
    {
      id: 'P-03',
      target: 'MCS binding route',
      change:
        'Model mcs-cohort-sept-thursday and mcs-cohort-sept-friday as context-bearing checkout-variant candidates of mcs-full with exact delivery-block context; do not create a second order per installment receipt.',
      apply_gate:
        'owner confirms whether commercial, agreement, entitlement, or fulfillment promises materially differ; Astra then selects the internal representation after provider evidence closes',
    },
    {
      id: 'P-04',
      target: 'localized Foundations offer family',
      change:
        'Add candidate locale-specific offer and bundle relationships for checkout slugs mcq-program-a-foundations, mcs-foundations-es, and mcs-foundations-ja with exact source declarations. Retain the French course/native counterpart as source-only and infer no sellable offer.',
      apply_gate:
        'owner confirms material promise differences and French sellable intent; Astra then selects offer-key or variant representation',
    },
    {
      id: 'P-05',
      target: 'staged active checkout coverage',
      change:
        'Create reviewed catalog and binding records in bounded program or component batches for active unresolved entries; never expand a generic allowlist.',
      active_offer_slugs: activeUnresolved,
      apply_gate:
        'each record closes evidence_needed and passes publication validation',
    },
    {
      id: 'P-06',
      target: 'managed-manifest and service-source coverage',
      change:
        'Record that exact native IDs 2f0da0f8-7278-4cf4-baeb-f5f1949f8c77 and cc660896-b415-4a72-928b-475b3236ea62 were not found in the scanned managed course manifests. Their components are mentoring, performance-evaluation, or service containers, so the authoritative source may instead be an allowance, procedure, or schedule contract.',
      apply_gate:
        'the correct service, allowance, procedure, schedule, or managed-manifest authority is identified',
    },
    {
      id: 'P-07',
      target: 'Plutio relationships',
      change:
        'Keep proposal and contract template links as structural evidence and project references as unverified; add no offer or agreement binding.',
      apply_gate:
        'supported item or line definition or exact accepted agreement mapping becomes available',
    },
  ],
  validation_contract: [
    'Every active checkout record has exactly one treatment and disposition.',
    'Every Stripe product reference is scoped to one observed namespace and account.',
    'Every checkout-declared direct or installment price ID remains a separate source declaration and is not attached to a label-matched product as verified.',
    'Offer-level catalog price arrays remain unscoped; product-to-price association exists only for an exact native default-price match.',
    'Every record keeps payer, purchaser, sponsor, participant, and student as distinct roles; no identity relation was collected and sameness is never assumed.',
    'No source-only or label-only relationship becomes accepted identity.',
    'The audit records observed local active state without conferring grandfathering, an allowlist, or enforced publication blocks; proposed holds remain not applied.',
    'Canonical catalogs remain unchanged by this proposal artifact.',
  ],
};

const qualifiedQuestions = catalog.components
  .filter((item) => item.open_questions?.length)
  .flatMap((item) =>
    item.open_questions.map((question, index) => {
      const groups = item.heartbeat.access_group_ids.map((id) => ({
        id,
        native_exists: groupById.has(id),
      }));
      const courses = item.heartbeat.course_ids.map((id) => ({
        id,
        native_exists: courseById.has(id),
        found_in_scanned_managed_manifest: sourceCourseById.has(id),
      }));
      const remainingEvidence = [];
      if (/session|hour|count|allowance|resubmission/i.test(question)) {
        remainingEvidence.push('quantity_or_consumption_contract');
      }
      if (/attach|group|course|marker|taxonomy/i.test(question)) {
        remainingEvidence.push('provider_attachment_or_purpose_authority');
      }
      if (/credential|eligib|verification source/i.test(question)) {
        remainingEvidence.push('eligibility_source_authority');
      }
      if (/appointment|evidence source|track/i.test(question)) {
        remainingEvidence.push('typed_service_or_evidence_procedure');
      }
      if (/transition|graduation|completion/i.test(question)) {
        remainingEvidence.push('completion_or_transition_policy');
      }
      if (!remainingEvidence.length) {
        remainingEvidence.push('source_owner_meaning_or_authority');
      }
      return {
        question_id: item.component_key + ':' + (index + 1),
        component_key: item.component_key,
        component_type: item.component_type,
        evidence_status: item.evidence_status,
        source_question: question,
        audit_status: 'partially_resolved_remaining_evidence_open',
        resolved_facts: {
          declared_groups: groups,
          declared_courses: courses,
          supported_group_course_attachment:
            'not_exposed_by_current_list_surfaces',
        },
        remaining_evidence: [...new Set(remainingEvidence)],
      };
    }),
  );
proposal.qualified_open_questions = qualifiedQuestions;

const decisionMarkdown = [
  '# NC-20260907-004 owner decision brief',
  '',
  'This brief contains only unresolved business meaning or source authority. The audit observes current local source behavior but grants no grandfathering, allowlist, or publication enforcement. Every hold below is proposed and not applied.',
  '',
  '## D-01 — Foundations locale identity',
  '',
  'Confirm whether the delivered commercial, entitlement, assessment, certificate, refund, or fulfillment promises materially differ across the current English, Spanish, and Japanese checkout contexts, and whether the French learning counterpart is intended to be sellable at all. Evidence present: three active checkout slugs, exact native groups and courses, shared or regional price declarations, and a French course/native counterpart with no checkout or page source. Evidence missing: an accepted cross-locale promise comparison and French sellable intent. Owner: Academy product and finance. Astra owns the later offer-key versus variant representation. Every hold is proposed and not applied.',
  '',
  '## D-02 — MCS program-wide offer versus dated checkout variants',
  '',
  'Confirm whether commercial, agreement, entitlement, refund, or fulfillment promises materially differ between the program-wide MCS offering, the Thursday and Friday checkout contexts, and the two observed Stripe account products. Evidence present: accepted mcs-full catalog offer, one program-wide enrollment copy, dated schedule contexts, and exact account-scoped product identities. Evidence missing: native agreement and non-default price semantics plus an accepted promise-difference statement. Owner: Academy product and finance. Astra owns the later offer-key versus variant representation. Proposed hold: keep account references separate and infer no duplicate order or installment semantics.',
  '',
  '## D-03 — PCC practice-test access group',
  '',
  'Resolve the source-verification gap for the group attached to course 5e9eb6c7-7f5c-4244-b352-e202a604969b through supported provider attachment evidence or an existing authoritative source record. The historical catalog UUID remains unresolved provenance and the promised component remains intact; the near-match group is only a candidate. The user is not asked to invent an ID. Owner: Academy course source. Proposed hold: preserve observed inactive checkout state and do not promote a replacement group.',
  '',
  '## D-04 — Managed manifest or service-source ownership',
  '',
  'Identify the correct authoritative source type for native IDs 2f0da0f8-7278-4cf4-baeb-f5f1949f8c77 and cc660896-b415-4a72-928b-475b3236ea62. They were not found in the scanned managed course manifests, but their catalog components are mentoring, performance-evaluation, or service containers; an allowance, procedure, or schedule source may be appropriate instead of course.json. Owner: Academy operations or course source. Proposed hold: do not claim reproducible service quantity, procedure, or attachment until the correct source is identified.',
  '',
  '## D-05 — Service quantities and consumption',
  '',
  "Resolve the catalog's existing component questions before operational entitlement issuance. Owner: Academy operations. Hold: preserve current fulfillment; no inferred hours, sessions, assessment counts, substitution, transfer, or completion.",
  '',
  'Legacy component questions were audit-qualified rather than copied as undifferentiated open work: ' +
    qualifiedQuestions.length +
    ' records retain newly verified native facts separately from genuinely open quantity, attachment, eligibility, procedure, completion, or source-authority evidence.',
  '',
  '## Evidence-only gaps',
  '',
  "No payer, purchaser, sponsor, participant, or student identity was collected. These remain distinct roles on every record and no sameness is assumed. Plutio item and agreement mapping, six Stripe default-price-null relationships, current exact pool-key readback, group-course attachments, and CoachGrader offer or component bindings remain evidence gaps. The courses repository's Plutio student-master wording is superseded source drift, not an open authority choice. No absence or meaning is inferred.",
  '',
].join('\n');

const evidenceMarkdown = [
  '# NC-20260907-004 — student product catalog read-only reconciliation',
  '',
  'Date: 2026-09-07',
  '',
  '## Outcome',
  '',
  'A privacy-minimized source-bound draft now covers ' +
    inventory.counts.records +
    ' selected source/disposition records, not canonical orders or unique offers: ' +
    inventory.counts.checkout_records +
    ' checkout entries, the catalog-only MCS offer, seven native Product Map non-student counterparts, and one French learning counterpart without a sellable-offer inference. All ' +
    inventory.counts.active_checkout_records +
    ' active checkout entries have one treatment and one disposition. Canonical catalogs, provider objects, business or runtime state, and primary program state remain unchanged.',
  '',
  '## Source coverage',
  '',
  '- Checkout: ' +
    baseline.counts.checkout_entries +
    ' local working-tree entries and ' +
    baseline.counts.checkout_active_entries +
    ' active; selected safe fields are unchanged from Tandemweb HEAD, while deployment identity remains unverified.',
  '- Roster: ' +
    roster.counts.product_map_rows +
    ' Product Map rows and ' +
    roster.counts.invalid_target_rows +
    ' invalid targets; zero student rows read.',
  '- Heartbeat: ' +
    heartbeat.counts.native_groups +
    ' groups and ' +
    heartbeat.counts.native_courses +
    ' courses; ' +
    heartbeat.counts.catalog_declared_groups_found +
    '/' +
    heartbeat.counts.catalog_declared_unique_group_ids +
    ' declared groups and ' +
    heartbeat.counts.catalog_declared_courses_found +
    '/' +
    heartbeat.counts.catalog_declared_unique_course_ids +
    ' declared courses exist.',
  '- Stripe: ' +
    providers.stripe.namespaces
      .map((item) => item.returned_count)
      .reduce((a, b) => a + b, 0) +
    ' products across two namespaces; all nine declared product references exist, with three exact default-price matches and six native null defaults.',
  '- Plutio: bounded template and custom-field structure is exhausted; no item-level offer or agreement binding is exposed, and two project references remain unverified.',
  '- Curriculum: ' +
    sourceAuthority.curriculum_and_bundles.counts.course_json_records +
    ' ICF course records; 18/20 catalog-declared course IDs were found in the scanned managed course manifests. The other two are service containers, so no curriculum-absence conclusion is made.',
  '- Schedule: all six supported calendar program reads recovered successfully; five accepted delivery blocks retain the committed-seat simple-sync boundary.',
  '- Publishing discovery: ' +
    publishingDiscovery.site_wide_static_scan.active_found +
    '/37 active checkout slugs have a bounded static page-source reference; four evaluation-training slugs were not found. The page catalog predates ES and JA sources, so index absence is not publication absence.',
  '',
  '## Disposition and publication boundary',
  '',
  'Disposition counts: ' +
    JSON.stringify(inventory.counts.dispositions) +
    '. Treatment counts: ' +
    JSON.stringify(inventory.counts.treatments) +
    '. The audit records observed local active or inactive state without granting grandfathering, an allowlist, or an enforced publication block. Holding new or changed publication is an unapplied proposal requiring acceptance and implementation evidence. Inactivity alone is not retirement evidence.',
  '',
  '## Material contradictions and safe holds',
  '',
  '1. PCC practice-test catalog group ID is absent and source-unreproducible; do not substitute the near-match native group.',
  '2. Foundations locale variants have checkout and provider evidence without accepted offer or bundle bindings.',
  '2a. A French learning counterpart has source and native course evidence but no checkout or page source; no sellable offer is inferred.',
  '3. MCS uses dated checkout slugs and account-scoped products around one program-wide enrollment; exact variant and agreement meaning remains unsettled.',
  '4. Two declared and native service-container course IDs were not found in the scanned managed course manifests; another service, allowance, procedure, or schedule source may be appropriate.',
  '5. Courses documentation still assigns Plutio superseded student-master authority.',
  '6. Provider existence does not prove attachment, fulfillment, agreement, enrollment, progress, assessment completion, or capacity.',
  '7. Payer, purchaser, sponsor, participant, and student remain distinct roles. This audit read no identities and establishes no per-record relation among them.',
  '',
  '## Privacy and external effects',
  '',
  'No people, students, members, progress, payments, invoices, contracts, assessment records, credentials, invitation codes, secret URLs, or raw provider payloads are retained. Provider access was read-only. No deployment, release, migration, message, catalog application, or program mutation occurred.',
  '',
].join('\n');

const programDelta = {
  proposal_id: 'NC-20260907-004-proposed-program-delta',
  generated_at_utc: new Date().toISOString(),
  apply_authority: 'Astra only',
  status: 'review_complete_pending_astra_acceptance_do_not_apply',
  observed_state_revision:
    sourceAuthority.program_binding_observed_read_only.state_revision,
  work_item: 'work:student-product-catalog-source-reconciliation',
  pre_review_operations: {
    keep_status: 'active',
    attach_evidence_to_commitments: {
      'commitment:catalog-source-baseline': sourceSnapshots,
      'commitment:catalog-dispositions': [
        'docs/reports/NC-20260907-004-CATALOG-DISPOSITION-DRAFT.json',
      ],
      'commitment:catalog-business-decisions': [
        'docs/reports/NC-20260907-004-OWNER-DECISION-BRIEF.md',
      ],
      'commitment:catalog-proposal': [
        'docs/reports/NC-20260907-004-UNAPPLIED-CATALOG-BINDING-PROPOSAL.json',
      ],
      'commitment:catalog-verification-review': [
        'docs/reports/NC-20260907-004-PRE-REVIEW-VERIFICATION.md',
        'docs/reports/NC-20260907-004-POST-R1-CORRECTION-VERIFICATION.md',
        'docs/reports/NC-20260907-004-CLAUDE-REVIEW-RESPONSE-R1.md',
        'docs/reports/NC-20260907-004-CLAUDE-REVIEW-RESPONSE-R2.md',
      ],
      'commitment:catalog-source-closure': [
        'docs/programs/company-os/evidence/NC-20260907-004-student-product-catalog-reconciliation.md',
        'docs/reports/NC-20260907-004-C-PUBLISHING-DISCOVERY-SUPPLEMENT.json',
      ],
    },
  },
  post_review_candidate: {
    refresh_expected_revision: true,
    satisfied_now: [
      'review artifact with no unresolved material findings',
      'focused validation receipts',
    ],
    mark_completed_only_with_remaining: [
      'commit hash and push receipt',
      'verified handoff',
    ],
    work_status_after_commit: 'done',
    evidence_to_add: [
      'docs/programs/company-os/evidence/NC-20260907-004-student-product-catalog-reconciliation.md',
      'docs/reports/NC-20260907-004-CATALOG-DISPOSITION-DRAFT.json',
      'docs/reports/NC-20260907-004-UNAPPLIED-CATALOG-BINDING-PROPOSAL.json',
      'docs/reports/NC-20260907-004-OWNER-DECISION-BRIEF.md',
    ],
  },
  candidates_to_register: [],
  strategy_candidates: [],
  prohibited: [
    'Do not apply against stale revision 253 without refresh.',
    'Do not mark review or source-closure commitments complete before review, commit, push, and handoff evidence exist.',
    'Do not activate rollout, mutate catalogs or providers or runtime, or begin the production pilot.',
  ],
};

const progressMarkdown = [
  '# NC-20260907-004 disposition draft progress',
  '',
  'Generated at: ' + inventory.generated_at_utc,
  '',
  'The draft contains ' +
    inventory.counts.records +
    ' records. All ' +
    inventory.counts.active_checkout_records +
    ' active checkout entries have exactly one treatment and disposition.',
  '',
  'Dispositions: ' +
    Object.entries(inventory.counts.dispositions)
      .map(([key, value]) => key + ' ' + value)
      .join(', ') +
    '.',
  '',
  'Treatments: ' +
    Object.entries(inventory.counts.treatments)
      .map(([key, value]) => key + ' ' + value)
      .join(', ') +
    '.',
  '',
  'The draft records current local active sale behavior without granting grandfathering or a new allowlist. Holding new or changed publication is proposed only and is not applied or enforced. Canonical catalogs and bindings were not edited.',
  '',
  'Next: validate counts, enum, privacy, and namespace invariants; run the existing identity audit and documentation continuity checks; then prepare the bounded Sonnet/high review packet.',
  '',
].join('\n');

process.stdout.write(
  JSON.stringify({
    inventory,
    proposal,
    decisionMarkdown,
    evidenceMarkdown,
    programDelta,
    progressMarkdown,
  }),
);
