import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';

const uuid = z.uuid();
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.iso.datetime({ offset: true });
const money = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const obligationSchema = z
  .object({
    obligationId: uuid,
    ordinal: z.number().int().min(1).max(24),
    amountCents: money,
    currency: z.string().regex(/^[A-Z]{3}$/),
    dueAt: instant,
  })
  .strict();
const contractSchema = z
  .object({
    schemaVersion: z.literal(1),
    contractId: uuid,
    billingPrincipalId: uuid,
    productId: z.string().regex(/^[a-z0-9-]{1,100}$/),
    paymentOptionId: z.string().min(2).max(100),
    kind: z.literal('finite_installments'),
    cadence: z.enum(['monthly', 'quarterly', 'annual']),
    timezone: z.literal('America/Chicago'),
    count: z.number().int().min(2).max(24),
    totalCents: money,
    currency: z.string().regex(/^[A-Z]{3}$/),
    acceptedAt: instant,
    obligations: z.array(obligationSchema).min(2).max(24),
    scheduleSha256: sha,
    disclosure: z.string().min(40).max(4000),
    disclosureSha256: sha,
    selectionMethod: z.literal('payment_option_and_submit'),
  })
  .strict();
export const finiteBillingActivationSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('activation'),
    deliveryId: uuid,
    sentAt: instant,
    environment: z.enum(['test', 'live']),
    contract: contractSchema,
    binding: z
      .object({
        bindingId: uuid,
        state: z.literal('active'),
        evidenceSha256: sha,
        brand: z.string().max(40).nullable(),
        lastFour: z
          .string()
          .regex(/^\d{4}$/)
          .nullable(),
      })
      .strict(),
    firstPayment: z
      .object({
        submissionId: uuid,
        orderId: uuid,
        pspReference: z.string().min(1).max(100),
        amountCents: money,
        currency: z.string().regex(/^[A-Z]{3}$/),
        paidAt: instant,
      })
      .strict(),
  })
  .strict();
export type FiniteBillingActivation = z.infer<
  typeof finiteBillingActivationSchema
>;
export const finiteBillingPaidSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('payment_paid'),
    deliveryId: uuid,
    sentAt: instant,
    environment: z.enum(['test', 'live']),
    contractId: uuid,
    obligationId: uuid,
    attemptId: uuid,
    pspReference: z.string().min(1).max(100),
    amountCents: money,
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();
export type FiniteBillingPaid = z.infer<typeof finiteBillingPaidSchema>;
export type FiniteBillingRelay = FiniteBillingActivation | FiniteBillingPaid;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
function digest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
function ensure(value: boolean, code: string): asserts value {
  if (!value) throw new Error(code);
}

export function validateFiniteBillingActivation(
  input: unknown,
): FiniteBillingActivation {
  const parsed = finiteBillingActivationSchema.parse(input);
  const c = parsed.contract;
  ensure(c.obligations.length === c.count, 'finite_billing_count_mismatch');
  ensure(
    c.obligations.every(
      (o, i) => o.ordinal === i + 1 && o.currency === c.currency,
    ),
    'finite_billing_obligation_mismatch',
  );
  ensure(
    new Set(c.obligations.map((o) => o.obligationId)).size === c.count,
    'finite_billing_obligation_mismatch',
  );
  ensure(
    c.obligations.reduce((sum, o) => sum + o.amountCents, 0) === c.totalCents,
    'finite_billing_amount_mismatch',
  );
  ensure(
    c.obligations.every(
      (o, i) =>
        i === 0 || Date.parse(o.dueAt) > Date.parse(c.obligations[i - 1].dueAt),
    ),
    'finite_billing_due_order_invalid',
  );
  const {
    scheduleSha256,
    disclosure,
    disclosureSha256,
    selectionMethod,
    ...schedule
  } = c;
  ensure(
    digest(schedule) === scheduleSha256,
    'finite_billing_schedule_conflict',
  );
  ensure(
    createHash('sha256').update(disclosure).digest('hex') === disclosureSha256,
    'finite_billing_consent_conflict',
  );
  ensure(
    parsed.firstPayment.amountCents === c.obligations[0].amountCents &&
      parsed.firstPayment.currency === c.currency,
    'finite_billing_first_payment_conflict',
  );
  return parsed;
}

