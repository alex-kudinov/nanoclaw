import crypto from 'crypto';
import type { PoolClient } from 'pg';

import { withAgentContext } from './business-db.js';

const ACTOR = 'checkout-identity:host';
const TOKEN_TTL_SECONDS = 15 * 60;
const CUSTOMER_ID_RE = /^cus_[A-Za-z0-9_]{10,200}$/;
const TOKEN_RE = /^[A-Za-z0-9]{32}$/;
const SOURCE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

export class CheckoutCustomerIdentityError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'CheckoutCustomerIdentityError';
  }
}

export interface CheckoutIdentityResolveRequest {
  kind: 'checkout.identity.resolve';
  sourceRequestKey: string;
  observedAt: string;
  checkoutToken: string;
  checkoutTokenSha256: string;
  email: string;
  emailSha256: string;
  displayName: string;
  productSlug: string;
}

export interface CheckoutIdentityBindRequest {
  kind: 'checkout.identity.bind';
  sourceRequestKey: string;
  observedAt: string;
  stripeCustomerId: string;
  bindingToken: string;
}

export type CheckoutIdentityRequest =
  | CheckoutIdentityResolveRequest
  | CheckoutIdentityBindRequest;

export interface CheckoutIdentityResolveResult {
  partyId: number;
  interactionId: number;
  resolution: 'created' | 'existing' | 'replayed';
  bindingToken: string;
  stripeCustomerId: string | null;
}

export interface CheckoutIdentityBindResult {
  partyId: number;
  stripeCustomerId: string;
  bound: true;
  duplicate: boolean;
}

interface BindingClaims {
  v: 1;
  party_id: number;
  interaction_id: number;
  checkout_token_sha256: string;
  email_sha256: string;
  exp: number;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(secret: string, value: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(value, 'utf8')
    .digest('hex');
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CheckoutCustomerIdentityError('invalid_checkout_identity_body');
  }
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new CheckoutCustomerIdentityError(`invalid_${field}`);
  }
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (
    !normalized ||
    normalized.length > max ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new CheckoutCustomerIdentityError(`invalid_${field}`);
  }
  return normalized;
}

function normalizedEmail(value: unknown): string {
  const email = boundedString(value, 'email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new CheckoutCustomerIdentityError('invalid_email');
  }
  return email;
}

function instant(value: unknown): string {
  const raw = boundedString(value, 'observed_at', 64);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw new CheckoutCustomerIdentityError('invalid_observed_at');
  }
  return new Date(parsed).toISOString();
}

export function prepareCheckoutCustomerIdentityRequest(
  payload: unknown,
  identitySecret: string,
): CheckoutIdentityRequest {
  if (identitySecret.length < 32) {
    throw new CheckoutCustomerIdentityError(
      'identity_secret_unconfigured',
      503,
    );
  }
  const input = asObject(payload);
  if (input.schema_version !== 1) {
    throw new CheckoutCustomerIdentityError('unsupported_schema_version');
  }
  const kind = boundedString(input.request_kind, 'request_kind', 64);
  const sourceRequestKey = boundedString(
    input.source_request_key,
    'source_request_key',
    500,
  );
  if (!SOURCE_KEY_RE.test(sourceRequestKey)) {
    throw new CheckoutCustomerIdentityError('invalid_source_request_key');
  }
  const observedAt = instant(input.observed_at);
  if (kind === 'checkout.identity.resolve') {
    const checkoutToken = boundedString(
      input.checkout_token,
      'checkout_token',
      32,
    );
    if (!TOKEN_RE.test(checkoutToken)) {
      throw new CheckoutCustomerIdentityError('invalid_checkout_token');
    }
    const email = normalizedEmail(input.email);
    const firstName = boundedString(input.first_name, 'first_name', 100);
    const lastName = boundedString(input.last_name, 'last_name', 100);
    const productSlug = boundedString(input.product_slug, 'product_slug', 64);
    if (!SLUG_RE.test(productSlug)) {
      throw new CheckoutCustomerIdentityError('invalid_product_slug');
    }
    return {
      kind,
      sourceRequestKey,
      observedAt,
      checkoutToken,
      checkoutTokenSha256: hmac(
        identitySecret,
        `checkout-token:${checkoutToken}`,
      ),
      email,
      emailSha256: hmac(identitySecret, `email:${email}`),
      displayName: `${firstName} ${lastName}`,
      productSlug,
    };
  }
  if (kind === 'checkout.identity.bind') {
    const stripeCustomerId = boundedString(
      input.stripe_customer_id,
      'stripe_customer_id',
      204,
    );
    if (!CUSTOMER_ID_RE.test(stripeCustomerId)) {
      throw new CheckoutCustomerIdentityError('invalid_stripe_customer_id');
    }
    return {
      kind,
      sourceRequestKey,
      observedAt,
      stripeCustomerId,
      bindingToken: boundedString(input.binding_token, 'binding_token', 2048),
    };
  }
  throw new CheckoutCustomerIdentityError('unsupported_request_kind');
}

