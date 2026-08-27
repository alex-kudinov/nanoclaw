import crypto from 'node:crypto';
import https from 'node:https';

import type { PoolClient } from 'pg';

import { withAgentContext } from './business-db.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

export const CONTADOR_STRIPE_INGRESS_PARITY_INTERVAL_MS = 15 * 60 * 1000;
export const CONTADOR_STRIPE_INGRESS_PARITY_WINDOW_SECONDS = 72 * 60 * 60;
export const CONTADOR_STRIPE_INGRESS_PARITY_MAX_ROWS_PER_SCOPE = 500;
const MAX_PAGES_PER_SCOPE = 10;
const HTTP_TIMEOUT_MS = 20_000;
const SCOPES = ['heartbeat', 'tandem'] as const;
export type ContadorStripeIngressScope = (typeof SCOPES)[number];

interface StripeListResponse {
  data?: Array<Record<string, unknown>>;
  has_more?: boolean;
  error?: { type?: string };
}

export interface ContadorStripeIngressPaymentIntent {
  id: string;
  createdAt: string;
}

export interface ContadorStripeIngressSnapshot {
  scope: ContadorStripeIngressScope;
  accountId: string;
  observedAt: string;
  windowStartAt: string;
  rowsScanned: number;
  succeededPaymentIntents: ContadorStripeIngressPaymentIntent[];
  complete: true;
}

export interface ContadorStripeIngressFetchDeps {
  getJson?: (key: string, path: string) => Promise<Record<string, unknown>>;
  keyForScope?: (scope: ContadorStripeIngressScope) => string;
  maxPagesPerScope?: number;
  maxRowsPerScope?: number;
}

export interface ContadorStripeIngressScopeResult {
  rowsScanned: number;
  succeededPaymentIntents: number;
  existingCases: number;
  inboxWithoutCase: number;
  exceptionsCreated: number;
}

export interface ContadorStripeIngressParityResult {
  complete: true;
  windowHours: 72;
  heartbeat: ContadorStripeIngressScopeResult;
  tandem: ContadorStripeIngressScopeResult;
  totalExceptionsCreated: number;
}

export interface ContadorStripeIngressParityHealth {
  enabled: boolean;
  mode: 'read_only_provider_owned_exception';
  consumerEnabled: false;
  status: 'disabled' | 'never_run' | 'healthy' | 'degraded';
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  result: ContadorStripeIngressParityResult | null;
  errorCodes: string[];
}

function sha(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function stripeKey(scope: ContadorStripeIngressScope): string {
  const env = readEnvFile(['STRIPE_RESTRICTED_KEY', 'STRIPE_SECRET_KEY_ALT']);
  const key =
    scope === 'heartbeat'
      ? env.STRIPE_RESTRICTED_KEY
      : env.STRIPE_SECRET_KEY_ALT;
  if (!key) throw new Error(`stripe_ingress_${scope}_credential_unavailable`);
  return key;
}

function boundedCode(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';
  const normalized = value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return normalized.slice(0, 64) || 'unknown';
}

function stripeGetJson(
  key: string,
  path: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: 'api.stripe.com',
        path,
        headers: {
          Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
        },
      },
      (response) => {
        let body = '';
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () => {
          let parsed: StripeListResponse;
          try {
            parsed = JSON.parse(body) as StripeListResponse;
          } catch {
            reject(new Error('stripe_ingress_response_invalid'));
            return;
          }
          if ((response.statusCode ?? 500) >= 400 || parsed.error) {
            reject(
              new Error(
                `stripe_ingress_http_${response.statusCode ?? 0}_${boundedCode(parsed.error?.type)}`,
              ),
            );
            return;
          }
          resolve(parsed as Record<string, unknown>);
        });
      },
    );
    request.on('error', () =>
      reject(new Error('stripe_ingress_request_failed')),
    );
    request.setTimeout(HTTP_TIMEOUT_MS, () =>
      request.destroy(new Error('stripe_ingress_request_timeout')),
    );
  });
}

