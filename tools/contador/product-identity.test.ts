import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const {
  compileProductBindings,
  resolveProductIdentity,
  loadProductBindings,
} = require('./lib/product-identity.cjs');
const { derivePaymentFulfillmentOutcome } = require('./process-payment.cjs');
const catalog = require('../../facts/catalogs/student-entitlements-v1.json');
const bindings = require('../../facts/catalogs/student-product-bindings-v1.json');
const compiled = loadProductBindings();
const inaugural = catalog.offers.find(
  (o: any) => o.offer_key === 'supervision-inaugural',
);
const regular = catalog.offers.find(
  (o: any) => o.offer_key === 'supervision-regular',
);
const header = ['Product Name', 'Roster Tab', 'Column'];
const base = {
  account: 'tandem',
  offerKey: 'supervision-inaugural',
  productName: 'New translated display name',
  productIds: [],
  priceIds: [],
};
const resolve = (input = {}, rows = [header]) =>
  resolveProductIdentity(compiled, { ...base, ...input }, rows);

describe('source-bound product identity', () => {
  it('routes a metadata-only full payment with a renamed or missing display name', () => {
    for (const productName of ['New translated display name', '', 'Unknown']) {
      expect(resolve({ productName })).toMatchObject({
        status: 'resolved',
        offerKey: 'supervision-inaugural',
        rows: [
          [
            'offer:supervision-inaugural',
            'CSS',
            'Coaching Supervision Mastery',
          ],
        ],
      });
    }
  });
  it('routes installment product and price to the same offer without declaring it fully paid', () => {
    const result = resolve({
      offerKey: null,
      productIds: inaugural.stripe_product_ids,
      priceIds: inaugural.stripe_price_ids,
    });
    expect(result.status).toBe('resolved');
    expect(result.offerKey).toBe('supervision-inaugural');
    expect(result).not.toHaveProperty('paid');
    expect(result).not.toHaveProperty('assignment');
  });
  it('keeps inaugural and regular commercial offers distinct despite their shared bundle', () => {
    expect(
      resolve({
        offerKey: 'supervision-regular',
        productIds: regular.stripe_product_ids,
      }).offerKey,
    ).toBe('supervision-regular');
    expect(resolve({ productIds: regular.stripe_product_ids }).status).toBe(
      'conflict',
    );
  });
  it('holds mixed, unknown, and incomplete provider bindings instead of selecting the first line', () => {
    for (const input of [
      {
        productIds: [
          ...inaugural.stripe_product_ids,
          ...regular.stripe_product_ids,
        ],
      },
      { productIds: ['prod_unregistered'] },
      { priceIds: ['price_unregistered'] },
      {
        offerKey: 'new-unregistered-slug',
        productIds: inaugural.stripe_product_ids,
      },
      { incomplete: true },
    ])
      expect(resolve(input)).toMatchObject({ status: 'conflict', rows: [] });
  });
  it('does not resolve a known identity through the other Stripe account or a display-name fallback', () => {
    expect(
      resolve({ account: 'heartbeat' }, [
        header,
        [base.productName, 'CSS', 'Coaching Supervision Mastery'],
      ]),
    ).toMatchObject({ status: 'conflict', rows: [] });
  });
  it('holds a conflicting operator destination, including not-a-student', () => {
    for (const dest of [
      ['ACC', 'M1'],
      ['(not a student)', 'n/a'],
    ]) {
      expect(resolve({}, [header, [base.productName, ...dest]])).toMatchObject({
        status: 'conflict',
        code: 'product_projection_conflict',
        rows: [],
      });
    }
  });
  it('accepts a matching operator projection without depending on its label', () => {
    expect(
      resolve({}, [
        header,
        [base.productName, 'CSS', 'Coaching Supervision Mastery'],
      ]).status,
    ).toBe('resolved');
  });
  it('preserves existing routes for products outside the explicitly migrated population', () => {
    const row = ['Legacy service', '(not a student)', 'n/a'];
    expect(
      resolve(
        { offerKey: null, productName: row[0], productIds: ['prod_legacy'] },
        [header, row],
      ),
    ).toMatchObject({ status: 'legacy', rows: [row] });
  });
  it('rejects drift, duplicate aliases, unknown offers and duplicate destinations at compilation', () => {
    const invalid = [
      { ...bindings, entitlement_catalog_revision: 999 },
      { ...bindings, routes: [...bindings.routes, bindings.routes[0]] },
      {
        ...bindings,
        routes: [{ ...bindings.routes[0], offer_key: 'not-an-offer' }],
      },
      {
        ...bindings,
        routes: [
          {
            ...bindings.routes[0],
            roster_targets: [
              ...bindings.routes[0].roster_targets,
              ...bindings.routes[0].roster_targets,
            ],
          },
        ],
      },
    ];
    for (const value of invalid)
      expect(() => compileProductBindings(catalog, value)).toThrow();
  });
  it('records an owned non-retryable identity exception while preserving successful accounting', () => {
    expect(
      derivePaymentFulfillmentOutcome({
        paymentLogVerified: true,
        postgresVerified: true,
        rosterMode: 'identity_conflict',
      }),
    ).toMatchObject({
      state: 'needs_review',
      errorCode: 'product_identity_conflict',
      receipts: expect.arrayContaining([
        {
          stage: 'student_roster',
          outcome: 'exception',
          resultCode: 'product_identity_conflict',
        },
      ]),
    });
  });
});