export function issueCheckoutIdentityBindingToken(
  claims: Omit<BindingClaims, 'v' | 'exp'>,
  identitySecret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const body: BindingClaims = {
    v: 1,
    ...claims,
    exp: nowSeconds + TOKEN_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(body), 'utf8').toString(
    'base64url',
  );
  return `v1.${encoded}.${hmac(identitySecret, `checkout-binding:${encoded}`)}`;
}

export function verifyCheckoutIdentityBindingToken(
  token: string,
  identitySecret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): BindingClaims {
  const parts = token.split('.');
  if (
    parts.length !== 3 ||
    parts[0] !== 'v1' ||
    !/^[0-9a-f]{64}$/.test(parts[2])
  ) {
    throw new CheckoutCustomerIdentityError('invalid_binding_token', 401);
  }
  const expected = hmac(identitySecret, `checkout-binding:${parts[1]}`);
  if (
    !crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(parts[2], 'hex'),
    )
  ) {
    throw new CheckoutCustomerIdentityError('invalid_binding_token', 401);
  }
  let claims: BindingClaims;
  try {
    claims = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as BindingClaims;
  } catch {
    throw new CheckoutCustomerIdentityError('invalid_binding_token', 401);
  }
  if (
    claims.v !== 1 ||
    !Number.isInteger(claims.party_id) ||
    claims.party_id <= 0 ||
    !Number.isInteger(claims.interaction_id) ||
    claims.interaction_id <= 0 ||
    !/^[0-9a-f]{64}$/.test(claims.checkout_token_sha256) ||
    !/^[0-9a-f]{64}$/.test(claims.email_sha256) ||
    !Number.isInteger(claims.exp) ||
    claims.exp < nowSeconds
  ) {
    throw new CheckoutCustomerIdentityError('invalid_binding_token', 401);
  }
  return claims;
}

async function strictPartyCandidates(
  client: PoolClient,
  email: string,
): Promise<number[]> {
  const result = await client.query<{ party_id: string }>(
    `WITH candidates AS (
       SELECT business_v2.canonical_party_id(p.id) AS party_id
         FROM business_v2.parties p
        WHERE p.merged_into IS NULL AND lower(p.primary_email::text)=lower($1)
       UNION
       SELECT business_v2.canonical_party_id(pe.party_id)
         FROM business_v2.party_emails pe
         JOIN business_v2.parties p
           ON p.id=business_v2.canonical_party_id(pe.party_id)
        WHERE p.merged_into IS NULL AND lower(pe.email::text)=lower($1)
     )
     SELECT DISTINCT party_id::text FROM candidates ORDER BY party_id LIMIT 2`,
    [email],
  );
  return result.rows.map((row) => Number(row.party_id));
}

async function exactStripeCustomerForParty(
  client: PoolClient,
  partyId: number,
): Promise<string | null> {
  const result = await client.query<{ external_id: string }>(
    `SELECT external_id
       FROM business_v2.party_external_refs
      WHERE business_v2.canonical_party_id(party_id)=$1
        AND provider='stripe' AND source_scope='tandem'
        AND entity_type='customer' AND status='active'
      ORDER BY id LIMIT 2`,
    [partyId],
  );
  if (result.rows.length > 1) {
    throw new CheckoutCustomerIdentityError(
      'checkout_party_stripe_customer_ambiguous',
      409,
    );
  }
  const customerId = result.rows[0]?.external_id ?? null;
  if (customerId !== null && !CUSTOMER_ID_RE.test(customerId)) {
    throw new CheckoutCustomerIdentityError(
      'invalid_bound_stripe_customer',
      409,
    );
  }
  return customerId;
}

