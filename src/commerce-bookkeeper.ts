import { spawn } from 'child_process';
import crypto from 'crypto';
import path from 'path';

import { DATA_DIR } from './config.js';
import { readEnvFile } from './env.js';

export const COMMERCE_BOOKKEEPER_MAX_BODY_BYTES = 64 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const CODE_ROOT = process.env.NANOCLAW_CODE_ROOT || process.cwd();
const SCRIPT = path.resolve(
  CODE_ROOT,
  'tools/contador/process-commerce-payment.cjs',
);
const SA_JSON = path.join(
  DATA_DIR,
  'service-accounts',
  'sheets-service-account.json',
);
const PSQL_DIR = '/opt/homebrew/opt/postgresql@16/bin';

export class CommerceBookkeeperRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'CommerceBookkeeperRequestError';
  }
}

export interface CommerceBookkeeperEnvelope {
  schemaVersion: 1;
  deliveryId: string;
  sentAt: string;
  environment: 'test' | 'live';
  deliveryKind: 'payment' | 'refund' | 'fee_reconciliation';
  economics: null | {
    feeBasis: 'adyen_detailed' | 'zentact_settled';
    providerFeeCents: number;
    periFeeCents: number;
  };
  notification: {
    pspReference: string;
    originalReference?: string;
    merchantReference: string;
    merchantAccountCode: string;
    eventCode: 'AUTHORISATION' | 'REFUND';
    eventDate: string;
    success: 'true';
    amount: { value: number; currency: 'USD' };
    additionalData: Record<string, unknown>;
  };
  order: {
    orderId: string;
    merchantReference: string;
    productId: string;
    productName: string;
    amountCents: number;
    currency: 'USD';
    rosterPolicy: 'catalog' | 'none';
    payer: { firstName: string; lastName: string; email: string };
    learner: { firstName: string; lastName: string; email: string };
    purchaseRelationship: 'self' | 'other';
    cohort: null | {
      key: string;
      program: 'acc' | 'pcc' | 'actc';
      module: number;
      enrollmentScope: 'module' | 'full_program';
      start: string;
      end: string;
      label: string;
      range: string;
      time: string;
      timezone: 'America/New_York';
      sessions: string[];
      rosterValue: string;
    };
  };
  refund: null | {
    refundId: string;
    requestReference: string;
    paymentPspReference: string;
    refundPspReference: string;
    amountCents: number;
    cumulativeRefundedCents: number;
    remainingPaidCents: number;
  };
}

export interface CommerceBookkeeperResult {
  deliveryId: string;
  provider: 'adyen';
  providerPaymentId: string;
  paymentLogVerified: boolean;
  studentRosterVerified: boolean;
  postgresVerified: boolean;
  officialRecordSuppressed: boolean;
  feeReconciliationVerified: boolean;
  summary: string;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CommerceBookkeeperRequestError(`${label} invalid`, 422);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 254): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > max) {
    throw new CommerceBookkeeperRequestError(`${label} invalid`, 422);
  }
  return result;
}

function person(value: unknown, label: string) {
  const p = object(value, label);
  const email = text(p.email, `${label}.email`).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CommerceBookkeeperRequestError(`${label}.email invalid`, 422);
  }
  return {
    firstName: text(p.firstName, `${label}.firstName`, 100),
    lastName: text(p.lastName, `${label}.lastName`, 100),
    email,
  };
}

function economics(
  value: unknown,
  amountCents: number,
): CommerceBookkeeperEnvelope['economics'] {
  if (value === null || value === undefined) return null;
  const input = object(value, 'economics');
  const feeBasis = text(input.feeBasis, 'economics.feeBasis', 32);
  const providerFeeCents = Number(input.providerFeeCents);
  const periFeeCents = Number(input.periFeeCents);
  if (
    !['adyen_detailed', 'zentact_settled'].includes(feeBasis) ||
    !Number.isSafeInteger(providerFeeCents) ||
    providerFeeCents < 0 ||
    !Number.isSafeInteger(periFeeCents) ||
    periFeeCents < 0 ||
    providerFeeCents + periFeeCents > amountCents
  ) {
    throw new CommerceBookkeeperRequestError('economics invalid', 422);
  }
  return {
    feeBasis: feeBasis as 'adyen_detailed' | 'zentact_settled',
    providerFeeCents,
    periFeeCents,
  };
}

