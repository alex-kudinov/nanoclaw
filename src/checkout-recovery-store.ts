import crypto from 'crypto';
import type { PoolClient, QueryResultRow } from 'pg';

import { withAgentContext } from './business-db.js';
import {
  checkoutEligibility,
  nextCheckoutRecoveryState,
  type CheckoutRecoveryAccount,
  type CheckoutRecoveryAlias,
  type CheckoutRecoveryConsent,
  type CheckoutRecoveryEligibility,
  type CheckoutFailureGuidanceKey,
  type CheckoutRecoveryLocale,
  type CheckoutPaymentMethodBrand,
  type CheckoutRecoveryState,
  type PreparedCheckoutRecoveryEvent,
} from './checkout-recovery.js';
import {
  scheduleCheckoutRecoveryTouchesWithClient,
  type CheckoutRecoverySendConfig,
} from './checkout-recovery-sender.js';

const ACTOR = 'checkout-recovery:host';

interface CaseRow extends QueryResultRow {
  id: string;
  case_uuid: string;
  source_system: 'tandemweb' | 'stripe';
  source_case_key: string;
  stripe_account: CheckoutRecoveryAccount;
  state: CheckoutRecoveryState;
  version: number;
  program_slug: string | null;
  product_slug: string | null;
  amount_cents: string | null;
  currency: string | null;
  contact_email: string | null;
  email_sha256: string | null;
  consent_state: CheckoutRecoveryConsent;
  consent_policy_version: string | null;
  checkout_locale: CheckoutRecoveryLocale | null;
  return_url: string | null;
  product_name: string | null;
  party_id: string | null;
  party_evidence_tier:
    | 'stripe_customer_exact_ref_v1'
    | 'unique_party_email_v1'
    | 'identity_unresolved_v1'
    | null;
  stripe_customer_id: string | null;
  last_failure_code: string | null;
  last_decline_code: string | null;
  last_advice_code: string | null;
  customer_guidance_key: CheckoutFailureGuidanceKey | null;
  payment_method_brand: CheckoutPaymentMethodBrand | null;
  payment_method_last4: string | null;
  operator_incident_id: string | null;
  eligibility_state: CheckoutRecoveryEligibility;
  suppression_code: string | null;
  started_at: string;
  last_observed_at: string;
  shadow_due_at: string | null;
  shadow_notified_at: string | null;
  created_at: string;
}

export interface CheckoutRecoveryProjection {
  caseId: number;
  version: number;
  stripeAccount: CheckoutRecoveryAccount;
  state: CheckoutRecoveryState;
  programSlug: string | null;
  productSlug: string | null;
  amountCents: number | null;
  currency: string | null;
  consentState: CheckoutRecoveryConsent;
  eligibilityState: CheckoutRecoveryEligibility;
  ageMinutes: number;
  customerMessageSent: false;
}

export interface CheckoutRecoveryOperatorIncident {
  incidentId: number;
  incidentUuid: string;
  version: number;
  isRoot: boolean;
  threadKey: string;
  kind: 'payment_failed' | 'checkout_incomplete';
  outcome: 'open' | 'purchased';
  partyId: number | null;
  partyDisplayName: string | null;
  relationshipState: string | null;
  productName: string | null;
  productKey: string;
  amountCents: number | null;
  currency: string | null;
  guidanceKey: CheckoutFailureGuidanceKey | null;
  paymentMethodBrand: CheckoutPaymentMethodBrand | null;
  paymentMethodLast4: string | null;
  caseCount: number;
  paymentIntentCount: number;
  providerFailureCount: number;
  episodeStartedAt: string;
  lastFailureAt: string;
  reminderState:
    | 'not_sent_consent_missing'
    | 'not_sent_opted_out'
    | 'eligible_pending'
    | 'provider_accepted'
    | 'suppressed'
    | 'not_applicable';
}

export interface CheckoutRecoveryProcessResult {
  caseId: number;
  eventId: number;
  version: number;
  state: CheckoutRecoveryState;
  duplicate: boolean;
  resultCode: string;
  shouldNotify: boolean;
  projection: CheckoutRecoveryProjection;
}

export interface CheckoutRecoveryHealth {
  totalCases: number;
  openCases: number;
  shadowReadyCases: number;
  unnotifiedCases: number;
  heartbeatCases: number;
  tandemCases: number;
  lastObservedAt: string | null;
}

function sha(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value), 'utf8')
    .digest('hex');
}

function projection(
  row: CaseRow,
  nowMs = Date.now(),
): CheckoutRecoveryProjection {
  return {
    caseId: Number(row.id),
    version: Number(row.version),
    stripeAccount: row.stripe_account,
    state: row.state,
    programSlug: row.program_slug,
    productSlug: row.product_slug,
    amountCents: row.amount_cents === null ? null : Number(row.amount_cents),
    currency: row.currency,
    consentState: row.consent_state,
    eligibilityState: row.eligibility_state,
    ageMinutes: Math.max(
      0,
      Math.floor((nowMs - Date.parse(row.started_at)) / 60_000),
    ),
    customerMessageSent: false,
  };
}

const CASE_COLUMNS = `
  id::text, case_uuid::text, source_system, source_case_key, stripe_account, state, version,
  program_slug, product_slug, amount_cents::text, currency,
  contact_email::text, email_sha256, consent_state, consent_policy_version,
  checkout_locale, return_url, product_name,
  party_id::text, party_evidence_tier, stripe_customer_id,
  last_failure_code, last_decline_code, last_advice_code,
  customer_guidance_key, payment_method_brand, payment_method_last4,
  operator_incident_id::text,
  eligibility_state, suppression_code, started_at::text,
  last_observed_at::text, shadow_due_at::text, shadow_notified_at::text,
  created_at::text
`;

interface PartyResolution {
  partyId: number | null;
  evidenceTier:
    | 'stripe_customer_exact_ref_v1'
    | 'unique_party_email_v1'
    | 'identity_unresolved_v1';
}