export async function resolveCheckoutCustomerIdentityWithClient(input: {
  client: PoolClient;
  request: CheckoutIdentityResolveRequest;
  identitySecret: string;
}): Promise<CheckoutIdentityResolveResult> {
  const { client, request, identitySecret } = input;
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended('checkout-identity:' || $1,0))`,
    [request.checkoutTokenSha256],
  );
  const sourceId = `checkout_identity:${request.checkoutTokenSha256}`;
  const prior = await client.query<{
    id: string;
    party_id: string;
    email_sha256: string | null;
  }>(
    `SELECT id::text,party_id::text,metadata->>'email_sha256' AS email_sha256
       FROM business_v2.interactions
      WHERE source_provider='wordpress' AND source_id=$1
      ORDER BY id LIMIT 1`,
    [sourceId],
  );
  if (prior.rows[0]) {
    if (prior.rows[0].email_sha256 !== request.emailSha256) {
      throw new CheckoutCustomerIdentityError(
        'checkout_token_identity_conflict',
        409,
      );
    }
    const partyId = Number(prior.rows[0].party_id);
    const interactionId = Number(prior.rows[0].id);
    return {
      partyId,
      interactionId,
      resolution: 'replayed',
      bindingToken: issueCheckoutIdentityBindingToken(
        {
          party_id: partyId,
          interaction_id: interactionId,
          checkout_token_sha256: request.checkoutTokenSha256,
          email_sha256: request.emailSha256,
        },
        identitySecret,
      ),
      stripeCustomerId: await exactStripeCustomerForParty(client, partyId),
    };
  }

  const candidates = await strictPartyCandidates(client, request.email);
  if (candidates.length > 1) {
    throw new CheckoutCustomerIdentityError('checkout_party_ambiguous', 409);
  }
  let partyId = candidates[0] ?? null;
  let resolution: 'created' | 'existing' = 'existing';
  if (partyId === null) {
    const created = await client.query<{ id: string }>(
      `SELECT business_v2.fn_create_party(
         'person',$1,$2::citext,'wordpress',$3::jsonb
       )::text AS id`,
      [
        request.displayName,
        request.email,
        JSON.stringify({
          source: 'checkout_identity',
          product_slug: request.productSlug,
          checkout_token_sha256: request.checkoutTokenSha256,
        }),
      ],
    );
    partyId = Number(created.rows[0].id);
    await client.query(`SELECT business_v2.fn_add_party_role($1,'prospect')`, [
      partyId,
    ]);
    resolution = 'created';
  }

  const interaction = await client.query<{ id: string }>(
    `SELECT business_v2.fn_log_interaction_dedup(
       $1,'form-submission','inbound','Website checkout identity captured',
       $2::timestamptz,$3::jsonb,'wordpress',$4
     )::text AS id`,
    [
      partyId,
      request.observedAt,
      JSON.stringify({
        source: 'checkout_identity',
        product_slug: request.productSlug,
        checkout_token_sha256: request.checkoutTokenSha256,
        email_sha256: request.emailSha256,
        resolution,
      }),
      sourceId,
    ],
  );
  const interactionId = Number(interaction.rows[0].id);
  return {
    partyId,
    interactionId,
    resolution,
    bindingToken: issueCheckoutIdentityBindingToken(
      {
        party_id: partyId,
        interaction_id: interactionId,
        checkout_token_sha256: request.checkoutTokenSha256,
        email_sha256: request.emailSha256,
      },
      identitySecret,
    ),
    stripeCustomerId: await exactStripeCustomerForParty(client, partyId),
  };
}

export async function resolveCheckoutCustomerIdentity(input: {
  request: CheckoutIdentityResolveRequest;
  identitySecret: string;
}): Promise<CheckoutIdentityResolveResult> {
  return withAgentContext(ACTOR, (client) =>
    resolveCheckoutCustomerIdentityWithClient({ client, ...input }),
  );
}

export async function bindCheckoutCustomerIdentityWithClient(input: {
  client: PoolClient;
  request: CheckoutIdentityBindRequest;
  identitySecret: string;
}): Promise<CheckoutIdentityBindResult> {
  const { client, request, identitySecret } = input;
  const claims = verifyCheckoutIdentityBindingToken(
    request.bindingToken,
    identitySecret,
  );
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended('checkout-stripe-customer:' || $1,0))`,
    [request.stripeCustomerId],
  );
  const interaction = await client.query<{
    party_id: string;
    email_sha256: string | null;
  }>(
    `SELECT party_id::text,metadata->>'email_sha256' AS email_sha256
       FROM business_v2.interactions
      WHERE id=$1 AND source_provider='wordpress'
        AND source_id=$2`,
    [
      claims.interaction_id,
      `checkout_identity:${claims.checkout_token_sha256}`,
    ],
  );
  if (
    !interaction.rows[0] ||
    Number(interaction.rows[0].party_id) !== claims.party_id ||
    interaction.rows[0].email_sha256 !== claims.email_sha256
  ) {
    throw new CheckoutCustomerIdentityError('binding_source_mismatch', 409);
  }

  const existing = await client.query<{ party_id: string }>(
    `SELECT business_v2.canonical_party_id(party_id)::text AS party_id
       FROM business_v2.party_external_refs
      WHERE provider='stripe' AND source_scope='tandem'
        AND entity_type='customer' AND external_id=$1
      FOR UPDATE`,
    [request.stripeCustomerId],
  );
  if (
    existing.rows[0] &&
    Number(existing.rows[0].party_id) !== claims.party_id
  ) {
    throw new CheckoutCustomerIdentityError(
      'stripe_customer_party_conflict',
      409,
    );
  }
  const duplicate = existing.rows.length === 1;
  const receipt = sha256(
    JSON.stringify({
      rule: 'checkout_capture_party_stripe_binding_v1',
      party_id: claims.party_id,
      customer_id: request.stripeCustomerId,
      interaction_id: claims.interaction_id,
    }),
  );
  if (duplicate) {
    await client.query(
      `UPDATE business_v2.party_external_refs
          SET status='active',verified_at=$2::timestamptz,
              last_seen_at=GREATEST(last_seen_at,$2::timestamptz),
              source_receipt_sha256=$3,updated_at=now()
        WHERE provider='stripe' AND source_scope='tandem'
          AND entity_type='customer' AND external_id=$1`,
      [request.stripeCustomerId, request.observedAt, receipt],
    );
  } else {
    await client.query(
      `INSERT INTO business_v2.party_external_refs
         (party_id,provider,source_scope,entity_type,external_id,
          adapter_key,adapter_version,schema_version,status,verified_at,
          first_seen_at,last_seen_at,source_receipt_sha256)
       VALUES ($1,'stripe','tandem','customer',$2,
               'checkout_identity_handshake','1.0.0',1,'active',
               $3::timestamptz,$3::timestamptz,$3::timestamptz,$4)`,
      [claims.party_id, request.stripeCustomerId, request.observedAt, receipt],
    );
  }
  await client.query(
    `SELECT business_v2.fn_log_interaction_dedup(
       $1,'other','internal','Stripe Customer bound to checkout identity',
       $2::timestamptz,$3::jsonb,'wordpress',$4
     )`,
    [
      claims.party_id,
      request.observedAt,
      JSON.stringify({
        source: 'checkout_identity',
        stripe_account: 'tandem',
        stripe_customer_id: request.stripeCustomerId,
        binding_receipt_sha256: receipt,
      }),
      `checkout_stripe_customer:${request.stripeCustomerId}`,
    ],
  );
  return {
    partyId: claims.party_id,
    stripeCustomerId: request.stripeCustomerId,
    bound: true,
    duplicate,
  };
}

export async function bindCheckoutCustomerIdentity(input: {
  request: CheckoutIdentityBindRequest;
  identitySecret: string;
}): Promise<CheckoutIdentityBindResult> {
  return withAgentContext(ACTOR, (client) =>
    bindCheckoutCustomerIdentityWithClient({ client, ...input }),
  );
}
