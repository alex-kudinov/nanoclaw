#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const MANIFEST_PATH = 'facts/catalogs/student-catalog-publication-v1.json';
const SCHEMA_PATH = 'facts/catalogs/student-catalog-publication-v1.schema.json';
const OUTPUT_NAMES = {
  nanoclaw: 'nanoclaw-product-bindings-v1.compat.json',
  tandemweb: 'tandemweb-checkout-publication-v1.json',
  envelope: 'student-catalog-publication-envelope-v1.json',
};
const TRACKED_OUTPUTS = {
  nanoclaw: 'facts/generated/student-product-bindings-v1.compat.json',
  tandemweb: 'data/generated/student-catalog-publication-v1.json',
};
const EXPECTED_POPULATION = ['supervision-inaugural', 'supervision-regular'];
const EXPECTED_CONSUMERS = ['nanoclaw-v1', 'tandemweb-checkout-validation'];
const EXPECTED_HOLDS = [
  'global_strict_publication_eligible',
  'heartbeat_class_assignment_verified',
  'heartbeat_completion_verified',
  'heartbeat_group_course_attachment_verified',
  'heartbeat_learner_access_verified',
  'heartbeat_progress_verified',
  'native_price_amount_verified',
  'native_price_recurrence_verified',
];
const ALLOWED_SOURCES = new Map(
  [
    [
      'supervision_program',
      'nanoclaw',
      'facts/catalogs/coaching-supervision-mastery.json',
    ],
    [
      'entitlement_catalog',
      'nanoclaw',
      'facts/catalogs/student-entitlements-v1.json',
    ],
    [
      'binding_catalog',
      'nanoclaw',
      'facts/catalogs/student-product-bindings-v1.json',
    ],
    ['checkout_catalog', 'tandemweb', 'data/checkout/products.json'],
    [
      'stripe_snapshot',
      'nanoclaw',
      'docs/reports/NC-20260907-004-B2-PROVIDER-CATALOG-SNAPSHOT.json',
    ],
    [
      'heartbeat_snapshot',
      'nanoclaw',
      'docs/reports/NC-20260907-004-B1-HEARTBEAT-MAIN-SNAPSHOT.json',
    ],
    [
      'course_source_snapshot',
      'nanoclaw',
      'docs/reports/NC-20260907-004-C-SOURCE-AUTHORITY-SNAPSHOT.json',
    ],
    [
      'consumer_alias_attestation',
      'nanoclaw',
      'docs/reports/NC-20260907-006-STRIPE-ALIAS-ATTESTATION.json',
    ],
  ].map(([key, root, relative]) => [key, { root, path: relative }]),
);
const RELATIONSHIP_TYPES = new Set([
  'consumer_account_alias',
  'offer_uses_product',
  'product_default_price',
  'offer_includes_bundle',
  'checkout_represents_offer',
  'offer_projects_to_roster',
  'offer_declares_access_group',
  'bundle_declares_course',
  'access_group_exists',
  'course_exists',
]);
const EVIDENCE_STATUSES = {
  source_declaration: new Set([
    'source_declared',
    'unverified',
    'held',
    'historical',
    'retired',
  ]),
  accepted_source: new Set([
    'accepted',
    'source_declared',
    'unverified',
    'held',
    'historical',
    'retired',
  ]),
  native_readback: new Set([
    'native_verified',
    'candidate',
    'unverified',
    'held',
    'historical',
    'retired',
  ]),
  existence_only: new Set([
    'native_verified',
    'candidate',
    'unverified',
    'held',
    'historical',
    'retired',
  ]),
};

export class PublicationBuildError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'PublicationBuildError';
    this.code = code;
  }
}