async function resolveCheckoutPartyWithClient(
  client: PoolClient,
  input: {
    stripeAccount: CheckoutRecoveryAccount;
    stripeCustomerId: string | null;
    email: string | null;
  },
): Promise<PartyResolution> {
  if (input.stripeCustomerId) {
    const exact = await client.query<{ party_id: string }>(
      `SELECT DISTINCT r.party_id::text
         FROM business_v2.party_external_refs r
         JOIN business_v2.parties p ON p.id=r.party_id
        WHERE r.provider='stripe' AND r.source_scope=$1
          AND r.entity_type='customer' AND r.external_id=$2
          AND r.status='active' AND p.merged_into IS NULL
        LIMIT 2`,
      [input.stripeAccount, input.stripeCustomerId],
    );
    if (exact.rows.length === 1) {
      return {
        partyId: Number(exact.rows[0].party_id),
        evidenceTier: 'stripe_customer_exact_ref_v1',
      };
    }
    if (exact.rows.length > 1) {
      return { partyId: null, evidenceTier: 'identity_unresolved_v1' };
    }
  }
  if (input.email) {
    const owners = await client.query<{ party_id: string }>(
      `WITH candidates AS (
         SELECT p.id AS party_id
           FROM business_v2.parties p
          WHERE p.merged_into IS NULL
            AND lower(p.primary_email::text)=lower($1)
         UNION
         SELECT pe.party_id
           FROM business_v2.party_emails pe
           JOIN business_v2.parties p ON p.id=pe.party_id
          WHERE p.merged_into IS NULL
            AND lower(pe.email::text)=lower($1)
       )
       SELECT party_id::text FROM candidates ORDER BY party_id LIMIT 2`,
      [input.email],
    );
    if (owners.rows.length === 1) {
      return {
        partyId: Number(owners.rows[0].party_id),
        evidenceTier: 'unique_party_email_v1',
      };
    }
  }
  return { partyId: null, evidenceTier: 'identity_unresolved_v1' };
}

async function findCaseIdsByAliases(
  client: PoolClient,
  account: CheckoutRecoveryAccount,
  aliases: CheckoutRecoveryAlias[],
): Promise<number[]> {
  const ids = new Set<number>();
  for (const entry of aliases) {
    const found = await client.query<{ case_id: string }>(
      `SELECT case_id::text
         FROM business_v2.checkout_recovery_aliases
        WHERE stripe_account = $1 AND alias_kind = $2 AND alias_id = $3`,
      [account, entry.kind, entry.id],
    );
    if (found.rows[0]) ids.add(Number(found.rows[0].case_id));
  }
  return [...ids];
}

async function bindAliases(
  client: PoolClient,
  caseId: number,
  account: CheckoutRecoveryAccount,
  aliases: CheckoutRecoveryAlias[],
): Promise<void> {
  for (const entry of aliases) {
    const found = await client.query<{ case_id: string }>(
      `SELECT case_id::text
         FROM business_v2.checkout_recovery_aliases
        WHERE stripe_account = $1 AND alias_kind = $2 AND alias_id = $3`,
      [account, entry.kind, entry.id],
    );
    if (found.rows[0] && Number(found.rows[0].case_id) !== caseId) {
      throw new Error('checkout_recovery_alias_collision');
    }
    if (!found.rows[0]) {
      await client.query(
        `INSERT INTO business_v2.checkout_recovery_aliases
           (case_id, stripe_account, alias_kind, alias_id)
         VALUES ($1, $2, $3, $4)`,
        [caseId, account, entry.kind, entry.id],
      );
    }
  }
}

function shadowDueAt(
  event: PreparedCheckoutRecoveryEvent,
  nextState: CheckoutRecoveryState,
): string | null {
  if (event.stripe_account !== 'tandem') return null;
  const observed = Date.parse(event.observed_at);
  if (event.event_type === 'payment.failed') {
    return new Date(observed + 5 * 60_000).toISOString();
  }
  if (['captured', 'payment_created', 'client_abandoned'].includes(nextState)) {
    return new Date(observed + 45 * 60_000).toISOString();
  }
  return null;
}

