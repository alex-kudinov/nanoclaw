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
const bindings = require('../../facts/generated/student-product-bindings-v2.scoped.json');
const v1Bindings = require('../../facts/catalogs/student-product-bindings-v1.json');
const compiled = loadProductBindings();
const compiledV1 = compileProductBindings(catalog, v1Bindings);
const inaugural = catalog.offers.find(
  (o: any) => o.offer_key === 'supervision-inaugural',
);
const regular = catalog.offers.find(
  (o: any) => o.offer_key === 'supervision-regular',
);
const mcs = catalog.offers.find((o: any) => o.offer_key === 'mcs-full');
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
  it('preserves v1 scope-versus-identity conflict classification across two accounts', () => {
    const syntheticCatalog = {
      catalog_revision: 1,
      bundles: [{ bundle_key: 'bundle:a' }, { bundle_key: 'bundle:b' }],
      offers: [
        {
          offer_key: 'offer-a',
          bundle_key: 'bundle:a',
          stripe_product_ids: ['prod_a'],
          stripe_price_ids: ['price_a'],
        },
        {
          offer_key: 'offer-b',
          bundle_key: 'bundle:b',
          stripe_product_ids: ['prod_b'],
          stripe_price_ids: ['price_b'],
        },
      ],
    };
    const syntheticBindings = {
      schema_version: 1,
      revision: 1,
      entitlement_catalog_revision: 1,
      routes: [
        {
          offer_key: 'offer-a',
          stripe_account: 'tandem',
          roster_targets: [{ tab: 'A', column: 'Full' }],
        },
        {
          offer_key: 'offer-b',
          stripe_account: 'heartbeat',
          roster_targets: [{ tab: 'B', column: 'Full' }],
        },
      ],
    };
    const synthetic = compileProductBindings(
      syntheticCatalog,
      syntheticBindings,
    );
    expect(
      resolveProductIdentity(
        synthetic,
        {
          account: 'tandem',
          productName: '',
          productIds: ['prod_a', 'prod_b'],
          priceIds: [],
        },
        [header],
      ),
    ).toMatchObject({ code: 'product_identity_conflict' });
    expect(
      resolveProductIdentity(
        synthetic,
        {
          account: 'tandem',
          productName: '',
          productIds: ['prod_b'],
          priceIds: [],
        },
        [header],
      ),
    ).toMatchObject({ code: 'product_identity_scope_conflict' });
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
  it('resolves only the exact managed ALT MCS family to the current roster destination', () => {
    expect(
      resolve({
        offerKey: mcs.offer_key,
        productIds: ['prod_Uk2OvW03ZwxmAj'],
        priceIds: ['price_1TkYJfA7hTBWpVVqm502swAb'],
        productName: 'Mentor Coach Training (AAMC)',
      }),
    ).toMatchObject({
      status: 'resolved',
      offerKey: 'mcs-full',
      rows: [['offer:mcs-full', 'MCS', 'MCS Practicum']],
    });
  });
  it('qualifies ALT MCS by exact price or a complete offer key while preserving unqualified product history', () => {
    const legacyRow = [
      'MCS Advanced Accreditation Mentor Coaching — Installment (/mo)',
      'MCS',
      'MCS Practicum',
    ];
    expect(
      resolve({
        offerKey: 'mcs-full',
        productIds: ['prod_Uk2OvW03ZwxmAj'],
        priceIds: [],
      }),
    ).toMatchObject({ status: 'resolved', offerKey: 'mcs-full' });
    expect(
      resolve({
        offerKey: 'mcs-full',
        productIds: ['prod_Uk2OvW03ZwxmAj'],
        incomplete: true,
      }),
    ).toMatchObject({ status: 'conflict', code: 'product_identity_conflict' });
    expect(
      resolve(
        {
          offerKey: 'mcs-full',
          productIds: ['prod_Uk2OvW03ZwxmAj'],
          priceIds: ['price_historical'],
          productName: 'MCS - Standard path',
        },
        [header, ['MCS - Standard path', 'MCS', 'MCS Practicum']],
      ),
    ).toMatchObject({
      status: 'legacy',
      rows: [['MCS - Standard path', 'MCS', 'MCS Practicum']],
    });
    const retiredRow = [
      'Mentor Coach Training - September Thursday Cohort',
      'MCS',
      'MCS Practicum',
    ];
    expect(
      resolve(
        {
          offerKey: 'mcs-cohort-sept-thursday',
          productIds: ['prod_Uk2OvW03ZwxmAj'],
          priceIds: ['price_1TkYJfA7hTBWpVVqm502swAb'],
          productName: retiredRow[0],
        },
        [header, retiredRow],
      ),
    ).toMatchObject({ status: 'legacy', rows: [retiredRow] });
    expect(
      resolve(
        {
          offerKey: null,
          productIds: ['prod_Uk2OvW03ZwxmAj'],
          priceIds: ['price_historical_unlisted'],
          productName: legacyRow[0],
        },
        [header, legacyRow],
      ),
    ).toMatchObject({ status: 'legacy', rows: [legacyRow] });
    expect(
      resolve(
        {
          offerKey: null,
          productIds: ['prod_Uk2OvW03ZwxmAj'],
          priceIds: [],
          productName: legacyRow[0],
        },
        [header, legacyRow],
      ),
    ).toMatchObject({ status: 'legacy', rows: [legacyRow] });
    expect(
      resolve({
        offerKey: null,
        productIds: ['prod_Uk2OvW03ZwxmAj'],
        priceIds: ['price_1TkYJfA7hTBWpVVqm502swAb', 'price_unknown_companion'],
      }),
    ).toMatchObject({ status: 'conflict', code: 'product_identity_conflict' });
    expect(
      resolve({
        offerKey: null,
        productIds: ['prod_Uk2OvW03ZwxmAj'],
        priceIds: ['price_1TkYJfA7hTBWpVVqm502swAb'],
        incomplete: true,
      }),
    ).toMatchObject({ status: 'conflict', code: 'product_identity_conflict' });
  });
  it('preserves primary MCS Product Map behavior with unknown historical prices or incomplete lookup', () => {
    const legacyRow = ['MCS - Standard path', 'MCS', 'MCS Practicum'];
    for (const input of [
      {
        account: 'heartbeat',
        offerKey: 'mcs-full',
        productIds: ['prod_UWzqD2zowB8apy'],
      },
      {
        account: 'heartbeat',
        offerKey: 'mcs-full',
        productIds: ['prod_UWzqD2zowB8apy'],
        priceIds: ['price_historical_unlisted'],
      },
      {
        account: 'heartbeat',
        offerKey: 'mcs-full',
        productIds: ['prod_UWzqD2zowB8apy'],
        incomplete: true,
      },
    ]) {
      expect(
        resolve({ ...input, productName: legacyRow[0] }, [header, legacyRow]),
      ).toMatchObject({ status: 'legacy', rows: [legacyRow] });
    }
  });
  it('matches the v1 outcome for primary MCS legacy and all prior supervision cases', () => {
    const legacyRow = ['MCS - Standard path', 'MCS', 'MCS Practicum'];
    const cases = [
      {
        input: {
          account: 'heartbeat',
          offerKey: 'mcs-full',
          productIds: ['prod_UWzqD2zowB8apy'],
          priceIds: ['price_historical_unlisted'],
          incomplete: true,
          productName: legacyRow[0],
        },
        rows: [header, legacyRow],
      },
      {
        input: {
          account: 'tandem',
          offerKey: 'mcs-cohort-sept-thursday',
          productName: 'Mentor Coach Training - September Thursday Cohort',
          productIds: ['prod_Uk2OvW03ZwxmAj'],
          priceIds: ['price_1TkYJfA7hTBWpVVqm502swAb'],
        },
        rows: [
          header,
          [
            'Mentor Coach Training - September Thursday Cohort',
            'MCS',
            'MCS Practicum',
          ],
        ],
      },
      { input: { offerKey: 'supervision-inaugural' }, rows: [header] },
      {
        input: {
          offerKey: 'supervision-regular',
          productIds: regular.stripe_product_ids,
          priceIds: regular.stripe_price_ids,
        },
        rows: [header],
      },
      {
        input: {
          account: 'heartbeat',
          productIds: inaugural.stripe_product_ids,
        },
        rows: [header],
      },
      {
        input: {
          offerKey: 'supervision-inaugural',
          priceIds: regular.stripe_price_ids,
        },
        rows: [header],
      },
    ];
    for (const item of cases) {
      const prior = resolveProductIdentity(compiledV1, item.input, item.rows);
      const current = resolveProductIdentity(compiled, item.input, item.rows);
      const { revision: _priorRevision, ...priorOutcome } = prior;
      const { revision: _currentRevision, ...currentOutcome } = current;
      expect(currentOutcome).toEqual(priorOutcome);
    }
  });
  it('holds known wrong-account and mixed managed/legacy MCS identities', () => {
    for (const input of [
      {
        account: 'heartbeat',
        offerKey: 'mcs-full',
        productIds: ['prod_Uk2OvW03ZwxmAj'],
      },
      {
        account: 'tandem',
        offerKey: 'mcs-full',
        productIds: ['prod_UWzqD2zowB8apy'],
      },
      {
        account: 'tandem',
        offerKey: 'mcs-full',
        productIds: ['prod_Uk2OvW03ZwxmAj', 'prod_UWzqD2zowB8apy'],
      },
    ]) {
      expect(resolve(input)).toMatchObject({ status: 'conflict', rows: [] });
    }
  });
  it('classifies MCS wrong-scope companions from the qualifying managed set', () => {
    expect(
      resolve({
        offerKey: null,
        productIds: ['prod_Uk2OvW03ZwxmAj', 'prod_UWzqD2zowB8apy'],
        priceIds: [],
      }),
    ).toMatchObject({ code: 'product_identity_scope_conflict' });
    expect(
      resolve({
        offerKey: null,
        productIds: ['prod_UWzqD2zowB8apy'],
        priceIds: ['price_1TkYJfA7hTBWpVVqm502swAb'],
      }),
    ).toMatchObject({ code: 'product_identity_conflict' });
    expect(
      resolve({
        offerKey: 'supervision-inaugural',
        productIds: [],
        priceIds: ['price_1TkYJfA7hTBWpVVqm502swAb'],
      }),
    ).toMatchObject({ code: 'product_identity_conflict' });
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
