import { createHash, createHmac, randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import {
  parseCheckoutAttributionHandoff,
  type CheckoutAttributionHandoff,
} from './payment-checkout-attribution.js';
import {
  paymentScopeFingerprint,
  PaymentDomainError,
  type PaymentScope,
} from './payment-domain.js';
import { PaymentPayloadVault } from './payment-payload-vault.js';
import type { PaymentTransaction } from './payment-store.js';

const CHAOS_PATH = '/wp-json/chaos/v1/lifecycle-event';
const SOURCE_SYSTEM = 'nanoclaw_adyen';
const PRODUCT_SLUG = 'mcq-program-a-foundations';
const PROGRAM = 'mcs';
const MAX_ATTEMPTS = 8;
const REQUEST_TIMEOUT_MS = 10_000;

export type PaymentChaosEventName = 'checkout_started' | 'purchase_completed';
export type PaymentChaosAction =
  | 'attempt_accepted'
  | 'session_requested'
  | 'retry_requested'
  | 'session_ready'
  | 'session_unknown'
  | 'session_failed'
  | 'terminal_nonpayment'
  | 'authorization_verified'
  | 'authorization_refused'
  | 'payment_needs_review'
  | 'purchase_admitted';
export type PaymentChaosOutcome =
  | 'started'
  | 'ready'
  | 'held'
  | 'failed'
  | 'verified';

export interface PaymentChaosObservabilityConfig {
  environment: 'live';
  endpoint: string;
  webhookToken: string;
  identityHmacSecret: string;
  batchSize: number;
  pollIntervalMs: number;
}

interface OutboxRow {
  id: number;
  source_event_sha256: string;
  scope_sha256: string;
  attempt_id: string | null;
  event_name: PaymentChaosEventName;
  action: PaymentChaosAction;
  outcome: PaymentChaosOutcome;
  reason_code: string;
  session_sequence: number;
  evidence_class: string;
  occurred_at: string;
  attempts: number;
  lease_token: string;
}

interface AttributionAuthorityRow {
  attempt_id: string;
  snapshot_id: string;
  snapshot_sha256: string;
  binding_reference: string;
  binding_sha256: string;
  encrypted_snapshot: string;
  encrypted_binding: string;
  payer_email: string;
}

export interface PaymentChaosRunResult {
  projected: number;
  processed: number;
  accepted: number;
  suppressed: number;
  retried: number;
  deadLettered: number;
}

function ensure(condition: boolean, code: string): asserts condition {
  if (!condition) throw new PaymentDomainError(code);
}

function canonicalEndpoint(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PaymentDomainError('invalid_payment_chaos_configuration');
  }
  ensure(
    url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === CHAOS_PATH,
    'invalid_payment_chaos_configuration',
  );
  return url.toString();
}

export function chaosPersonKey(email: string, secret: string): string {
  const normalized = email.trim().toLowerCase();
  ensure(
    normalized.length >= 3 &&
      normalized.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized),
    'payment_chaos_identity_unavailable',
  );
  return createHmac('sha256', secret)
    .update(`chaos-person-v1|${normalized}`)
    .digest('hex');
}

function sourceEventId(row: OutboxRow): string {
  return `payment-observability-v1:${createHash('sha256')
    .update(
      JSON.stringify([
        row.source_event_sha256,
        row.event_name,
        row.action,
        row.session_sequence,
      ]),
    )
    .digest('hex')}`;
}

function receiptHash(
  row: Pick<OutboxRow, 'source_event_sha256'>,
  attempt: number,
  kind: string,
): string {
  return createHash('sha256')
    .update(JSON.stringify([row.source_event_sha256, attempt, kind]))
    .digest('hex');
}

/**
 * PostgreSQL projection and delivery ledger. Source facts remain authoritative;
 * this table contains only minimized observability state.
 */
export class PaymentChaosObservabilityStore {
  private readonly scopeHash: string;