function fail(code, detail = '') {
  throw new PublicationBuildError(code, detail);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function sha256Value(value) {
  return sha256Bytes(canonicalJson(value));
}

function prettyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sameArray(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function schemaRef(root, reference) {
  if (typeof reference !== 'string' || !reference.startsWith('#/')) return null;
  return reference
    .slice(2)
    .split('/')
    .reduce(
      (value, part) =>
        value?.[part.replaceAll('~1', '/').replaceAll('~0', '~')],
      root,
    );
}

function schemaErrors(root, schema, value, location = '$') {
  if (schema.$ref) {
    const resolved = schemaRef(root, schema.$ref);
    return resolved
      ? schemaErrors(root, resolved, value, location)
      : [`${location}: unresolved $ref`];
  }
  if (schema.oneOf) {
    const passing = schema.oneOf.filter(
      (candidate) =>
        schemaErrors(root, candidate, value, location).length === 0,
    );
    return passing.length === 1 ? [] : [`${location}: oneOf`];
  }
  const errors = [];
  if ('const' in schema && canonicalJson(value) !== canonicalJson(schema.const))
    errors.push(`${location}: const`);
  if (
    schema.enum &&
    !schema.enum.some(
      (candidate) => canonicalJson(candidate) === canonicalJson(value),
    )
  )
    errors.push(`${location}: enum`);
  if (schema.type === 'object') {
    if (!isObject(value)) return [...errors, `${location}: type object`];
    for (const required of schema.required ?? [])
      if (!(required in value))
        errors.push(`${location}.${required}: required`);
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value))
        if (!(key in properties))
          errors.push(`${location}.${key}: additionalProperties`);
    }
    for (const [key, child] of Object.entries(properties))
      if (key in value)
        errors.push(
          ...schemaErrors(root, child, value[key], `${location}.${key}`),
        );
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) return [...errors, `${location}: type array`];
    if (schema.minItems !== undefined && value.length < schema.minItems)
      errors.push(`${location}: minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      errors.push(`${location}: maxItems`);
    if (
      schema.uniqueItems &&
      new Set(value.map(canonicalJson)).size !== value.length
    )
      errors.push(`${location}: uniqueItems`);
    if (schema.items)
      value.forEach((item, index) =>
        errors.push(
          ...schemaErrors(root, schema.items, item, `${location}[${index}]`),
        ),
      );
  } else if (schema.type === 'string') {
    if (typeof value !== 'string')
      return [...errors, `${location}: type string`];
    if (schema.minLength !== undefined && value.length < schema.minLength)
      errors.push(`${location}: minLength`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      errors.push(`${location}: pattern`);
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value)))
      errors.push(`${location}: format date-time`);
  } else if (schema.type === 'integer') {
    if (!Number.isInteger(value))
      return [...errors, `${location}: type integer`];
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push(`${location}: minimum`);
  } else if (schema.type === 'null' && value !== null) {
    errors.push(`${location}: type null`);
  }
  return errors;
}

export function validateManifestSchema(schema, manifest) {
  const errors = schemaErrors(schema, schema, manifest);
  if (errors.length) fail('manifest_schema_invalid', errors[0]);
}

function requireString(value, code, detail) {
  if (typeof value !== 'string' || value.length === 0) fail(code, detail);
}

function validateTimestamp(value, nullable, detail) {
  if (value === null && nullable) return;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
    fail('manifest_timestamp_invalid', detail);
}

function intervalsOverlap(left, right) {
  const leftStart =
    left.effective_from === null
      ? Number.NEGATIVE_INFINITY
      : Date.parse(left.effective_from);
  const leftEnd =
    left.effective_to === null
      ? Number.POSITIVE_INFINITY
      : Date.parse(left.effective_to);
  const rightStart =
    right.effective_from === null
      ? Number.NEGATIVE_INFINITY
      : Date.parse(right.effective_from);
  const rightEnd =
    right.effective_to === null
      ? Number.POSITIVE_INFINITY
      : Date.parse(right.effective_to);
  return leftStart < rightEnd && rightStart < leftEnd;
}

function relationshipScopeKey(relation) {
  return canonicalJson({
    namespace: relation.namespace,
    object_type: relation.object_type,
    object_id: relation.object_id,
    relationship_type: relation.relationship_type,
    target: relation.target,
    consumer_keys: [...relation.consumer_keys].sort(),
  });
}

export function validateManifestBeforeReads(manifest) {
  if (!isObject(manifest)) fail('manifest_invalid', 'root must be an object');
  if (
    manifest.schema_version !== 1 ||
    manifest.catalog_id !== 'student-catalog-publication' ||
    !Number.isInteger(manifest.revision) ||
    manifest.revision < 1
  ) {
    fail('manifest_version_invalid');
  }
  if (manifest.compatibility_profile !== 'nanoclaw-v1-exact')
    fail('compatibility_profile_invalid');
  if (!sameArray(manifest.population_keys, EXPECTED_POPULATION))
    fail('population_scope_invalid');
  if (!sameArray(manifest.consumers, EXPECTED_CONSUMERS))
    fail('consumer_scope_invalid');
  if (
    !isObject(manifest.source_roots) ||
    manifest.source_roots.nanoclaw !== 'nanoclaw' ||
    manifest.source_roots.tandemweb !== 'tandemweb' ||
    Object.keys(manifest.source_roots).length !== 2
  ) {
    fail('source_root_invalid');
  }
  if (
    !Array.isArray(manifest.sources) ||
    manifest.sources.length !== ALLOWED_SOURCES.size
  )
    fail('source_set_invalid');

  const sourcesByKey = new Map();
  const sourcesByPath = new Map();
  for (const source of manifest.sources) {
    if (!isObject(source)) fail('source_ref_invalid');
    requireString(
      source.source_key,
      'source_ref_invalid',
      'missing source_key',
    );
    if (sourcesByKey.has(source.source_key))
      fail('duplicate_source_key', source.source_key);
    const allowed = ALLOWED_SOURCES.get(source.source_key);
    if (
      !allowed ||
      source.root !== allowed.root ||
      source.path !== allowed.path
    ) {
      fail('source_ref_not_allowed', source.source_key);
    }
    if (
      path.isAbsolute(source.path) ||
      source.path.split('/').includes('..') ||
      source.path.includes('\\')
    ) {
      fail('source_ref_not_allowed', source.source_key);
    }
    requireString(source.namespace, 'source_ref_invalid', source.source_key);
    requireString(source.object_type, 'source_ref_invalid', source.source_key);
    requireString(source.object_id, 'source_ref_invalid', source.source_key);
    requireString(
      source.source_version,
      'source_version_missing',
      source.source_key,
    );
    if (!/^[a-f0-9]{64}$/.test(source.source_sha256 ?? ''))
      fail('source_digest_invalid', source.source_key);
    if (sourcesByPath.has(source.path))
      fail('duplicate_source_path', source.path);
    sourcesByKey.set(source.source_key, source);
    sourcesByPath.set(source.path, source);
  }
  for (const key of ALLOWED_SOURCES.keys())
    if (!sourcesByKey.has(key)) fail('source_set_invalid', key);

  if (
    !Array.isArray(manifest.relationships) ||
    manifest.relationships.length === 0
  )
    fail('relationships_missing');
  const keys = new Set();
  const scoped = new Map();
  for (const relation of manifest.relationships) {
    if (!isObject(relation)) fail('relationship_invalid');
    requireString(
      relation.relationship_key,
      'relationship_key_invalid',
      'missing',
    );
    if (keys.has(relation.relationship_key))
      fail('duplicate_relationship_key', relation.relationship_key);
    keys.add(relation.relationship_key);
    if (!RELATIONSHIP_TYPES.has(relation.relationship_type))
      fail('relationship_type_invalid', relation.relationship_key);
    const allowedStatuses = EVIDENCE_STATUSES[relation.evidence_class];
    if (!allowedStatuses)
      fail('evidence_class_invalid', relation.relationship_key);
    if (!allowedStatuses.has(relation.relationship_status))
      fail('relationship_status_exceeds_evidence', relation.relationship_key);
    for (const field of [
      'namespace',
      'object_type',
      'object_id',
      'source_ref',
      'source_version',
      'source_sha256',
      'evidence_ref',
    ]) {
      requireString(
        relation[field],
        'relationship_invalid',
        `${relation.relationship_key}.${field}`,
      );
    }
    if (!isObject(relation.target))
      fail('relationship_target_invalid', relation.relationship_key);
    for (const field of ['namespace', 'object_type', 'object_id'])
      requireString(
        relation.target[field],
        'relationship_target_invalid',
        relation.relationship_key,
      );
    const source = sourcesByPath.get(relation.source_ref);
    if (!source) fail('relationship_source_unknown', relation.relationship_key);
    if (
      relation.source_version !== source.source_version ||
      relation.source_sha256 !== source.source_sha256
    ) {
      fail('relationship_source_mismatch', relation.relationship_key);
    }
    if (
      !Array.isArray(relation.consumer_keys) ||
      relation.consumer_keys.length === 0 ||
      new Set(relation.consumer_keys).size !== relation.consumer_keys.length ||
      relation.consumer_keys.some((key) => !EXPECTED_CONSUMERS.includes(key))
    ) {
      fail('relationship_consumer_invalid', relation.relationship_key);
    }
    if (
      !isObject(relation.owner) ||
      typeof relation.owner.source !== 'string' ||
      typeof relation.owner.consumer !== 'string'
    ) {
      fail('relationship_owner_invalid', relation.relationship_key);
    }
    validateTimestamp(
      relation.observed_at,
      true,
      `${relation.relationship_key}.observed_at`,
    );
    validateTimestamp(
      relation.effective_from,
      true,
      `${relation.relationship_key}.effective_from`,
    );
    validateTimestamp(
      relation.effective_to,
      true,
      `${relation.relationship_key}.effective_to`,
    );
    if (
      (relation.evidence_class === 'native_readback' ||
        relation.evidence_class === 'existence_only') &&
      relation.observed_at === null
    ) {
      fail('provider_observation_missing', relation.relationship_key);
    }
    if (
      relation.effective_from !== null &&
      relation.effective_to !== null &&
      Date.parse(relation.effective_to) <= Date.parse(relation.effective_from)
    ) {
      fail('effective_interval_invalid', relation.relationship_key);
    }
    if (
      relation.evidence_class === 'existence_only' &&
      !['access_group_exists', 'course_exists'].includes(
        relation.relationship_type,
      )
    ) {
      fail('existence_evidence_overreach', relation.relationship_key);
    }
    const scope = relationshipScopeKey(relation);
    for (const prior of scoped.get(scope) ?? []) {
      if (intervalsOverlap(prior, relation))
        fail(
          'duplicate_active_relationship_interval',
          relation.relationship_key,
        );
    }
    scoped.set(scope, [...(scoped.get(scope) ?? []), relation]);
  }

  if (
    !isObject(manifest.holds) ||
    !sameArray(Object.keys(manifest.holds).sort(), EXPECTED_HOLDS) ||
    Object.values(manifest.holds).some((value) => value !== false)
  ) {
    fail('evidence_hold_invalid');
  }
  return { sourcesByKey, sourcesByPath };
}

function resolveAllowedSource(root, relative) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`))
    fail('source_ref_not_allowed', relative);
  return resolved;
}

