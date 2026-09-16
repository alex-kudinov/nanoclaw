import crypto from 'node:crypto';

import { query } from './business-db.js';
import {
  executeAcademyCapacityOperatorCommand,
  type CapacityOperatorResult,
} from './academy-capacity-operator-store.js';

export interface AcademyCapacitySaleFact {
  version: 1;
  eligible: boolean;
  payment_provider?: 'stripe' | 'adyen';
  provider_payment_id?: string;
  /** Legacy Stripe field retained so deployed Contador sentinels replay identically. */
  payment_intent_id?: string;
  product_slug: string | null;
  cohort_program: string | null;
  cohort_start: string | null;
}

interface SaleIngressDeps {
  query: typeof query;
  execute: typeof executeAcademyCapacityOperatorCommand;
}

const defaultDeps: SaleIngressDeps = {
  query,
  execute: executeAcademyCapacityOperatorCommand,
};

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function recordAcademyCapacityWebsiteSale(
  fact: AcademyCapacitySaleFact,
  deps: Partial<SaleIngressDeps> = {},
): Promise<CapacityOperatorResult | null> {
  if (!fact.eligible) return null;
  const provider = fact.payment_provider ?? 'stripe';
  const providerPaymentId =
    fact.provider_payment_id ?? fact.payment_intent_id ?? '';
  if (
    fact.version !== 1 ||
    !['stripe', 'adyen'].includes(provider) ||
    (provider === 'stripe'
      ? !/^pi_[A-Za-z0-9_]+$/.test(providerPaymentId)
      : !/^[A-Za-z0-9._:-]{1,100}$/.test(providerPaymentId)) ||
    !fact.product_slug ||
    !/^[a-z0-9][a-z0-9._:-]{0,199}$/.test(fact.product_slug) ||
    !['acc', 'mcs-practicum'].includes(fact.cohort_program ?? '') ||
    !fact.cohort_start ||
    !/^\d{4}-\d{2}-\d{2}/.test(fact.cohort_start)
  ) {
    throw new Error('academy-capacity-sale: invalid eligible fact');
  }
  const runtime = { ...defaultDeps, ...deps };
  const date = fact.cohort_start.slice(0, 10);
  const deliveryBlockKey = `${
    fact.cohort_program === 'acc' ? 'acc.module-1' : 'mcs-practicum'
  }:${date}`;
  const evidenceSha256 = hash(
    [
      provider,
      providerPaymentId,
      fact.product_slug,
      fact.cohort_program,
      fact.cohort_start,
      deliveryBlockKey,
    ].join('|'),
  );
  const providerIdentity =
    provider === 'stripe' ? providerPaymentId : `adyen:${providerPaymentId}`;
  const identity = hash(providerIdentity).slice(0, 32);
  let result: CapacityOperatorResult | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const target = await runtime.query<{
      pool_key: string;
      pool_version: number;
      ends_at: Date | string;
      catalog_revision: number;
    }>(
      `SELECT p.pool_key,p.version AS pool_version,d.ends_at,m.catalog_revision
         FROM business_v2.academy_delivery_blocks d
         JOIN business_v2.academy_seat_pools p ON p.delivery_block_id=d.id
         JOIN business_v2.academy_seat_pool_offers m ON m.pool_id=p.id
        WHERE d.delivery_block_key=$1 AND m.offer_key=$2 AND m.state='active'
        LIMIT 2`,
      [deliveryBlockKey, fact.product_slug],
    );
    if (target.rows.length !== 1)
      throw new Error(
        'academy-capacity-sale: exact pool/offer mapping not found',
      );
    const row = target.rows[0];
    const poolVersion = Number(row.pool_version);
    result = await runtime.execute('capacity', {
      type: 'commit_seat',
      // The version suffix keeps a stale optimistic attempt auditable while a
      // fresh pool read can retry the same payment without replaying its denial.
      caseKey: `website-sale:${identity}:pool-v${poolVersion}`,
      commitmentKey: `commitment:website:${identity}`,
      poolKey: row.pool_key,
      expectedPoolVersion: poolVersion,
      sourceScope:
        provider === 'stripe' ? 'website_stripe_sale' : 'website_adyen_sale',
      idempotencyKey: providerIdentity,
      offerKey: fact.product_slug,
      catalogRevision: Number(row.catalog_revision),
      orderKey: null,
      seatKey: null,
      expiresAt:
        row.ends_at instanceof Date
          ? row.ends_at.toISOString()
          : new Date(row.ends_at).toISOString(),
      reason: 'verified website sale',
      evidenceSha256,
    });
    if (result.code !== 'stale_version') return result;
  }
  return result;
}