  constructor(
    private readonly transaction: PaymentTransaction,
    private readonly caller: 'tandem-wordpress-live',
    scope: PaymentScope,
    private readonly vault: PaymentPayloadVault,
  ) {
    this.scopeHash = paymentScopeFingerprint(scope);
    if (
      typeof transaction !== 'function' ||
      caller !== 'tandem-wordpress-live' ||
      scope.provider !== 'adyen' ||
      scope.environment !== 'live' ||
      scope.store === null ||
      !(vault instanceof PaymentPayloadVault)
    )
      throw new PaymentDomainError('invalid_payment_chaos_configuration');
  }

  /** Project committed facts only. No external call occurs in this transaction. */
  async projectCommitted(limit: number): Promise<number> {
    ensure(
      Number.isInteger(limit) && limit >= 1 && limit <= 100,
      'invalid_payment_chaos_configuration',
    );
    return this.transaction(async (client) => {
      const projected = await client.query(
        `WITH eligible_attempts AS (
          SELECT a.* FROM business_v2.payment_attempts a
          JOIN business_v2.payment_checkout_admission_evidence c
            ON c.scope_sha256=a.scope_sha256 AND c.attempt_id=a.attempt_id
             AND c.caller=$2
          JOIN business_v2.payment_checkout_attribution_admissions x
            ON x.scope_sha256=c.scope_sha256 AND x.caller=c.caller
             AND x.attempt_id=c.attempt_id
          WHERE a.scope_sha256=$1
            AND a.contract->'quote'->>'offerKey'=$3
        ), candidates AS (
          SELECT a.attempt_id,'attempt'::text source_kind,
            a.attempt_id::text origin_reference,0 origin_version,
            'checkout_started'::text event_name,
            'attempt_accepted'::text action,'started'::text outcome,
            'none'::text reason_code,1 session_sequence,
            'signed_private_request'::text evidence_class,a.created_at occurred_at
          FROM eligible_attempts a
          UNION ALL
          SELECT o.attempt_id,'session_receipt',o.operation_id::text,r.version,
            'checkout_started',
            CASE WHEN r.kind='prepared' AND o.session_sequence>1 THEN 'retry_requested'
                 WHEN r.kind='prepared' THEN 'session_requested'
                 WHEN r.kind='session_available' THEN 'session_ready'
                 WHEN r.kind='unknown' THEN 'session_unknown'
                 ELSE 'session_failed' END,
            CASE WHEN r.kind='prepared' THEN 'started'
                 WHEN r.kind='session_available' THEN 'ready'
                 WHEN r.kind='unknown' THEN 'held' ELSE 'failed' END,
            CASE WHEN r.kind IN ('prepared','session_available') THEN 'none'
                 ELSE r.kind END,
            o.session_sequence,'signed_private_response',r.recorded_at
          FROM business_v2.payment_operation_receipts r
          JOIN business_v2.payment_operations o ON o.operation_id=r.operation_id
          JOIN eligible_attempts a ON a.attempt_id=o.attempt_id
          WHERE r.kind<>'claimed'
          UNION ALL
          SELECT t.attempt_id,'terminal_nonpayment',t.receipt_sha256,0,
            'checkout_started','terminal_nonpayment','failed',t.terminal_status,
            t.session_sequence,'authenticated_session_result',t.observed_at
          FROM business_v2.payment_session_terminal_nonpayment_receipts t
          JOIN eligible_attempts a ON a.attempt_id=t.attempt_id
          WHERE t.scope_sha256=$1
          UNION ALL
          SELECT e.attempt_id,'authorization',e.payload_sha256,0,
            'checkout_started',
            CASE WHEN e.fact->>'success'='true' THEN 'authorization_verified'
                 ELSE 'authorization_refused' END,
            CASE WHEN e.fact->>'success'='true' THEN 'held' ELSE 'failed' END,
            CASE WHEN e.fact->>'success'='true' THEN 'none' ELSE 'refused' END,
            e.session_sequence,'hmac_webhook',e.received_at
          FROM business_v2.payment_events e
          JOIN eligible_attempts a ON a.attempt_id=e.attempt_id
          WHERE e.scope_sha256=$1 AND e.fact->>'kind'='authorization'
          UNION ALL
          SELECT a.attempt_id,
            'payment_exception',x.exception_sha256,0,'checkout_started',
            'payment_needs_review','held',x.reason,1,'durable_exception',x.recorded_at
          FROM business_v2.payment_event_exceptions x
          JOIN eligible_attempts a
            ON a.attempt_id=COALESCE(x.attempt_id,x.related_attempt_id,x.attempt_hint)
          WHERE x.scope_sha256=$1
          UNION ALL
          SELECT a.attempt_id,
            'owned_event_exception',x.exception_sha256,0,
            'checkout_started','payment_needs_review','held',x.reason,1,
            'hmac_owned_exception',x.recorded_at
          FROM business_v2.payment_owned_event_exceptions x
          JOIN eligible_attempts a ON a.attempt_id=x.attempt_hint
          WHERE x.scope_sha256=$1
          UNION ALL
          SELECT x.attempt_id,'retry_exception',x.exception_sha256,0,
            'checkout_started','payment_needs_review','held',x.reason,
            x.session_sequence,'durable_retry_exception',x.recorded_at
          FROM business_v2.payment_session_retry_exceptions x
          JOIN eligible_attempts a ON a.attempt_id=x.attempt_id
          UNION ALL
          SELECT n.attempt_id,'enrollment_admission',n.admission_evidence_sha256,0,
            'purchase_completed','purchase_admitted','verified','none',
            COALESCE(e.session_sequence,1),'canonical_enrollment',
            to_timestamp(n.materialized_at/1000.0)
          FROM business_v2.payment_enrollment_admissions n
          JOIN eligible_attempts a ON a.attempt_id=n.attempt_id
          JOIN LATERAL (
            SELECT pe.session_sequence FROM business_v2.payment_events pe
            WHERE pe.scope_sha256=n.scope_sha256 AND pe.attempt_id=n.attempt_id
              AND pe.fact->>'kind'='authorization'
              AND pe.fact->>'success'='true'
            ORDER BY pe.received_at LIMIT 1
          ) e ON true
          WHERE n.scope_sha256=$1 AND n.state='provisional_materialized'
        ), selected AS (
          SELECT c.* FROM candidates c
          WHERE NOT EXISTS (
            SELECT 1 FROM business_v2.payment_chaos_observability_outbox o
            WHERE o.scope_sha256=$1 AND o.source_kind=c.source_kind
              AND o.origin_reference=c.origin_reference
              AND o.origin_version=c.origin_version
          )
          ORDER BY c.occurred_at,c.source_kind,c.origin_reference,c.origin_version
          LIMIT $4
        ), inserted AS (
          INSERT INTO business_v2.payment_chaos_observability_outbox
            (source_event_sha256,scope_sha256,attempt_id,source_kind,
             origin_reference,origin_version,event_name,action,outcome,
             reason_code,session_sequence,evidence_class,occurred_at)
          SELECT encode(sha256(convert_to(
              $1||'|'||source_kind||'|'||origin_reference||'|'||origin_version::text,
              'UTF8')),'hex'),$1,attempt_id,source_kind,origin_reference,
            origin_version,event_name,action,outcome,reason_code,
            session_sequence,evidence_class,occurred_at
          FROM selected
          ON CONFLICT(scope_sha256,source_kind,origin_reference,origin_version)
          DO NOTHING
          RETURNING id,source_event_sha256
        )
        INSERT INTO business_v2.payment_chaos_observability_receipts
          (receipt_sha256,outbox_id,attempt_number,kind,outcome_code)
        SELECT encode(sha256(convert_to(source_event_sha256||'|0|queued','UTF8')),'hex'),
          id,0,'queued','projected' FROM inserted
        RETURNING outbox_id`,
        [this.scopeHash, this.caller, PRODUCT_SLUG, limit],
      );
      return projected.rowCount ?? 0;
    });
  }

