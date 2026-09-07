/** Product names are labels; exact provider-scoped bindings identify offers.
 * This bridge routes the existing roster writer only. It grants no access,
 * invents no payment terms, and never assigns or counts a class seat.
 */
function compileProductBindings(catalog, bindings) {
  if (
    bindings.schema_version !== 1 ||
    !Number.isInteger(bindings.revision) ||
    bindings.revision < 1 ||
    bindings.entitlement_catalog_revision !== catalog.catalog_revision ||
    !Array.isArray(bindings.routes) ||
    !bindings.routes.length
  ) {
    throw new Error('product binding catalog revision invalid');
  }
  const offers = new Map();
  for (const offer of catalog.offers ?? []) {
    if (offers.has(offer.offer_key)) throw new Error('duplicate catalog offer');
    offers.set(offer.offer_key, offer);
  }
  const index = new Map();
  const add = (account, kind, value, route) => {
    const key = `${account}:${kind}:${value}`;
    if (index.has(key)) throw new Error(`duplicate product binding: ${key}`);
    index.set(key, route);
  };
  for (const route of bindings.routes) {
    const offer = offers.get(route.offer_key);
    if (
      !offer ||
      !catalog.bundles?.some((b) => b.bundle_key === offer.bundle_key) ||
      !['tandem', 'heartbeat'].includes(route.stripe_account) ||
      !Array.isArray(route.roster_targets) ||
      !route.roster_targets.length ||
      route.roster_targets.some(
        (t) => !t.tab || !t.column || t.tab === '(not a student)',
      ) ||
      new Set(route.roster_targets.map((t) => `${t.tab}\0${t.column}`)).size !==
        route.roster_targets.length
    ) {
      throw new Error('invalid product binding route');
    }
    add(route.stripe_account, 'offer', offer.offer_key, route);
    for (const id of offer.stripe_product_ids ?? [])
      add(route.stripe_account, 'product', id, route);
    for (const id of offer.stripe_price_ids ?? [])
      add(route.stripe_account, 'price', id, route);
  }
  return { index, revision: bindings.revision };
}

function targetKey(rows) {
  return [
    ...new Set(
      rows.map((r) => `${String(r[1]).trim()}\0${String(r[2]).trim()}`),
    ),
  ]
    .sort()
    .join('\n');
}

function resolveProductIdentity(compiled, input, productMapRows) {
  const legacyRows = productMapRows.filter(
    (row, i) =>
      i > 0 &&
      row[0] &&
      String(row[0]).toLowerCase() ===
        String(input.productName || '').toLowerCase(),
  );
  const signals = [
    ...(input.offerKey ? [['offer', input.offerKey]] : []),
    ...[...new Set(input.productIds ?? [])]
      .filter(Boolean)
      .map((id) => ['product', id]),
    ...[...new Set(input.priceIds ?? [])]
      .filter(Boolean)
      .map((id) => ['price', id]),
  ];
  const matches = signals.map(([kind, id]) =>
    compiled.index.get(`${input.account}:${kind}:${id}`),
  );
  const known = matches.filter(Boolean);
  // Coverage is explicit: unregistered products retain their existing path.
  if (!known.length) {
    const wrongScope = signals.some(([kind, id]) =>
      [...compiled.index.keys()].some((key) => key.endsWith(`:${kind}:${id}`)),
    );
    if (wrongScope)
      return {
        status: 'conflict',
        rows: [],
        code: 'product_identity_scope_conflict',
        revision: compiled.revision,
      };
    return { status: 'legacy', rows: legacyRows, revision: compiled.revision };
  }
  const offerKeys = new Set(known.map((r) => r.offer_key));
  if (input.incomplete || matches.some((r) => !r) || offerKeys.size !== 1) {
    return {
      status: 'conflict',
      rows: [],
      code: 'product_identity_conflict',
      revision: compiled.revision,
    };
  }
  const route = known[0];
  const rows = route.roster_targets.map((t) => [
    `offer:${route.offer_key}`,
    t.tab,
    t.column,
  ]);
  // A live operator mapping disagreement is owned, never silently overridden.
  if (legacyRows.length && targetKey(legacyRows) !== targetKey(rows)) {
    return {
      status: 'conflict',
      rows: [],
      code: 'product_projection_conflict',
      revision: compiled.revision,
    };
  }
  return {
    status: 'resolved',
    offerKey: route.offer_key,
    rows,
    revision: compiled.revision,
  };
}

function loadProductBindings() {
  return compileProductBindings(
    require('../../../facts/catalogs/student-entitlements-v1.json'),
    require('../../../facts/generated/student-product-bindings-v1.compat.json'),
  );
}

module.exports = {
  compileProductBindings,
  resolveProductIdentity,
  loadProductBindings,
};
