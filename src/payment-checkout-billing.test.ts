import { describe, expect, it } from 'vitest';

import {
  checkoutBillingProfileSha256,
  parseCheckoutBillingProfile,
} from './payment-checkout-billing.js';

const valid = {
  schemaVersion: 1,
  companyLegalName: ' Tandem Client LLC ',
  invoiceEmail: ' Accounts@Example.test ',
  taxId: ' 12-3456789 ',
  address: {
    street: ' Main Street ',
    houseNumberOrName: ' 42 ',
    city: ' Chicago ',
    postalCode: ' 60601 ',
    stateOrProvince: ' IL ',
    country: 'US',
  },
} as const;

describe('immutable checkout billing profile', () => {
  it('normalizes one complete business profile and fingerprints the normalized bytes', () => {
    const parsed = parseCheckoutBillingProfile(valid);
    expect(parsed).toEqual({
      schemaVersion: 1,
      companyLegalName: 'Tandem Client LLC',
      invoiceEmail: 'accounts@example.test',
      taxId: '12-3456789',
      address: {
        street: 'Main Street',
        houseNumberOrName: '42',
        city: 'Chicago',
        postalCode: '60601',
        stateOrProvince: 'IL',
        country: 'US',
      },
    });
    expect(checkoutBillingProfileSha256(valid)).toBe(
      checkoutBillingProfileSha256(parsed),
    );
  });

  it('accepts a complete street address without an apartment or suite', () => {
    const parsed = parseCheckoutBillingProfile({
      ...valid,
      address: {
        ...valid.address,
        street: '13507 Mooring Pointe Dr',
        houseNumberOrName: '   ',
      },
    });
    expect(parsed.address).toMatchObject({
      street: '13507 Mooring Pointe Dr',
      houseNumberOrName: '',
    });
  });

  it.each([
    { ...valid, companyLegalName: '' },
    { ...valid, invoiceEmail: 'not-an-email' },
    { ...valid, address: { ...valid.address, country: 'USA' } },
    {
      ...valid,
      address: { ...valid.address, stateOrProvince: null },
    },
    { ...valid, extra: 'browser-injected' },
  ])('rejects incomplete or over-broad business data %#', (value) => {
    expect(() => parseCheckoutBillingProfile(value)).toThrow(
      'invalid_billing_profile',
    );
  });
});