function resolveAllowedSourceForRead(root, relative) {
  const resolved = resolveAllowedSource(root, relative);
  let physicalRoot;
  let physical;
  try {
    physicalRoot = fs.realpathSync(root);
    physical = fs.realpathSync(resolved);
  } catch {
    fail('source_read_failed', relative);
  }
  if (!physical.startsWith(`${physicalRoot}${path.sep}`))
    fail('source_symlink_not_allowed', relative);
  let cursor = physicalRoot;
  for (const segment of relative.split('/')) {
    cursor = path.join(cursor, segment);
    if (fs.lstatSync(cursor).isSymbolicLink())
      fail('source_symlink_not_allowed', relative);
  }
  return resolved;
}

function parseJson(bytes, sourceKey) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('source_json_invalid', sourceKey);
  }
}

function readDeclaredSources(manifest, sourcesByKey, roots) {
  const values = new Map();
  for (const [sourceKey, source] of sourcesByKey) {
    const root = roots[source.root];
    requireString(root, 'source_root_missing', source.root);
    const absolute = resolveAllowedSourceForRead(root, source.path);
    let bytes;
    try {
      bytes = fs.readFileSync(absolute);
    } catch {
      fail('source_read_failed', sourceKey);
    }
    if (sha256Bytes(bytes) !== source.source_sha256)
      fail('source_digest_mismatch', sourceKey);
    values.set(sourceKey, parseJson(bytes, sourceKey));
  }
  return values;
}

