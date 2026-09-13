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
  notification: {
    pspReference: string;
    merchantReference: string;
    merchantAccountCode: string;
    eventCode: 'AUTHORISATION';
    eventDate: string;
    success: 'true';
    amount: { value: number; currency: 'USD' };
    additionalData: Record<string, unknown>;
  };
  order: {
    orderId: string;
    merchantReference: string;
    productId: 'mcq-program-a-foundations';
    amountCents: number;
    currency: 'USD';
    payer: { firstName: string; lastName: string; email: string };
    learner: { firstName: string; lastName: string; email: string };
    purchaseRelationship: 'self' | 'other';
  };
}

export interface CommerceBookkeeperResult {
  deliveryId: string;
  provider: 'adyen';
  providerPaymentId: string;
  paymentLogVerified: boolean;
  studentRosterVerified: boolean;
  postgresVerified: boolean;
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
  const amountValue = Number(amount.value);
  const orderAmount = Number(order.amountCents);
  if (
    n.eventCode !== 'AUTHORISATION' ||
    n.success !== 'true' ||
    !Number.isSafeInteger(amountValue) ||
    amountValue <= 0 ||
    amount.currency !== 'USD' ||
    order.currency !== 'USD' ||
    amountValue !== orderAmount ||
    order.merchantReference !== merchantReference ||
    order.productId !== 'mcq-program-a-foundations'
  ) {
    throw new CommerceBookkeeperRequestError('payment identity mismatch', 422);
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
  return {
    schemaVersion: 1,
    deliveryId,
    sentAt,
    notification: {
      pspReference,
      merchantReference,
      merchantAccountCode: text(
        n.merchantAccountCode,
        'notification.merchantAccountCode',
        200,
      ),
      eventCode: 'AUTHORISATION',
      eventDate,
      success: 'true',
      amount: { value: amountValue, currency: 'USD' },
      additionalData: object(n.additionalData, 'notification.additionalData'),
    },
    order: {
      orderId: text(order.orderId, 'order.orderId', 36),
      merchantReference,
      productId: 'mcq-program-a-foundations',
      amountCents: orderAmount,
      currency: 'USD',
      payer: person(order.payer, 'order.payer'),
      learner: person(order.learner, 'order.learner'),
      purchaseRelationship: relationship,
    },
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
        if (
          result.deliveryId !== envelope.deliveryId ||
          !result.paymentLogVerified ||
          !result.studentRosterVerified ||
          !result.postgresVerified
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
