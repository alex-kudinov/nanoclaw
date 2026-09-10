import { createHash } from 'node:crypto';
import https from 'node:https';
import type { Pool } from 'pg';

import { readEnvFile } from './env.js';
import {
  EnrollmentPilotRefusalError,
  type EnrollmentPilotEvidenceResolver,
  type NativeStripeEnrollmentEvidence,
} from './student-enrollment-production.js';

const TIMEOUT_MS = 20_000;

type Json = Record<string, any>;

export interface StripeEnrollmentEvidenceDeps {
  stripeGet?: (path: string) => Promise<Json>;
  resolveParty?: (email: string) => Promise<number | null>;
  clock?: () => number;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function objectId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return text((value as Json).id);
  return '';
}

function stripeKey(): string {
  const key = readEnvFile(['STRIPE_SECRET_KEY_ALT']).STRIPE_SECRET_KEY_ALT;
  if (!key) throw new Error('enrollment_pilot_stripe_key_unconfigured');
  return key;
}

function defaultStripeGet(path: string): Promise<Json> {
  const auth = Buffer.from(`${stripeKey()}:`).toString('base64');
  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: 'api.stripe.com',
        path,
        headers: { Authorization: `Basic ${auth}` },
      },
      (response) => {
        let body = '';
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () => {
          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error('enrollment_pilot_stripe_read_failed'));
            return;
          }
          try {
            resolve(JSON.parse(body) as Json);
          } catch {
            reject(new Error('enrollment_pilot_stripe_response_invalid'));
          }
        });
      },
    );
    request.on('error', () =>
      reject(new Error('enrollment_pilot_stripe_read_failed')),
    );
    request.setTimeout(TIMEOUT_MS, () =>
      request.destroy(new Error('enrollment_pilot_stripe_read_timed_out')),
    );
  });
}

function defaultPartyResolver(pool: Pick<Pool, 'query'>) {
  return async (email: string): Promise<number | null> => {
    const result = await pool.query(
      'SELECT business_v2.resolve_parties_by_email($1::citext) AS party_id',
      [email],
    );
    if (result.rowCount !== 1) return null;
    const id = Number(result.rows[0]?.party_id);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  };
}

