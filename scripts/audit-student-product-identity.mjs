import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  compileProductBindings,
  resolveProductIdentity,
} = require('../tools/contador/lib/product-identity.cjs');

export function auditProductIdentity(
  catalog,
  bindings,
  checkout,
  productMapRows,
) {
  const compiled = compileProductBindings(catalog, bindings);
  const offers = new Map(catalog.offers.map((o) => [o.offer_key, o]));
  const products = Object.entries(checkout).filter(
    ([key]) => !key.startsWith('_'),
  );
  const coverage = products.map(([key, value]) => {
    const offer = offers.get(key);
    const prices = [
      value.stripe_price_id,
      value.installments?.enabled ? value.installments?.stripe_price_id : null,
    ].filter(Boolean);
    const identity = resolveProductIdentity(
      compiled,
      {
        account: 'tandem',
        offerKey: key,
        productName: value.name,
        productIds: [],
        priceIds: prices,
      },
      productMapRows,
    );
    return {
      offer_key: key,
      checkout_active: value.active === true,
      entitlement_catalogued: Boolean(offer),
      identity_status: identity.status,
      roster_route_present: identity.rows.length > 0,
      code: identity.code ?? null,
      price_bindings_match: offer
        ? prices.every((id) => offer.stripe_price_ids.includes(id))
        : null,
    };
  });
  const active = coverage.filter((p) => p.checkout_active);
  const gaps = active.filter(
    (p) => p.identity_status !== 'resolved' || !p.roster_route_present,
  );
  return {
    binding_revision: bindings.revision,
    entitlement_catalog_revision: catalog.catalog_revision,
    checkout_products: products.length,
    active_products: active.length,
    active_canonical_routes: active.length - gaps.length,
    active_coverage_gaps: gaps.map((p) => p.offer_key),
    catalog_offers_absent_from_checkout: [...offers.keys()].filter(
      (key) => !Object.hasOwn(checkout, key),
    ),
    coverage,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const readArg = (key) => args[args.indexOf(key) + 1];
  if (!args.includes('--checkout') || !args.includes('--product-map')) {
    throw new Error(
      'Usage: --checkout <products.json> --product-map <rows.json> [--require-active-coverage]',
    );
  }
  const checkoutText = fs.readFileSync(readArg('--checkout'), 'utf8');
  const mapText = fs.readFileSync(readArg('--product-map'), 'utf8');
  const report = auditProductIdentity(
    require(path.join(root, 'facts/catalogs/student-entitlements-v1.json')),
    require(path.join(root, 'facts/catalogs/student-product-bindings-v1.json')),
    JSON.parse(checkoutText),
    JSON.parse(mapText),
  );
  // Hash source bytes for provenance; never output checkout secrets/invite codes.
  report.source_sha256 = {
    checkout: crypto.createHash('sha256').update(checkoutText).digest('hex'),
    product_map: crypto.createHash('sha256').update(mapText).digest('hex'),
  };
  console.log(JSON.stringify(report, null, 2));
  if (
    args.includes('--require-active-coverage') &&
    report.active_coverage_gaps.length
  )
    process.exitCode = 2;
}