function cohort(value: unknown): CommerceBookkeeperEnvelope['order']['cohort'] {
  if (value === null || value === undefined) return null;
  const c = object(value, 'order.cohort');
  const program = text(c.program, 'order.cohort.program', 4);
  const module = Number(c.module);
  const scope = text(c.enrollmentScope, 'order.cohort.enrollmentScope', 20);
  const key = text(c.key, 'order.cohort.key', 40);
  const start = text(c.start, 'order.cohort.start', 40);
  const end = text(c.end, 'order.cohort.end', 40);
  const label = text(c.label, 'order.cohort.label', 80);
  const range = text(c.range, 'order.cohort.range', 120);
  const time = text(c.time, 'order.cohort.time', 120);
  const timezone = text(c.timezone, 'order.cohort.timezone', 40);
  const rosterValue = text(c.rosterValue, 'order.cohort.rosterValue', 200);
  const rosterValueValid =
    program === 'acc'
      ? /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(rosterValue)
      : rosterValue === `${label} — ${range}`;
  const sessions = Array.isArray(c.sessions)
    ? c.sessions.map((item, index) =>
        text(item, `order.cohort.sessions.${index}`, 40),
      )
    : [];
  const iso = /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;
  if (
    !['acc', 'pcc', 'actc'].includes(program) ||
    !Number.isInteger(module) ||
    module < 1 ||
    module > 4 ||
    !['module', 'full_program'].includes(scope) ||
    !new RegExp(`^${program}-m${module}-[a-f0-9]{24}$`).test(key) ||
    !iso.test(start) ||
    !iso.test(end) ||
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(end) <= Date.parse(start) ||
    timezone !== 'America/New_York' ||
    sessions.length !== 4 ||
    sessions.some(
      (item) => !iso.test(item) || !Number.isFinite(Date.parse(item)),
    ) ||
    !rosterValueValid
  ) {
    throw new CommerceBookkeeperRequestError('order.cohort invalid', 422);
  }
  return {
    key,
    program: program as 'acc' | 'pcc' | 'actc',
    module,
    enrollmentScope: scope as 'module' | 'full_program',
    start,
    end,
    label,
    range,
    time,
    timezone: 'America/New_York',
    sessions,
    rosterValue,
  };
}

