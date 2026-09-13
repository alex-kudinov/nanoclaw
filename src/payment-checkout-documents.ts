import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import fontkit from '@pdf-lib/fontkit';
import type { gmail_v1 } from 'googleapis';
import { PDFDocument, type PDFFont, rgb } from 'pdf-lib';
import type { PoolClient } from 'pg';
import { z } from 'zod';

import { assertExternalWriteAllowed } from './action-safety.js';
import { GMAIL_SEND_AS } from './config.js';
import { getGmailClient } from './gmail-auth.js';
import { sendEmail } from './gmail-api.js';
import type { CheckoutBillingProfile } from './payment-checkout-billing.js';
import type { CheckoutPaymentEvidence } from './payment-checkout-evidence.js';
import {
  paymentScopeFingerprint,
  PaymentDomainError,
  validateAttempt,
  type PaymentScope,
} from './payment-domain.js';
import type { PaymentPayloadVault } from './payment-payload-vault.js';
import { paymentPayloadFingerprint } from './payment-payload-vault.js';
import type { PaymentTransaction } from './payment-store.js';
import { ROBOTO_REGULAR_TTF_BASE64 } from './payment-checkout-roboto-font.js';

const OFFER = 'mcq-program-a-foundations';
const LOCALE = 'en-US';
const PRODUCT = 'Mentor Coaching Foundations';
const DOCUMENT_VERSION = 'mcs-checkout-document-v2';
const TANDEM_LOGO_PNG = readFileSync(
  fileURLToPath(
    new URL(
      '../assets/checkout-documents/tandem-logo-horizontal.png',
      import.meta.url,
    ),
  ),
);
// The PDF is base64-encoded into the signed inner JSON, then that JSON is
// base64-encoded again by the private response envelope. 500 kB leaves bounded
// headroom under WordPress's 1 MiB response limit at both layers.
export const CHECKOUT_DOCUMENT_MAX_PDF_BYTES = 500_000;
const RECEIPT_SELLER = Object.freeze({
  displayName: 'Tandem Coaching Academy',
  legalName: 'Tandem Coaching Partners, LLC',
  supportEmail: 'hello@tandemcoach.co',
  country: 'US' as const,
  addressLines: [
    '104 E Ovilla Rd, Ste 1278',
    'Red Oak, TX 75154, United States',
  ],
  taxId: null,
});
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_:.\/-]+$/);
const email = z.string().trim().toLowerCase().email().max(254);
const printable = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const printableOrEmpty = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));

export type PaymentCheckoutDocumentKind = 'receipt' | 'paid_invoice';

const paidInvoiceDisabled = z.object({ enabled: z.literal(false) }).strict();
const RETENTION_POLICY = Object.freeze({
  version: 'mcs-checkout-documents-7y-v1',
  years: 7 as const,
  legalHold: 'explicit_hold_blocks_purge' as const,
  purge: 'customer_pdf_recipient_and_sent_message' as const,
  tombstone: 'number_date_amount_currency_hashes_and_purge_receipt' as const,
  sweepIntervalMs: 24 * 60 * 60_000,
  batchSize: 25,
});
const paidInvoiceEnabled = z
  .object({
    enabled: z.literal(true),
    decisionReference: ref,
    approvedAt: z.iso.datetime({ offset: true }),
    activationReceiptSha256: digest,
    sequencePrefix: z.literal('TCA'),
    seller: z
      .object({
        displayName: printable(160),
        legalName: printable(160),
        addressLines: z.array(printable(180)).min(1).max(5),
        country: z.string().regex(/^[A-Z]{2}$/),
        taxId: z.null(),
        supportEmail: email,
      })
      .strict(),
    capturePolicy: z
      .object({
        version: z.literal('adyen-immediate-auto-capture-v1'),
        mode: z.literal('immediate_automatic_capture'),
        evidenceReference: ref,
      })
      .strict(),
    taxPolicy: z
      .object({
        version: z.literal('mcs-foundations-zero-tax-display-v1'),
        jurisdiction: z.literal('US-TX'),
        taxMinor: z.literal(0),
        taxLabel: z.literal('Tax'),
        classification: z.literal('not_stated'),
      })
      .strict(),
    retentionPolicyVersion: z.literal('mcs-checkout-documents-7y-v1'),
    correctionPolicy: z.literal('credit_note_or_replacement_only'),
  })
  .strict();

export const websiteCheckoutDocumentConfigSchema = z
  .object({
    receiptEnabled: z.boolean().default(true),
    downloadCapabilityTtlMs: z
      .number()
      .int()
      .min(30_000)
      .max(15 * 60_000)
      .default(5 * 60_000),
    retentionPolicy: z
      .object({
        version: z
          .literal('mcs-checkout-documents-7y-v1')
          .default('mcs-checkout-documents-7y-v1'),
        years: z.literal(7).default(7),
        legalHold: z
          .literal('explicit_hold_blocks_purge')
          .default('explicit_hold_blocks_purge'),
        purge: z
          .literal('customer_pdf_recipient_and_sent_message')
          .default('customer_pdf_recipient_and_sent_message'),
        tombstone: z
          .literal('number_date_amount_currency_hashes_and_purge_receipt')
          .default('number_date_amount_currency_hashes_and_purge_receipt'),
        sweepIntervalMs: z
          .number()
          .int()
          .min(60 * 60_000)
          .max(24 * 60 * 60_000)
          .default(24 * 60 * 60_000),
        batchSize: z.number().int().min(1).max(100).default(25),
      })
      .strict()
      .default(RETENTION_POLICY),
    paidInvoice: z
      .discriminatedUnion('enabled', [paidInvoiceDisabled, paidInvoiceEnabled])
      .default({ enabled: false }),
  })
  .strict()
  .default({
    receiptEnabled: true,
    downloadCapabilityTtlMs: 5 * 60_000,
    retentionPolicy: RETENTION_POLICY,
    paidInvoice: { enabled: false },
  });

export type WebsiteCheckoutDocumentConfig = z.infer<
  typeof websiteCheckoutDocumentConfigSchema