export function verifyFiniteBillingRelay(input: {
  rawBody: Buffer;
  signature: string | string[] | undefined;
  secret: string;
  now?: number;
}): FiniteBillingRelay {
  ensure(
    input.rawBody.length <= 64 * 1024 &&
      input.secret.length >= 32 &&
      typeof input.signature === 'string' &&
      /^[a-f0-9]{64}$/.test(input.signature),
    'finite_billing_signature_invalid',
  );
  const expected = createHmac('sha256', input.secret)
    .update(
      `tandem-commerce-billing-v1\n${createHash('sha256').update(input.rawBody).digest('hex')}`,
    )
    .digest();
  ensure(
    timingSafeEqual(expected, Buffer.from(input.signature, 'hex')),
    'finite_billing_signature_invalid',
  );
  const raw = JSON.parse(input.rawBody.toString('utf8'));
  const parsed =
    raw?.kind === 'activation'
      ? validateFiniteBillingActivation(raw)
      : finiteBillingPaidSchema.parse(raw);
  ensure(
    Math.abs((input.now ?? Date.now()) - Date.parse(parsed.sentAt)) <=
      5 * 60 * 1000,
    'finite_billing_delivery_expired',
  );
  return parsed;
}

export type BillingTransaction = <T>(
  fn: (client: PoolClient) => Promise<T>,
) => Promise<T>;
export interface FiniteChargeCommand {
  schemaVersion: 1;
  commandId: string;
  contractId: string;
  obligationId: string;
  bindingId: string;
  ordinal: number;
  count: number;
  amountCents: number;
  currency: string;
  attemptOrdinal: 0;
  idempotencyKey: string;
  expiresAt: string;
}

