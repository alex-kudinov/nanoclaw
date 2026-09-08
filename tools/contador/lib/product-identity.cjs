/** Product names are labels; exact provider-scoped bindings identify offers.
 * This bridge routes the existing roster writer only. It grants no access,
 * invents no payment terms, and never assigns or counts a class seat.
 */
function compileProductBindings(catalog, bindings) {
  if (
    ![1, 2].includes(bindings.schema_version) ||
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
  const legacyIndex = new Map();
  const scopes = new Map();
  const add = (target, account, kind, value, record) => {
    const key = `${account}:${kind}:${value}`;
    if (index.has(key) || legacyIndex.has(key))
      throw new Error(`duplicate product binding: ${key}`);
    target.set(key, record);
    const identityKey = `${kind}:${value}`;
    scopes.set(identityKey, [
      ...(scopes.get(identityKey) ?? []),
      { account, record },
    ]);
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
    const identity =
      bindings.schema_version === 2
        ? route.provider_identity
        : {
            product_ids: offer.stripe_product_ids ?? [],
            price_ids: offer.stripe_price_ids ?? [],
          };
    const profile =
      bindings.schema_version === 2
        ? route.resolution_profile
        : {
            managed_signal_kinds: ['offer', 'product', 'price'],
            unknown_companion: 'conflict',
            unrecognized_offer: 'conflict',
            incomplete: 'conflict',
            unqualified: 'legacy',
          };
    if (
      !identity ||
      !Array.isArray(identity.product_ids) ||
      !identity.product_ids.length ||
      !Array.isArray(identity.price_ids) ||
      identity.product_ids.some(
        (id) => !offer.stripe_product_ids?.includes(id),
      ) ||
      identity.price_ids.some((id) => !offer.stripe_price_ids?.includes(id)) ||
      !profile ||
      !Array.isArray(profile.managed_signal_kinds) ||
      !profile.managed_signal_kinds.length ||
      new Set(profile.managed_signal_kinds).size !==
        profile.managed_signal_kinds.length ||
      profile.managed_signal_kinds.some(
        (kind) => !['offer', 'product', 'price'].includes(kind),
      ) ||
      profile.unknown_companion !== 'conflict' ||
      !['conflict', 'legacy'].includes(profile.unrecognized_offer) ||
      profile.incomplete !== 'conflict' ||
      profile.unqualified !== 'legacy'
    ) {
      throw new Error('invalid scoped product binding identity');
    }
    const compiledRoute = { ...route, resolution_profile: profile };
    add(index, route.stripe_account, 'offer', offer.offer_key, compiledRoute);
    for (const id of identity.product_ids)
      add(index, route.stripe_account, 'product', id, compiledRoute);
    for (const id of identity.price_ids)
      add(index, route.stripe_account, 'price', id, compiledRoute);
  }
  for (const legacy of bindings.legacy_scopes ?? []) {
    const offer = offers.get(legacy.offer_key);
    const identity = legacy.provider_identity;
    if (
      bindings.schema_version !== 2 ||
      !offer ||
      !['tandem', 'heartbeat'].includes(legacy.stripe_account) ||
      legacy.fallback !== 'product_map' ||
      !identity ||
      !Array.isArray(identity.product_ids) ||
      !identity.product_ids.length ||
      !Array.isArray(identity.price_ids) ||
      identity.product_ids.some(
        (id) => !offer.stripe_product_ids?.includes(id),
      ) ||
      identity.price_ids.some((id) => !offer.stripe_price_ids?.includes(id))
    ) {
      throw new Error('invalid legacy product binding scope');
    }
    add(legacyIndex, legacy.stripe_account, 'offer', offer.offer_key, legacy);
    for (const id of identity.product_ids)
      add(legacyIndex, legacy.stripe_account, 'product', id, legacy);
    for (const id of identity.price_ids)
      add(legacyIndex, legacy.stripe_account, 'price', id, legacy);
  }
  return { index, legacyIndex, scopes, revision: bindings.revision };
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
  const legacyMatches = signals.map(([kind, id]) =>
    compiled.legacyIndex?.get(`${input.account}:${kind}:${id}`),
  );
  const known = matches.filter(Boolean);
  const knownLegacy = legacyMatches.filter(Boolean);
  const qualifying = matches.filter(
    (route, index) =>
      route &&
      route.resolution_profile.managed_signal_kinds.includes(signals[index][0]),
  );
  const wrongScope = signals.some(([kind, id]) => {
    const scoped = compiled.scopes?.get(`${kind}:${id}`) ?? [];
    return (
      scoped.length > 0 &&
      !scoped.some((item) => item.account === input.account)
    );
  });
  if (wrongScope)
    return {
      status: 'conflict',
      rows: [],
      code: qualifying.length
        ? 'product_identity_conflict'
        : 'product_identity_scope_conflict',
      revision: compiled.revision,
    };
  const knownOfferKeys = new Set(
    [...known, ...knownLegacy].map((record) => record.offer_key),
  );
  if (knownOfferKeys.size > 1 || (known.length > 0 && knownLegacy.length > 0))
    return {
      status: 'conflict',
      rows: [],
      code: 'product_identity_conflict',
      revision: compiled.revision,
    };
  const hasUnrecognizedOffer = signals.some(
    ([kind], index) =>
      kind === 'offer' && !matches[index] && !legacyMatches[index],
  );
  if (
    qualifying.length > 0 &&
    qualifying[0].resolution_profile.unrecognized_offer === 'legacy' &&
    hasUnrecognizedOffer
  )
    return { status: 'legacy', rows: legacyRows, revision: compiled.revision };
  // Coverage is explicit: unregistered products retain their existing path.
  if (!qualifying.length) {
    const legacyOfferKeys = new Set(knownLegacy.map((r) => r.offer_key));
    if (legacyOfferKeys.size > 1)
      return {
        status: 'conflict',
        rows: [],
        code: 'product_identity_conflict',
        revision: compiled.revision,
      };
    return { status: 'legacy', rows: legacyRows, revision: compiled.revision };
  }
  const offerKeys = new Set(qualifying.map((r) => r.offer_key));
  if (
    input.incomplete ||
    matches.some((r) => !r) ||
    knownLegacy.length > 0 ||
    offerKeys.size !== 1
  ) {
    return {
      status: 'conflict',
      rows: [],
      code: 'product_identity_conflict',
      revision: compiled.revision,
    };
  }
  const route = qualifying[0];
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
    require('../../../facts/generated/student-product-bindings-v2.scoped.json'),
  );
}

module.exports = {
  compileProductBindings,
  resolveProductIdentity,
  loadProductBindings,
};
