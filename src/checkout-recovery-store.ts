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
  type CheckoutRecoveryLocale,
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
  eligibility_state, suppression_code, started_at::text,
  last_observed_at::text, shadow_due_at::text, shadow_notified_at::text,
  created_at::text
`;

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

function transitionShouldNotify(
  previous: CheckoutRecoveryState | null,
  next: CheckoutRecoveryState,
): boolean {
  return (
    previous !== next &&
    ['payment_failed', 'expired', 'held', 'recovered'].includes(next)
  );
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

  let caseId = aliasCaseIds[0] ?? null;
  if (caseId === null) {
    const created = await client.query<{ id: string }>(
      `INSERT INTO business_v2.checkout_recovery_cases
           (source_system, source_case_key, stripe_account, state,
            program_slug, product_slug, amount_cents, currency,
            contact_email, email_sha256, consent_state,
            consent_policy_version, checkout_locale, return_url, product_name,
            eligibility_state, last_event_type,
            last_source_event_key, last_evidence_sha256, started_at,
            last_observed_at, shadow_due_at)
         VALUES ($1, $2, $3, 'captured', $4, $5, $6, $7, $8::citext, $9,
                 $10, $11, $12, $13, $14, $15, $16, $17, $18,
                 $19::timestamptz, $19::timestamptz, NULL)
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
              eligibility_state = $15,
              suppression_code = COALESCE($16, suppression_code),
              last_event_type = $17,
              last_source_event_key = $18,
              last_evidence_sha256 = $19,
              last_observed_at = GREATEST(last_observed_at, $20::timestamptz),
              shadow_due_at = CASE WHEN $21 THEN NULL ELSE COALESCE($22::timestamptz, shadow_due_at) END,
              purchased_at = CASE WHEN $21 THEN COALESCE(purchased_at, $20::timestamptz) ELSE purchased_at END,
              closed_at = CASE WHEN $21 THEN COALESCE(closed_at, $20::timestamptz) ELSE closed_at END,
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
  return {
    caseId,
    eventId: Number(eventRow.rows[0].id),
    version: nextVersion,
    state: transition.state,
    duplicate: false,
    resultCode: transition.resultCode,
    shouldNotify: transitionShouldNotify(current.state, transition.state),
    projection: projection(item),
  };
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
        },
        input.sendConfig,
        now,
      );
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

export function formatCheckoutRecoveryProjection(
  item: CheckoutRecoveryProjection,
): string {
  const product = item.productSlug ?? item.programSlug ?? 'unknown product';
  const value =
    item.amountCents === null || item.currency === null
      ? 'amount unknown'
      : `${item.currency.toUpperCase()} ${(item.amountCents / 100).toFixed(2)}`;
  return `[checkout shadow] ${item.stripeAccount} — ${product} — ${item.state}; ${value}; consent ${item.consentState}/${item.eligibilityState}; case ${item.caseId}; no customer message sent`;
}