export function validateNanoclawArtifact({ manifest, schema, nanoclawRoot }) {
  validateManifestSchema(schema, manifest);
  const indexes = validateManifestBeforeReads(manifest);
  const nanoclawSources = new Map(
    [...indexes.sourcesByKey].filter(
      ([, source]) => source.root === 'nanoclaw',
    ),
  );
  const sources = readDeclaredSources(manifest, nanoclawSources, {
    nanoclaw: nanoclawRoot,
  });
  const entitlements = sources.get('entitlement_catalog');
  const bindings = sources.get('binding_catalog');
  const aliasAttestation = sources.get('consumer_alias_attestation');
  if (
    entitlements?.catalog_revision !== 1 ||
    bindings?.revision !== 1 ||
    bindings?.entitlement_catalog_revision !== entitlements.catalog_revision
  ) {
    fail('catalog_revision_mismatch');
  }
  if (
    !Array.isArray(bindings.routes) ||
    bindings.routes.length !== EXPECTED_POPULATION.length
  )
    fail('binding_population_invalid');
  const alias = exactlyOne(manifest, 'consumer_account_alias', 'tandem');
  if (
    alias.relationship_status !== 'native_verified' ||
    alias.target.object_id !== 'acct_1G1wKzA7hTBWpVVq' ||
    aliasAttestation?.provider?.native_account_id !== alias.target.object_id ||
    aliasAttestation?.provider?.match !== true
  ) {
    fail('consumer_account_alias_evidence_invalid');
  }
  for (const offerKey of EXPECTED_POPULATION) {
    const offer = entitlements.offers?.find(
      (item) => item.offer_key === offerKey,
    );
    const binding = bindings.routes.find((item) => item.offer_key === offerKey);
    if (
      !offer ||
      !binding ||
      offer.stripe_product_ids?.length !== 1 ||
      offer.stripe_price_ids?.length !== 1 ||
      binding.stripe_account !== 'tandem' ||
      binding.roster_targets?.length !== 1
    ) {
      fail('nanoclaw_compatibility_mismatch', offerKey);
    }
    const offerProduct = exactlyOne(manifest, 'offer_uses_product', offerKey);
    const defaultPrice = exactlyOne(
      manifest,
      'product_default_price',
      offerProduct.target.object_id,
    );
    const roster = exactlyOne(manifest, 'offer_projects_to_roster', offerKey);
    if (
      offerProduct.target.object_id !== offer.stripe_product_ids[0] ||
      defaultPrice.target.object_id !== offer.stripe_price_ids[0] ||
      roster.target.object_id !==
        `${binding.roster_targets[0].tab}/${binding.roster_targets[0].column}`
    ) {
      fail('nanoclaw_compatibility_mismatch', offerKey);
    }
  }
  const expected = prettyJson(bindings);
  const generatedPath = resolveAllowedSourceForRead(
    nanoclawRoot,
    TRACKED_OUTPUTS.nanoclaw,
  );
  if (fs.readFileSync(generatedPath, 'utf8') !== expected)
    fail('nanoclaw_output_stale');
  return {
    output_sha256: sha256Bytes(expected),
    routes: bindings.routes.length,
  };
}