export function prepareCommerceBookkeeperEnvelope(input: {
  rawBody: Buffer;
  signatureHeader: string | string[] | undefined;
  relaySecret: string;
  now?: number;
}): CommerceBookkeeperEnvelope {
  if (input.rawBody.length > COMMERCE_BOOKKEEPER_MAX_BODY_BYTES) {
    throw new CommerceBookkeeperRequestError('body too large', 413);
  }
  const signature = Array.isArray(input.signatureHeader)
    ? ''
    : (input.signatureHeader ?? '').trim().toLowerCase();
  if (input.relaySecret.length < 32 || !/^[a-f0-9]{64}$/.test(signature)) {
    throw new CommerceBookkeeperRequestError('signature invalid', 401);
  }
  const digest = crypto
    .createHash('sha256')
    .update(input.rawBody)
    .digest('hex');
  const expected = crypto
    .createHmac('sha256', input.relaySecret)
    .update(`tandem-commerce-bookkeeper-v1\n${digest}`, 'utf8')
    .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new CommerceBookkeeperRequestError('signature invalid', 401);
  }
  let raw: Record<string, unknown>;
  try {
    raw = object(JSON.parse(input.rawBody.toString('utf8')), 'envelope');
  } catch (error) {
    if (error instanceof CommerceBookkeeperRequestError) throw error;
    throw new CommerceBookkeeperRequestError('JSON invalid', 400);
  }
  if (raw.schemaVersion !== 1) {
    throw new CommerceBookkeeperRequestError('schemaVersion invalid', 422);
  }
  const deliveryId = text(raw.deliveryId, 'deliveryId', 36);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      deliveryId,
    )
  ) {
    throw new CommerceBookkeeperRequestError('deliveryId invalid', 422);
  }
  const sentAt = text(raw.sentAt, 'sentAt', 40);
  const sentTime = Date.parse(sentAt);
  if (
    !Number.isFinite(sentTime) ||
    Math.abs((input.now ?? Date.now()) - sentTime) > MAX_CLOCK_SKEW_MS
  ) {
    throw new CommerceBookkeeperRequestError('sentAt expired', 401);
  }
  const n = object(raw.notification, 'notification');
  const amount = object(n.amount, 'notification.amount');
  const order = object(raw.order, 'order');
  const merchantReference = text(
    n.merchantReference,
    'notification.merchantReference',
    64,
  );
  const pspReference = text(n.pspReference, 'notification.pspReference', 100);
  const productId = text(order.productId, 'order.productId', 100);
  const productName = text(order.productName, 'order.productName', 200);
  const amountValue = Number(amount.value);
  const orderAmount = Number(order.amountCents);
  const environment = text(raw.environment, 'environment', 8);
  const deliveryKind = text(raw.deliveryKind, 'deliveryKind', 24);
  const orderMerchantReference = text(
    order.merchantReference,
    'order.merchantReference',
    64,
  );
  if (
    n.success !== 'true' ||
    !Number.isSafeInteger(amountValue) ||
    amountValue <= 0 ||
    amount.currency !== 'USD' ||
    order.currency !== 'USD' ||
    !/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(productId) ||
    /[\x00-\x1f\x7f]/.test(productName)
  ) {
    throw new CommerceBookkeeperRequestError('payment identity mismatch', 422);
  }
  if (
    !['test', 'live'].includes(environment) ||
    !['payment', 'refund', 'fee_reconciliation'].includes(deliveryKind)
  ) {
    throw new CommerceBookkeeperRequestError('delivery scope invalid', 422);
  }
  const preparedEconomics = economics(raw.economics, orderAmount);
  let refund: CommerceBookkeeperEnvelope['refund'] = null;
  if (n.eventCode === 'REFUND') {
    const rawRefund = object(raw.refund, 'refund');
    const refundId = text(rawRefund.refundId, 'refund.refundId', 36);
    const requestReference = text(
      rawRefund.requestReference,
      'refund.requestReference',
      80,
    );
    const paymentPspReference = text(
      rawRefund.paymentPspReference,
      'refund.paymentPspReference',
      100,
    );
    const refundPspReference = text(
      rawRefund.refundPspReference,
      'refund.refundPspReference',
      100,
    );
    const refundAmount = Number(rawRefund.amountCents);
    const cumulativeRefunded = Number(rawRefund.cumulativeRefundedCents);
    const remainingPaid = Number(rawRefund.remainingPaidCents);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        refundId,
      ) ||
      !requestReference.startsWith(`${orderMerchantReference}-RF-`) ||
      !/^TCA-[A-Z0-9-]+-RF-[0-9]{2,}$/.test(requestReference) ||
      merchantReference !== requestReference ||
      pspReference !== refundPspReference ||
      text(n.originalReference, 'notification.originalReference', 100) !==
        paymentPspReference ||
      !Number.isSafeInteger(refundAmount) ||
      !Number.isSafeInteger(cumulativeRefunded) ||
      !Number.isSafeInteger(remainingPaid) ||
      refundAmount <= 0 ||
      amountValue !== refundAmount ||
      cumulativeRefunded < refundAmount ||
      cumulativeRefunded > orderAmount ||
      remainingPaid !== orderAmount - cumulativeRefunded
    ) {
      throw new CommerceBookkeeperRequestError('refund identity mismatch', 422);
    }
    refund = {
      refundId,
      requestReference,
      paymentPspReference,
      refundPspReference,
      amountCents: refundAmount,
      cumulativeRefundedCents: cumulativeRefunded,
      remainingPaidCents: remainingPaid,
    };
  } else if (
    n.eventCode !== 'AUTHORISATION' ||
    (raw.refund !== null && raw.refund !== undefined) ||
    amountValue !== orderAmount ||
    orderMerchantReference !== merchantReference
  ) {
    throw new CommerceBookkeeperRequestError('payment identity mismatch', 422);
  }
  if (
    (refund !== null && deliveryKind !== 'refund') ||
    (refund === null && deliveryKind === 'refund') ||
    (deliveryKind === 'fee_reconciliation' &&
      (environment !== 'live' || preparedEconomics === null)) ||
    (deliveryKind === 'refund' && preparedEconomics !== null)
  ) {
    throw new CommerceBookkeeperRequestError('delivery scope invalid', 422);
  }
  const relationship = order.purchaseRelationship;
  if (relationship !== 'self' && relationship !== 'other') {
    throw new CommerceBookkeeperRequestError(
      'purchaseRelationship invalid',
      422,
    );
  }
  const eventDate = text(n.eventDate, 'notification.eventDate', 40);
  if (!Number.isFinite(Date.parse(eventDate))) {
    throw new CommerceBookkeeperRequestError(
      'notification.eventDate invalid',
      422,
    );
  }
  const rosterPolicy = order.rosterPolicy;
  if (rosterPolicy !== 'catalog' && rosterPolicy !== 'none') {
    throw new CommerceBookkeeperRequestError('rosterPolicy invalid', 422);
  }
  const preparedCohort = cohort(order.cohort);
  if (rosterPolicy === 'none' && preparedCohort !== null) {
    throw new CommerceBookkeeperRequestError('rosterPolicy invalid', 422);
  }
  return {
    schemaVersion: 1,
    deliveryId,
    sentAt,
    environment: environment as 'test' | 'live',
    deliveryKind: deliveryKind as 'payment' | 'refund' | 'fee_reconciliation',
    economics: preparedEconomics,
    notification: {
      pspReference,
      ...(refund === null
        ? {}
        : {
            originalReference: refund.paymentPspReference,
          }),
      merchantReference,
      merchantAccountCode: text(
        n.merchantAccountCode,
        'notification.merchantAccountCode',
        200,
      ),
      eventCode: refund === null ? 'AUTHORISATION' : 'REFUND',
      eventDate,
      success: 'true',
      amount: { value: amountValue, currency: 'USD' },
      additionalData: object(n.additionalData, 'notification.additionalData'),
    },
    order: {
      orderId: text(order.orderId, 'order.orderId', 36),
      merchantReference: orderMerchantReference,
      productId,
      productName,
      amountCents: orderAmount,
      currency: 'USD',
      rosterPolicy,
      payer: person(order.payer, 'order.payer'),
      learner: person(order.learner, 'order.learner'),
      purchaseRelationship: relationship,
      cohort: preparedCohort,
    },
    refund,
  };
}