function normalizeInstant(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

function paymentIntentId(value: unknown): string | null {
  return typeof value === 'string' && /^pi_[A-Za-z0-9_]{1,180}$/.test(value)
    ? value
    : null;
}

async function fetchSnapshotOnce(input: {
  scope: ContadorStripeIngressScope;
  observedAt: string;
  createdGte: number;
  createdLt: number;
  deps: ContadorStripeIngressFetchDeps;
}): Promise<ContadorStripeIngressSnapshot> {
  const key = (input.deps.keyForScope ?? stripeKey)(input.scope);
  const getJson = input.deps.getJson ?? stripeGetJson;
  const maxPages = input.deps.maxPagesPerScope ?? MAX_PAGES_PER_SCOPE;
  const maxRows =
    input.deps.maxRowsPerScope ??
    CONTADOR_STRIPE_INGRESS_PARITY_MAX_ROWS_PER_SCOPE;
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) {
    throw new Error('stripe_ingress_page_cap_invalid');
  }
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 5_000) {
    throw new Error('stripe_ingress_row_cap_invalid');
  }
  const account = await getJson(key, '/v1/account');
  const accountId =
    typeof account.id === 'string' &&
    /^acct_[A-Za-z0-9_]{1,180}$/.test(account.id)
      ? account.id
      : null;
  if (!accountId)
    throw new Error('stripe_ingress_account_identity_unavailable');

  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let startingAfter: string | null = null;
  let hasMore = true;
  let pages = 0;
  while (hasMore) {
    if (pages >= maxPages) throw new Error('stripe_ingress_page_cap_exceeded');
    const search = new URLSearchParams({
      limit: '100',
      'created[gte]': String(input.createdGte),
      'created[lt]': String(input.createdLt),
    });
    if (startingAfter) search.set('starting_after', startingAfter);
    const page = (await getJson(
      key,
      `/v1/payment_intents?${search.toString()}`,
    )) as StripeListResponse;
    if (!Array.isArray(page.data))
      throw new Error('stripe_ingress_list_shape_invalid');
    for (const row of page.data) {
      const id = paymentIntentId(row.id);
      if (!id) throw new Error('stripe_ingress_payment_intent_id_invalid');
      if (seen.has(id))
        throw new Error('stripe_ingress_payment_intent_duplicate');
      seen.add(id);
      rows.push(row);
      if (rows.length > maxRows)
        throw new Error('stripe_ingress_row_cap_exceeded');
    }
    hasMore = page.has_more === true;
    startingAfter = paymentIntentId(page.data.at(-1)?.id);
    if (hasMore && !startingAfter) {
      throw new Error('stripe_ingress_pagination_cursor_missing');
    }
    pages += 1;
  }

  const succeededPaymentIntents = rows.flatMap((row) => {
    if (row.status !== 'succeeded') return [];
    const id = paymentIntentId(row.id);
    const createdAt = normalizeInstant(row.created);
    if (!id || !createdAt)
      throw new Error('stripe_ingress_succeeded_row_invalid');
    return [{ id, createdAt }];
  });
  succeededPaymentIntents.sort((a, b) => a.id.localeCompare(b.id));
  return {
    scope: input.scope,
    accountId,
    observedAt: input.observedAt,
    windowStartAt: new Date(input.createdGte * 1000).toISOString(),
    rowsScanned: rows.length,
    succeededPaymentIntents,
    complete: true,
  };
}

function stableSnapshotValue(snapshot: ContadorStripeIngressSnapshot): unknown {
  return {
    scope: snapshot.scope,
    accountId: snapshot.accountId,
    windowStartAt: snapshot.windowStartAt,
    rowsScanned: snapshot.rowsScanned,
    succeededPaymentIntents: snapshot.succeededPaymentIntents,
    complete: snapshot.complete,
  };
}

export async function fetchContadorStripeIngressSnapshot(
  scope: ContadorStripeIngressScope,
  observedAt: string,
  deps: ContadorStripeIngressFetchDeps = {},
): Promise<ContadorStripeIngressSnapshot> {
  if (!SCOPES.includes(scope)) throw new Error('stripe_ingress_scope_invalid');
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new Error('stripe_ingress_observed_at_invalid');
  }
  const createdLt = Math.floor(Date.parse(observedAt) / 1000) + 1;
  const createdGte = createdLt - CONTADOR_STRIPE_INGRESS_PARITY_WINDOW_SECONDS;
  const first = await fetchSnapshotOnce({
    scope,
    observedAt,
    createdGte,
    createdLt,
    deps,
  });
  const second = await fetchSnapshotOnce({
    scope,
    observedAt,
    createdGte,
    createdLt,
    deps,
  });
  if (sha(stableSnapshotValue(first)) !== sha(stableSnapshotValue(second))) {
    throw new Error('stripe_ingress_snapshot_drift');
  }
  return second;
}