function findObjects(value, predicate, results = []) {
  if (Array.isArray(value)) {
    for (const item of value) findObjects(item, predicate, results);
  } else if (isObject(value)) {
    if (predicate(value)) results.push(value);
    for (const item of Object.values(value))
      findObjects(item, predicate, results);
  }
  return results;
}

function relationsFor(manifest, type, objectId) {
  return manifest.relationships.filter(
    (relation) =>
      relation.relationship_type === type &&
      (objectId === undefined || relation.object_id === objectId),
  );
}

function exactlyOne(
  manifest,
  type,
  objectId,
  errorCode = 'relationship_cardinality_invalid',
) {
  const matches = relationsFor(manifest, type, objectId);
  if (matches.length !== 1) fail(errorCode, `${type}:${objectId ?? '*'}`);
  return matches[0];
}

function assertLowerable(relation, expectedConsumers) {
  if (relation.effective_from !== null || relation.effective_to !== null)
    fail('unsafe_lowering_interval', relation.relationship_key);
  if (!sameArray(relation.consumer_keys, expectedConsumers))
    fail('unsafe_lowering_consumer_scope', relation.relationship_key);
}

function validateAndProject(manifest, sources) {
  const program = sources.get('supervision_program');
  const entitlements = sources.get('entitlement_catalog');
  const bindings = sources.get('binding_catalog');
  const checkout = sources.get('checkout_catalog');
  const stripeSnapshot = sources.get('stripe_snapshot');
  const heartbeatSnapshot = sources.get('heartbeat_snapshot');
  const courseSnapshot = sources.get('course_source_snapshot');
  const aliasAttestation = sources.get('consumer_alias_attestation');

  if (
    program?.catalog_revision !== 1 ||
    entitlements?.catalog_revision !== 1 ||
    bindings?.revision !== 1 ||
    bindings?.entitlement_catalog_revision !== 1
  ) {
    fail('catalog_revision_mismatch');
  }
  if (
    !Array.isArray(bindings.routes) ||
    bindings.routes.length !== EXPECTED_POPULATION.length
  )
    fail('binding_population_invalid');
  const alias = exactlyOne(manifest, 'consumer_account_alias', 'tandem');
  if (
    alias.relationship_status !== 'native_verified' ||
    alias.target.namespace !== 'stripe:alt' ||
    alias.target.object_type !== 'account' ||
    alias.target.object_id !== 'acct_1G1wKzA7hTBWpVVq'
  ) {
    fail('consumer_account_alias_invalid');
  }
  if (
    aliasAttestation?.consumer?.consumer_key !== 'tandem' ||
    aliasAttestation?.consumer?.configuration_slot !==
      'STRIPE_SECRET_KEY_ALT' ||
    aliasAttestation?.provider?.native_account_id !== alias.target.object_id ||
    aliasAttestation?.provider?.match !== true
  ) {
    fail('consumer_account_alias_evidence_invalid');
  }
  assertLowerable(alias, ['nanoclaw-v1']);

  const bundle = entitlements?.bundles?.find(
    (item) => item.bundle_key === 'coaching-supervision-mastery:v1',
  );
  if (!bundle || bundle.version !== 1) fail('bundle_version_mismatch');

  const routes = [];
  const checkoutProjection = [];
  for (const offerKey of EXPECTED_POPULATION) {
    const offer = entitlements?.offers?.find(
      (item) => item.offer_key === offerKey,
    );
    const binding = bindings.routes.find((item) => item.offer_key === offerKey);
    const checkoutProduct = checkout?.[offerKey];
    const programExpectation = program?.checkout_expectations?.find(
      (item) => item.product === offerKey,
    );
    if (!offer || !binding || !checkoutProduct || !programExpectation)
      fail('population_source_missing', offerKey);
    if (offer.bundle_key !== bundle.bundle_key)
      fail('bundle_reference_mismatch', offerKey);
    if (
      !Array.isArray(offer.stripe_product_ids) ||
      offer.stripe_product_ids.length !== 1 ||
      !Array.isArray(offer.stripe_price_ids) ||
      offer.stripe_price_ids.length !== 1
    ) {
      fail('unsafe_lowering_many_to_many', offerKey);
    }
    if (
      binding.stripe_account !== 'tandem' ||
      !Array.isArray(binding.roster_targets) ||
      binding.roster_targets.length !== 1
    )
      fail('unsafe_lowering_roster', offerKey);
    const roster = binding.roster_targets[0];
    if (
      roster.tab !== 'CSS' ||
      roster.column !== 'Coaching Supervision Mastery'
    )
      fail('product_projection_conflict', offerKey);

    const offerBundle = exactlyOne(manifest, 'offer_includes_bundle', offerKey);
    const offerProduct = exactlyOne(
      manifest,
      'offer_uses_product',
      offerKey,
      'unsafe_lowering_many_to_many',
    );
    const checkoutRelation = exactlyOne(
      manifest,
      'checkout_represents_offer',
      offerKey,
    );
    const rosterRelation = exactlyOne(
      manifest,
      'offer_projects_to_roster',
      offerKey,
      'unsafe_lowering_many_to_many',
    );
    const accessRelation = exactlyOne(
      manifest,
      'offer_declares_access_group',
      offerKey,
    );
    const defaultPrice = exactlyOne(
      manifest,
      'product_default_price',
      offerProduct.target.object_id,
      'unsafe_lowering_many_to_many',
    );
    assertLowerable(offerProduct, EXPECTED_CONSUMERS);
    assertLowerable(defaultPrice, EXPECTED_CONSUMERS);
    assertLowerable(checkoutRelation, ['tandemweb-checkout-validation']);
    assertLowerable(rosterRelation, ['nanoclaw-v1']);
    if (
      offerBundle.target.object_id !== bundle.bundle_key ||
      offerProduct.target.object_id !== offer.stripe_product_ids[0] ||
      defaultPrice.target.object_id !== offer.stripe_price_ids[0]
    ) {
      fail('relationship_source_value_mismatch', offerKey);
    }
    if (
      checkoutRelation.target.object_id !== offerKey ||
      rosterRelation.target.object_id !== 'CSS/Coaching Supervision Mastery' ||
      accessRelation.target.object_id !== 'fa5f5f09-a10e-4dfd-8bf2-0451f7cffa83'
    ) {
      fail('relationship_source_value_mismatch', offerKey);
    }

    const stripeEvidence = findObjects(
      stripeSnapshot,
      (item) =>
        item.offer_key === offerKey &&
        item.native_product_id === offerProduct.target.object_id,
    );
    if (
      stripeEvidence.length !== 1 ||
      stripeEvidence[0].account_id !== alias.target.object_id ||
      stripeEvidence[0].native_default_price_id !==
        defaultPrice.target.object_id ||
      stripeEvidence[0].default_price_matches_declared !== true
    ) {
      fail('native_product_evidence_invalid', offerKey);
    }
    const installments = checkoutProduct.installments;
    if (
      checkoutProduct.price_cents !== offer.price_cents ||
      checkoutProduct.currency !== offer.currency ||
      checkoutProduct.active !== programExpectation.active ||
      programExpectation.price_cents !== offer.price_cents
    ) {
      fail('checkout_source_mismatch', offerKey);
    }
    const cohortStartDates = checkoutProduct.cohort_start_dates ?? [];
    const cohortExcludedStartDates =
      checkoutProduct.cohort_excluded_start_dates ?? [];
    if (
      checkoutProduct.requires_cohort !== true ||
      checkoutProduct.cohort_program !== 'supervision' ||
      !sameArray(cohortStartDates, programExpectation.cohort_start_dates) ||
      !sameArray(
        cohortExcludedStartDates,
        programExpectation.cohort_excluded_start_dates,
      )
    ) {
      fail('checkout_cohort_eligibility_invalid', offerKey);
    }
    if (
      !isObject(installments) ||
      installments.enabled !== true ||
      !Number.isInteger(installments.count) ||
      installments.count !== 4 ||
      installments.interval !== 'month' ||
      installments.total_cents !== checkoutProduct.price_cents ||
      installments.amount_cents * installments.count !==
        installments.total_cents ||
      installments.stripe_price_id !== defaultPrice.target.object_id
    ) {
      fail('checkout_installment_invalid', offerKey);
    }
    if (checkoutProduct.stripe_price_id !== '')
      fail('checkout_direct_price_role_invalid', offerKey);

    routes.push({
      offer_key: binding.offer_key,
      stripe_account: binding.stripe_account,
      roster_targets: binding.roster_targets,
    });
    checkoutProjection.push({
      offer_key: offerKey,
      active: checkoutProduct.active,
      declared_total: {
        currency: checkoutProduct.currency,
        amount_cents: checkoutProduct.price_cents,
      },
      direct_price_id: null,
      cohort_eligibility: {
        required: true,
        program: 'supervision',
        allowed_start_dates: cohortStartDates,
        excluded_start_dates: cohortExcludedStartDates,
      },
      installment_plan: {
        count: installments.count,
        interval: installments.interval,
        amount_cents: installments.amount_cents,
        total_cents: installments.total_cents,
        stripe_price_id: installments.stripe_price_id,
        stripe_price_role: 'installment_subscription_default_price',
      },
      native_identity: {
        namespace: 'stripe:alt',
        account_id: alias.target.object_id,
        product_id: offerProduct.target.object_id,
        default_price_id: defaultPrice.target.object_id,
      },
      entitlement: {
        catalog_revision: entitlements.catalog_revision,
        bundle_key: bundle.bundle_key,
        bundle_version: bundle.version,
      },
      roster_projection: { tab: roster.tab, column: roster.column },
    });
  }

  const inauguralEligibility = checkoutProjection[0].cohort_eligibility;
  const regularEligibility = checkoutProjection[1].cohort_eligibility;
  if (
    inauguralEligibility.allowed_start_dates.length === 0 ||
    inauguralEligibility.excluded_start_dates.length !== 0 ||
    regularEligibility.allowed_start_dates.length !== 0 ||
    !sameArray(
      regularEligibility.excluded_start_dates,
      inauguralEligibility.allowed_start_dates,
    )
  ) {
    fail('checkout_cohort_partition_invalid');
  }

  const groupExists = exactlyOne(
    manifest,
    'access_group_exists',
    'fa5f5f09-a10e-4dfd-8bf2-0451f7cffa83',
  );
  const courseExists = exactlyOne(
    manifest,
    'course_exists',
    '1f2febfe-eb34-463a-818e-ce7d0cac1251',
  );
  const bundleCourse = exactlyOne(
    manifest,
    'bundle_declares_course',
    bundle.bundle_key,
  );
  const declaredCourseComponent = entitlements?.components?.find(
    (component) =>
      bundle.components?.some(
        (entry) => entry.component_key === component.component_key,
      ) && component.heartbeat?.course_ids?.includes(courseExists.object_id),
  );
  if (
    groupExists.evidence_class !== 'existence_only' ||
    courseExists.evidence_class !== 'existence_only' ||
    bundleCourse.target.object_id !== courseExists.object_id ||
    !declaredCourseComponent
  )
    fail('heartbeat_evidence_invalid');
  if (
    !canonicalJson(heartbeatSnapshot).includes(groupExists.object_id) ||
    !canonicalJson(heartbeatSnapshot).includes(courseExists.object_id) ||
    !canonicalJson(courseSnapshot).includes(courseExists.object_id)
  ) {
    fail('heartbeat_evidence_invalid');
  }

  const nanoclawCompat = {
    schema_version: bindings.schema_version,
    revision: bindings.revision,
    entitlement_catalog_revision: bindings.entitlement_catalog_revision,
    authority: bindings.authority,
    routes,
  };
  if (canonicalJson(nanoclawCompat) !== canonicalJson(bindings))
    fail('nanoclaw_compatibility_mismatch');

  const selectedCheckoutSha256 = sha256Value(checkoutProjection);
  const sourceDigests = Object.fromEntries(
    [...sources.entries()].map(([key]) => {
      const source = manifest.sources.find((item) => item.source_key === key);
      return [key, source.source_sha256];
    }),
  );
  const tandemwebPublicationPayload = {
    schema_version: 1,
    publication_id: 'student-catalog-publication-v1',
    publication_revision: manifest.revision,
    compatibility_profile: manifest.compatibility_profile,
    coverage_state: 'validated',
    population_keys: [...EXPECTED_POPULATION],
    selected_checkout_sha256: selectedCheckoutSha256,
    source_versions: {
      supervision_program: manifest.sources.find(
        (item) => item.source_key === 'supervision_program',
      ).source_version,
      student_entitlements: manifest.sources.find(
        (item) => item.source_key === 'entitlement_catalog',
      ).source_version,
      checkout_catalog: manifest.sources.find(
        (item) => item.source_key === 'checkout_catalog',
      ).source_version,
    },
    source_digests: sourceDigests,
    routes: checkoutProjection,
    evidence_limits: { ...manifest.holds },
  };
  const tandemwebPublication = {
    ...tandemwebPublicationPayload,
    payload_sha256: sha256Value(tandemwebPublicationPayload),
  };
  return { nanoclawCompat, tandemwebPublication, selectedCheckoutSha256 };
}