export class FiniteBillingStore {
  constructor(private transaction: BillingTransaction) {}
  async activate(
    input: FiniteBillingActivation,
  ): Promise<{ contractId: string; replay: boolean }> {
    const a = validateFiniteBillingActivation(input);
    const c = a.contract;
    return this.transaction(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`finite-billing:${c.contractId}`],
      );
      const prior = await client.query<{
        schedule_sha256: string;
        binding_evidence_sha256: string;
      }>(
        'SELECT schedule_sha256,binding_evidence_sha256 FROM business_v2.finite_billing_contracts WHERE contract_id=$1',
        [c.contractId],
      );
      if (prior.rowCount) {
        ensure(
          prior.rows[0].schedule_sha256 === c.scheduleSha256 &&
            prior.rows[0].binding_evidence_sha256 === a.binding.evidenceSha256,
          'finite_billing_activation_conflict',
        );
        return { contractId: c.contractId, replay: true };
      }
      await client.query(
        `INSERT INTO business_v2.finite_billing_contracts(contract_id,environment,billing_principal_id,commerce_binding_id,product_id,cadence,timezone,obligation_count,total_cents,currency,schedule_sha256,consent_sha256,binding_evidence_sha256,first_submission_id,first_order_id,first_psp_reference,state,activated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'active',$17)`,
        [
          c.contractId,
          a.environment,
          c.billingPrincipalId,
          a.binding.bindingId,
          c.productId,
          c.cadence,
          c.timezone,
          c.count,
          c.totalCents,
          c.currency,
          c.scheduleSha256,
          c.disclosureSha256,
          a.binding.evidenceSha256,
          a.firstPayment.submissionId,
          a.firstPayment.orderId,
          a.firstPayment.pspReference,
          a.firstPayment.paidAt,
        ],
      );
      for (const o of c.obligations)
        await client.query(
          `INSERT INTO business_v2.finite_billing_obligations(obligation_id,contract_id,ordinal,due_at,amount_cents,currency,state,paid_psp_reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            o.obligationId,
            c.contractId,
            o.ordinal,
            o.dueAt,
            o.amountCents,
            o.currency,
            o.ordinal === 1 ? 'paid' : 'scheduled',
            o.ordinal === 1 ? a.firstPayment.pspReference : null,
          ],
        );
      await client.query(
        `INSERT INTO business_v2.finite_billing_receipts(receipt_sha256,contract_id,obligation_id,kind,source_id) VALUES($1,$2,$3,'activated',$4)`,
        [
          digest(['activated', a.deliveryId, c.contractId]),
          c.contractId,
          c.obligations[0].obligationId,
          a.deliveryId,
        ],
      );
      return { contractId: c.contractId, replay: false };
    });
  }

  async accept(
    input: FiniteBillingRelay,
  ): Promise<{ contractId: string; replay: boolean }> {
    if (input.kind === 'activation') return this.activate(input);
    const result = await this.applyPaidFact({
      contractId: input.contractId,
      obligationId: input.obligationId,
      attemptId: input.attemptId,
      pspReference: input.pspReference,
      sourceId: input.deliveryId,
      amountCents: input.amountCents,
      currency: input.currency,
    });
    return { contractId: input.contractId, replay: result.replay };
  }
  async claimDue(now = new Date()): Promise<FiniteChargeCommand | null> {
    return this.transaction(async (client) => {
      const due = await client.query<any>(
        `SELECT o.*,c.commerce_binding_id,c.obligation_count FROM business_v2.finite_billing_obligations o JOIN business_v2.finite_billing_contracts c ON c.contract_id=o.contract_id WHERE c.state='active' AND o.state='scheduled' AND o.due_at<=$1 AND NOT EXISTS(SELECT 1 FROM business_v2.finite_billing_obligations p WHERE p.contract_id=o.contract_id AND p.ordinal<o.ordinal AND p.state<>'paid') ORDER BY o.due_at,o.contract_id,o.ordinal FOR UPDATE OF o SKIP LOCKED LIMIT 1`,
        [now.toISOString()],
      );
      if (!due.rowCount) return null;
      const o = due.rows[0];
      const attemptId = randomUUID();
      const lease = randomUUID();
      const command: FiniteChargeCommand = {
        schemaVersion: 1,
        commandId: attemptId,
        contractId: o.contract_id,
        obligationId: o.obligation_id,
        bindingId: o.commerce_binding_id,
        ordinal: Number(o.ordinal),
        count: Number(o.obligation_count),
        amountCents: Number(o.amount_cents),
        currency: o.currency,
        attemptOrdinal: 0,
        idempotencyKey: createHash('sha256')
          .update(`finite-billing-v1:${o.contract_id}:${o.obligation_id}:0`)
          .digest('base64url')
          .slice(0, 64),
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
      };
      await client.query(
        `INSERT INTO business_v2.finite_billing_attempts(attempt_id,obligation_id,idempotency_key,command_sha256,state) VALUES($1,$2,$3,$4,'prepared')`,
        [attemptId, o.obligation_id, command.idempotencyKey, digest(command)],
      );
      await client.query(
        `UPDATE business_v2.finite_billing_obligations SET state='claimed',lease_token=$2,lease_until=$3,version=version+1,updated_at=clock_timestamp() WHERE obligation_id=$1`,
        [
          o.obligation_id,
          lease,
          new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
        ],
      );
      await client.query(
        `INSERT INTO business_v2.finite_billing_receipts(receipt_sha256,contract_id,obligation_id,attempt_id,kind,source_id) VALUES($1,$2,$3,$4,'claimed',$4)`,
        [
          digest(['claimed', attemptId]),
          o.contract_id,
          o.obligation_id,
          attemptId,
        ],
      );
      return command;
    });
  }
  async recordDispatch(
    command: FiniteChargeCommand,
    result: 'accepted' | 'unknown' | 'rejected',
  ): Promise<void> {
    await this.transaction(async (client) => {
      const attempt = await client.query<any>(
        'SELECT a.*,o.contract_id FROM business_v2.finite_billing_attempts a JOIN business_v2.finite_billing_obligations o ON o.obligation_id=a.obligation_id WHERE a.attempt_id=$1 FOR UPDATE',
        [command.commandId],
      );
      ensure(
        attempt.rowCount === 1 &&
          attempt.rows[0].command_sha256 === digest(command),
        'finite_billing_attempt_conflict',
      );
      const state =
        result === 'accepted'
          ? 'awaiting_provider'
          : result === 'unknown'
            ? 'dispatch_unknown'
            : 'customer_action';
      await client.query(
        'UPDATE business_v2.finite_billing_attempts SET state=$2,updated_at=clock_timestamp() WHERE attempt_id=$1',
        [command.commandId, state],
      );
      await client.query(
        'UPDATE business_v2.finite_billing_obligations SET state=$2,lease_token=NULL,lease_until=NULL,version=version+1,updated_at=clock_timestamp() WHERE obligation_id=$1',
        [
          command.obligationId,
          result === 'rejected' ? 'customer_action' : state,
        ],
      );
      if (result === 'rejected')
        await client.query(
          "UPDATE business_v2.finite_billing_contracts SET state='customer_action',version=version+1,updated_at=clock_timestamp() WHERE contract_id=$1",
          [command.contractId],
        );
      if (result === 'rejected')
        await client.query(
          `INSERT INTO business_v2.finite_billing_recovery_requests(request_id,contract_id,obligation_id,attempt_id,amount_cents,currency,state,source_id)
           VALUES($1,$2,$3,$4,$5,$6,'required',$4) ON CONFLICT(obligation_id) DO NOTHING`,
          [
            randomUUID(),
            command.contractId,
            command.obligationId,
            command.commandId,
            command.amountCents,
            command.currency,
          ],
        );
      await client.query(
        `INSERT INTO business_v2.finite_billing_receipts(receipt_sha256,contract_id,obligation_id,attempt_id,kind,source_id) VALUES($1,$2,$3,$4,$5,$4) ON CONFLICT DO NOTHING`,
        [
          digest([state, command.commandId]),
          command.contractId,
          command.obligationId,
          command.commandId,
          result === 'accepted'
            ? 'dispatch_accepted'
            : result === 'unknown'
              ? 'dispatch_unknown'
              : 'customer_action',
        ],
      );
    });
  }

  async applyPaidFact(input: {
    contractId: string;
    obligationId: string;
    attemptId: string;
    pspReference: string;
    sourceId: string;
    amountCents: number;
    currency: string;
  }): Promise<{ state: 'paid' | 'completed'; replay: boolean }> {
    uuid.parse(input.contractId);
    uuid.parse(input.obligationId);
    uuid.parse(input.attemptId);
    ensure(
      /^[A-Za-z0-9_.:-]{1,100}$/.test(input.pspReference) &&
        /^[A-Za-z0-9_.:-]{1,200}$/.test(input.sourceId) &&
        Number.isSafeInteger(input.amountCents) &&
        input.amountCents > 0 &&
        /^[A-Z]{3}$/.test(input.currency),
      'finite_billing_payment_fact_invalid',
    );
    return this.transaction(async (client) => {
      const row = await client.query<any>(
        `SELECT o.*,a.state attempt_state
           FROM business_v2.finite_billing_obligations o
           JOIN business_v2.finite_billing_attempts a
             ON a.obligation_id=o.obligation_id AND a.attempt_id=$3
          WHERE o.contract_id=$1 AND o.obligation_id=$2 FOR UPDATE`,
        [input.contractId, input.obligationId, input.attemptId],
      );
      ensure(
        row.rowCount === 1 &&
          Number(row.rows[0].amount_cents) === input.amountCents &&
          row.rows[0].currency === input.currency,
        'finite_billing_payment_fact_conflict',
      );
      if (row.rows[0].state === 'paid') {
        ensure(
          row.rows[0].paid_psp_reference === input.pspReference,
          'finite_billing_payment_fact_conflict',
        );
        return { state: 'paid', replay: true };
      }
      ensure(
        ['awaiting_provider', 'claimed'].includes(row.rows[0].state),
        'finite_billing_payment_fact_conflict',
      );
      await client.query(
        "UPDATE business_v2.finite_billing_attempts SET state='paid',provider_reference=$2,updated_at=clock_timestamp() WHERE attempt_id=$1",
        [input.attemptId, input.pspReference],
      );
      await client.query(
        "UPDATE business_v2.finite_billing_obligations SET state='paid',paid_psp_reference=$2,lease_token=NULL,lease_until=NULL,version=version+1,updated_at=clock_timestamp() WHERE obligation_id=$1",
        [input.obligationId, input.pspReference],
      );
      const open = await client.query<{ count: number }>(
        "SELECT count(*)::int count FROM business_v2.finite_billing_obligations WHERE contract_id=$1 AND state<>'paid'",
        [input.contractId],
      );
      const complete = Number(open.rows[0].count) === 0;
      await client.query(
        'UPDATE business_v2.finite_billing_contracts SET state=$2,version=version+1,updated_at=clock_timestamp() WHERE contract_id=$1',
        [input.contractId, complete ? 'completed' : 'active'],
      );
      await client.query(
        "UPDATE business_v2.finite_billing_recovery_requests SET state='paid',updated_at=clock_timestamp() WHERE obligation_id=$1 AND state IN ('required','prepared')",
        [input.obligationId],
      );
      await client.query(
        'INSERT INTO business_v2.finite_billing_receipts(receipt_sha256,contract_id,obligation_id,attempt_id,kind,source_id) VALUES($1,$2,$3,$4,$5,$6)',
        [
          digest(['paid', input.sourceId, input.pspReference]),
          input.contractId,
          input.obligationId,
          input.attemptId,
          complete ? 'completed' : 'paid',
          input.sourceId,
        ],
      );
      return { state: complete ? 'completed' : 'paid', replay: false };
    });
  }
}

export async function runFiniteBillingSweep(input: {
  store: FiniteBillingStore;
  charge: (
    command: FiniteChargeCommand,
  ) => Promise<'accepted' | 'unknown' | 'rejected'>;
  now?: Date;
}) {
  const command = await input.store.claimDue(input.now ?? new Date());
  if (!command) return { state: 'idle' as const };
  let result: 'accepted' | 'unknown' | 'rejected' = 'unknown';
  try {
    result = await input.charge(command);
  } catch {
    result = 'unknown';
  }
  await input.store.recordDispatch(command, result);
  return { state: result, command };
}

export function finiteBillingChargeClient(config: {
  url: string;
  secret: string;
  fetchImpl?: typeof fetch;
}) {
  ensure(
    /^https:\/\//.test(config.url) && config.secret.length >= 32,
    'finite_billing_charge_config_invalid',
  );
  const transport = config.fetchImpl ?? fetch;
  return async (
    command: FiniteChargeCommand,
  ): Promise<'accepted' | 'unknown' | 'rejected'> => {
    const body = JSON.stringify(command);
    const signature = createHmac('sha256', config.secret)
      .update(
        `tandem-billing-command-v1\n${createHash('sha256').update(body).digest('hex')}`,
      )
      .digest('hex');
    let response: Response;
    try {
      response = await transport(config.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tandem-billing-signature': signature,
        },
        body,
        redirect: 'error',
      });
    } catch {
      return 'unknown';
    }
    const payload = (await response.json().catch(() => null)) as {
      accepted?: boolean;
    } | null;
    if (response.status >= 500 || response.status === 429) return 'unknown';
    if (!response.ok || payload?.accepted !== true) return 'rejected';
    return 'accepted';
  };
}
