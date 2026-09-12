import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { renderCheckoutDocumentPdf } from '../dist/payment-checkout-documents.js';

const output = resolve(process.argv[2] || 'tmp/pdfs/checkout-documents');
await mkdir(output, { recursive: true });

const base = {
  schemaVersion: 2,
  documentVersion: 'mcs-checkout-document-v2',
  issuedAt: '2026-09-12T12:00:00.000Z',
  seller: {
    displayName: 'Tandem Coaching Academy',
    legalName: 'Tandem Coaching Partners, LLC',
    supportEmail: 'hello@tandemcoach.co',
    country: 'US',
    addressLines: [
      '104 E Ovilla Rd, Ste 1278',
      'Red Oak, TX 75154, United States',
    ],
    taxId: null,
  },
  purchase: {
    offerKey: 'mcq-program-a-foundations',
    productName: 'Mentor Coaching Foundations',
    locale: 'en-US',
    quantity: 1,
    unitAmountMinor: 29900,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: 29900,
    currency: 'USD',
    discountPolicyReference: null,
  },
  payment: {
    method: 'card',
    status: 'paid',
    captureMode: 'immediate_automatic_capture',
    providerEvent: 'authorisation',
    tandemReference: 'TCA-0123456789AB',
    providerReferenceSha256: '0'.repeat(64),
    recordedAt: '2026-09-12T12:00:00.000Z',
  },
};

const receipt = {
  ...base,
  documentKind: 'receipt',
  documentNumber: 'TCA-0123456789AB-R',
  buyer: {
    name: 'Alex Morgan',
    email: 'alex.morgan@example.com',
    billingProfile: null,
  },
  policy: {
    enrollmentTermsVersion: 'terms-2026-09-11',
    enrollmentTermsSha256: '1'.repeat(64),
    privacyVersion: 'privacy-2026-09-11',
    privacySha256: '2'.repeat(64),
    taxPolicyVersion: null,
    taxJurisdiction: null,
    taxClassification: null,
    retentionPolicyVersion: 'mcs-checkout-documents-7y-v1',
    purgeAfter: '2033-09-12T12:00:00.000Z',
    correctionPolicy: 'original_payment_evidence_immutable',
  },
};

const invoice = {
  ...base,
  documentKind: 'paid_invoice',
  documentNumber: 'TCA-2026-000001',
  buyer: {
    name: 'Alex Morgan',
    email: 'alex.morgan@example.com',
    billingProfile: {
      companyLegalName: 'Example Coaching LLC',
      invoiceEmail: 'accounts@example.com',
      taxId: null,
      address: {
        street: '100 Example Street',
        houseNumberOrName: 'Suite 200',
        city: 'Austin',
        postalCode: '78701',
        stateOrProvince: 'TX',
        country: 'US',
      },
    },
  },
  policy: {
    enrollmentTermsVersion: 'terms-2026-09-11',
    enrollmentTermsSha256: '1'.repeat(64),
    privacyVersion: 'privacy-2026-09-11',
    privacySha256: '2'.repeat(64),
    taxPolicyVersion: 'mcs-foundations-zero-tax-display-v1',
    taxJurisdiction: 'US-TX',
    taxClassification: 'not_stated',
    retentionPolicyVersion: 'mcs-checkout-documents-7y-v1',
    purgeAfter: '2033-09-12T12:00:00.000Z',
    correctionPolicy: 'credit_note_or_replacement_only',
  },
};

const outputs = [
  ['mcs-runtime-receipt-preview.pdf', receipt],
  ['mcs-runtime-paid-invoice-preview.pdf', invoice],
];
for (const [name, value] of outputs) {
  await writeFile(
    resolve(output, name),
    await renderCheckoutDocumentPdf(value),
  );
}
process.stdout.write(`${output}\n`);