>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([key, child]) => [key, canonical(child)]),
    );
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function sha(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function websiteCheckoutPaidInvoiceActivationHash(
  value: Omit<z.infer<typeof paidInvoiceEnabled>, 'activationReceiptSha256'>,
): string {
  return sha(stableJson(value));
}

export function parseWebsiteCheckoutDocumentConfig(
  input: unknown,
): WebsiteCheckoutDocumentConfig {
  const parsed = websiteCheckoutDocumentConfigSchema.safeParse(input);
  if (!parsed.success)
    throw new PaymentDomainError('invalid_checkout_document_configuration');
  if (parsed.data.paidInvoice.enabled) {
    const { activationReceiptSha256, ...content } = parsed.data.paidInvoice;
    if (
      activationReceiptSha256 !==
        websiteCheckoutPaidInvoiceActivationHash(content) ||
      content.retentionPolicyVersion !== parsed.data.retentionPolicy.version
    )
      throw new PaymentDomainError('invalid_checkout_document_configuration');
  }
  return Object.freeze(structuredClone(parsed.data));
}

const addressSchema = z
  .object({
    street: printable(180),
    houseNumberOrName: printableOrEmpty(40),
    city: printable(100),
    postalCode: printable(20),
    stateOrProvince: printable(40).nullable(),
    country: z.string().regex(/^[A-Z]{2}$/),
  })
  .strict();
const billingSchema = z
  .object({
    companyLegalName: printable(160),
    invoiceEmail: email,
    taxId: printable(64).nullable(),
    address: addressSchema,
  })
  .strict();

export const checkoutDocumentSnapshotSchema = z
  .object({
    schemaVersion: z.literal(2),
    documentVersion: z.literal(DOCUMENT_VERSION),
    documentKind: z.enum(['receipt', 'paid_invoice']),
    documentNumber: z
      .string()
      .regex(/^(TCA-[A-F0-9]{12}-R|TCA-[0-9]{4}-[0-9]{6})$/),
    issuedAt: z.iso.datetime({ offset: true }),
    seller: z
      .object({
        displayName: printable(160),
        legalName: printable(160),
        supportEmail: email,
        country: z.string().regex(/^[A-Z]{2}$/),
        addressLines: z.array(printable(180)).max(5),
        taxId: printable(64).nullable(),
      })
      .strict(),
    buyer: z
      .object({
        name: printable(220),
        email: email,
        billingProfile: billingSchema.nullable(),
      })
      .strict(),
    purchase: z
      .object({
        offerKey: z.literal(OFFER),
        productName: z.literal(PRODUCT),
        locale: z.literal(LOCALE),
        quantity: z.literal(1),
        unitAmountMinor: z.number().int().positive(),
        discountMinor: z.number().int().nonnegative(),
        taxMinor: z.literal(0),
        totalMinor: z.number().int().positive(),
        currency: z.literal('USD'),
        discountPolicyReference: ref.nullable(),
      })
      .strict(),
    payment: z
      .object({
        method: z.literal('card'),
        status: z.literal('paid'),
        captureMode: z.literal('immediate_automatic_capture'),
        providerEvent: z.literal('authorisation'),
        tandemReference: z.string().regex(/^TCA-[A-F0-9]{12}$/),
        providerReferenceSha256: digest,
        recordedAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
    policy: z
      .object({
        enrollmentTermsVersion: ref,
        enrollmentTermsSha256: digest,
        privacyVersion: ref,
        privacySha256: digest,
        taxPolicyVersion: ref.nullable(),
        taxJurisdiction: ref.nullable(),
        taxClassification: z.literal('not_stated').nullable(),
        retentionPolicyVersion: ref,
        purgeAfter: z.iso.datetime({ offset: true }),
        correctionPolicy: ref,
      })
      .strict(),
  })
  .strict();

export type PaymentCheckoutDocumentSnapshot = Readonly<
  z.infer<typeof checkoutDocumentSnapshotSchema>
>;

export function parseCheckoutDocumentSnapshot(
  input: unknown,
): PaymentCheckoutDocumentSnapshot {
  const parsed = checkoutDocumentSnapshotSchema.safeParse(input);
  if (!parsed.success)
    throw new PaymentDomainError('invalid_checkout_document_snapshot');
  const value = parsed.data;
  if (
    value.purchase.unitAmountMinor - value.purchase.discountMinor !==
      value.purchase.totalMinor ||
    value.purchase.discountMinor > 0 !==
      (value.purchase.discountPolicyReference !== null) ||
    value.seller.taxId !== null ||
    value.policy.purgeAfter !== retentionUntil(value.issuedAt, 7) ||
    (value.documentKind === 'receipt') !==
      value.documentNumber.endsWith('-R') ||
    (value.documentKind === 'receipt' &&
      (value.policy.taxPolicyVersion !== null ||
        value.policy.taxJurisdiction !== null ||
        value.policy.taxClassification !== null)) ||
    (value.documentKind === 'paid_invoice') !==
      (value.buyer.billingProfile !== null &&
        value.policy.taxPolicyVersion !== null &&
        value.policy.taxJurisdiction !== null &&
        value.policy.taxClassification === 'not_stated' &&
        value.seller.addressLines.length > 0)
  )
    throw new PaymentDomainError('invalid_checkout_document_snapshot');
  return Object.freeze(structuredClone(value));
}

export function checkoutDocumentSnapshotSha256(input: unknown): string {
  return sha(stableJson(parseCheckoutDocumentSnapshot(input)));
}

function safePdfText(value: string, font: PDFFont): string {
  const available = new Set(font.getCharacterSet());
  return [...value.normalize('NFC')]
    .map((character) =>
      available.has(character.codePointAt(0) ?? 0) ? character : '□',
    )
    .join('');
}

function wrap(value: string, font: PDFFont, size: number, width: number) {
  const words = safePdfText(value, font).split(/\s+/u);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function money(minor: number): string {
  return `$${(minor / 100).toFixed(2)} USD`;
}

function retentionUntil(issuedAt: string, years: number): string {
  const value = new Date(issuedAt);
  if (Number.isNaN(value.getTime()) || !Number.isInteger(years) || years < 1)
    throw new PaymentDomainError('invalid_checkout_document_configuration');
  value.setUTCFullYear(value.getUTCFullYear() + years);
  return value.toISOString();
}

export async function renderCheckoutDocumentPdf(
  input: unknown,
  fontBytes: Buffer = Buffer.from(ROBOTO_REGULAR_TTF_BASE64, 'base64'),
  logoBytes: Buffer = TANDEM_LOGO_PNG,
): Promise<Buffer> {
  const snapshot = parseCheckoutDocumentSnapshot(input);
  const document = await PDFDocument.create({ updateMetadata: false });
  document.registerFontkit(fontkit);
  const font = await document.embedFont(fontBytes, { subset: true });
  const logo = await document.embedPng(logoBytes);
  document.setTitle(
    `${snapshot.documentKind === 'receipt' ? 'Receipt' : 'Paid invoice'} ${snapshot.documentNumber}`,
  );
  document.setAuthor(snapshot.seller.legalName);
  document.setCreator('Tandem checkout document service');
  document.setProducer('Tandem checkout document service');
  const fixedDate = new Date(snapshot.issuedAt);
  document.setCreationDate(fixedDate);
  document.setModificationDate(fixedDate);
  const page = document.addPage([612, 792]);
  const left = 52;
  const right = 560;
  const green = rgb(0.031, 0.443, 0.247);
  const navy = rgb(0, 0.239, 0.376);
  const ink = rgb(0.09, 0.21, 0.165);
  const muted = rgb(0.39, 0.46, 0.42);
  const lineColor = rgb(0.84, 0.89, 0.86);
  const pale = rgb(0.953, 0.976, 0.961);
  const paleBlue = rgb(0.937, 0.965, 0.98);
  const text = (value: string, x: number, y: number, size = 9, color = ink) =>
    page.drawText(safePdfText(value, font), { x, y, size, font, color });
  const rightText = (
    value: string,
    x: number,
    y: number,
    size = 9,
    color = ink,
  ) => {
    const safe = safePdfText(value, font);
    page.drawText(safe, {
      x: x - font.widthOfTextAtSize(safe, size),
      y,
      size,
      font,
      color,
    });
  };
  const label = (value: string, x: number, y: number) =>
    text(value.toUpperCase(), x, y, 7.5, green);
  const columnText = (
    value: string,
    x: number,
    y: number,
    width: number,
    size = 8.5,
    maxLines = 2,
  ) => {
    const lines = wrap(value, font, size, width).slice(0, maxLines);
    for (const line of lines) {
      text(line, x, y, size);
      y -= 15;
    }
    return y;
  };
  const issued = new Date(snapshot.issuedAt);
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const issuedDate = `${months[issued.getUTCMonth()]} ${issued.getUTCDate()}, ${issued.getUTCFullYear()}`;

  page.drawRectangle({
    x: 0,
    y: 0,
    width: 612,
    height: 792,
    color: rgb(0.97, 0.985, 0.977),
  });
  page.drawRectangle({
    x: 30,
    y: 42,
    width: 552,
    height: 712,
    color: rgb(1, 1, 1),
    borderColor: lineColor,
    borderWidth: 0.8,
  });
  const logoSize = logo.scaleToFit(222, 40);
  page.drawImage(logo, {
    x: left,
    y: 688,
    width: logoSize.width,
    height: logoSize.height,
  });
  page.drawRectangle({ x: 485, y: 696, width: 68, height: 22, color: green });
  const paid = 'PAID';
  text(paid, 519 - font.widthOfTextAtSize(paid, 8) / 2, 703, 8, rgb(1, 1, 1));
  page.drawLine({
    start: { x: left, y: 670 },
    end: { x: right, y: 670 },
    thickness: 0.8,
    color: lineColor,
  });
  text(
    snapshot.documentKind === 'receipt' ? 'Payment receipt' : 'Paid invoice',
    left,
    626,
    24,
    ink,
  );
  text(
    snapshot.documentKind === 'receipt'
      ? 'Confirmation of your completed card payment'
      : 'Business invoice - balance due $0.00 USD',
    left,
    606,
    8.5,
    muted,
  );
  rightText(snapshot.documentNumber, right, 626, 9, navy);
  rightText(`Issued ${issuedDate}`, right, 607, 8, muted);

  label('Seller', left, 568);
  text(snapshot.seller.legalName, left, 548, 10);
  let sellerY = 531;
  for (const addressLine of snapshot.seller.addressLines) {
    text(addressLine, left, sellerY, 8.5);
    sellerY -= 15;
  }
  text(snapshot.seller.supportEmail, left, sellerY, 8.5);

  const buyerX = 344;
  label(
    snapshot.documentKind === 'paid_invoice' ? 'Bill to' : 'Paid by',
    buyerX,
    568,
  );
  const billing = snapshot.buyer.billingProfile;
  let buyerY = columnText(
    billing?.companyLegalName ?? snapshot.buyer.name,
    buyerX,
    548,
    210,
    10,
    2,
  );
  if (snapshot.documentKind === 'paid_invoice' && billing) {
    buyerY = columnText(`Attn: ${snapshot.buyer.name}`, buyerX, buyerY, 210);
    buyerY = columnText(
      [billing.address.street, billing.address.houseNumberOrName]
        .filter(Boolean)
        .join(', '),
      buyerX,
      buyerY,
      210,
      8.5,
    );
    buyerY = columnText(
      `${billing.address.city}, ${billing.address.stateOrProvince ? `${billing.address.stateOrProvince} ` : ''}${billing.address.postalCode}, ${billing.address.country}`,
      buyerX,
      buyerY,
      210,
      8.5,
    );
    if (billing.taxId)
      columnText(`Tax/VAT ID: ${billing.taxId}`, buyerX, buyerY, 210);
  } else {
    columnText(snapshot.buyer.email, buyerX, buyerY, 210, 8.5, 2);
  }

  page.drawRectangle({ x: left, y: 444, width: 508, height: 28, color: pale });
  text('DESCRIPTION', 64, 454, 7.5, muted);
  if (snapshot.documentKind === 'paid_invoice')
    text('QTY', 411, 454, 7.5, muted);
  rightText('AMOUNT', 548, 454, 7.5, muted);
  text(snapshot.purchase.productName, 64, 420, 9.5);
  text(
    snapshot.documentKind === 'paid_invoice'
      ? 'Online professional education'
      : 'Quantity 1  |  English  |  Online course',
    64,
    404,
    8,
    muted,
  );
  if (snapshot.documentKind === 'paid_invoice') text('1', 418, 420, 9);
  rightText(money(snapshot.purchase.unitAmountMinor), 548, 420, 9.5);
  page.drawLine({
    start: { x: left, y: 384 },
    end: { x: right, y: 384 },
    thickness: 0.8,
    color: lineColor,
  });
  const amountRow = (rowLabel: string, value: string, y: number, size = 9) => {
    text(rowLabel, 392, y, size);
    rightText(value, right, y, size);
  };
  amountRow('Subtotal', money(snapshot.purchase.unitAmountMinor), 356);
  if (snapshot.purchase.discountMinor)
    amountRow('Discount', `-${money(snapshot.purchase.discountMinor)}`, 334);
  amountRow(
    'Tax',
    money(snapshot.purchase.taxMinor),
    snapshot.purchase.discountMinor ? 312 : 334,
  );
  const totalY = snapshot.purchase.discountMinor ? 282 : 305;
  if (snapshot.documentKind === 'receipt') {
    amountRow('Total paid', money(snapshot.purchase.totalMinor), totalY, 10.5);
  } else {
    amountRow('Total', money(snapshot.purchase.totalMinor), totalY, 9);
    amountRow(
      'Amount paid',
      money(snapshot.purchase.totalMinor),
      totalY - 30,
      9,
    );
    amountRow('Balance due', '$0.00 USD', totalY - 56, 10.5);
  }

  const paymentY = snapshot.documentKind === 'receipt' ? 208 : 174;
  page.drawRectangle({
    x: left,
    y: paymentY,
    width: 508,
    height: snapshot.documentKind === 'receipt' ? 66 : 54,
    color: paleBlue,
  });
  text(
    'PAYMENT STATUS',
    68,
    paymentY + (snapshot.documentKind === 'receipt' ? 42 : 33),
    8,
    navy,
  );
  text(
    snapshot.documentKind === 'receipt'
      ? 'Paid by card'
      : `Paid by card on ${issuedDate}`,
    68,
    paymentY + 15,
    10,
  );
  if (snapshot.documentKind === 'receipt')
    text(
      `${issuedDate}  |  Reference ${snapshot.payment.tandemReference}`,
      169,
      paymentY + 15,
      8.5,
      muted,
    );

  if (snapshot.documentKind === 'receipt') {
    text('Thank you for learning with Tandem.', left, 164, 12, green);
    text(
      `Questions about this payment? Contact ${snapshot.seller.supportEmail}.`,
      left,
      145,
      8.5,
      muted,
    );
  } else {
    text(
      'Tandem seller EIN is not displayed. A Form W-9 is available securely when required.',
      left,
      137,
      8,
      muted,
    );
    text(
      'Corrections are issued as a replacement document or credit note; the original invoice is not rewritten.',
      left,
      117,
      8,
      muted,
    );
  }
  page.drawLine({
    start: { x: left, y: 66 },
    end: { x: right, y: 66 },
    thickness: 0.6,
    color: lineColor,
  });
  const footerValue = `Document ${snapshot.documentVersion}  |  Terms ${snapshot.policy.enrollmentTermsVersion}  |  Privacy ${snapshot.policy.privacyVersion}`;
  const footerLines = wrap(footerValue, font, 6.8, right - left).slice(0, 2);
  footerLines.forEach((value, index) =>
    text(value, left, 50 - index * 9, 6.8, muted),
  );
  const bytes = await document.save({
    useObjectStreams: false,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
  const result = Buffer.from(bytes);
  if (result.length < 256 || result.length > CHECKOUT_DOCUMENT_MAX_PDF_BYTES)
    throw new PaymentDomainError('checkout_document_pdf_unavailable');
  return result;
}

interface AuthorityRow {
  contract: unknown;
  projection: CheckoutPaymentEvidence | null;
  preparation_id: string;
  purchase_relationship: 'self' | 'other';
  payer_party_id: string;
  participant_party_id: string;
  payer_name: string;
  payer_email: string;
  participant_name: string;
  participant_email: string;
  payment_method: string;
  payment_reference: string;
  payment_recorded_at: Date | string;
  terms_version: string;
  terms_content_sha256: string;
  privacy_version: string;
  privacy_content_sha256: string;
  scope_sha256: string;
  enrollment_active: boolean;
  retry_exception: boolean;
}

export interface PaymentCheckoutDocumentAuthority {
  attemptId: string;
  preparationId: string;
  payerPartyId: number;
  participantPartyId: number;
  relationship: 'self' | 'other';
  payer: { name: string; email: string };
  participant: { name: string; email: string };
  billingProfile: CheckoutBillingProfile | null;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  discountPolicyReference: string | null;
  paymentReference: string;
  tandemReference: string;
  paymentRecordedAt: string;
  termsVersion: string;
  termsSha256: string;
  privacyVersion: string;
  privacySha256: string;
}

export class PgPaymentCheckoutDocumentAuthorityReader {
  private readonly scopeSha256: string;
  constructor(
    private readonly transaction: PaymentTransaction,
    private readonly caller: 'tandem-wordpress-live',
    scope: PaymentScope,
    private readonly readIdentity: (preparationId: string) => Promise<{
      payerPartyId: number;
      participantPartyId: number;
      billingProfile: CheckoutBillingProfile | null;
    } | null>,
  ) {
    this.scopeSha256 = paymentScopeFingerprint(scope);
    if (
      caller !== 'tandem-wordpress-live' ||
      scope.provider !== 'adyen' ||
      scope.environment !== 'live' ||
      scope.store === null
    )
      throw new PaymentDomainError('invalid_checkout_document_configuration');
  }

  async read(attemptId: string): Promise<PaymentCheckoutDocumentAuthority> {
    if (!z.uuid().safeParse(attemptId).success)
      throw new PaymentDomainError('checkout_document_access_denied');
    const row = await this.transaction(async (client) => {
      const result = await client.query<AuthorityRow>(
        `SELECT a.contract,ce.projection,ca.identity_preparation_id preparation_id,
          ip.purchase_relationship,m.payer_party_id::text,m.participant_party_id::text,
          pp.display_name payer_name,lower(pp.primary_email::text) payer_email,
          lp.display_name participant_name,lower(lp.primary_email::text) participant_email,
          ea.payment_method,ea.payment_reference,ca.terms_version,
          ca.terms_content_sha256,ca.privacy_version,ca.privacy_content_sha256,
          ea.scope_sha256,
          EXISTS(SELECT 1 FROM business_v2.student_enrollments_v2 e
            WHERE e.enrollment_key=ea.enrollment_key AND e.state='active') enrollment_active,
          EXISTS(SELECT 1 FROM business_v2.payment_session_retry_exceptions re
            WHERE re.attempt_id=a.attempt_id) retry_exception,
          (SELECT e.received_at FROM business_v2.payment_events e
            WHERE e.attempt_id=a.attempt_id AND e.scope_sha256=$3
              AND e.fact->>'kind'='authorization' AND e.fact->>'success'='true'
            ORDER BY e.received_at,e.event_id LIMIT 1) payment_recorded_at
         FROM business_v2.payment_attempts a
         JOIN business_v2.payment_checkout_admission_evidence ca
           ON ca.attempt_id=a.attempt_id AND ca.caller=$2 AND ca.scope_sha256=$3
         JOIN business_v2.payment_identity_preparations ip
           ON ip.preparation_id=ca.identity_preparation_id AND ip.caller=$2
         JOIN business_v2.payment_identity_materializations m
           ON m.caller=ip.caller AND m.preparation_id=ip.preparation_id
         JOIN business_v2.parties pp ON pp.id=m.payer_party_id
           AND pp.party_type='person' AND pp.merged_into IS NULL AND pp.primary_email IS NOT NULL
         JOIN business_v2.parties lp ON lp.id=m.participant_party_id
           AND lp.party_type='person' AND lp.merged_into IS NULL AND lp.primary_email IS NOT NULL
         JOIN business_v2.payment_enrollment_admissions ea
           ON ea.attempt_id=a.attempt_id AND ea.checkout_caller=$2 AND ea.scope_sha256=$3
         JOIN business_v2.payment_checkout_evidence ce ON ce.attempt_id=a.attempt_id
         WHERE a.attempt_id=$1`,
        [attemptId, this.caller, this.scopeSha256],
      );
      if (result.rowCount !== 1)
        throw new PaymentDomainError('checkout_document_access_denied');
      return result.rows[0];
    });
    const attempt = validateAttempt(row.contract);
    const identity = await this.readIdentity(row.preparation_id);
    const payerPartyId = Number(row.payer_party_id);
    const participantPartyId = Number(row.participant_party_id);
    const recordedAt = new Date(row.payment_recorded_at);
    const payment = row.projection?.payments.filter(
      (candidate) => candidate.evidence.authorization === 'authorized',
    );
    if (
      paymentScopeFingerprint(attempt.scope) !== this.scopeSha256 ||
      attempt.quote.offerKey !== OFFER ||
      attempt.quote.locale !== LOCALE ||
      attempt.quote.currency !== 'USD' ||
      attempt.quote.finalAmount < 1 ||
      row.scope_sha256 !== this.scopeSha256 ||
      row.payment_method !== 'card' ||
      row.projection?.state !== 'authorization_recorded' ||
      payment?.length !== 1 ||
      payment[0].paymentReference !== row.payment_reference ||
      !row.enrollment_active ||
      row.retry_exception ||
      Number.isNaN(recordedAt.getTime()) ||
      !identity ||
      identity.payerPartyId !== payerPartyId ||
      identity.participantPartyId !== participantPartyId ||
      !Number.isSafeInteger(payerPartyId) ||
      !Number.isSafeInteger(participantPartyId)
    )
      throw new PaymentDomainError('checkout_document_authority_conflict');
    const tandemReference = `TCA-${paymentPayloadFingerprint(
      row.payment_reference,
    )
      .slice(0, 12)
      .toUpperCase()}`;
    return Object.freeze({
      attemptId,
      preparationId: row.preparation_id,
      payerPartyId,
      participantPartyId,
      relationship: row.purchase_relationship,
      payer: {
        name: printable(220).parse(row.payer_name),
        email: email.parse(row.payer_email),
      },
      participant: {
        name: printable(220).parse(row.participant_name),
        email: email.parse(row.participant_email),
      },
      billingProfile: identity.billingProfile,
      originalAmount: attempt.quote.originalAmount,
      discountAmount: attempt.quote.discountAmount,
      finalAmount: attempt.quote.finalAmount,
      discountPolicyReference: attempt.quote.discountPolicyReference,
      paymentReference: row.payment_reference,
      tandemReference,
      paymentRecordedAt: recordedAt.toISOString(),
      termsVersion: row.terms_version,
      termsSha256: row.terms_content_sha256,
      privacyVersion: row.privacy_version,
      privacySha256: row.privacy_content_sha256,
    });
  }
}

export interface PaymentCheckoutDocumentRecord {
  documentId: string;
  attemptId: string;
  kind: PaymentCheckoutDocumentKind;
  documentNumber: string;
  snapshot: PaymentCheckoutDocumentSnapshot;
  snapshotSha256: string;
  pdfSha256: string;
  pdf: Buffer;
  issuedAt: string;
}

type DocumentRow = {
  document_id: string;
  scope_sha256: string;
  caller: string;
  attempt_id: string;
  document_kind: PaymentCheckoutDocumentKind;
  document_version: string;
  document_number: string;
  snapshot_sha256: string;
  encrypted_snapshot: string;
  pdf_sha256: string;
  encrypted_pdf: string;
  issued_at: Date | string;
  retention_until: Date | string;
};

type EmailRow = Record<string, unknown>;
export interface PaymentCheckoutDocumentEmailJob {
  jobId: string;
  documentId: string;
  state: 'queued' | 'claimed' | 'acknowledged' | 'confirmed' | 'held';
  uncertainAcceptance: boolean;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  version: number;
}

export interface PaymentCheckoutDocumentPurgeCandidate {
  document: PaymentCheckoutDocumentRecord;
  emailJobs: readonly {
    jobId: string;
    recipient: string;
    gmailMessageId: string | null;
    gmailThreadId: string | null;
  }[];
}

function emailJob(row: EmailRow): PaymentCheckoutDocumentEmailJob {
  return {
    jobId: String(row.job_id),
    documentId: String(row.document_id),
    state: row.state as PaymentCheckoutDocumentEmailJob['state'],
    uncertainAcceptance: row.uncertain_acceptance === true,
    leaseToken: row.lease_token === null ? null : String(row.lease_token),
    leaseExpiresAt:
      row.lease_expires_at === null
        ? null
        : new Date(String(row.lease_expires_at)).toISOString(),
    gmailMessageId:
      row.gmail_message_id === null ? null : String(row.gmail_message_id),
    gmailThreadId:
      row.gmail_thread_id === null ? null : String(row.gmail_thread_id),
    version: Number(row.version),
  };
}

export class PgPaymentCheckoutDocumentStore {
  private readonly scopeSha256: string;
  private readonly pdfKey: Buffer;
  constructor(
    private readonly transaction: PaymentTransaction,
    private readonly caller: string,
    scope: PaymentScope,
    private readonly vault: PaymentPayloadVault,
    pdfKey: Buffer,
    private readonly uuid: () => string = randomUUID,
  ) {
    this.scopeSha256 = paymentScopeFingerprint(scope);
    this.pdfKey = Buffer.from(pdfKey);
    if (this.pdfKey.length !== 32)
      throw new PaymentDomainError('invalid_checkout_document_configuration');
  }

  private sealPdf(pdf: Buffer, documentId: string): string {
    if (
      !Buffer.isBuffer(pdf) ||
      pdf.length < 256 ||
      pdf.length > CHECKOUT_DOCUMENT_MAX_PDF_BYTES
    )
      throw new PaymentDomainError('checkout_document_pdf_unavailable');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.pdfKey, iv);
    cipher.setAAD(Buffer.from(`${documentId}:checkout-document-pdf`));
    const encrypted = Buffer.concat([cipher.update(pdf), cipher.final()]);
    return [
      'pdf-v1',
      iv.toString('base64url'),
      encrypted.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
    ].join('.');
  }

  private openPdf(envelope: string, documentId: string): Buffer {
    try {
      if (typeof envelope !== 'string' || envelope.length > 1_500_000)
        throw new Error();
      const [version, iv, body, tag, extra] = envelope.split('.');
      if (
        version !== 'pdf-v1' ||
        extra !== undefined ||
        Buffer.from(iv, 'base64url').length !== 12 ||
        Buffer.from(tag, 'base64url').length !== 16
      )
        throw new Error();
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.pdfKey,
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAAD(Buffer.from(`${documentId}:checkout-document-pdf`));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      const pdf = Buffer.concat([
        decipher.update(Buffer.from(body, 'base64url')),
        decipher.final(),
      ]);
      if (pdf.length < 256 || pdf.length > CHECKOUT_DOCUMENT_MAX_PDF_BYTES)
        throw new Error();
      return pdf;
    } catch {
      throw new PaymentDomainError('checkout_document_evidence_corrupt');
    }
  }

  private async durable<T>(work: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await work();
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : '';
        if (!['40001', '40P01'].includes(code) || attempt >= 2) throw error;
      }
    }
  }

  private record(row: DocumentRow): PaymentCheckoutDocumentRecord {
    const json = this.vault.open(
      row.encrypted_snapshot,
      `${row.document_id}:checkout-document-snapshot`,
    );
    const snapshot = parseCheckoutDocumentSnapshot(JSON.parse(json));
    const pdf = this.openPdf(row.encrypted_pdf, row.document_id);
    if (
      checkoutDocumentSnapshotSha256(snapshot) !== row.snapshot_sha256 ||
      sha(pdf) !== row.pdf_sha256 ||
      row.scope_sha256 !== this.scopeSha256 ||
      row.caller !== this.caller ||
      row.document_version !== DOCUMENT_VERSION ||
      snapshot.documentNumber !== row.document_number ||
      snapshot.documentKind !== row.document_kind ||
      snapshot.issuedAt !== new Date(row.issued_at).toISOString()
    )
      throw new PaymentDomainError('checkout_document_evidence_corrupt');
    return {
      documentId: row.document_id,
      attemptId: row.attempt_id,
      kind: row.document_kind,
      documentNumber: row.document_number,
      snapshot,
      snapshotSha256: row.snapshot_sha256,
      pdfSha256: row.pdf_sha256,
      pdf,
      issuedAt: new Date(row.issued_at).toISOString(),
    };
  }

  async ensure(
    kind: PaymentCheckoutDocumentKind,
    authority: PaymentCheckoutDocumentAuthority,
    config: WebsiteCheckoutDocumentConfig,
  ): Promise<PaymentCheckoutDocumentRecord> {
    return this.durable(() =>
      this.transaction(async (client) => {
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`checkout-document:${authority.attemptId}:${kind}`],
        );
        const purged = await client.query(
          `SELECT 1 FROM business_v2.payment_checkout_document_tombstones
           WHERE attempt_id_sha256=$1 AND document_kind=$2`,
          [sha(authority.attemptId), kind],
        );
        if (purged.rowCount)
          throw new PaymentDomainError('checkout_document_expired');
        const prior = await client.query<DocumentRow>(
          `SELECT * FROM business_v2.payment_checkout_documents
           WHERE attempt_id=$1 AND document_kind=$2`,
          [authority.attemptId, kind],
        );
        if (prior.rowCount === 1) return this.record(prior.rows[0]);
        if (prior.rowCount)
          throw new PaymentDomainError('checkout_document_evidence_conflict');
        if (kind === 'receipt' && !config.receiptEnabled)
          throw new PaymentDomainError('receipt_unavailable');
        if (kind === 'paid_invoice' && !config.paidInvoice.enabled)
          throw new PaymentDomainError('paid_invoice_unavailable');
        if (kind === 'paid_invoice' && !authority.billingProfile)
          throw new PaymentDomainError('paid_invoice_details_required');
        const documentId = this.uuid();
        const documentNumber =
          kind === 'receipt'
            ? `${authority.tandemReference}-R`
            : await this.allocateInvoiceNumber(
                client,
                authority.paymentRecordedAt,
                config,
              );
        const invoice = config.paidInvoice.enabled ? config.paidInvoice : null;
        const snapshot = parseCheckoutDocumentSnapshot({
          schemaVersion: 2,
          documentVersion: DOCUMENT_VERSION,
          documentKind: kind,
          documentNumber,
          issuedAt: authority.paymentRecordedAt,
          seller:
            kind === 'paid_invoice' && invoice
              ? { ...invoice.seller }
              : { ...RECEIPT_SELLER },
          buyer: {
            name: authority.payer.name,
            email: authority.payer.email,
            billingProfile: authority.billingProfile
              ? {
                  companyLegalName: authority.billingProfile.companyLegalName,
                  invoiceEmail: authority.billingProfile.invoiceEmail,
                  taxId: authority.billingProfile.taxId,
                  address: authority.billingProfile.address,
                }
              : null,
          },
          purchase: {
            offerKey: OFFER,
            productName: PRODUCT,
            locale: LOCALE,
            quantity: 1,
            unitAmountMinor: authority.originalAmount,
            discountMinor: authority.discountAmount,
            taxMinor: 0,
            totalMinor: authority.finalAmount,
            currency: 'USD',
            discountPolicyReference: authority.discountPolicyReference,
          },
          payment: {
            method: 'card',
            status: 'paid',
            captureMode: 'immediate_automatic_capture',
            providerEvent: 'authorisation',
            tandemReference: authority.tandemReference,
            providerReferenceSha256: sha(authority.paymentReference),
            recordedAt: authority.paymentRecordedAt,
          },
          policy: {
            enrollmentTermsVersion: authority.termsVersion,
            enrollmentTermsSha256: authority.termsSha256,
            privacyVersion: authority.privacyVersion,
            privacySha256: authority.privacySha256,
            taxPolicyVersion: invoice?.taxPolicy.version ?? null,
            taxJurisdiction: invoice?.taxPolicy.jurisdiction ?? null,
            taxClassification: invoice?.taxPolicy.classification ?? null,
            retentionPolicyVersion: config.retentionPolicy.version,
            purgeAfter: retentionUntil(
              authority.paymentRecordedAt,
              config.retentionPolicy.years,
            ),
            correctionPolicy:
              invoice?.correctionPolicy ??
              'original_payment_evidence_immutable',
          },
        });
        const snapshotJson = stableJson(snapshot);
        const pdf = await renderCheckoutDocumentPdf(snapshot);
        const inserted = await client.query<DocumentRow>(
          `INSERT INTO business_v2.payment_checkout_documents
           (document_id,scope_sha256,caller,attempt_id,document_kind,document_version,
            document_number,snapshot_sha256,encrypted_snapshot,pdf_sha256,encrypted_pdf,
            issued_at,retention_until,retention_policy_version,amount_minor,currency,attempt_id_sha256)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
          [
            documentId,
            this.scopeSha256,
            this.caller,
            authority.attemptId,
            kind,
            DOCUMENT_VERSION,
            documentNumber,
            sha(snapshotJson),
            this.vault.seal(
              snapshotJson,
              `${documentId}:checkout-document-snapshot`,
            ),
            sha(pdf),
            this.sealPdf(pdf, documentId),
            authority.paymentRecordedAt,
            snapshot.policy.purgeAfter,
            config.retentionPolicy.version,
            snapshot.purchase.totalMinor,
            snapshot.purchase.currency,
            sha(authority.attemptId),
          ],
        );
        if (inserted.rowCount !== 1)
          throw new PaymentDomainError('checkout_document_write_unknown');
        return this.record(inserted.rows[0]);
      }),
    );
  }

  private async allocateInvoiceNumber(
    client: Pick<PoolClient, 'query'>,
    paymentRecordedAt: string,
    config: WebsiteCheckoutDocumentConfig,
  ): Promise<string> {
    if (!config.paidInvoice.enabled)
      throw new PaymentDomainError('paid_invoice_unavailable');
    const year = new Date(paymentRecordedAt).getUTCFullYear();
    const series = `${config.paidInvoice.sequencePrefix}-${year}`;
    const result = await client.query<{ allocated: string }>(
      `INSERT INTO business_v2.payment_checkout_document_sequences(series_key,next_value,updated_at)
       VALUES($1,2,clock_timestamp())
       ON CONFLICT(series_key) DO UPDATE SET next_value=business_v2.payment_checkout_document_sequences.next_value+1,
         updated_at=clock_timestamp()
       RETURNING (next_value-1)::text allocated`,
      [series],
    );
    const allocated = Number(result.rows[0]?.allocated);
    if (!Number.isSafeInteger(allocated) || allocated < 1 || allocated > 999999)
      throw new PaymentDomainError('paid_invoice_sequence_unavailable');
    return `${series}-${String(allocated).padStart(6, '0')}`;
  }

  async issueDownloadCapability(
    document: PaymentCheckoutDocumentRecord,
    ttlMs: number,
  ): Promise<{ capability: string; expiresAt: string }> {
    const capability = `dcap_${randomBytes(32).toString('base64url')}`;
    const capabilityId = this.uuid();
    return this.transaction(async (client) => {
      const result = await client.query<{
        issued_at: string;
        expires_at: string;
      }>(
        `INSERT INTO business_v2.payment_checkout_document_capabilities
         (capability_id,document_id,attempt_id,document_kind,capability_sha256,issued_at,expires_at)
         VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+($6::bigint*interval '1 millisecond'))
         RETURNING issued_at,expires_at`,
        [
          capabilityId,
          document.documentId,
          document.attemptId,
          document.kind,
          sha(capability),
          ttlMs,
        ],
      );
      if (result.rowCount !== 1)
        throw new PaymentDomainError(
          'checkout_document_capability_unavailable',
        );
      return {
        capability,
        expiresAt: new Date(result.rows[0].expires_at).toISOString(),
      };
    });
  }

  async readDownload(
    attemptId: string,
    kind: PaymentCheckoutDocumentKind,
    capability: string,
  ): Promise<PaymentCheckoutDocumentRecord> {
    if (!/^dcap_[A-Za-z0-9_-]{43}$/u.test(capability))
      throw new PaymentDomainError('checkout_document_access_denied');
    return this.transaction(async (client) => {
      const result = await client.query<DocumentRow>(
        `SELECT d.* FROM business_v2.payment_checkout_document_capabilities c
         JOIN business_v2.payment_checkout_documents d ON d.document_id=c.document_id
         WHERE c.capability_sha256=$1 AND c.attempt_id=$2 AND c.document_kind=$3
           AND c.expires_at>clock_timestamp() AND d.attempt_id=$2 AND d.document_kind=$3`,
        [sha(capability), attemptId, kind],
      );
      if (result.rowCount !== 1)
        throw new PaymentDomainError('checkout_document_access_denied');
      return this.record(result.rows[0]);
    });
  }

  async ensureEmailJob(
    document: PaymentCheckoutDocumentRecord,
    recipientEmail: string,
    contentSha256: string,
    now: string,
  ): Promise<PaymentCheckoutDocumentEmailJob> {
    const recipient = email.parse(recipientEmail);
    const jobId = this.uuid();
    return this.transaction(async (client) => {
      const inserted = await client.query<EmailRow>(
        `INSERT INTO business_v2.payment_checkout_document_email_jobs
         (job_id,document_id,attempt_id,document_kind,recipient_email_sha256,
          encrypted_recipient_email,content_sha256,state,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,'queued',$8,$8)
         ON CONFLICT(document_id,recipient_email_sha256) DO NOTHING
         RETURNING *`,
        [
          jobId,
          document.documentId,
          document.attemptId,
          document.kind,
          sha(recipient),
          this.vault.seal(
            recipient,
            `${document.documentId}:document-email-recipient`,
          ),
          contentSha256,
          now,
        ],
      );
      const result = inserted.rowCount
        ? inserted
        : await client.query<EmailRow>(
            `SELECT * FROM business_v2.payment_checkout_document_email_jobs
             WHERE document_id=$1 AND recipient_email_sha256=$2 FOR UPDATE`,
            [document.documentId, sha(recipient)],
          );
      if (result.rowCount !== 1)
        throw new PaymentDomainError('checkout_document_email_unavailable');
      const row = result.rows[0];
      if (String(row.content_sha256) !== contentSha256)
        throw new PaymentDomainError('checkout_document_email_conflict');
      const opened = this.vault.open(
        String(row.encrypted_recipient_email),
        `${document.documentId}:document-email-recipient`,
      );
      if (opened !== recipient)
        throw new PaymentDomainError('checkout_document_email_conflict');
      if (inserted.rowCount === 1)
        await this.emailReceipt(
          client,
          row,
          'queued',
          'pending',
          'email_queued',
          contentSha256,
          now,
        );
      return emailJob(row);
    });
  }

  private async emailReceipt(
    client: Pick<PoolClient, 'query'>,
    row: EmailRow,
    stage: string,
    outcome: string,
    resultCode: string,
    evidenceSha256: string,
    now: string,
  ) {
    await client.query(
      `INSERT INTO business_v2.payment_checkout_document_email_receipts
       (job_id,version,stage,outcome,result_code,evidence_sha256,occurred_at)
       VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(job_id,version) DO NOTHING`,
      [
        row.job_id,
        row.version,
        stage,
        outcome,
        resultCode,
        evidenceSha256,
        now,
      ],
    );
  }

  async claimEmail(jobId: string, now: string, leaseExpiresAt: string) {
    return this.transitionEmail(
      jobId,
      `state='claimed',lease_token=$2,lease_expires_at=$3,attempt_count=attempt_count+1,uncertain_acceptance=false,last_error_code=NULL`,
      [this.uuid(), leaseExpiresAt],
      "state IN ('queued','held') AND uncertain_acceptance=false AND (lease_expires_at IS NULL OR lease_expires_at<=$4)",
      [now],
      'claimed',
      'pending',
      'email_claimed',
      sha(`${jobId}:${now}:claimed`),
      now,
    );
  }

  async acknowledgeEmail(
    jobId: string,
    leaseToken: string,
    messageId: string,
    threadId: string,
    now: string,
  ) {
    return this.transitionEmail(
      jobId,
      `state='acknowledged',gmail_message_id=$2,gmail_thread_id=$3,lease_token=NULL,lease_expires_at=NULL`,
      [messageId, threadId],
      "state='claimed' AND lease_token=$4",
      [leaseToken],
      'sent_acknowledged',
      'pending',
      'gmail_acknowledged',
      sha(`${messageId}:${threadId}`),
      now,
    );
  }

  async adoptEmail(
    jobId: string,
    messageId: string,
    threadId: string,
    now: string,
  ) {
    return this.transitionEmail(
      jobId,
      `state='acknowledged',gmail_message_id=$2,gmail_thread_id=$3,lease_token=NULL,lease_expires_at=NULL,uncertain_acceptance=false`,
      [messageId, threadId],
      "state<>'confirmed'",
      [],
      'sent_acknowledged',
      'pending',
      'gmail_sent_adopted',
      sha(`${messageId}:${threadId}:adopted`),
      now,
    );
  }

  async confirmEmail(
    jobId: string,
    messageId: string,
    threadId: string,
    evidenceSha256: string,
    now: string,
  ) {
    return this.transitionEmail(
      jobId,
      `state='confirmed',lease_token=NULL,lease_expires_at=NULL,uncertain_acceptance=false,last_error_code=NULL`,
      [],
      "state='acknowledged' AND gmail_message_id=$2 AND gmail_thread_id=$3",
      [messageId, threadId],
      'readback',
      'verified',
      'gmail_readback_verified',
      evidenceSha256,
      now,
    );
  }

  async holdEmail(
    jobId: string,
    code: string,
    uncertain: boolean,
    evidenceSha256: string,
    now: string,
  ) {
    return this.transitionEmail(
      jobId,
      `state='held',uncertain_acceptance=$2,lease_token=NULL,lease_expires_at=NULL,last_error_code=$3`,
      [uncertain, code],
      "state<>'confirmed'",
      [],
      'held',
      'held',
      code,
      evidenceSha256,
      now,
    );
  }

  private async transitionEmail(
    jobId: string,
    setSql: string,
    setParams: unknown[],
    whereSql: string,
    whereParams: unknown[],
    stage: string,
    outcome: string,
    code: string,
    evidenceSha256: string,
    now: string,
  ) {
    return this.transaction(async (client) => {
      const current = await client.query<EmailRow>(
        'SELECT * FROM business_v2.payment_checkout_document_email_jobs WHERE job_id=$1 FOR UPDATE',
        [jobId],
      );
      if (current.rowCount !== 1)
        throw new PaymentDomainError('checkout_document_email_unavailable');
      if (current.rows[0].state === 'confirmed')
        return emailJob(current.rows[0]);
      const params = [jobId, ...setParams, ...whereParams, now];
      const nowIndex = params.length;
      const updated = await client.query<EmailRow>(
        `UPDATE business_v2.payment_checkout_document_email_jobs SET ${setSql},version=version+1,updated_at=$${nowIndex}
         WHERE job_id=$1 AND ${whereSql} RETURNING *`,
        params,
      );
      if (updated.rowCount !== 1)
        throw new PaymentDomainError('checkout_document_email_conflict');
      await this.emailReceipt(
        client,
        updated.rows[0],
        stage,
        outcome,
        code,
        evidenceSha256,
        now,
      );
      return emailJob(updated.rows[0]);
    });
  }

  async recordRetentionEvent(
    documentId: string,
    eventKind: 'hold_placed' | 'hold_released',
    decisionReference: string,
    receiptSha256: string,
    occurredAt: string,
  ): Promise<void> {
    ref.parse(decisionReference);
    digest.parse(receiptSha256);
    z.iso.datetime({ offset: true }).parse(occurredAt);
    await this.transaction(async (client) => {
      const document = await client.query(
        `SELECT document_id FROM business_v2.payment_checkout_documents
         WHERE document_id=$1 FOR UPDATE`,
        [documentId],
      );
      if (document.rowCount !== 1)
        throw new PaymentDomainError('checkout_document_access_denied');
      const latest = await client.query<{ event_kind: string }>(
        `SELECT event_kind FROM business_v2.payment_checkout_document_retention_events
         WHERE document_id=$1 ORDER BY occurred_at DESC,event_id DESC LIMIT 1`,
        [documentId],
      );
      const expected =
        eventKind === 'hold_placed'
          ? ['hold_released', undefined]
          : ['hold_placed'];
      if (!expected.includes(latest.rows[0]?.event_kind))
        throw new PaymentDomainError('checkout_document_retention_conflict');
      const inserted = await client.query(
        `INSERT INTO business_v2.payment_checkout_document_retention_events
         (event_id,document_id,event_kind,decision_reference,receipt_sha256,occurred_at)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [
          this.uuid(),
          documentId,
          eventKind,
          decisionReference,
          receiptSha256,
          occurredAt,
        ],
      );
      if (inserted.rowCount !== 1)
        throw new PaymentDomainError('checkout_document_retention_conflict');
    });
  }

  async dueForPurge(
    now: string,
    limit: number,
  ): Promise<readonly PaymentCheckoutDocumentPurgeCandidate[]> {
    z.iso.datetime({ offset: true }).parse(now);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new PaymentDomainError('invalid_checkout_document_configuration');
    return this.transaction(async (client) => {
      const documents = await client.query<DocumentRow>(
        `SELECT d.* FROM business_v2.payment_checkout_documents d
         WHERE d.retention_until<=$1
           AND COALESCE((
             SELECT e.event_kind
             FROM business_v2.payment_checkout_document_retention_events e
             WHERE e.document_id=d.document_id
             ORDER BY e.occurred_at DESC,e.event_id DESC LIMIT 1
           ),'hold_released')<>'hold_placed'
         ORDER BY d.retention_until,d.document_id LIMIT $2`,
        [now, limit],
      );
      const result: PaymentCheckoutDocumentPurgeCandidate[] = [];
      for (const row of documents.rows) {
        const document = this.record(row);
        const emailRows = await client.query<EmailRow>(
          `SELECT job_id,encrypted_recipient_email,gmail_message_id,gmail_thread_id
           FROM business_v2.payment_checkout_document_email_jobs
           WHERE document_id=$1 ORDER BY job_id`,
          [document.documentId],
        );
        const emailJobs = emailRows.rows.map((emailRow) => ({
          jobId: String(emailRow.job_id),
          recipient: email.parse(
            this.vault.open(
              String(emailRow.encrypted_recipient_email),
              `${document.documentId}:document-email-recipient`,
            ),
          ),
          gmailMessageId:
            emailRow.gmail_message_id === null
              ? null
              : String(emailRow.gmail_message_id),
          gmailThreadId:
            emailRow.gmail_thread_id === null
              ? null
              : String(emailRow.gmail_thread_id),
        }));
        result.push({ document, emailJobs });
      }
      return result;
    });
  }

  async purge(
    candidate: PaymentCheckoutDocumentPurgeCandidate,
    externalDeletionEvidenceSha256: readonly string[],
    purgedAt: string,
  ): Promise<'purged' | 'already_purged'> {
    z.iso.datetime({ offset: true }).parse(purgedAt);
    for (const value of externalDeletionEvidenceSha256) digest.parse(value);
    if (externalDeletionEvidenceSha256.length !== candidate.emailJobs.length)
      throw new PaymentDomainError('checkout_document_retention_conflict');
    const purgeReceiptSha256 = sha(
      stableJson({
        schemaVersion: 1,
        documentId: candidate.document.documentId,
        documentKind: candidate.document.kind,
        documentNumber: candidate.document.documentNumber,
        issuedAt: candidate.document.issuedAt,
        amountMinor: candidate.document.snapshot.purchase.totalMinor,
        currency: candidate.document.snapshot.purchase.currency,
        snapshotSha256: candidate.document.snapshotSha256,
        pdfSha256: candidate.document.pdfSha256,
        retentionPolicyVersion:
          candidate.document.snapshot.policy.retentionPolicyVersion,
        externalDeletionEvidenceSha256: [
          ...externalDeletionEvidenceSha256,
        ].sort(),
      }),
    );
    return this.transaction(async (client) => {
      const result = await client.query<{ outcome: string }>(
        `SELECT business_v2.purge_payment_checkout_document($1,$2,$3) outcome`,
        [candidate.document.documentId, purgeReceiptSha256, purgedAt],
      );
      const outcome = result.rows[0]?.outcome;
      if (outcome !== 'purged' && outcome !== 'already_purged')
        throw new PaymentDomainError('checkout_document_retention_conflict');
      return outcome;
    });
  }
}

export interface WebsiteCheckoutDocumentGmail {
  verifyAccount(): Promise<void>;
  findExact(input: {
    to: string;
    subject: string;
    filename: string;
    pdfSha256: string;
  }): Promise<{ messageId: string; threadId: string } | null>;
  send(input: {
    to: string;
    subject: string;
    body: string;
    filename: string;
    pdf: Buffer;
  }): Promise<{ messageId: string; threadId: string }>;
  readback(input: {
    messageId: string;
    threadId: string;
    to: string;
    subject: string;
    filename: string;
    pdfSha256: string;
  }): Promise<{ messageId: string; threadId: string; evidenceSha256: string }>;
  deleteExact(input: {
    messageId: string | null;
    threadId: string | null;
    to: string;
    subject: string;
    filename: string;
    pdfSha256: string;
  }): Promise<{ evidenceSha256: string }>;
}

function header(
  headers: readonly gmail_v1.Schema$MessagePartHeader[],
  name: string,
) {
  return (
    headers
      .find((value) => value.name?.toLowerCase() === name)
      ?.value?.trim() ?? ''
  );
}
function headerEmail(value: string) {
  return (value.match(/<([^<>]+)>$/u)?.[1] ?? value).trim().toLowerCase();
}

export class CanonicalGmailWebsiteCheckoutDocumentSender implements WebsiteCheckoutDocumentGmail {
  constructor(
    private readonly gmail: Pick<gmail_v1.Gmail, 'users'>,
    private readonly senderAccount: string,
    private readonly senderAddress: string,
    private readonly sendFn: typeof sendEmail = sendEmail,
    private readonly writeGuard: typeof assertExternalWriteAllowed = assertExternalWriteAllowed,
  ) {}

  async verifyAccount() {
    const profile = await this.gmail.users.getProfile({ userId: 'me' });
    if (
      headerEmail(profile.data.emailAddress ?? '') !==
      this.senderAccount.toLowerCase()
    )
      throw new Error('document_gmail_account_mismatch');
    const from = headerEmail(this.senderAddress);
    if (from === this.senderAccount.toLowerCase()) return;
    const aliases = await this.gmail.users.settings.sendAs.list({
      userId: 'me',
    });
    const exact = (aliases.data.sendAs ?? []).filter(
      (candidate) =>
        headerEmail(candidate.sendAsEmail ?? '') === from &&
        candidate.verificationStatus === 'accepted',
    );
    if (exact.length !== 1) throw new Error('document_gmail_send_as_mismatch');
    const read = await this.gmail.users.settings.sendAs.get({
      userId: 'me',
      sendAsEmail: from,
    });
    if (
      headerEmail(read.data.sendAsEmail ?? '') !== from ||
      read.data.verificationStatus !== 'accepted'
    )
      throw new Error('document_gmail_send_as_mismatch');
  }

  private async exact(input: {
    messageId: string;
    threadId: string;
    to: string;
    subject: string;
    filename: string;
    pdfSha256: string;
  }) {
    const value = await this.gmail.users.messages.get({
      userId: 'me',
      id: input.messageId,
      format: 'full',
    });
    const headers = value.data.payload?.headers ?? [];
    const parts: gmail_v1.Schema$MessagePart[] = [];
    const collect = (part: gmail_v1.Schema$MessagePart | undefined) => {
      if (!part) return;
      parts.push(part);
      for (const child of part.parts ?? []) collect(child);
    };
    collect(value.data.payload);
    const matches = parts.filter(
      (part) =>
        part.filename === input.filename && part.mimeType === 'application/pdf',
    );
    let decodedAttachment = Buffer.alloc(0);
    if (matches.length === 1) {
      const part = matches[0];
      let encoded = part.body?.data ?? '';
      if (!encoded && part.body?.attachmentId) {
        const attachment = await this.gmail.users.messages.attachments.get({
          userId: 'me',
          messageId: input.messageId,
          id: part.body.attachmentId,
        });
        encoded = attachment.data.data ?? '';
      }
      decodedAttachment = Buffer.from(
        encoded.replace(/-/gu, '+').replace(/_/gu, '/'),
        'base64',
      );
    }
    if (
      value.data.id !== input.messageId ||
      value.data.threadId !== input.threadId ||
      headerEmail(header(headers, 'to')) !== input.to.toLowerCase() ||
      headerEmail(header(headers, 'from')) !==
        headerEmail(this.senderAddress) ||
      header(headers, 'subject') !== input.subject ||
      matches.length !== 1 ||
      sha(decodedAttachment) !== input.pdfSha256
    )
      throw new Error('document_gmail_readback_mismatch');
    return {
      messageId: input.messageId,
      threadId: input.threadId,
      evidenceSha256: sha(
        stableJson({
          messageId: input.messageId,
          threadId: input.threadId,
          to: input.to,
          from: headerEmail(this.senderAddress),
          subject: input.subject,
          filename: input.filename,
          pdfSha256: input.pdfSha256,
        }),
      ),
    };
  }

  async findExact(input: {
    to: string;
    subject: string;
    filename: string;
    pdfSha256: string;
  }) {
    const found = await this.gmail.users.messages.list({
      userId: 'me',
      q: `in:sent to:${input.to.toLowerCase()} subject:"${input.subject.replace(/["\\]/gu, '')}"`,
      maxResults: 2,
      includeSpamTrash: false,
    });
    const rows = found.data.messages ?? [];
    if (rows.length > 1) throw new Error('document_gmail_sent_match_ambiguous');
    if (!rows.length) return null;
    const messageId = rows[0]?.id ?? '';
    const threadId = rows[0]?.threadId ?? '';
    if (!messageId || !threadId)
      throw new Error('document_gmail_sent_match_invalid');
    await this.exact({ ...input, messageId, threadId });
    return { messageId, threadId };
  }

  async send(input: {
    to: string;
    subject: string;
    body: string;
    filename: string;
    pdf: Buffer;
  }) {
    this.writeGuard({
      system: 'gmail',
      actionClass: 'c3_external_communication',
      source: 'host:website-checkout-document',
    });
    return this.sendFn(
      {
        to: input.to,
        subject: input.subject,
        body: input.body,
        attachments: [
          {
            filename: input.filename,
            mimeType: 'application/pdf',
            content: input.pdf,
          },
        ],
      },
      { getClient: () => this.gmail as gmail_v1.Gmail },
    );
  }

  readback(input: {
    messageId: string;
    threadId: string;
    to: string;
    subject: string;
    filename: string;
    pdfSha256: string;
  }) {
    return this.exact(input);
  }

  async deleteExact(input: {
    messageId: string | null;
    threadId: string | null;
    to: string;
    subject: string;
    filename: string;
    pdfSha256: string;
  }) {
    let messageId = input.messageId;
    let threadId = input.threadId;
    if ((messageId === null) !== (threadId === null))
      throw new Error('document_gmail_sent_match_invalid');
    if (messageId && threadId) {
      try {
        await this.exact({ ...input, messageId, threadId });
      } catch (error) {
        const status =
          error && typeof error === 'object' && 'code' in error
            ? Number(error.code)
            : 0;
        if (status !== 404) throw error;
        return {
          evidenceSha256: sha(
            stableJson({
              outcome: 'already_absent',
              messageIdSha256: sha(messageId),
              threadIdSha256: sha(threadId),
              pdfSha256: input.pdfSha256,
            }),
          ),
        };
      }
    } else {
      const found = await this.findExact(input);
      if (!found)
        return {
          evidenceSha256: sha(
            stableJson({
              outcome: 'no_sent_match',
              toSha256: sha(input.to.toLowerCase()),
              subjectSha256: sha(input.subject),
              filename: input.filename,
              pdfSha256: input.pdfSha256,
            }),
          ),
        };
      messageId = found.messageId;
      threadId = found.threadId;
    }
    this.writeGuard({
      system: 'gmail',
      actionClass: 'c3_external_communication',
      source: 'host:website-checkout-document-retention',
    });
    await this.gmail.users.messages.delete({ userId: 'me', id: messageId });
    return {
      evidenceSha256: sha(
        stableJson({
          outcome: 'deleted',
          messageIdSha256: sha(messageId),
          threadIdSha256: sha(threadId),
          pdfSha256: input.pdfSha256,
        }),
      ),
    };
  }
}

export class PaymentCheckoutDocumentRetentionWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private inFlight: Promise<unknown> | null = null;

  constructor(
    private readonly config: WebsiteCheckoutDocumentConfig,
    private readonly store: PgPaymentCheckoutDocumentStore,
    private readonly gmail?: WebsiteCheckoutDocumentGmail,
    private readonly now: () => Date = () => new Date(),
    private readonly reportFailure: (input: {
      documentId: string | null;
      documentKind: PaymentCheckoutDocumentKind | null;
      code: string;
    }) => void = () => undefined,
  ) {}

  async sweep(): Promise<{ examined: number; purged: number; held: number }> {
    if (this.running) return { examined: 0, purged: 0, held: 0 };
    this.running = true;
    let examined = 0;
    let purged = 0;
    let held = 0;
    try {
      const now = this.now().toISOString();
      const candidates = await this.store.dueForPurge(
        now,
        this.config.retentionPolicy.batchSize,
      );
      for (const candidate of candidates) {
        examined++;
        try {
          const evidence: string[] = [];
          if (candidate.emailJobs.length && !this.gmail) {
            held++;
            this.reportFailure({
              documentId: candidate.document.documentId,
              documentKind: candidate.document.kind,
              code: 'checkout_document_retention_gmail_unconfigured',
            });
            continue;
          }
          for (const job of candidate.emailJobs) {
            const filename = `${candidate.document.documentNumber}-${candidate.document.kind === 'receipt' ? 'receipt' : 'paid-invoice'}.pdf`;
            const label =
              candidate.document.kind === 'receipt'
                ? 'receipt'
                : 'paid invoice';
            const deleted = await this.gmail!.deleteExact({
              messageId: job.gmailMessageId,
              threadId: job.gmailThreadId,
              to: job.recipient,
              subject: `Your ${PRODUCT} ${label} — ${candidate.document.documentNumber}`,
              filename,
              pdfSha256: candidate.document.pdfSha256,
            });
            evidence.push(deleted.evidenceSha256);
          }
          await this.store.purge(candidate, evidence, now);
          purged++;
        } catch (error) {
          held++;
          this.reportFailure({
            documentId: candidate.document.documentId,
            documentKind: candidate.document.kind,
            code:
              error instanceof PaymentDomainError
                ? error.code
                : 'checkout_document_retention_sweep_failed',
          });
        }
      }
      return { examined, purged, held };
    } finally {
      this.running = false;
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.inFlight) return;
      this.inFlight = this.sweep()
        .catch(() =>
          this.reportFailure({
            documentId: null,
            documentKind: null,
            code: 'checkout_document_retention_scan_failed',
          }),
        )
        .finally(() => {
          this.inFlight = null;
        });
    }, this.config.retentionPolicy.sweepIntervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.inFlight;
  }
}

