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

/**
 * Content the receiver did not expect inside an authenticated delivery
 * (NC-20260924-001). Security and payment identity failures still throw;
 * everything else is accepted and recorded as an issue. `roster` issues hold
 * roster placement for owner resolution; `review` issues only flag.
 */
export interface CommerceBookkeeperIssue {
  target: 'roster' | 'review';
  code: string;
  value: string;
}

export interface CommerceBookkeeperException {
  target: 'roster' | 'postgres' | 'fees' | 'payment_log' | 'review';
  code: string;
  value: string;
}

export interface CommerceBookkeeperEnvelope {
  schemaVersion: 1;
  deliveryId: string;
  sentAt: string;
  environment: 'test' | 'live';
  deliveryKind: 'payment' | 'refund' | 'fee_reconciliation';
  issues: CommerceBookkeeperIssue[];
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
    amount: { value: number; currency: string };
    additionalData: Record<string, unknown>;
  };
  order: {
    orderId: string;
    merchantReference: string;
    productId: string;
    productName: string;
    amountCents: number;
    currency: string;
    rosterPolicy: 'catalog' | 'none';
    payer: { firstName: string; lastName: string; email: string };
    learner: { firstName: string; lastName: string; email: string };
    purchaseRelationship: string;
    cohort: null | {
      key: string;
      program: string;
      module: number | null;
      enrollmentScope: string;
      start: string;
      end: string;
      label: string;
      range: string;
      time: string;
      timezone: string;
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
  exceptions?: CommerceBookkeeperException[];
  exceptionsRecorded?: boolean;
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

type Issues = CommerceBookkeeperIssue[];

const KNOWN_COHORT_PROGRAMS = new Set(['acc', 'pcc', 'actc', 'mcs-practicum']);
const ISO_INSTANT =
  /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;

/** Data-only text: control characters become spaces, then bounded. */
function softText(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value
        .replace(/[\x00-\x1f\x7f]/g, ' ')
        .trim()
        .slice(0, max)
    : '';
}

function softRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function person(value: unknown, label: 'payer' | 'learner', issues: Issues) {
  const p = softRecord(value) ?? {};
  const email = softText(p.email, 254).toLowerCase();
  const firstName = softText(p.firstName, 100);
  const lastName = softText(p.lastName, 100);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    issues.push({
      target: label === 'learner' ? 'roster' : 'review',
      code: `${label}_email_invalid`,
      value: email || '(missing)',
    });
  }
  if (!firstName && !lastName) {
    issues.push({
      target: 'review',
      code: `${label}_name_missing`,
      value: email,
    });
  }
  return { firstName, lastName, email };
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

/**
 * Any program is accepted. Only the roster value is written downstream, so a
 * cohort whose roster value cannot be derived, or an ACC cohort whose value is
 * not the canonical month, holds roster placement for the owner instead of
 * rejecting the paid delivery. A program not seen before is flagged for review.
 */
function cohort(
  value: unknown,
  issues: Issues,
): CommerceBookkeeperEnvelope['order']['cohort'] {
  if (value === null || value === undefined) return null;
  const c = softRecord(value);
  if (!c) {
    issues.push({
      target: 'roster',
      code: 'cohort_unreadable',
      value: typeof value,
    });
    return null;
  }
  const program = softText(c.program, 40);
  const label = softText(c.label, 80);
  const range = softText(c.range, 120);
  const moduleNumber = Number(c.module);
  const prepared = {
    key: softText(c.key, 60),
    program,
    module:
      c.module === null ||
      c.module === undefined ||
      !Number.isInteger(moduleNumber)
        ? null
        : moduleNumber,
    enrollmentScope: softText(c.enrollmentScope, 20),
    start: softText(c.start, 40),
    end: softText(c.end, 40),
    label,
    range,
    time: softText(c.time, 120),
    timezone: softText(c.timezone, 40),
    sessions: Array.isArray(c.sessions)
      ? c.sessions.map((item) => softText(item, 40))
      : [],
    rosterValue:
      softText(c.rosterValue, 200) ||
      (label && range ? `${label} — ${range}` : ''),
  };
  // The roster value is the only cohort field written downstream: ACC uses its
  // canonical month, every other program its own signed "label — range".
  const canonicalRosterValue =
    program === 'acc'
      ? /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(prepared.rosterValue)
      : prepared.rosterValue === `${label} — ${range}`;
  if (!program || !prepared.rosterValue) {
    issues.push({
      target: 'roster',
      code: 'cohort_unreadable',
      value: program || '(no program)',
    });
  } else if (!canonicalRosterValue) {
    issues.push({
      target: 'roster',
      code: 'cohort_roster_value_unexpected',
      value: `${program}: ${prepared.rosterValue}`,
    });
  }
  if (program && !KNOWN_COHORT_PROGRAMS.has(program)) {
    issues.push({
      target: 'review',
      code: 'cohort_program_new',
      value: program,
    });
  } else if (program && knownShapeUnexpected(prepared)) {
    issues.push({
      target: 'review',
      code: 'cohort_shape_unexpected',
      value: program,
    });
  }
  if (
    [prepared.start, prepared.end, ...prepared.sessions].some(
      (item) => !ISO_INSTANT.test(item),
    ) ||
    Date.parse(prepared.end) <= Date.parse(prepared.start)
  ) {
    issues.push({
      target: 'review',
      code: 'cohort_schedule_unexpected',
      value: program || '(no program)',
    });
  }
  return prepared;
}

/** The pre-2026-09-24 shape rules for known programs, now a review flag instead of a rejection. */
function knownShapeUnexpected(
  c: NonNullable<CommerceBookkeeperEnvelope['order']['cohort']>,
): boolean {
  const credential = ['acc', 'pcc', 'actc'].includes(c.program);
  const module = c.module ?? -1;
  if (c.timezone !== 'America/New_York') return true;
  if (credential) {
    return (
      module < 1 ||
      module > 4 ||
      !['module', 'full_program'].includes(c.enrollmentScope) ||
      !new RegExp(`^${c.program}-m${module}-[a-f0-9]{24}$`).test(c.key) ||
      c.sessions.length !== 4
    );
  }
  return (
    module !== 0 ||
    c.enrollmentScope !== 'full_program' ||
    !/^mcs-practicum-[a-f0-9]{24}$/.test(c.key) ||
    ![10, 12].includes(c.sessions.length)
  );
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
  const issues: Issues = [];
  const rawProductId = softText(order.productId, 100);
  const productId = rawProductId || 'unknown-product';
  if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(rawProductId)) {
    issues.push({
      target: 'review',
      code: 'product_id_unexpected',
      value: rawProductId || '(missing)',
    });
  }
  const productName = softText(order.productName, 200) || productId;
  if (productName !== order.productName) {
    issues.push({
      target: 'review',
      code: 'product_name_adjusted',
      value: productName,
    });
  }
  const currency = typeof amount.currency === 'string' ? amount.currency : '';
  const amountValue = Number(amount.value);
  const orderAmount = Number(order.amountCents);
  const environment = text(raw.environment, 'environment', 8);
  const deliveryKind = text(raw.deliveryKind, 'deliveryKind', 24);
  const orderMerchantReference = text(
    order.merchantReference,
    'order.merchantReference',
    64,
  );
  // Payment identity stays fail-closed: success, amount and one currency.
  if (
    n.success !== 'true' ||
    !Number.isSafeInteger(amountValue) ||
    amountValue <= 0 ||
    !/^[A-Z]{3}$/.test(currency) ||
    order.currency !== currency
  ) {
    throw new CommerceBookkeeperRequestError('payment identity mismatch', 422);
  }
  if (currency !== 'USD') {
    issues.push({ target: 'review', code: 'currency_new', value: currency });
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
  const relationship = softText(order.purchaseRelationship, 40);
  if (relationship !== 'self' && relationship !== 'other') {
    issues.push({
      target: 'review',
      code: 'purchase_relationship_new',
      value: relationship || '(missing)',
    });
  }
  let eventDate = softText(n.eventDate, 40);
  if (!Number.isFinite(Date.parse(eventDate))) {
    issues.push({
      target: 'review',
      code: 'event_date_unreadable',
      value: eventDate || '(missing)',
    });
    eventDate = sentAt;
  }
  let rosterPolicy: 'catalog' | 'none' =
    order.rosterPolicy === 'none' ? 'none' : 'catalog';
  if (order.rosterPolicy !== 'catalog' && order.rosterPolicy !== 'none') {
    issues.push({
      target: 'roster',
      code: 'roster_policy_new',
      value: softText(order.rosterPolicy, 40) || '(missing)',
    });
  }
  const preparedCohort = cohort(order.cohort, issues);
  if (rosterPolicy === 'none' && preparedCohort !== null) {
    issues.push({
      target: 'roster',
      code: 'roster_policy_cohort_conflict',
      value: preparedCohort.program,
    });
    rosterPolicy = 'catalog';
  }
  const additionalData = softRecord(n.additionalData);
  if (!additionalData) {
    issues.push({
      target: 'review',
      code: 'additional_data_missing',
      value: typeof n.additionalData,
    });
  }
  const payer = person(order.payer, 'payer', issues);
  const learner = person(order.learner, 'learner', issues);
  return {
    schemaVersion: 1,
    deliveryId,
    sentAt,
    environment: environment as 'test' | 'live',
    deliveryKind: deliveryKind as 'payment' | 'refund' | 'fee_reconciliation',
    issues,
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
      amount: { value: amountValue, currency },
      additionalData: additionalData ?? {},
    },
    order: {
      orderId: text(order.orderId, 'order.orderId', 36),
      merchantReference: orderMerchantReference,
      productId,
      productName,
      amountCents: orderAmount,
      currency,
      rosterPolicy,
      payer,
      learner,
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
        if (!acceptedProjection(envelope, result)) {
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

/**
 * Every sink is either verified by readback or covered by a durably recorded,
 * named exception. A Live payment must always reach the Payment Log.
 */
export function acceptedProjection(
  envelope: CommerceBookkeeperEnvelope,
  result: CommerceBookkeeperResult,
): boolean {
  const exceptions = Array.isArray(result.exceptions) ? result.exceptions : [];
  const excepted = (target: CommerceBookkeeperException['target']) =>
    exceptions.some(
      (item) =>
        item?.target === target &&
        typeof item.code === 'string' &&
        item.code !== '',
    );
  if (result.deliveryId !== envelope.deliveryId) return false;
  if (exceptions.length > 0 && result.exceptionsRecorded !== true) return false;
  const live =
    envelope.environment === 'live' && !result.officialRecordSuppressed;
  const validSuppression =
    envelope.environment === 'test' &&
    result.officialRecordSuppressed === true &&
    !result.paymentLogVerified &&
    !result.studentRosterVerified &&
    !result.postgresVerified &&
    !result.feeReconciliationVerified &&
    exceptions.length === 0;
  const validFeeReconciliation =
    live &&
    envelope.deliveryKind === 'fee_reconciliation' &&
    !result.studentRosterVerified &&
    !result.postgresVerified &&
    ((result.paymentLogVerified && result.feeReconciliationVerified) ||
      excepted('fees'));
  const validOfficialProjection =
    live &&
    envelope.deliveryKind !== 'fee_reconciliation' &&
    !result.feeReconciliationVerified &&
    (result.paymentLogVerified ||
      (envelope.deliveryKind === 'refund' && excepted('payment_log'))) &&
    (result.studentRosterVerified || excepted('roster')) &&
    (result.postgresVerified || excepted('postgres'));
  return validSuppression || validFeeReconciliation || validOfficialProjection;
}