  async claim(limit: number): Promise<OutboxRow[]> {
    ensure(
      Number.isInteger(limit) && limit === 1,
      'invalid_payment_chaos_configuration',
    );
    return this.transaction(async (client) => {
      const leaseToken = randomUUID();
      const expired = await client.query<OutboxRow>(
        `UPDATE business_v2.payment_chaos_observability_outbox
         SET status='dead_lettered',lease_token=NULL,lease_until=NULL,
           last_error_code='timeout',version=version+1
         WHERE scope_sha256=$1 AND status='in_flight' AND attempts>=$2
           AND lease_until<clock_timestamp()
         RETURNING id::int,source_event_sha256,scope_sha256,
           attempts,''::text lease_token`,
        [this.scopeHash, MAX_ATTEMPTS],
      );
      for (const row of expired.rows)
        await this.receipt(client, row, row.attempts, 'failed', 'timeout');
      const rows = await client.query<OutboxRow>(
        `SELECT id::int,source_event_sha256,scope_sha256,attempt_id::text,event_name,action,
          outcome,reason_code,session_sequence,evidence_class,occurred_at::text,
          attempts,$3::text lease_token
        FROM business_v2.payment_chaos_observability_outbox
        WHERE scope_sha256=$1 AND attempts<$2 AND ((status IN ('pending','failed')
          AND next_attempt_at<=clock_timestamp())
          OR (status='in_flight' AND lease_until<clock_timestamp()))
        ORDER BY occurred_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [this.scopeHash, MAX_ATTEMPTS, leaseToken],
      );
      for (const row of rows.rows) {
        const attempt = row.attempts + 1;
        await client.query(
          `UPDATE business_v2.payment_chaos_observability_outbox
           SET status='in_flight',attempts=$2,lease_token=$3,
             lease_until=clock_timestamp()+interval '2 minutes',
             last_attempted_at=clock_timestamp(),version=version+1
           WHERE id=$1 AND scope_sha256=$4`,
          [row.id, attempt, leaseToken, this.scopeHash],
        );
        await this.receipt(client, row, attempt, 'claimed', 'claimed');
        row.attempts = attempt;
      }
      return rows.rows;
    });
  }

  private async receipt(
    client: PoolClient,
    row: Pick<OutboxRow, 'id' | 'source_event_sha256'>,
    attempt: number,
    kind: 'claimed' | 'accepted' | 'failed' | 'suppressed',
    outcome: string,
    httpStatus: number | null = null,
  ): Promise<void> {
    await client.query(
      `INSERT INTO business_v2.payment_chaos_observability_receipts
       (receipt_sha256,outbox_id,attempt_number,kind,outcome_code,http_status)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(receipt_sha256) DO NOTHING`,
      [
        receiptHash(row, attempt, kind),
        row.id,
        attempt,
        kind,
        outcome,
        httpStatus,
      ],
    );
  }

  private async attributionAuthority(
    client: PoolClient,
    attemptId: string,
  ): Promise<{ consent: 'granted' | 'denied' | 'unknown'; email: string }> {
    const result = await client.query<AttributionAuthorityRow>(
      `SELECT a.attempt_id::text,a.snapshot_id::text,a.snapshot_sha256,
        a.binding_reference,a.binding_sha256,a.encrypted_snapshot,
        a.encrypted_binding,p.primary_email::text payer_email
       FROM business_v2.payment_checkout_attribution_admissions a
       JOIN business_v2.payment_checkout_admission_evidence c
         ON c.scope_sha256=a.scope_sha256 AND c.caller=a.caller
           AND c.attempt_id=a.attempt_id
       JOIN business_v2.payment_identity_preparations i
         ON i.caller=c.caller AND i.preparation_id=c.identity_preparation_id
       JOIN business_v2.parties p
         ON p.id=business_v2.canonical_party_id(i.payer_party_id)
          AND p.merged_into IS NULL
       WHERE a.scope_sha256=$1 AND a.caller=$2 AND a.attempt_id=$3`,
      [this.scopeHash, this.caller, attemptId],
    );
    ensure(result.rowCount === 1, 'payment_chaos_authority_unavailable');
    const row = result.rows[0];
    const aad = [
      'checkout-attribution-v1',
      this.scopeHash,
      this.caller,
      row.attempt_id,
      row.snapshot_id,
      row.binding_reference,
    ].join(':');
    const snapshotJson = this.vault.open(
      row.encrypted_snapshot,
      `${aad}:snapshot`,
    );
    const bindingJson = this.vault.open(
      row.encrypted_binding,
      `${aad}:binding`,
    );
    const handoff: CheckoutAttributionHandoff = {
      snapshotId: row.snapshot_id,
      snapshotSha256: row.snapshot_sha256,
      snapshotJsonBase64: Buffer.from(snapshotJson).toString('base64'),
      bindingReference: row.binding_reference,
      bindingSha256: row.binding_sha256,
      bindingJsonBase64: Buffer.from(bindingJson).toString('base64'),
    };
    const parsed = parseCheckoutAttributionHandoff(handoff);
    return {
      consent: parsed.snapshot.trackingConsent.state,
      email: row.payer_email,
    };
  }

  async deliveryAuthority(
    row: OutboxRow,
    identityHmacSecret: string,
  ): Promise<
    { state: 'send'; personKey: string } | { state: 'suppress'; reason: string }
  > {
    if (!row.attempt_id)
      return { state: 'suppress', reason: 'identity_unavailable' };
    return this.transaction(async (client) => {
      const authority = await this.attributionAuthority(
        client,
        row.attempt_id!,
      );
      if (authority.consent !== 'granted')
        return {
          state: 'suppress' as const,
          reason: `tracking_consent_${authority.consent}`,
        };
      return {
        state: 'send' as const,
        personKey: chaosPersonKey(authority.email, identityHmacSecret),
      };
    });
  }

  async markAccepted(row: OutboxRow, httpStatus: number): Promise<void> {
    await this.finish(row, 'accepted', 'accepted', httpStatus);
  }

  async markSuppressed(row: OutboxRow, reason: string): Promise<void> {
    await this.finish(row, 'suppressed', reason, null);
  }

  async markFailed(
    row: OutboxRow,
    reason:
      | 'transport_error'
      | 'timeout'
      | 'http_4xx'
      | 'http_5xx'
      | 'invalid_response'
      | 'authority_unavailable',
    httpStatus: number | null,
  ): Promise<boolean> {
    const dead = row.attempts >= MAX_ATTEMPTS;
    await this.transaction(async (client) => {
      const updated = await client.query(
        `UPDATE business_v2.payment_chaos_observability_outbox
         SET status=$4,last_error_code=$5,last_http_status=$6,
           next_attempt_at=clock_timestamp()+($7::int*interval '1 second'),
           lease_token=NULL,lease_until=NULL,version=version+1
         WHERE id=$1 AND status='in_flight' AND lease_token=$2
           AND source_event_sha256=$3 AND scope_sha256=$8`,
        [
          row.id,
          row.lease_token,
          row.source_event_sha256,
          dead ? 'dead_lettered' : 'failed',
          reason,
          httpStatus,
          Math.min(21600, 60 * 2 ** Math.min(row.attempts, 8)),
          this.scopeHash,
        ],
      );
      ensure(updated.rowCount === 1, 'payment_chaos_lease_lost');
      await this.receipt(
        client,
        row,
        row.attempts,
        'failed',
        reason,
        httpStatus,
      );
    });
    return dead;
  }

  private async finish(
    row: OutboxRow,
    status: 'accepted' | 'suppressed',
    outcome: string,
    httpStatus: number | null,
  ): Promise<void> {
    await this.transaction(async (client) => {
      const updated = await client.query(
        `UPDATE business_v2.payment_chaos_observability_outbox
         SET status=$4,accepted_at=CASE WHEN $4='accepted' THEN clock_timestamp() ELSE NULL END,
           last_http_status=$5,last_error_code=NULL,lease_token=NULL,lease_until=NULL,
           version=version+1
         WHERE id=$1 AND status='in_flight' AND lease_token=$2
           AND source_event_sha256=$3 AND scope_sha256=$6`,
        [
          row.id,
          row.lease_token,
          row.source_event_sha256,
          status,
          httpStatus,
          this.scopeHash,
        ],
      );
      ensure(updated.rowCount === 1, 'payment_chaos_lease_lost');
      await this.receipt(
        client,
        row,
        row.attempts,
        status,
        outcome,
        httpStatus,
      );
    });
  }
}

export class PaymentChaosObservabilityWorker {
  private timer: NodeJS.Timeout | null = null;
  private active: Promise<PaymentChaosRunResult> | null = null;
  private readonly endpoint: string;

  constructor(
    private readonly store: PaymentChaosObservabilityStore,
    private readonly config: PaymentChaosObservabilityConfig,
    private readonly transport: typeof fetch = fetch,
  ) {
    this.endpoint = canonicalEndpoint(config.endpoint);
    if (
      config.environment !== 'live' ||
      config.webhookToken.length < 32 ||
      config.identityHmacSecret.length < 32 ||
      createHash('sha256').update(config.webhookToken).digest('hex') ===
        createHash('sha256').update(config.identityHmacSecret).digest('hex') ||
      !Number.isInteger(config.batchSize) ||
      config.batchSize < 1 ||
      config.batchSize > 100 ||
      !Number.isInteger(config.pollIntervalMs) ||
      config.pollIntervalMs < 1000 ||
      config.pollIntervalMs > 60000
    )
      throw new PaymentDomainError('invalid_payment_chaos_configuration');
  }

  async drainOnce(): Promise<PaymentChaosRunResult> {
    if (this.active) return this.active;
    const run = async (): Promise<PaymentChaosRunResult> => {
      const result: PaymentChaosRunResult = {
        projected: await this.store.projectCommitted(this.config.batchSize),
        processed: 0,
        accepted: 0,
        suppressed: 0,
        retried: 0,
        deadLettered: 0,
      };
      for (let index = 0; index < this.config.batchSize; index += 1) {
        const rows = await this.store.claim(1);
        const row = rows[0];
        if (!row) break;
        result.processed += 1;
        let authority:
          | { state: 'send'; personKey: string }
          | { state: 'suppress'; reason: string };
        try {
          authority = await this.store.deliveryAuthority(
            row,
            this.config.identityHmacSecret,
          );
        } catch {
          const dead = await this.store.markFailed(
            row,
            'authority_unavailable',
            null,
          );
          if (dead) result.deadLettered += 1;
          else result.retried += 1;
          continue;
        }
        if (authority.state === 'suppress') {
          await this.store.markSuppressed(row, authority.reason);
          result.suppressed += 1;
          continue;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const response = await this.transport(this.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Chaos-Token': this.config.webhookToken,
            },
            body: JSON.stringify({
              event_name: row.event_name,
              source_system: SOURCE_SYSTEM,
              source_event_id: sourceEventId(row),
              occurred_at: row.occurred_at,
              identity: { person_key: authority.personKey },
              program: PROGRAM,
              product_slug: PRODUCT_SLUG,
              properties: {
                payment_provider: 'adyen',
                environment: 'live',
                payment_action: row.action,
                payment_outcome: row.outcome,
                reason_code: row.reason_code,
                sequence: row.session_sequence === 1 ? 'initial' : 'retry',
                evidence_class: row.evidence_class,
                ...(row.event_name === 'purchase_completed'
                  ? {
                      authorization_state: 'verified',
                      enrollment_state: 'admitted',
                      settlement_state: 'unproven',
                    }
                  : {}),
              },
            }),
            redirect: 'error',
            signal: controller.signal,
          });
          const responseBody = (await response.json().catch(() => null)) as {
            status?: unknown;
          } | null;
          if (
            response.ok &&
            ['recorded', 'duplicate'].includes(String(responseBody?.status))
          ) {
            await this.store.markAccepted(row, response.status);
            result.accepted += 1;
          } else {
            const reason = !response.ok
              ? response.status >= 500
                ? 'http_5xx'
                : 'http_4xx'
              : 'invalid_response';
            const dead = await this.store.markFailed(
              row,
              reason,
              response.status,
            );
            if (dead) result.deadLettered += 1;
            else result.retried += 1;
          }
        } catch (error) {
          const dead = await this.store.markFailed(
            row,
            error instanceof Error && error.name === 'AbortError'
              ? 'timeout'
              : 'transport_error',
            null,
          );
          if (dead) result.deadLettered += 1;
          else result.retried += 1;
        } finally {
          clearTimeout(timer);
        }
      }
      return result;
    };
    this.active = run().finally(() => {
      this.active = null;
    });
    return this.active;
  }

  start(): void {
    if (this.timer)
      throw new PaymentDomainError('invalid_payment_chaos_configuration');
    this.timer = setInterval(
      () => void this.drainOnce().catch(() => undefined),
      this.config.pollIntervalMs,
    );
    this.timer.unref();
    void this.drainOnce().catch(() => undefined);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.active;
  }
}