function hashEvidence(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function only<T>(values: T[], code: string): T {
  if (values.length !== 1) throw new EnrollmentPilotRefusalError(code as any);
  return values[0];
}

export function createStripeEnrollmentEvidenceResolver(
  pool: Pick<Pool, 'query'>,
  deps: StripeEnrollmentEvidenceDeps = {},
): EnrollmentPilotEvidenceResolver {
  const get = deps.stripeGet ?? defaultStripeGet;
  const resolveParty = deps.resolveParty ?? defaultPartyResolver(pool);
  const clock = deps.clock ?? Date.now;
  return async ({ payload, source }) => {
    const envelope =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Json)
        : {};
    if (
      source.stripeAccount !== 'tandem' ||
      !['payment_intent.succeeded', 'checkout.session.completed'].includes(
        source.eventType,
      ) ||
      !/^evt_[A-Za-z0-9_]+$/.test(text(envelope.event_id)) ||
      !Number.isSafeInteger(Number(envelope.event_created)) ||
      text(envelope.payment_intent_id) !== source.paymentIntentId
    )
      throw new EnrollmentPilotRefusalError('event_identity_invalid');

    const paymentIntent = await get(
      `/v1/payment_intents/${encodeURIComponent(source.paymentIntentId)}?expand[]=latest_charge&expand[]=customer`,
    );
    if (text(paymentIntent.id) !== source.paymentIntentId)
      throw new EnrollmentPilotRefusalError('native_evidence_incomplete');

    let session: Json | null = null;
    let line: Json | null = null;
    if (source.sourceObjectId.startsWith('cs_')) {
      session = await get(
        `/v1/checkout/sessions/${encodeURIComponent(source.sourceObjectId)}?expand[]=customer_details`,
      );
      if (
        !/^cs_[A-Za-z0-9_]+$/.test(text(session.id)) ||
        objectId(session.payment_intent) !== source.paymentIntentId
      )
        throw new EnrollmentPilotRefusalError('native_evidence_incomplete');
      const linePage = await get(
        `/v1/checkout/sessions/${encodeURIComponent(text(session.id))}/line_items?limit=2&expand[]=data.price.product`,
      );
      line = only(
        Array.isArray(linePage.data) && linePage.has_more !== true
          ? linePage.data
          : [],
        'population_not_selected',
      ) as Json;
    } else if (source.sourceObjectId !== source.paymentIntentId) {
      throw new EnrollmentPilotRefusalError('native_evidence_incomplete');
    }
    const charge =
      paymentIntent.latest_charge &&
      typeof paymentIntent.latest_charge === 'object'
        ? paymentIntent.latest_charge
        : await get(
            `/v1/charges/${encodeURIComponent(objectId(paymentIntent.latest_charge))}`,
          );
    const metadata = {
      ...(session?.metadata ?? {}),
      ...(paymentIntent.metadata ?? {}),
      ...(charge.metadata ?? {}),
    };
    const participantEmail = text(
      session?.customer_details?.email ??
        session?.customer_email ??
        metadata.email,
    ).toLowerCase();
    const participantName = text(
      session?.customer_details?.name ?? metadata.name,
    );
    const participantPartyId = participantEmail
      ? await resolveParty(participantEmail)
      : null;
    const declaredPartyId = Number(metadata.tandem_party_id);
    const customerEmail = text(paymentIntent.customer?.email).toLowerCase();
    const participantResolved = Boolean(
      participantPartyId &&
      participantPartyId === declaredPartyId &&
      participantName &&
      (!customerEmail || customerEmail === participantEmail),
    );

    const productId = line ? objectId(line.price?.product) : null;
    const priceId = line ? objectId(line.price) : null;
    const observedAt = new Date(clock()).toISOString();
    const evidenceCore = {
      account: 'tandem',
      eventId: text(envelope.event_id),
      eventType: source.eventType,
      eventCreated: Number(envelope.event_created),
      paymentIntentId: source.paymentIntentId,
      paymentIntentCreated: Number(paymentIntent.created),
      paymentIntentStatus: text(paymentIntent.status),
      amountMinor: Number(paymentIntent.amount),
      amountReceivedMinor: Number(paymentIntent.amount_received),
      currency: text(paymentIntent.currency).toLowerCase(),
      purchasePath: session
        ? 'stripe_checkout_session'
        : 'tandem_payment_intent',
      checkoutSessionId: session ? text(session.id) : null,
      checkoutPaymentStatus: session ? text(session.payment_status) : null,
      checkoutMode: session ? text(session.mode) : null,
      checkoutAmountMinor: session ? Number(session.amount_total) : null,
      discountMinor: session
        ? Number(session.total_details?.amount_discount ?? 0)
        : Number(metadata.discount_amount ?? 0),
      discountCount:
        (Array.isArray(session?.discounts) ? session.discounts.length : 0) +
        (text(metadata.coupon_code) ? 1 : 0),
      couponCode: text(metadata.coupon_code) || null,
      pricingPolicy: text(metadata.pricing_policy),
      regionalPriceApplied: text(metadata.regional_price_applied) === 'true',
      baseAmountMinor: Number(metadata.base_amount),
      originalAmountMinor: text(metadata.original_amount)
        ? Number(metadata.original_amount)
        : null,
      productId,
      priceId,
      quantity: session ? Number(line?.quantity) : 1,
      offerKey: text(metadata.product),
      cohortProgram: text(metadata.cohort_program),
      cohortStart: text(metadata.cohort_start).slice(0, 10),
      chargeId: text(charge.id),
      chargePaid: charge.paid === true,
      chargeAmountMinor: Number(charge.amount),
      chargeCurrency: text(charge.currency).toLowerCase(),
      chargeDisputed: charge.disputed === true,
      amountRefundedMinor: Number(charge.amount_refunded ?? 0),
      invoiceId: objectId(paymentIntent.invoice) || null,
      termsAccepted: text(metadata.terms_accepted) === 'true',
      termsVersion: text(metadata.terms_version),
      connectedAccountTransfer: Boolean(
        paymentIntent.transfer_data || paymentIntent.on_behalf_of,
      ),
      participantPartyId: participantResolved ? participantPartyId! : 0,
      participantEmailSha256: hashEvidence(participantEmail),
      participantNameSha256: hashEvidence(participantName),
      observedAt,
    };
    return {
      ...evidenceCore,
      participantEmail,
      participantName,
      evidenceSha256: hashEvidence(evidenceCore),
    } as NativeStripeEnrollmentEvidence;
  };
}