export async function handleCommerceBookkeeper(
  envelope: CommerceBookkeeperEnvelope,
): Promise<CommerceBookkeeperResult> {
  const operationalConfig = readEnvFile([
    'SHEETS_PAYMENTS_ID',
    'SHEETS_ROSTER_ID',
  ]);
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT], {
      env: {
        ...process.env,
        ...operationalConfig,
        SHEETS_SA_JSON: SA_JSON,
        PGDATABASE: 'nanoclaw_business',
        PATH: `${process.env.PATH ?? ''}:${PSQL_DIR}`,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(`commerce bookkeeper failed: ${stderr.slice(0, 300)}`),
        );
        return;
      }
      const line = stdout
        .split('\n')
        .find((entry) => entry.startsWith('__COMMERCE_BOOKKEEPER__'));
      if (!line) {
        reject(new Error('commerce bookkeeper receipt missing'));
        return;
      }
      try {
        const result = JSON.parse(
          Buffer.from(
            line.slice('__COMMERCE_BOOKKEEPER__'.length),
            'base64url',
          ).toString('utf8'),
        ) as CommerceBookkeeperResult;
        const validSuppression =
          envelope.environment === 'test' &&
          result.officialRecordSuppressed === true &&
          !result.paymentLogVerified &&
          !result.studentRosterVerified &&
          !result.postgresVerified &&
          !result.feeReconciliationVerified;
        const validFeeReconciliation =
          envelope.environment === 'live' &&
          envelope.deliveryKind === 'fee_reconciliation' &&
          !result.officialRecordSuppressed &&
          result.paymentLogVerified &&
          !result.studentRosterVerified &&
          !result.postgresVerified &&
          result.feeReconciliationVerified;
        const validOfficialProjection =
          envelope.environment === 'live' &&
          envelope.deliveryKind !== 'fee_reconciliation' &&
          !result.officialRecordSuppressed &&
          result.paymentLogVerified &&
          result.studentRosterVerified &&
          result.postgresVerified &&
          !result.feeReconciliationVerified;
        if (
          result.deliveryId !== envelope.deliveryId ||
          (!validSuppression &&
            !validFeeReconciliation &&
            !validOfficialProjection)
        ) {
          reject(new Error('commerce bookkeeper readback incomplete'));
          return;
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify(envelope));
  });
}