async function insertReceipt(
  client: PoolClient,
  input: {
    caseId: string;
    stage: string;
    outcome: string;
    resultCode: string;
    sourceEventId: string;
    occurredAt: string;
    evidence: unknown;
  },
): Promise<void> {
  const evidenceSha256 = sha(input.evidence);
  const receiptKey = `contador:${input.caseId}:v0:${input.stage}:${sha([
    input.caseId,
    input.stage,
    input.sourceEventId,
    evidenceSha256,
  ]).slice(0, 24)}`;
  await client.query(
    `INSERT INTO business_v2.contador_payment_fulfillment_receipts
       (receipt_key,case_id,case_version,stage,outcome,result_code,
        evidence_sha256,source_event_id,actor,occurred_at)
     VALUES ($1,$2,0,$3,$4,$5,$6,$7,
             'contador-stripe-ingress-parity:host',$8::timestamptz)`,
    [
      receiptKey,
      input.caseId,
      input.stage,
      input.outcome,
      input.resultCode,
      evidenceSha256,
      input.sourceEventId,
      input.occurredAt,
    ],
  );
}

export async function reconcileContadorStripeIngressSnapshotsWithClient(input: {
  client: PoolClient;
  snapshots: ContadorStripeIngressSnapshot[];
}): Promise<ContadorStripeIngressParityResult> {
  if (
    input.snapshots.length !== 2 ||
    !SCOPES.every((scope) => input.snapshots.some((row) => row.scope === scope))
  ) {
    throw new Error('stripe_ingress_snapshot_scope_incomplete');
  }
  if (new Set(input.snapshots.map((row) => row.accountId)).size !== 2) {
    throw new Error('stripe_ingress_account_scope_collision');
  }
  const results = new Map<
    ContadorStripeIngressScope,
    ContadorStripeIngressScopeResult
  >();
  for (const snapshot of [...input.snapshots].sort((a, b) =>
    a.scope.localeCompare(b.scope),
  )) {
    if (!snapshot.complete)
      throw new Error('stripe_ingress_snapshot_incomplete');
    const result: ContadorStripeIngressScopeResult = {
      rowsScanned: snapshot.rowsScanned,
      succeededPaymentIntents: snapshot.succeededPaymentIntents.length,
      existingCases: 0,
      inboxWithoutCase: 0,
      exceptionsCreated: 0,
    };
    for (const payment of snapshot.succeededPaymentIntents) {
      await input.client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`${snapshot.scope}:${payment.id}`],
      );
      const existing = await input.client.query<{ id: string }>(
        `SELECT c.id::text
           FROM business_v2.contador_payment_fulfillment_cases c
          WHERE c.stripe_account=$1 AND c.payment_intent_id=$2
         UNION
         SELECT a.case_id::text
           FROM business_v2.contador_payment_fulfillment_aliases a
          WHERE a.stripe_account=$1 AND a.alias_kind='payment_intent'
            AND a.alias_id=$2
          LIMIT 1`,
        [snapshot.scope, payment.id],
      );
      if (existing.rows[0]) {
        result.existingCases += 1;
        continue;
      }
      const inbox = await input.client.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM business_v2.webhook_inbox
          WHERE source='stripe-payment'
            AND raw_body->>'account'=$1
            AND raw_body->>'stripe_id'=$2`,
        [snapshot.scope, payment.id],
      );
      const inboxPresent = Number(inbox.rows[0]?.count ?? 0) > 0;
      if (inboxPresent) result.inboxWithoutCase += 1;
      const errorCode = inboxPresent
        ? 'provider_delivery_unadmitted'
        : 'provider_delivery_missing';
      const sourceEventId = `stripe:ingress_parity:${snapshot.scope}:${payment.id}`;
      const evidenceSha256 = sha([
        'stripe_ingress_parity_v1',
        snapshot.scope,
        snapshot.accountId,
        payment.id,
        payment.createdAt,
        snapshot.windowStartAt,
      ]);
      const inserted = await input.client.query<{ id: string }>(
        `INSERT INTO business_v2.contador_payment_fulfillment_cases
           (stripe_account,payment_intent_id,state,version,attempt_count,
            lease_token,lease_expires_at,owner_group,last_event_type,
            last_source_object_id,last_source_event_id,last_error_code,
            last_evidence_sha256,review_deadline,first_observed_at,
            last_observed_at,resolved_at)
         VALUES ($1,$2,'needs_review',0,1,NULL,NULL,'contador',
                 'payment_intent.succeeded',$2,$3,$4,$5,
                 now()+interval '1 day',$6::timestamptz,$6::timestamptz,NULL)
         RETURNING id::text`,
        [
          snapshot.scope,
          payment.id,
          sourceEventId,
          errorCode,
          evidenceSha256,
          snapshot.observedAt,
        ],
      );
      const caseId = inserted.rows[0]?.id;
      if (!caseId) throw new Error('stripe_ingress_case_insert_failed');
      await input.client.query(
        `INSERT INTO business_v2.contador_payment_fulfillment_aliases
           (case_id,stripe_account,alias_kind,alias_id)
         VALUES ($1,$2,'payment_intent',$3)`,
        [caseId, snapshot.scope, payment.id],
      );
      const receipts = [
        ['admission', 'exception', errorCode],
        ['stripe_source', 'verified', 'stripe_succeeded_read_only'],
        ['payment_log', 'not_applicable', 'ingress_missing_no_processing'],
        ['postgres_payment', 'not_applicable', 'ingress_missing_no_processing'],
        ['student_roster', 'not_applicable', 'ingress_missing_no_processing'],
        ['final', 'exception', errorCode],
      ] as const;
      for (const [stage, outcome, resultCode] of receipts) {
        await insertReceipt(input.client, {
          caseId,
          stage,
          outcome,
          resultCode,
          sourceEventId,
          occurredAt: snapshot.observedAt,
          evidence: [
            'stripe_ingress_parity_v1',
            snapshot.scope,
            payment.id,
            stage,
            outcome,
            resultCode,
          ],
        });
      }
      result.exceptionsCreated += 1;
    }
    results.set(snapshot.scope, result);
  }
  const heartbeat = results.get('heartbeat');
  const tandem = results.get('tandem');
  if (!heartbeat || !tandem)
    throw new Error('stripe_ingress_result_scope_missing');
  return {
    complete: true,
    windowHours: 72,
    heartbeat,
    tandem,
    totalExceptionsCreated:
      heartbeat.exceptionsCreated + tandem.exceptionsCreated,
  };
}

function baseHealth(): ContadorStripeIngressParityHealth {
  return {
    enabled: false,
    mode: 'read_only_provider_owned_exception',
    consumerEnabled: false,
    status: 'disabled',
    lastRunAt: null,
    lastSuccessAt: null,
    result: null,
    errorCodes: [],
  };
}

let currentHealth = baseHealth();

export function contadorStripeIngressParityEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.CONTADOR_STRIPE_INGRESS_PARITY_ENABLED === '1';
}

export function getContadorStripeIngressParityHealth(): ContadorStripeIngressParityHealth {
  return structuredClone(currentHealth);
}

export function resetContadorStripeIngressParityHealthForTests(): void {
  currentHealth = baseHealth();
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return /^[a-z][a-z0-9_]{0,99}$/.test(message)
    ? message
    : 'stripe_ingress_parity_failed';
}

export async function runContadorStripeIngressParity(
  input: {
    env?: NodeJS.ProcessEnv;
    nowMs?: number;
    fetchSnapshot?: typeof fetchContadorStripeIngressSnapshot;
    reconcile?: (
      snapshots: ContadorStripeIngressSnapshot[],
    ) => Promise<ContadorStripeIngressParityResult>;
  } = {},
): Promise<ContadorStripeIngressParityHealth> {
  if (!contadorStripeIngressParityEnabled(input.env)) {
    currentHealth = baseHealth();
    return getContadorStripeIngressParityHealth();
  }
  const runAt = new Date(input.nowMs ?? Date.now()).toISOString();
  currentHealth = {
    ...currentHealth,
    enabled: true,
    status: currentHealth.lastSuccessAt ? 'healthy' : 'never_run',
    lastRunAt: runAt,
    errorCodes: [],
  };
  try {
    const fetchSnapshot =
      input.fetchSnapshot ?? fetchContadorStripeIngressSnapshot;
    const snapshots = await Promise.all(
      SCOPES.map((scope) => fetchSnapshot(scope, runAt)),
    );
    const result = input.reconcile
      ? await input.reconcile(snapshots)
      : await withAgentContext('contador-stripe-ingress-parity', (client) =>
          reconcileContadorStripeIngressSnapshotsWithClient({
            client,
            snapshots,
          }),
        );
    currentHealth = {
      enabled: true,
      mode: 'read_only_provider_owned_exception',
      consumerEnabled: false,
      status: 'healthy',
      lastRunAt: runAt,
      lastSuccessAt: runAt,
      result,
      errorCodes: [],
    };
    logger.info(currentHealth, 'Contador Stripe ingress parity complete');
  } catch (error) {
    currentHealth = {
      ...currentHealth,
      enabled: true,
      status: 'degraded',
      lastRunAt: runAt,
      errorCodes: [errorCode(error)],
    };
    logger.warn(
      { ...currentHealth, errorCode: errorCode(error) },
      'Contador Stripe ingress parity degraded',
    );
  }
  return getContadorStripeIngressParityHealth();
}