export function buildPublication({
  manifest,
  schema,
  nanoclawRoot,
  tandemwebRoot,
}) {
  validateManifestSchema(schema, manifest);
  const indexes = validateManifestBeforeReads(manifest);
  const sources = readDeclaredSources(manifest, indexes.sourcesByKey, {
    nanoclaw: nanoclawRoot,
    tandemweb: tandemwebRoot,
  });
  const projected = validateAndProject(manifest, sources);
  const nanoclawBytes = prettyJson(projected.nanoclawCompat);
  const tandemwebBytes = prettyJson(projected.tandemwebPublication);
  const envelope = {
    schema_version: 1,
    publication_revision: manifest.revision,
    build_tool_version: 1,
    compatibility_profile: manifest.compatibility_profile,
    population_keys: [...EXPECTED_POPULATION],
    coverage_state: 'validated',
    source_versions: Object.fromEntries(
      manifest.sources.map((source) => [
        source.source_key,
        source.source_version,
      ]),
    ),
    source_sha256: Object.fromEntries(
      manifest.sources.map((source) => [
        source.source_key,
        source.source_sha256,
      ]),
    ),
    output_sha256: {
      nanoclaw: sha256Bytes(nanoclawBytes),
      tandemweb: sha256Bytes(tandemwebBytes),
    },
    selected_checkout_sha256: projected.selectedCheckoutSha256,
    holds: { ...manifest.holds },
  };
  return {
    nanoclaw: projected.nanoclawCompat,
    tandemweb: projected.tandemwebPublication,
    envelope,
    bytes: {
      nanoclaw: nanoclawBytes,
      tandemweb: tandemwebBytes,
      envelope: prettyJson(envelope),
    },
  };
}