export class PaymentCheckoutDocumentOwner {
  constructor(
    private readonly config: WebsiteCheckoutDocumentConfig,
    private readonly authority: PgPaymentCheckoutDocumentAuthorityReader,
    private readonly store: PgPaymentCheckoutDocumentStore,
    private readonly gmail?: WebsiteCheckoutDocumentGmail,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async prepare(attemptId: string, kind: PaymentCheckoutDocumentKind) {
    const authority = await this.authority.read(attemptId);
    const document = await this.store.ensure(kind, authority, this.config);
    const capability = await this.store.issueDownloadCapability(
      document,
      this.config.downloadCapabilityTtlMs,
    );
    return {
      documentKind: kind,
      documentNumber: document.documentNumber,
      filename: `${document.documentNumber}-${kind === 'receipt' ? 'receipt' : 'paid-invoice'}.pdf`,
      pdfSha256: document.pdfSha256,
      ...capability,
    };
  }

  async download(
    attemptId: string,
    kind: PaymentCheckoutDocumentKind,
    capability: string,
  ) {
    const document = await this.store.readDownload(attemptId, kind, capability);
    return {
      documentKind: kind,
      documentNumber: document.documentNumber,
      filename: `${document.documentNumber}-${kind === 'receipt' ? 'receipt' : 'paid-invoice'}.pdf`,
      mimeType: 'application/pdf' as const,
      contentBase64: document.pdf.toString('base64'),
      pdfSha256: document.pdfSha256,
    };
  }

  async email(attemptId: string, kind: PaymentCheckoutDocumentKind) {
    if (!this.gmail)
      throw new PaymentDomainError('checkout_document_email_unavailable');
    const authority = await this.authority.read(attemptId);
    const document = await this.store.ensure(kind, authority, this.config);
    const to =
      kind === 'paid_invoice' && authority.billingProfile
        ? authority.billingProfile.invoiceEmail
        : authority.payer.email;
    const filename = `${document.documentNumber}-${kind === 'receipt' ? 'receipt' : 'paid-invoice'}.pdf`;
    const label = kind === 'receipt' ? 'receipt' : 'paid invoice';
    const subject = `Your ${PRODUCT} ${label} — ${document.documentNumber}`;
    const body = [
      `Hi ${authority.payer.name},`,
      '',
      `Attached is your ${label} for ${PRODUCT}.`,
      `Document number: ${document.documentNumber}`,
      `Payment reference: ${authority.tandemReference}`,
      '',
      'This document confirms this purchase only. It is not a course-completion certificate.',
    ].join('\n');
    const contentSha256 = sha(
      stableJson({
        to,
        subject,
        body,
        filename,
        pdfSha256: document.pdfSha256,
      }),
    );
    const now = this.now().toISOString();
    let job = await this.store.ensureEmailJob(document, to, contentSha256, now);
    if (job.state === 'confirmed')
      return { state: 'verified' as const, destination: maskEmail(to) };
    await this.gmail.verifyAccount();
    if (
      job.state === 'acknowledged' &&
      job.gmailMessageId &&
      job.gmailThreadId
    ) {
      try {
        const read = await this.gmail.readback({
          messageId: job.gmailMessageId,
          threadId: job.gmailThreadId,
          to,
          subject,
          filename,
          pdfSha256: document.pdfSha256,
        });
        await this.store.confirmEmail(
          job.jobId,
          read.messageId,
          read.threadId,
          read.evidenceSha256,
          now,
        );
        return { state: 'verified' as const, destination: maskEmail(to) };
      } catch {
        return { state: 'queued' as const, destination: maskEmail(to) };
      }
    }
    try {
      const prior = await this.gmail.findExact({
        to,
        subject,
        filename,
        pdfSha256: document.pdfSha256,
      });
      if (prior) {
        job = await this.store.adoptEmail(
          job.jobId,
          prior.messageId,
          prior.threadId,
          now,
        );
        const read = await this.gmail.readback({
          ...prior,
          to,
          subject,
          filename,
          pdfSha256: document.pdfSha256,
        });
        await this.store.confirmEmail(
          job.jobId,
          read.messageId,
          read.threadId,
          read.evidenceSha256,
          now,
        );
        return { state: 'verified' as const, destination: maskEmail(to) };
      }
    } catch (error) {
      if (error instanceof Error && /ambiguous|mismatch/u.test(error.message)) {
        await this.store.holdEmail(
          job.jobId,
          'gmail_reconciliation_conflict',
          true,
          sha(`${job.jobId}:reconciliation`),
          now,
        );
        return { state: 'held' as const, destination: maskEmail(to) };
      }
      if (job.state === 'claimed' || job.state === 'held') {
        await this.store.holdEmail(
          job.jobId,
          'gmail_reconciliation_unavailable',
          true,
          sha(`${job.jobId}:reconciliation-unavailable`),
          now,
        );
        return { state: 'held' as const, destination: maskEmail(to) };
      }
      return { state: 'queued' as const, destination: maskEmail(to) };
    }
    if (job.state === 'held' && job.uncertainAcceptance)
      return { state: 'held' as const, destination: maskEmail(to) };
    if (job.state === 'claimed') {
      if (
        job.leaseExpiresAt &&
        Date.parse(job.leaseExpiresAt) > Date.parse(now)
      )
        return { state: 'queued' as const, destination: maskEmail(to) };
      await this.store.holdEmail(
        job.jobId,
        'gmail_prior_attempt_unresolved',
        true,
        sha(`${job.jobId}:prior-attempt`),
        now,
      );
      return { state: 'held' as const, destination: maskEmail(to) };
    }
    job = await this.store.claimEmail(
      job.jobId,
      now,
      new Date(this.now().getTime() + 30_000).toISOString(),
    );
    if (job.state !== 'claimed' || !job.leaseToken)
      return { state: 'queued' as const, destination: maskEmail(to) };
    let sent: { messageId: string; threadId: string };
    try {
      sent = await this.gmail.send({
        to,
        subject,
        body,
        filename,
        pdf: document.pdf,
      });
      if (!sent.messageId || !sent.threadId)
        throw new Error('gmail_ack_missing');
    } catch {
      await this.store.holdEmail(
        job.jobId,
        'gmail_acceptance_unknown',
        true,
        sha(`${job.jobId}:send-error`),
        now,
      );
      return { state: 'held' as const, destination: maskEmail(to) };
    }
    try {
      await this.store.acknowledgeEmail(
        job.jobId,
        job.leaseToken,
        sent.messageId,
        sent.threadId,
        now,
      );
      const read = await this.gmail.readback({
        ...sent,
        to,
        subject,
        filename,
        pdfSha256: document.pdfSha256,
      });
      await this.store.confirmEmail(
        job.jobId,
        read.messageId,
        read.threadId,
        read.evidenceSha256,
        now,
      );
      return { state: 'verified' as const, destination: maskEmail(to) };
    } catch {
      await this.store.holdEmail(
        job.jobId,
        'gmail_readback_unavailable',
        true,
        sha(`${sent.messageId}:${sent.threadId}`),
        now,
      );
      return { state: 'held' as const, destination: maskEmail(to) };
    }
  }
}

function maskEmail(value: string): string {
  const [local, domain] = value.split('@');
  return `${local.slice(0, 1)}${'*'.repeat(Math.min(5, Math.max(2, local.length - 1)))}@${domain}`;
}

export function createCanonicalWebsiteCheckoutDocumentGmail(
  senderAccount: string,
  senderAddress: string,
  deps: {
    gmail?: gmail_v1.Gmail;
    sendEmail?: typeof sendEmail;
    assertExternalWriteAllowed?: typeof assertExternalWriteAllowed;
  } = {},
): WebsiteCheckoutDocumentGmail {
  if (senderAddress !== GMAIL_SEND_AS)
    throw new PaymentDomainError('invalid_checkout_document_configuration');
  return new CanonicalGmailWebsiteCheckoutDocumentSender(
    deps.gmail ?? getGmailClient(),
    senderAccount,
    senderAddress,
    deps.sendEmail,
    deps.assertExternalWriteAllowed,
  );
}
