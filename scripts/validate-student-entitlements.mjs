import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
export const defaultCatalogPath = path.join(
  root,
  'facts/catalogs/student-entitlements-v1.json',
);
export const defaultSchemaPath = path.join(
  root,
  'facts/catalogs/student-entitlements-v1.schema.json',
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[a-z0-9][a-z0-9._:-]+$/;
const MARKER_SCHEDULES = new Set([
  'module_class_block',
  'program_cohort_series',
  'group_series',
]);
const COMPONENT_TYPES = new Set([
  'course',
  'live_class_series',
  'group_mentoring',
  'individual_mentoring',
  'group_supervision',
  'individual_supervision',
  'observed_practice',
  'assessment',
  'performance_evaluation',
  'exam_preparation',
  'resource_access',
  'fieldwork',
  'capstone',
  'certificate_outcome',
]);
const DELIVERY_MODES = new Set([
  'self_paced',
  'live_group',
  'individual_appointment',
  'blended',
  'submission',
  'provider_access',
  'earned_on_completion',
]);
const SCHEDULING_MODELS = new Set([
  'none',
  'module_class_block',
  'program_cohort_series',
  'group_series',
  'individual_booking',
  'milestone_window',
  'self_paced',
]);
const CONSUMPTION_MODELS = new Set([
  'binary_access',
  'course_completion',
  'session_count',
  'hour_count',
  'attendance',
  'submission_count',
  'milestone_completion',
  'provider_entitlement',
]);
const MARKER_POLICIES = new Set([
  'none',
  'class_block',
  'program_cohort',
  'group_series',
]);
const EVIDENCE_STATUSES = new Set([
  'verified',
  'source_confirmed',
  'provisional',
  'unresolved',
]);
const QUANTITY_STATUSES = new Set([
  'verified',
  'source_confirmed',
  'historical_requires_confirmation',
  'unknown',
]);
const ATTACHMENT_STATUSES = new Set([
  'exact_component_group_and_course_verified',
  'group_and_course_verified_attachment_unavailable',
  'full_group_verified_contents_unavailable',
  'group_verified_course_unresolved',
  'not_applicable',
]);
const BUNDLE_INCLUSIONS = new Set([
  'included',
  'conditional',
  'earned_on_completion',
]);
const OFFER_STATUSES = new Set([
  'active',
  'active_future_cohort',
  'inactive',
  'historical',
]);
const ENROLLMENT_SCOPES = new Set(['full_program', 'cohort_program']);
const PROVIDER_CONTENT_STATUSES = new Set([
  'full_group_verified_contents_unavailable',
  'group_and_course_verified',
]);
const CONFLICT_SEVERITIES = new Set(['high', 'medium', 'low']);
const CONFLICT_DISPOSITIONS = new Set([
  'resolved',
  'held',
  'requires_owner_decision',
]);
const INDIVIDUAL_COMPONENT_TYPES = new Set([
  'individual_mentoring',
  'individual_supervision',
]);

function requireCondition(condition, message, findings) {
  if (!condition) findings.push(message);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function validateStudentEntitlementCatalog(catalog) {
  const findings = [];
  requireCondition(catalog?.schema_version === '1.0', 'schema_version must be 1.0', findings);
  requireCondition(catalog?.catalog_id === 'student-entitlements', 'catalog_id must be student-entitlements', findings);
  requireCondition(Number.isInteger(catalog?.catalog_revision) && catalog.catalog_revision > 0, 'catalog_revision must be a positive integer', findings);
  requireCondition(validDate(catalog?.effective_from), 'effective_from must be an ISO date-time', findings);
  requireCondition(Array.isArray(catalog?.components) && catalog.components.length > 0, 'components must be nonempty', findings);
  requireCondition(Array.isArray(catalog?.bundles) && catalog.bundles.length > 0, 'bundles must be nonempty', findings);
  requireCondition(Array.isArray(catalog?.offers) && catalog.offers.length > 0, 'offers must be nonempty', findings);
  requireCondition(Array.isArray(catalog?.known_conflicts), 'known_conflicts must be an array', findings);

  const components = Array.isArray(catalog?.components) ? catalog.components : [];
  const bundles = Array.isArray(catalog?.bundles) ? catalog.bundles : [];
  const offers = Array.isArray(catalog?.offers) ? catalog.offers : [];
  const conflicts = Array.isArray(catalog?.known_conflicts) ? catalog.known_conflicts : [];
  const componentKeys = components.map((entry) => entry.component_key);
  const bundleKeys = bundles.map((entry) => entry.bundle_key);
  const offerKeys = offers.map((entry) => entry.offer_key);
  const conflictKeys = conflicts.map((entry) => entry.conflict_id);

  requireCondition(unique(componentKeys), 'component_key values must be unique', findings);
  requireCondition(unique(bundleKeys), 'bundle_key values must be unique', findings);
  requireCondition(unique(offerKeys), 'offer_key values must be unique', findings);
  requireCondition(unique(conflictKeys), 'conflict_id values must be unique', findings);

  const componentSet = new Set(componentKeys);
  const bundleSet = new Set(bundleKeys);
  for (const component of components) {
    const prefix = `component ${component.component_key ?? '(missing)'}`;
    requireCondition(KEY.test(component.component_key ?? ''), `${prefix}: invalid component_key`, findings);
    requireCondition(typeof component.name === 'string' && component.name.length > 0, `${prefix}: name required`, findings);
    requireCondition(COMPONENT_TYPES.has(component.component_type), `${prefix}: invalid component_type`, findings);
    requireCondition(DELIVERY_MODES.has(component.delivery_mode), `${prefix}: invalid delivery_mode`, findings);
    requireCondition(SCHEDULING_MODELS.has(component.scheduling_model), `${prefix}: invalid scheduling_model`, findings);
    requireCondition(CONSUMPTION_MODELS.has(component.consumption_model), `${prefix}: invalid consumption_model`, findings);
    requireCondition(MARKER_POLICIES.has(component.marker_policy), `${prefix}: invalid marker_policy`, findings);
    requireCondition(EVIDENCE_STATUSES.has(component.evidence_status), `${prefix}: invalid evidence_status`, findings);
    requireCondition(Array.isArray(component.sources) && component.sources.length > 0, `${prefix}: sources required`, findings);
    requireCondition(Array.isArray(component.open_questions), `${prefix}: open_questions must be an array`, findings);
    requireCondition(component.quantity && typeof component.quantity === 'object', `${prefix}: quantity required`, findings);
    if (component.quantity && typeof component.quantity === 'object') {
      requireCondition(component.quantity.value !== undefined, `${prefix}: quantity value required`, findings);
      requireCondition(typeof component.quantity.unit === 'string' && component.quantity.unit.length > 0, `${prefix}: quantity unit required`, findings);
      requireCondition(QUANTITY_STATUSES.has(component.quantity.status), `${prefix}: invalid quantity status`, findings);
    }
    const heartbeat = component.heartbeat;
    requireCondition(heartbeat && typeof heartbeat === 'object', `${prefix}: heartbeat projection required`, findings);
    if (heartbeat) {
      requireCondition(Array.isArray(heartbeat.access_group_ids), `${prefix}: heartbeat access_group_ids must be an array`, findings);
      requireCondition(Array.isArray(heartbeat.course_ids), `${prefix}: heartbeat course_ids must be an array`, findings);
      requireCondition(ATTACHMENT_STATUSES.has(heartbeat.attachment_status), `${prefix}: invalid heartbeat attachment_status`, findings);
      for (const id of [...(heartbeat.access_group_ids ?? []), ...(heartbeat.course_ids ?? [])]) {
        requireCondition(UUID.test(id), `${prefix}: invalid Heartbeat UUID ${id}`, findings);
      }
      requireCondition(unique(heartbeat.access_group_ids ?? []), `${prefix}: duplicate Heartbeat access group`, findings);
      requireCondition(unique(heartbeat.course_ids ?? []), `${prefix}: duplicate Heartbeat course`, findings);
      if (heartbeat.attachment_status === 'exact_component_group_and_course_verified') {
        requireCondition((heartbeat.access_group_ids ?? []).length > 0, `${prefix}: exact attachment requires an access group`, findings);
        requireCondition((heartbeat.course_ids ?? []).length > 0, `${prefix}: exact attachment requires a course`, findings);
      }
      if (heartbeat.attachment_status === 'not_applicable') {
        requireCondition((heartbeat.access_group_ids ?? []).length === 0, `${prefix}: not_applicable must not list groups`, findings);
        requireCondition((heartbeat.course_ids ?? []).length === 0, `${prefix}: not_applicable must not list courses`, findings);
      }
    }
    if (component.marker_policy !== 'none') {
      requireCondition(MARKER_SCHEDULES.has(component.scheduling_model), `${prefix}: marker requires a scheduled group model`, findings);
      requireCondition(!['individual_appointment', 'self_paced', 'provider_access', 'earned_on_completion'].includes(component.delivery_mode), `${prefix}: marker cannot be used for individual, self-paced, access-only, or earned outcomes`, findings);
      requireCondition(!INDIVIDUAL_COMPONENT_TYPES.has(component.component_type), `${prefix}: individual mentoring or supervision must not have a marker`, findings);
    }
    if (['individual_booking', 'self_paced', 'none'].includes(component.scheduling_model)) {
      requireCondition(component.marker_policy === 'none', `${prefix}: nonscheduled component must not have a marker`, findings);
    }
  }

  for (const bundle of bundles) {
    const prefix = `bundle ${bundle.bundle_key ?? '(missing)'}`;
    requireCondition(KEY.test(bundle.bundle_key ?? ''), `${prefix}: invalid bundle_key`, findings);
    requireCondition(Number.isInteger(bundle.version) && bundle.version > 0, `${prefix}: positive version required`, findings);
    requireCondition(validDate(bundle.effective_from), `${prefix}: effective_from must be an ISO date-time`, findings);
    requireCondition(Array.isArray(bundle.components) && bundle.components.length > 0, `${prefix}: components required`, findings);
    requireCondition(Array.isArray(bundle.sources) && bundle.sources.length > 0, `${prefix}: sources required`, findings);
    requireCondition(EVIDENCE_STATUSES.has(bundle.evidence_status), `${prefix}: invalid evidence_status`, findings);
    const refs = (bundle.components ?? []).map((entry) => entry.component_key);
    requireCondition(unique(refs), `${prefix}: duplicate component reference`, findings);
    for (const ref of refs) {
      requireCondition(componentSet.has(ref), `${prefix}: unknown component ${ref}`, findings);
    }
    for (const entry of bundle.components ?? []) {
      requireCondition(BUNDLE_INCLUSIONS.has(entry.inclusion), `${prefix}: ${entry.component_key} has invalid inclusion`, findings);
      if (entry.inclusion === 'conditional' || entry.inclusion === 'earned_on_completion') {
        requireCondition(typeof entry.condition === 'string' && entry.condition.length > 0, `${prefix}: ${entry.component_key} requires a condition`, findings);
      }
    }
  }

  for (const offer of offers) {
    const prefix = `offer ${offer.offer_key ?? '(missing)'}`;
    requireCondition(KEY.test(offer.offer_key ?? ''), `${prefix}: invalid offer_key`, findings);
    requireCondition(bundleSet.has(offer.bundle_key), `${prefix}: unknown bundle ${offer.bundle_key}`, findings);
    requireCondition(OFFER_STATUSES.has(offer.status), `${prefix}: invalid status`, findings);
    requireCondition(ENROLLMENT_SCOPES.has(offer.enrollment_scope), `${prefix}: invalid enrollment_scope`, findings);
    requireCondition(PROVIDER_CONTENT_STATUSES.has(offer.provider_content_status), `${prefix}: invalid provider_content_status`, findings);
    requireCondition(Number.isInteger(offer.price_cents) && offer.price_cents >= 0, `${prefix}: price_cents must be a nonnegative integer`, findings);
    requireCondition(offer.currency === 'usd', `${prefix}: current catalog supports USD only`, findings);
    requireCondition(Array.isArray(offer.heartbeat_full_access_group_ids) && offer.heartbeat_full_access_group_ids.length > 0, `${prefix}: full-access group required`, findings);
    for (const id of offer.heartbeat_full_access_group_ids ?? []) {
      requireCondition(UUID.test(id), `${prefix}: invalid full-access group UUID ${id}`, findings);
    }
    for (const id of offer.stripe_product_ids ?? []) {
      requireCondition(/^prod_[A-Za-z0-9]+$/.test(id), `${prefix}: invalid Stripe product ${id}`, findings);
    }
    for (const id of offer.stripe_price_ids ?? []) {
      requireCondition(/^price_[A-Za-z0-9]+$/.test(id), `${prefix}: invalid Stripe price ${id}`, findings);
    }
  }

  for (const conflict of conflicts) {
    const prefix = `conflict ${conflict.conflict_id ?? '(missing)'}`;
    requireCondition(KEY.test(conflict.conflict_id ?? ''), `${prefix}: invalid conflict_id`, findings);
    requireCondition(CONFLICT_SEVERITIES.has(conflict.severity), `${prefix}: invalid severity`, findings);
    requireCondition(CONFLICT_DISPOSITIONS.has(conflict.disposition), `${prefix}: invalid disposition`, findings);
    requireCondition(typeof conflict.summary === 'string' && conflict.summary.length > 0, `${prefix}: summary required`, findings);
    requireCondition(Array.isArray(conflict.sources) && conflict.sources.length > 0, `${prefix}: sources required`, findings);
  }

  requireCondition(catalog?.heartbeat_projection_policy?.marker_groups?.catalog_revision_1_creation_authority === 'none', 'catalog revision 1 must grant no marker-group creation authority', findings);
  requireCondition(catalog?.heartbeat_projection_policy?.marker_groups?.content_attachments_allowed === false, 'marker groups must forbid content attachments', findings);
  requireCondition(catalog?.heartbeat_projection_policy?.marker_groups?.paid_offer_allowed === false, 'marker groups must forbid paid offers', findings);

  const requiredOffers = [
    'acc-full',
    'pcc-full',
    'actc-full',
    'acc-pcc-full',
    'mcs-full',
    'supervision-inaugural',
    'supervision-regular',
  ];
  for (const offer of requiredOffers) {
    requireCondition(offerKeys.includes(offer), `required active/full offer missing: ${offer}`, findings);
  }

  return {
    ok: findings.length === 0,
    findings,
    summary: {
      components: components.length,
      bundles: bundles.length,
      offers: offers.length,
      conflicts: conflicts.length,
      unresolvedComponents: components.filter((entry) => entry.evidence_status === 'unresolved').length,
      provisionalComponents: components.filter((entry) => entry.evidence_status === 'provisional').length,
      openQuestions: components.reduce((count, entry) => count + (entry.open_questions?.length ?? 0), 0),
    },
  };
}

export function loadAndValidateStudentEntitlementCatalog(catalogPath = defaultCatalogPath) {
  JSON.parse(fs.readFileSync(defaultSchemaPath, 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  return validateStudentEntitlementCatalog(catalog);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = loadAndValidateStudentEntitlementCatalog(process.argv[2] ?? defaultCatalogPath);
  if (!result.ok) {
    for (const finding of result.findings) console.error(`ERROR ${finding}`);
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ ok: true, ...result.summary }));
  }
}