function parseArgs(argv) {
  const args = { nanoclawRoot: SCRIPT_ROOT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--nanoclaw-root')
      args.nanoclawRoot = path.resolve(argv[++index]);
    else if (arg === '--tandemweb-root')
      args.tandemwebRoot = path.resolve(argv[++index]);
    else if (arg === '--out-dir') args.outDir = path.resolve(argv[++index]);
    else if (arg === '--write-tracked') args.writeTracked = true;
    else if (arg === '--check') args.check = true;
    else if (arg === '--check-nanoclaw') args.checkNanoclaw = true;
    else fail('argument_invalid', arg);
  }
  if (!args.checkNanoclaw && !args.tandemwebRoot)
    fail('argument_missing', '--tandemweb-root');
  if (!args.outDir && !args.writeTracked && !args.check && !args.checkNanoclaw)
    fail(
      'argument_missing',
      '--out-dir, --write-tracked, --check, or --check-nanoclaw',
    );
  return args;
}

function compareBytes(absolute, expected, code) {
  let actual;
  try {
    actual = fs.readFileSync(absolute, 'utf8');
  } catch {
    fail(code, 'missing');
  }
  if (actual !== expected) fail(code, 'content mismatch');
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const manifestAbsolute = resolveAllowedSourceForRead(
    args.nanoclawRoot,
    MANIFEST_PATH,
  );
  const schemaAbsolute = resolveAllowedSourceForRead(
    args.nanoclawRoot,
    SCHEMA_PATH,
  );
  const manifest = parseJson(
    fs.readFileSync(manifestAbsolute),
    'publication_manifest',
  );
  const schema = parseJson(
    fs.readFileSync(schemaAbsolute),
    'publication_schema',
  );
  if (args.checkNanoclaw && !args.tandemwebRoot) {
    const result = validateNanoclawArtifact({
      manifest,
      schema,
      nanoclawRoot: args.nanoclawRoot,
    });
    process.stdout.write(
      `${JSON.stringify({ status: 'validated', consumer: 'nanoclaw-v1', ...result })}\n`,
    );
    return;
  }
  const built = buildPublication({
    manifest,
    schema,
    nanoclawRoot: args.nanoclawRoot,
    tandemwebRoot: args.tandemwebRoot,
  });
  if (args.outDir) {
    fs.mkdirSync(args.outDir, { recursive: true });
    for (const [key, filename] of Object.entries(OUTPUT_NAMES))
      fs.writeFileSync(path.join(args.outDir, filename), built.bytes[key]);
  }
  if (args.writeTracked) {
    const nanoclawOutput = resolveAllowedSource(
      args.nanoclawRoot,
      TRACKED_OUTPUTS.nanoclaw,
    );
    const tandemwebOutput = resolveAllowedSource(
      args.tandemwebRoot,
      TRACKED_OUTPUTS.tandemweb,
    );
    fs.mkdirSync(path.dirname(nanoclawOutput), { recursive: true });
    fs.mkdirSync(path.dirname(tandemwebOutput), { recursive: true });
    fs.writeFileSync(nanoclawOutput, built.bytes.nanoclaw);
    fs.writeFileSync(tandemwebOutput, built.bytes.tandemweb);
  }
  if (args.check) {
    compareBytes(
      resolveAllowedSource(args.nanoclawRoot, TRACKED_OUTPUTS.nanoclaw),
      built.bytes.nanoclaw,
      'nanoclaw_output_stale',
    );
    compareBytes(
      resolveAllowedSource(args.tandemwebRoot, TRACKED_OUTPUTS.tandemweb),
      built.bytes.tandemweb,
      'tandemweb_output_stale',
    );
  }
  process.stdout.write(
    `${JSON.stringify({
      status: 'validated',
      publication_revision: manifest.revision,
      population_keys: EXPECTED_POPULATION,
      output_sha256: built.envelope.output_sha256,
      selected_checkout_sha256: built.envelope.selected_checkout_sha256,
    })}\n`,
  );
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    runCli();
  } catch (error) {
    if (error instanceof PublicationBuildError) {
      process.stderr.write(
        `${error.code}${error.message === error.code ? '' : `: ${error.message.slice(error.code.length + 2)}`}\n`,
      );
      process.exit(1);
    }
    throw error;
  }
}