async function insertReceipt(
  client: PoolClient,
  input: {
    caseId: number;
    caseVersion: number;
    type:
      | 'admission'
      | 'alias_binding'
      | 'state_transition'
      | 'shadow_projection'
      | 'suppression'
      | 'closure';
    outcome: 'verified' | 'no_op' | 'held' | 'ineligible' | 'not_applicable';
    resultCode: string;
    evidenceSha256: string;
    sourceEventKey: string;
    occurredAt: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO business_v2.checkout_recovery_receipts
       (case_id, case_version, receipt_type, outcome, result_code,
        evidence_sha256, source_event_key, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
     ON CONFLICT DO NOTHING`,
    [
      input.caseId,
      input.caseVersion,
      input.type,
      input.outcome,
      input.resultCode,
      input.evidenceSha256,
      input.sourceEventKey,
      input.occurredAt,
    ],
  );
}

export async function recordPreparedCheckoutRecovery(input: {
  event: PreparedCheckoutRecoveryEvent;
  webhookInboxId: number | null;
  transientEmail?: string | null;
}): Promise<CheckoutRecoveryProcessResult> {
  return withAgentContext(ACTOR, (client) =>
    recordPreparedCheckoutRecoveryWithClient(client, input),
  );
}

export async function recordPreparedCheckoutRecoveryWithClient(
  client: PoolClient,
  input: {
    event: PreparedCheckoutRecoveryEvent;
    webhookInboxId: number | null;
    transientEmail?: string | null;
  },
): Promise<CheckoutRecoveryProcessResult> {
  const duplicate = await client.query<{
    event_id: string;
    case_id: string;
  }>(
    `SELECT id::text AS event_id, case_id::text
         FROM business_v2.checkout_recovery_events
        WHERE source_event_key = $1`,
    [input.event.source_event_key],
  );
  if (duplicate.rows[0]) {
    const row = await client.query<CaseRow>(
      `SELECT ${CASE_COLUMNS}
           FROM business_v2.checkout_recovery_cases WHERE id = $1`,
      [duplicate.rows[0].case_id],
    );
    const item = row.rows[0];
    return {
      caseId: Number(item.id),
      eventId: Number(duplicate.rows[0].event_id),
      version: Number(item.version),
      state: item.state,
      duplicate: true,
      resultCode: 'duplicate_event',
      shouldNotify: false,
      projection: projection(item),
    };
  }

  const aliasCaseIds = await findCaseIdsByAliases(
    client,
    input.event.stripe_account,
    input.event.aliases,
  );
  if (aliasCaseIds.length > 1) {
    throw new Error('checkout_recovery_aliases_span_multiple_cases');
  }

  const partyResolution = await resolveCheckoutPartyWithClient(client, {
    stripeAccount: input.event.stripe_account,
    stripeCustomerId: input.event.stripe_customer_id,
    email: input.transientEmail ?? null,
  });

  let caseId = aliasCaseIds[0] ?? null;
  if (caseId === null) {
    const created = await client.query<{ id: string }>(
      `INSERT INTO business_v2.checkout_recovery_cases
           (source_system, source_case_key, stripe_account, state,
            program_slug, product_slug, amount_cents, currency,
            contact_email, email_sha256, consent_state,
            consent_policy_version, checkout_locale, return_url, product_name,
            party_id, party_evidence_tier, stripe_customer_id,
            last_failure_code, last_decline_code, last_advice_code,
            customer_guidance_key, payment_method_brand, payment_method_last4,
            eligibility_state, last_event_type,
            last_source_event_key, last_evidence_sha256, started_at,
            last_observed_at, shadow_due_at)
         VALUES ($1, $2, $3, 'captured', $4, $5, $6, $7, $8::citext, $9,
                 $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                 $21, $22, $23, $24, $25, $26, $27,
                 $28::timestamptz, $28::timestamptz, NULL)
         ON CONFLICT (source_system, source_case_key) DO NOTHING
         RETURNING id::text`,
      [
        input.event.source_system === 'host_timeout'
          ? 'tandemweb'
          : input.event.source_system,
        input.event.source_case_key,
        input.event.stripe_account,
        input.event.program_slug,
        input.event.product_slug,
        input.event.amount_cents,
        input.event.currency,
        input.transientEmail ?? null,
        input.event.email_sha256,
        input.event.consent_state,
        input.event.consent_policy_version,
        input.event.checkout_locale,
        input.event.return_url,
        input.event.product_name,
        partyResolution.partyId,
        partyResolution.evidenceTier,
        input.event.stripe_customer_id,
        input.event.failure_code,
        input.event.decline_code,
        input.event.advice_code,
        input.event.customer_guidance_key,
        input.event.payment_method_brand,
        input.event.payment_method_last4,
        checkoutEligibility(input.event.consent_state, null),
        input.event.event_type,
        input.event.source_event_key,
        input.event.payload_sha256,
        input.event.observed_at,
      ],
    );
    if (created.rows[0]) caseId = Number(created.rows[0].id);
    else {
      const existing = await client.query<{ id: string }>(
        `SELECT id::text FROM business_v2.checkout_recovery_cases
            WHERE source_system = $1 AND source_case_key = $2`,
        [
          input.event.source_system === 'host_timeout'
            ? 'tandemweb'
            : input.event.source_system,
          input.event.source_case_key,
        ],
      );
      if (!existing.rows[0])
        throw new Error('checkout_recovery_case_create_failed');
      caseId = Number(existing.rows[0].id);
    }
  }

  await bindAliases(
    client,
    caseId,
    input.event.stripe_account,
    input.event.aliases,
  );
  const locked = await client.query<CaseRow>(
    `SELECT ${CASE_COLUMNS}
         FROM business_v2.checkout_recovery_cases
        WHERE id = $1 FOR UPDATE`,
    [caseId],
  );
  const current = locked.rows[0];
  if (!current) throw new Error('checkout_recovery_case_missing');

  const terminalPrecedence = ['purchased', 'recovered', 'closed'].includes(
    current.state,
  );
  let forcedHold: string | null = null;
  if (!terminalPrecedence) {
    if (
      current.email_sha256 &&
      input.event.email_sha256 &&
      current.email_sha256 !== input.event.email_sha256
    ) {
      forcedHold = 'identity_conflict';
    } else if (
      current.product_slug &&
      input.event.product_slug &&
      current.product_slug !== input.event.product_slug
    ) {
      forcedHold = 'product_conflict';
    } else if (
      current.party_id &&
      partyResolution.partyId !== null &&
      Number(current.party_id) !== partyResolution.partyId
    ) {
      forcedHold = 'identity_conflict';
    }
  }
  const transition = terminalPrecedence
    ? nextCheckoutRecoveryState(current.state, input.event)
    : forcedHold
      ? { state: 'held' as const, resultCode: forcedHold }
      : nextCheckoutRecoveryState(current.state, input.event);
  const nextVersion = Number(current.version) + 1;
  const consentState =
    input.event.consent_state === 'unknown'
      ? current.consent_state
      : input.event.consent_state;
  const eligibility = checkoutEligibility(consentState, forcedHold);
  const dueAt = shadowDueAt(input.event, transition.state);
  const terminal =
    transition.state === 'purchased' || transition.state === 'recovered';

  const updated = await client.query<CaseRow>(
    `UPDATE business_v2.checkout_recovery_cases
          SET state = $2,
              version = $3,
              program_slug = COALESCE(program_slug, $4),
              product_slug = COALESCE(product_slug, $5),
              amount_cents = COALESCE(amount_cents, $6),
              currency = COALESCE(currency, $7),
              contact_email = COALESCE(contact_email, $8::citext),
              email_sha256 = COALESCE(email_sha256, $9),
              consent_state = $10,
              consent_policy_version = COALESCE(consent_policy_version, $11),
              checkout_locale = COALESCE(checkout_locale, $12),
              return_url = COALESCE(return_url, $13),
              product_name = COALESCE(product_name, $14),
              party_id = COALESCE(party_id, $15),
              party_evidence_tier = CASE
                WHEN party_id IS NULL AND $15::bigint IS NOT NULL THEN $16
                ELSE COALESCE(party_evidence_tier, $16)
              END,
              stripe_customer_id = COALESCE(stripe_customer_id, $17),
              last_failure_code = COALESCE($18, last_failure_code),
              last_decline_code = COALESCE($19, last_decline_code),
              last_advice_code = COALESCE($20, last_advice_code),
              customer_guidance_key = COALESCE($21, customer_guidance_key),
              payment_method_brand = COALESCE($22, payment_method_brand),
              payment_method_last4 = COALESCE($23, payment_method_last4),
              eligibility_state = $24,
              suppression_code = COALESCE($25, suppression_code),
              last_event_type = $26,
              last_source_event_key = $27,
              last_evidence_sha256 = $28,
              last_observed_at = GREATEST(last_observed_at, $29::timestamptz),
              shadow_due_at = CASE WHEN $30 THEN NULL ELSE COALESCE($31::timestamptz, shadow_due_at) END,
              purchased_at = CASE WHEN $30 THEN COALESCE(purchased_at, $29::timestamptz) ELSE purchased_at END,
              closed_at = CASE WHEN $30 THEN COALESCE(closed_at, $29::timestamptz) ELSE closed_at END,
              updated_at = now()
        WHERE id = $1
        RETURNING ${CASE_COLUMNS}`,
    [
      caseId,
      transition.state,
      nextVersion,
      input.event.program_slug,
      input.event.product_slug,
      input.event.amount_cents,
      input.event.currency,
      input.transientEmail ?? null,
      input.event.email_sha256,
      consentState,
      input.event.consent_policy_version,
      input.event.checkout_locale,
      input.event.return_url,
      input.event.product_name,
      partyResolution.partyId,
      partyResolution.evidenceTier,
      input.event.stripe_customer_id,
      input.event.failure_code,
      input.event.decline_code,
      input.event.advice_code,
      input.event.customer_guidance_key,
      input.event.payment_method_brand,
      input.event.payment_method_last4,
      eligibility,
      forcedHold,
      input.event.event_type,
      input.event.source_event_key,
      input.event.payload_sha256,
      input.event.observed_at,
      terminal,
      dueAt,
    ],
  );
  const item = updated.rows[0];
  const eventRow = await client.query<{ id: string }>(
    `INSERT INTO business_v2.checkout_recovery_events
         (case_id, schema_version, source_system, stripe_account,
          source_event_key, event_type, observed_at, webhook_inbox_id,
          payload_sha256, previous_state, next_state, result_code, facts)
       VALUES ($1, 1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9, $10, $11,
               $12::jsonb)
       RETURNING id::text`,
    [
      caseId,
      input.event.source_system,
      input.event.stripe_account,
      input.event.source_event_key,
      input.event.event_type,
      input.event.observed_at,
      input.webhookInboxId,
      input.event.payload_sha256,
      current.state,
      transition.state,
      transition.resultCode,
      JSON.stringify({
        alias_kinds: input.event.aliases.map((entry) => entry.kind).sort(),
        has_email: input.event.email_sha256 !== null,
        consent_state: consentState,
        recovered_from_present: input.event.recovered_from !== null,
        party_linked: item.party_id !== null,
        party_evidence_tier: item.party_evidence_tier,
        failure_code: input.event.failure_code,
        decline_code: input.event.decline_code,
        advice_code: input.event.advice_code,
        customer_guidance_key: input.event.customer_guidance_key,
        payment_method_brand: input.event.payment_method_brand,
        payment_method_last4_present: input.event.payment_method_last4 !== null,
      }),
    ],
  );
  await insertReceipt(client, {
    caseId,
    caseVersion: nextVersion,
    type: current.version === 0 ? 'admission' : 'state_transition',
    outcome: forcedHold
      ? 'held'
      : transition.resultCode === 'terminal_precedence'
        ? 'no_op'
        : 'verified',
    resultCode: transition.resultCode,
    evidenceSha256: input.event.payload_sha256,
    sourceEventKey: input.event.source_event_key,
    occurredAt: input.event.observed_at,
  });
  const isFailureEvent =
    input.event.event_type === 'payment.failed' ||
    input.event.event_type === 'checkout.session_expired';
  const isPurchaseEvent =
    input.event.event_type === 'payment.succeeded' ||
    input.event.event_type === 'checkout.session_completed';
  if (!terminal && isFailureEvent) {
    await ensureCheckoutRecoveryIncidentWithClient(client, item, {
      kind:
        input.event.event_type === 'payment.failed'
          ? 'payment_failed'
          : 'checkout_incomplete',
      observedAt: input.event.observed_at,
    });
  } else if (
    terminal &&
    isPurchaseEvent &&
    item.operator_incident_id !== null
  ) {
    await markCheckoutRecoveryIncidentPurchasedWithClient(
      client,
      Number(item.operator_incident_id),
      input.event.observed_at,
    );
  }
  return {
    caseId,
    eventId: Number(eventRow.rows[0].id),
    version: nextVersion,
    state: transition.state,
    duplicate: false,
    resultCode: transition.resultCode,
    shouldNotify: false,
    projection: projection(item),
  };
}

interface IncidentRow extends QueryResultRow {
  id: string;
  incident_uuid: string;
  incident_key: string;
  group_key: string;
  subject_key: string;
  party_id: string | null;
  stripe_account: CheckoutRecoveryAccount;
  incident_kind: 'payment_failed' | 'checkout_incomplete';
  product_key: string;
  product_name: string | null;
  amount_cents: string | null;
  currency: string | null;
  episode_started_at: string;
  episode_ends_at: string;
  last_failure_at: string;
  notify_due_at: string;
  status: 'open' | 'notified' | 'closed';
  version: number;
  notified_version: number;
  case_count: number;
  payment_intent_count: number;
  provider_failure_count: number;
  customer_guidance_key: CheckoutFailureGuidanceKey | null;
  payment_method_brand: CheckoutPaymentMethodBrand | null;
  payment_method_last4: string | null;
  reminder_state: CheckoutRecoveryOperatorIncident['reminderState'];
  root_notified_at: string | null;
  last_notified_at: string | null;
  closed_at: string | null;
  party_display_name?: string | null;
  relationship_state?: string | null;
}

const INCIDENT_COLUMNS = `
  id::text,incident_uuid::text,incident_key,group_key,subject_key,
  party_id::text,stripe_account,incident_kind,product_key,product_name,
  amount_cents::text,currency,episode_started_at::text,episode_ends_at::text,
  last_failure_at::text,notify_due_at::text,status,version,notified_version,
  case_count,payment_intent_count,provider_failure_count,
  customer_guidance_key,payment_method_brand,payment_method_last4,
  reminder_state,root_notified_at::text,last_notified_at::text,closed_at::text
`;

function incidentSubjectKey(row: CaseRow): string {
  if (row.party_id !== null) return sha(`party:${row.party_id}`);
  if (row.email_sha256 !== null) return sha(`email:${row.email_sha256}`);
  return sha(`case:${row.case_uuid}`);
}

function incidentProductKey(row: CaseRow): string {
  return (
    row.product_slug ??
    row.program_slug ??
    row.product_name ??
    'unknown_product'
  );
}

async function ensureCheckoutRecoveryIncidentWithClient(
  client: PoolClient,
  row: CaseRow,
  input: {
    kind: 'payment_failed' | 'checkout_incomplete';
    observedAt: string;
  },
): Promise<number> {
  const subjectKey = incidentSubjectKey(row);
  const productKey = incidentProductKey(row);
  const groupKey = sha({
    subject_key: subjectKey,
    stripe_account: row.stripe_account,
    product_key: productKey,
    amount_cents: row.amount_cents,
    currency: row.currency,
  });
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('checkout-recovery-incident:' || $1,0)
     )`,
    [groupKey],
  );
  let incident: IncidentRow | undefined;
  if (row.operator_incident_id !== null) {
    const existing = await client.query<IncidentRow>(
      `SELECT ${INCIDENT_COLUMNS}
         FROM business_v2.checkout_recovery_operator_incidents
        WHERE id=$1 FOR UPDATE`,
      [row.operator_incident_id],
    );
    incident = existing.rows[0];
    if (incident?.status === 'closed') return Number(incident.id);
  } else {
    const existing = await client.query<IncidentRow>(
      `SELECT ${INCIDENT_COLUMNS}
         FROM business_v2.checkout_recovery_operator_incidents
        WHERE group_key=$1
          AND status<>'closed'
          AND $2::timestamptz>=episode_started_at
          AND $2::timestamptz<episode_ends_at
        ORDER BY episode_started_at DESC,id DESC
        LIMIT 1 FOR UPDATE`,
      [groupKey, row.started_at],
    );
    incident = existing.rows[0];
  }
  if (!incident) {
    const episodeStartedAt = row.started_at;
    const episodeEndsAt = new Date(
      Date.parse(episodeStartedAt) + 30 * 60_000,
    ).toISOString();
    const notifyDueAt = new Date(
      Math.min(
        Date.parse(episodeEndsAt),
        Date.parse(input.observedAt) + 5 * 60_000,
      ),
    ).toISOString();
    const incidentKey = sha({
      group_key: groupKey,
      episode_started_at: episodeStartedAt,
    });
    const created = await client.query<IncidentRow>(
      `INSERT INTO business_v2.checkout_recovery_operator_incidents
         (incident_key,group_key,subject_key,party_id,stripe_account,
          incident_kind,product_key,product_name,amount_cents,currency,
          episode_started_at,episode_ends_at,last_failure_at,notify_due_at,
          customer_guidance_key,payment_method_brand,payment_method_last4)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::timestamptz,
               $12::timestamptz,$13::timestamptz,$14::timestamptz,$15,$16,$17)
       ON CONFLICT (incident_key) DO UPDATE SET updated_at=now()
       RETURNING ${INCIDENT_COLUMNS}`,
      [
        incidentKey,
        groupKey,
        subjectKey,
        row.party_id,
        row.stripe_account,
        input.kind,
        productKey,
        row.product_name,
        row.amount_cents,
        row.currency,
        episodeStartedAt,
        episodeEndsAt,
        input.observedAt,
        notifyDueAt,
        row.customer_guidance_key,
        row.payment_method_brand,
        row.payment_method_last4,
      ],
    );
    incident = created.rows[0];
  } else {
    const updated = await client.query<IncidentRow>(
      `UPDATE business_v2.checkout_recovery_operator_incidents
          SET incident_kind=CASE WHEN $2='payment_failed'
                                 THEN 'payment_failed' ELSE incident_kind END,
              party_id=COALESCE(party_id,$3),
              product_name=COALESCE(product_name,$4),
              last_failure_at=GREATEST(last_failure_at,$5::timestamptz),
              notify_due_at=LEAST(
                episode_ends_at,$5::timestamptz+interval '5 minutes'
              ),
              customer_guidance_key=COALESCE($6,customer_guidance_key),
              payment_method_brand=COALESCE($7,payment_method_brand),
              payment_method_last4=COALESCE($8,payment_method_last4),
              version=version+1,updated_at=now()
        WHERE id=$1
        RETURNING ${INCIDENT_COLUMNS}`,
      [
        incident.id,
        input.kind,
        row.party_id,
        row.product_name,
        input.observedAt,
        row.customer_guidance_key,
        row.payment_method_brand,
        row.payment_method_last4,
      ],
    );
    incident = updated.rows[0];
  }
  if (!incident) throw new Error('checkout_recovery_incident_create_failed');
  await client.query(
    `INSERT INTO business_v2.checkout_recovery_operator_incident_cases
       (incident_id,case_id) VALUES ($1,$2)
     ON CONFLICT (case_id) DO NOTHING`,
    [incident.id, row.id],
  );
  const linked = await client.query<{ incident_id: string }>(
    `SELECT incident_id::text
       FROM business_v2.checkout_recovery_operator_incident_cases
      WHERE case_id=$1`,
    [row.id],
  );
  if (!linked.rows[0] || linked.rows[0].incident_id !== incident.id) {
    throw new Error('checkout_recovery_case_incident_conflict');
  }
  await client.query(
    `UPDATE business_v2.checkout_recovery_cases
        SET operator_incident_id=$2,updated_at=now()
      WHERE id=$1 AND (operator_incident_id IS NULL OR operator_incident_id=$2)`,
    [row.id, incident.id],
  );
  await client.query(
    `UPDATE business_v2.checkout_recovery_operator_incidents i
        SET case_count=(
              SELECT count(*) FROM business_v2.checkout_recovery_operator_incident_cases c
               WHERE c.incident_id=i.id
            ),
            payment_intent_count=(
              SELECT count(DISTINCT a.alias_id)
                FROM business_v2.checkout_recovery_operator_incident_cases c
                JOIN business_v2.checkout_recovery_aliases a ON a.case_id=c.case_id
               WHERE c.incident_id=i.id AND a.alias_kind='payment_intent'
            ),
            provider_failure_count=(
              SELECT count(*)
                FROM business_v2.checkout_recovery_operator_incident_cases c
                JOIN business_v2.checkout_recovery_events e ON e.case_id=c.case_id
               WHERE c.incident_id=i.id AND e.event_type='payment.failed'
            ),
            reminder_state=CASE
              WHEN EXISTS (
                SELECT 1 FROM business_v2.checkout_recovery_operator_incident_cases c
                JOIN business_v2.checkout_recovery_send_intents s ON s.case_id=c.case_id
                WHERE c.incident_id=i.id AND s.status='accepted'
              ) THEN 'provider_accepted'
              WHEN EXISTS (
                SELECT 1 FROM business_v2.checkout_recovery_operator_incident_cases c
                JOIN business_v2.checkout_recovery_cases rc ON rc.id=c.case_id
                WHERE c.incident_id=i.id AND rc.eligibility_state='eligible'
              ) THEN 'eligible_pending'
              WHEN EXISTS (
                SELECT 1 FROM business_v2.checkout_recovery_operator_incident_cases c
                JOIN business_v2.checkout_recovery_cases rc ON rc.id=c.case_id
                WHERE c.incident_id=i.id AND rc.consent_state='denied'
              ) THEN 'not_sent_opted_out'
              ELSE 'not_sent_consent_missing'
            END,
            updated_at=now()
      WHERE i.id=$1`,
    [incident.id],
  );
  return Number(incident.id);
}

async function markCheckoutRecoveryIncidentPurchasedWithClient(
  client: PoolClient,
  incidentId: number,
  occurredAt: string,
): Promise<void> {
  await client.query(
    `UPDATE business_v2.checkout_recovery_operator_incidents
        SET status='closed',version=version+1,
            closed_at=COALESCE(closed_at,$2::timestamptz),
            notify_due_at=CASE WHEN root_notified_at IS NULL
                               THEN notify_due_at ELSE $2::timestamptz END,
            updated_at=now()
      WHERE id=$1`,
    [incidentId, occurredAt],
  );
}

export async function sweepCheckoutRecoveryShadow(
  input: {
    limit?: number;
    now?: Date;
    sendConfig?: CheckoutRecoverySendConfig;
  } = {},
): Promise<CheckoutRecoveryProjection[]> {
  return withAgentContext(ACTOR, (client) =>
    sweepCheckoutRecoveryShadowWithClient(client, input),
  );
}

export async function sweepCheckoutRecoveryShadowWithClient(
  client: PoolClient,
  input: {
    limit?: number;
    now?: Date;
    sendConfig?: CheckoutRecoverySendConfig;
  } = {},
): Promise<CheckoutRecoveryProjection[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
  const now = input.now ?? new Date();
  const due = await client.query<CaseRow>(
    `SELECT ${CASE_COLUMNS}
         FROM business_v2.checkout_recovery_cases
        WHERE stripe_account = 'tandem'
          AND shadow_due_at IS NOT NULL
          AND shadow_due_at <= $1::timestamptz
          AND state NOT IN ('purchased', 'recovered', 'suppressed', 'held', 'closed')
        ORDER BY shadow_due_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT $2`,
    [now.toISOString(), limit],
  );
  const output: CheckoutRecoveryProjection[] = [];
  for (const current of due.rows) {
    const nextVersion = Number(current.version) + 1;
    const sourceEventKey = `checkout:timeout:${current.id}:v${nextVersion}`;
    const evidenceSha256 = sha({
      case_id: current.id,
      previous_version: current.version,
      due_at: current.shadow_due_at,
      evaluated_at: now.toISOString(),
    });
    const eligibility = checkoutEligibility(
      current.consent_state,
      current.suppression_code,
    );
    const updated = await client.query<CaseRow>(
      `UPDATE business_v2.checkout_recovery_cases
            SET state = 'shadow_ready', version = $2,
                eligibility_state = $3, shadow_due_at = NULL,
                shadow_ready_at = $4::timestamptz,
                owner_review_deadline = $4::timestamptz + interval '48 hours',
                last_event_type = 'checkout.shadow_timeout',
                last_source_event_key = $5,
                last_evidence_sha256 = $6,
                last_observed_at = GREATEST(last_observed_at, $4::timestamptz),
                updated_at = now()
          WHERE id = $1
          RETURNING ${CASE_COLUMNS}`,
      [
        current.id,
        nextVersion,
        eligibility,
        now.toISOString(),
        sourceEventKey,
        evidenceSha256,
      ],
    );
    const event = await client.query<{ id: string }>(
      `INSERT INTO business_v2.checkout_recovery_events
           (case_id, schema_version, source_system, stripe_account,
            source_event_key, event_type, observed_at, payload_sha256,
            previous_state, next_state, result_code, facts)
         VALUES ($1, 1, 'host_timeout', 'tandem', $2,
                 'checkout.shadow_timeout', $3::timestamptz, $4, $5,
                 'shadow_ready', 'shadow_timeout_ready', $6::jsonb)
         RETURNING id::text`,
      [
        current.id,
        sourceEventKey,
        now.toISOString(),
        evidenceSha256,
        current.state,
        JSON.stringify({
          timeout_minutes: 45,
          consent_state: current.consent_state,
          eligibility_state: eligibility,
        }),
      ],
    );
    void event;
    await insertReceipt(client, {
      caseId: Number(current.id),
      caseVersion: nextVersion,
      type: 'shadow_projection',
      outcome: eligibility === 'eligible' ? 'verified' : 'ineligible',
      resultCode: `shadow_${eligibility}`,
      evidenceSha256,
      sourceEventKey,
      occurredAt: now.toISOString(),
    });
    if (input.sendConfig && eligibility === 'eligible') {
      const scheduledCase = updated.rows[0];
      await scheduleCheckoutRecoveryTouchesWithClient(
        client,
        {
          id: Number(scheduledCase.id),
          createdAt: scheduledCase.created_at,
          startedAt: scheduledCase.started_at,
          stripeAccount: scheduledCase.stripe_account,
          consentState: scheduledCase.consent_state,
          consentPolicyVersion: scheduledCase.consent_policy_version,
          checkoutLocale: scheduledCase.checkout_locale,
          returnUrl: scheduledCase.return_url,
          productName: scheduledCase.product_name,
          productSlug: scheduledCase.product_slug,
          emailSha256: scheduledCase.email_sha256,
          contactEmail: scheduledCase.contact_email,
          guidanceKey: scheduledCase.customer_guidance_key,
        },
        input.sendConfig,
        now,
      );
    }
    const incidentCase = updated.rows[0];
    if (incidentCase.operator_incident_id === null) {
      await ensureCheckoutRecoveryIncidentWithClient(client, incidentCase, {
        kind: 'checkout_incomplete',
        observedAt: now.toISOString(),
      });
    }
    output.push(projection(updated.rows[0], now.getTime()));
  }
  return output;
}

export async function markCheckoutRecoveryProjectionNotified(input: {
  caseId: number;
  expectedVersion: number;
  occurredAt?: string;
}): Promise<boolean> {
  return withAgentContext(ACTOR, async (client) => {
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const updated = await client.query(
      `UPDATE business_v2.checkout_recovery_cases
          SET shadow_notified_at = $3::timestamptz, updated_at = now()
        WHERE id = $1 AND version = $2 AND shadow_notified_at IS NULL`,
      [input.caseId, input.expectedVersion, occurredAt],
    );
    if (updated.rowCount !== 1) return false;
    await insertReceipt(client, {
      caseId: input.caseId,
      caseVersion: input.expectedVersion,
      type: 'shadow_projection',
      outcome: 'verified',
      resultCode: 'internal_projection_posted',
      evidenceSha256: sha({
        case_id: input.caseId,
        version: input.expectedVersion,
        occurred_at: occurredAt,
      }),
      sourceEventKey: `checkout:projection:${input.caseId}:v${input.expectedVersion}`,
      occurredAt,
    });
    return true;
  });
}

export async function checkoutRecoveryHealth(): Promise<CheckoutRecoveryHealth> {
  return withAgentContext(ACTOR, async (client) => {
    const result = await client.query<{
      total_cases: string;
      open_cases: string;
      shadow_ready_cases: string;
      unnotified_cases: string;
      heartbeat_cases: string;
      tandem_cases: string;
      last_observed_at: string | null;
    }>(
      `SELECT count(*)::text AS total_cases,
              count(*) FILTER (WHERE state NOT IN ('purchased','recovered','closed'))::text AS open_cases,
              count(*) FILTER (WHERE state = 'shadow_ready')::text AS shadow_ready_cases,
              count(*) FILTER (WHERE state IN ('shadow_ready','payment_failed','expired','held') AND shadow_notified_at IS NULL)::text AS unnotified_cases,
              count(*) FILTER (WHERE stripe_account = 'heartbeat')::text AS heartbeat_cases,
              count(*) FILTER (WHERE stripe_account = 'tandem')::text AS tandem_cases,
              max(last_observed_at)::text AS last_observed_at
         FROM business_v2.checkout_recovery_cases`,
    );
    const row = result.rows[0];
    return {
      totalCases: Number(row.total_cases),
      openCases: Number(row.open_cases),
      shadowReadyCases: Number(row.shadow_ready_cases),
      unnotifiedCases: Number(row.unnotified_cases),
      heartbeatCases: Number(row.heartbeat_cases),
      tandemCases: Number(row.tandem_cases),
      lastObservedAt: row.last_observed_at,
    };
  });
}

export async function listDueCheckoutRecoveryOperatorIncidents(
  input: { limit?: number; now?: Date } = {},
): Promise<CheckoutRecoveryOperatorIncident[]> {
  return withAgentContext(ACTOR, (client) =>
    listDueCheckoutRecoveryOperatorIncidentsWithClient(client, input),
  );
}

export async function listDueCheckoutRecoveryOperatorIncidentsWithClient(
  client: PoolClient,
  input: { limit?: number; now?: Date } = {},
): Promise<CheckoutRecoveryOperatorIncident[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
  const now = input.now ?? new Date();
  const rows = await client.query<IncidentRow>(
    `SELECT ${INCIDENT_COLUMNS},p.display_name AS party_display_name,
              relationship.value->>'relationship_state' AS relationship_state
         FROM business_v2.checkout_recovery_operator_incidents i
         LEFT JOIN business_v2.parties p ON p.id=i.party_id
         LEFT JOIN business_v2.party_context_projections relationship
           ON relationship.party_id=i.party_id
          AND relationship.section='relationship'
          AND relationship.projection_key='relationship.client_status.v1'
        WHERE i.notify_due_at<=$1::timestamptz
          AND (
            (i.notified_version=0 AND i.status<>'closed') OR
            (
              i.notified_version>0 AND i.version>i.notified_version AND
              (
                i.status<>'closed' OR
                (
                  i.status='closed' AND
                  i.closed_at IS NOT NULL AND
                  i.closed_at>i.last_notified_at
                )
              )
            )
          )
        ORDER BY i.notify_due_at,i.id
        LIMIT $2`,
    [now.toISOString(), limit],
  );
  return rows.rows.map((row) => ({
    incidentId: Number(row.id),
    incidentUuid: row.incident_uuid,
    version: Number(row.version),
    isRoot: Number(row.notified_version) === 0,
    threadKey: `checkout:failure:${row.incident_uuid}`,
    kind: row.incident_kind,
    outcome: row.status === 'closed' ? 'purchased' : 'open',
    partyId: row.party_id === null ? null : Number(row.party_id),
    partyDisplayName: row.party_display_name ?? null,
    relationshipState: row.relationship_state ?? null,
    productName: row.product_name,
    productKey: row.product_key,
    amountCents: row.amount_cents === null ? null : Number(row.amount_cents),
    currency: row.currency,
    guidanceKey: row.customer_guidance_key,
    paymentMethodBrand: row.payment_method_brand,
    paymentMethodLast4: row.payment_method_last4,
    caseCount: Number(row.case_count),
    paymentIntentCount: Number(row.payment_intent_count),
    providerFailureCount: Number(row.provider_failure_count),
    episodeStartedAt: row.episode_started_at,
    lastFailureAt: row.last_failure_at,
    reminderState: row.reminder_state,
  }));
}

export async function markCheckoutRecoveryOperatorIncidentNotified(input: {
  incidentId: number;
  expectedVersion: number;
  occurredAt?: string;
}): Promise<boolean> {
  return withAgentContext(ACTOR, async (client) => {
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const updated = await client.query(
      `UPDATE business_v2.checkout_recovery_operator_incidents
          SET status=CASE WHEN status='open' THEN 'notified' ELSE status END,
              notified_version=$2,
              root_notified_at=COALESCE(root_notified_at,$3::timestamptz),
              last_notified_at=$3::timestamptz,updated_at=now()
        WHERE id=$1 AND version=$2 AND notified_version<$2`,
      [input.incidentId, input.expectedVersion, occurredAt],
    );
    if (updated.rowCount !== 1) return false;
    const cases = await client.query<{
      id: string;
      version: number;
    }>(
      `UPDATE business_v2.checkout_recovery_cases rc
          SET shadow_notified_at=COALESCE(shadow_notified_at,$2::timestamptz),
              updated_at=now()
         FROM business_v2.checkout_recovery_operator_incident_cases membership
        WHERE membership.incident_id=$1 AND membership.case_id=rc.id
        RETURNING rc.id::text,rc.version`,
      [input.incidentId, occurredAt],
    );
    for (const item of cases.rows) {
      await insertReceipt(client, {
        caseId: Number(item.id),
        caseVersion: Number(item.version),
        type: 'shadow_projection',
        outcome: 'verified',
        resultCode: 'operator_incident_posted',
        evidenceSha256: sha({
          incident_id: input.incidentId,
          incident_version: input.expectedVersion,
          occurred_at: occurredAt,
        }),
        sourceEventKey: `checkout:incident:${input.incidentId}:v${input.expectedVersion}`,
        occurredAt,
      });
    }
    return true;
  });
}

function guidanceText(key: CheckoutFailureGuidanceKey | null): string {
  switch (key) {
    case 'verify_card_details':
      return 'Ask the customer to check their card and billing details, then try again.';
    case 'authenticate_payment':
      return 'Ask the customer to retry and complete the bank verification step.';
    case 'use_different_method':
      return 'Ask the customer to use another card or payment method.';
    case 'contact_issuer_or_change_method':
      return 'The bank gave no specific reason; ask the customer to contact the issuer or use another payment method.';
    case 'retry_later_or_change_method':
      return 'Ask the customer to retry once later, then use another method or contact the issuer.';
    default:
      return 'Ask the customer to contact the card issuer or use another payment method.';
  }
}

function reminderText(
  state: CheckoutRecoveryOperatorIncident['reminderState'],
): string {
  switch (state) {
    case 'provider_accepted':
      return 'provider accepted the consented reminder';
    case 'eligible_pending':
      return 'consented reminder is eligible/pending';
    case 'not_sent_opted_out':
      return 'not sent — customer opted out';
    case 'suppressed':
      return 'not sent — suppressed by current purchase/policy evidence';
    case 'not_applicable':
      return 'not applicable';
    default:
      return 'not sent — checkout reminder consent was not received';
  }
}

export function formatCheckoutRecoveryOperatorIncident(
  item: CheckoutRecoveryOperatorIncident,
): string {
  if (item.outcome === 'purchased') {
    return `Checkout completed after the failed attempt.${
      item.productName || item.productKey
        ? ` Product: ${item.productName ?? item.productKey}.`
        : ''
    } No further recovery action is needed.`;
  }
  const product = item.productName ?? item.productKey;
  const amount =
    item.amountCents === null || item.currency === null
      ? 'amount unavailable'
      : `${item.currency.toUpperCase()} ${(item.amountCents / 100).toFixed(2)}`;
  const customer =
    item.partyId === null
      ? 'identity not resolved'
      : `${item.partyDisplayName ?? 'Known contact'} — Party ${item.partyId}${
          item.relationshipState
            ? ` (${item.relationshipState.replace(/_/g, ' ')})`
            : ''
        }`;
  const method =
    item.paymentMethodBrand && item.paymentMethodLast4
      ? `${item.paymentMethodBrand.replace('_', ' ')} ending ${item.paymentMethodLast4}`
      : 'payment method unavailable';
  const minutes = Math.max(
    0,
    Math.round(
      (Date.parse(item.lastFailureAt) - Date.parse(item.episodeStartedAt)) /
        60_000,
    ),
  );
  return [
    `Payment unsuccessful: ${product} — ${amount}`,
    `Customer: ${customer}`,
    `Stripe: ${method}; ${guidanceText(item.guidanceKey)}`,
    `Attempts: ${item.paymentIntentCount} payment intent${item.paymentIntentCount === 1 ? '' : 's'} / ${item.providerFailureCount} provider failure${item.providerFailureCount === 1 ? '' : 's'} over ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    `Reminder: ${reminderText(item.reminderState)}.`,
  ].join('\n');
}
