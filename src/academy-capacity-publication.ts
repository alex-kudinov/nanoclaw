import crypto from 'node:crypto';

import type { QueryResultRow } from 'pg';

import { query } from './business-db.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

export type CapacityPublicationReason = 'threshold' | 'daily' | 'initial';
export type CapacitySiteState = 'available' | 'sold_out';

export interface CapacityPublicationPayload {
  schema_version: 1;
  pool_key: string;
  program: 'acc' | 'mcs-practicum';
  cohort_start: string;
  state: CapacitySiteState;
  revision: number;
  generated_at: string;
  payload_sha256: string;
}

export interface AcademyCapacityPublicationConfig {
  enabled: boolean;
  valid: boolean;
  siteUrl: string | null;
  siteKey: string | null;
  cloudflareZoneId: string | null;
  cloudflareToken: string | null;
  reason: string;
}

interface PublicationDeps {
  query: typeof query;
  fetch: typeof fetch;
  now: () => string;
}

const defaultDeps: PublicationDeps = {
  query,
  fetch,
  now: () => new Date().toISOString(),
};

const SITE_PATHS: Record<'acc' | 'mcs-practicum', string[]> = {
  acc: [
    '/icf/acc-coach-certification-training/',
    '/icf/acc-pcc-certification/',
    '/icf/pcc-professional-coach-certification/',
  ],
  'mcs-practicum': ['/mcs/', '/mcs/advanced-accreditation-mentor-coaching/'],
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function sha(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function academyCapacityPublicationConfig(
  env: NodeJS.ProcessEnv = process.env,
): AcademyCapacityPublicationConfig {
  const file = readEnvFile([
    'ACADEMY_CAPACITY_PUBLICATION_ENABLED',
    'ACADEMY_CAPACITY_SITE_URL',
    'TANDEM_API_KEY',
    'CF_ZONE_ID',
    'CF_MGMT_TOKEN',
    'CF_API_TOKEN',
  ]);
  const source = { ...file, ...env };
  const enabled = source.ACADEMY_CAPACITY_PUBLICATION_ENABLED === '1';
  const siteUrl = source.ACADEMY_CAPACITY_SITE_URL?.replace(/\/+$/, '') ?? null;
  const siteKey = source.TANDEM_API_KEY ?? null;
  const cloudflareZoneId = source.CF_ZONE_ID ?? null;
  const cloudflareToken = source.CF_MGMT_TOKEN ?? source.CF_API_TOKEN ?? null;
  if (!enabled)
    return {
      enabled,
      valid: true,
      siteUrl,
      siteKey,
      cloudflareZoneId,
      cloudflareToken,
      reason: 'disabled',
    };
  if (!siteUrl || !/^https:\/\//.test(siteUrl))
    return {
      enabled,
      valid: false,
      siteUrl,
      siteKey,
      cloudflareZoneId,
      cloudflareToken,
      reason: 'site_url_invalid',
    };
  if (!siteKey || siteKey.length < 16)
    return {
      enabled,
      valid: false,
      siteUrl,
      siteKey: null,
      cloudflareZoneId,
      cloudflareToken,
      reason: 'site_key_missing',
    };
  if (!cloudflareZoneId || !cloudflareToken)
    return {
      enabled,
      valid: false,
      siteUrl,
      siteKey,
      cloudflareZoneId,
      cloudflareToken,
      reason: 'cloudflare_config_missing',
    };
  return {
    enabled,
    valid: true,
    siteUrl,
    siteKey,
    cloudflareZoneId,
    cloudflareToken,
    reason: 'enabled',
  };
}

export function publicSiteState(
  value: 'open' | 'sold_out' | 'closed',
  waitlistCount = 0,
): CapacitySiteState {
  return value === 'open' && waitlistCount === 0 ? 'available' : 'sold_out';
}

export function publicProgramAndDate(deliveryBlockKey: string): {
  program: 'acc' | 'mcs-practicum';
  cohortStart: string;
} | null {
  const match = /^(acc\.module-1|mcs-practicum):(\d{4}-\d{2}-\d{2})$/.exec(
    deliveryBlockKey,
  );
  if (!match) return null;
  return {
    program: match[1] === 'acc.module-1' ? 'acc' : 'mcs-practicum',
    cohortStart: match[2],
  };
}

export function buildCapacityPublicationPayload(input: {
  poolKey: string;
  deliveryBlockKey: string;
  publicState: 'open' | 'sold_out' | 'closed';
  poolVersion: number;
  generatedAt: string;
  waitlistCount?: number;
}): CapacityPublicationPayload | null {
  const publicIdentity = publicProgramAndDate(input.deliveryBlockKey);
  if (!publicIdentity) return null;
  const base = {
    schema_version: 1 as const,
    pool_key: input.poolKey,
    program: publicIdentity.program,
    cohort_start: publicIdentity.cohortStart,
    state: publicSiteState(input.publicState, input.waitlistCount ?? 0),
    revision: input.poolVersion,
    generated_at: input.generatedAt,
  };
  return { ...base, payload_sha256: sha(stableJson(base)) };
}

export async function enqueueAcademyCapacityPublications(
  reason: CapacityPublicationReason,
  deps: Partial<PublicationDeps> = {},
): Promise<{ scanned: number; enqueued: number; skipped: number }> {
  const runtime = { ...defaultDeps, ...deps };
  const now = runtime.now();
  const result = await runtime.query(
    `SELECT p.id::text AS pool_id,v.pool_key,v.delivery_block_key,v.public_state,
            v.waitlist_count,
            v.pool_version,
            (SELECT x.public_state
               FROM business_v2.academy_capacity_publications x
              WHERE x.pool_id=p.id AND x.state='delivered'
              ORDER BY x.delivered_at DESC,x.id DESC LIMIT 1) AS last_state
       FROM business_v2.v_academy_seat_pool_occupancy v
       JOIN business_v2.academy_seat_pools p ON p.pool_key=v.pool_key
      ORDER BY p.id`,
  );
  let enqueued = 0;
  let skipped = 0;
  for (const row of result.rows as QueryResultRow[]) {
    const projection = buildCapacityPublicationPayload({
      poolKey: String(row.pool_key),
      deliveryBlockKey: String(row.delivery_block_key),
      publicState: row.public_state as 'open' | 'sold_out' | 'closed',
      poolVersion: Number(row.pool_version),
      generatedAt: now,
      waitlistCount: Number(row.waitlist_count),
    });
    if (!projection) {
      skipped += 1;
      continue;
    }
    if (reason === 'threshold' && row.last_state === projection.state) {
      skipped += 1;
      continue;
    }
    const day = now.slice(0, 10);
    const publicationKey = `capacity-publication:${sha(
      `${projection.pool_key}|${row.pool_version}|${projection.state}|${reason}|${reason === 'daily' ? day : ''}`,
    ).slice(0, 40)}`;
    const inserted = await runtime.query<{ id: string }>(
      `INSERT INTO business_v2.academy_capacity_publications
         (publication_key,pool_id,pool_version,public_state,reason,payload_sha256,
          state,attempt_count,next_attempt_at,created_at,updated_at,updated_by)
       VALUES ($1,$2::bigint,$3,$4,$5,repeat('0',64),'pending',0,$6,$6,$6,'academy-capacity-publication:host')
       ON CONFLICT (publication_key) DO NOTHING
       RETURNING id::text`,
      [
        publicationKey,
        String(row.pool_id),
        Number(row.pool_version),
        projection.state,
        reason,
        now,
      ],
    );
    if (inserted.rowCount === 1 && inserted.rows[0]) {
      const payload = buildCapacityPublicationPayload({
        poolKey: String(row.pool_key),
        deliveryBlockKey: String(row.delivery_block_key),
        publicState: row.public_state as 'open' | 'sold_out' | 'closed',
        poolVersion: Number(inserted.rows[0].id),
        generatedAt: now,
        waitlistCount: Number(row.waitlist_count),
      })!;
      const finalized = await runtime.query(
        `UPDATE business_v2.academy_capacity_publications
            SET payload_sha256=$1
          WHERE id=$2::bigint AND payload_sha256=repeat('0',64)`,
        [payload.payload_sha256, inserted.rows[0].id],
      );
      if (finalized.rowCount !== 1)
        throw new Error(
          'academy-capacity-publication: payload finalization failed',
        );
      enqueued += 1;
    } else skipped += 1;
  }
  return { scanned: result.rows.length, enqueued, skipped };
}

export async function runAcademyCapacityPublicationBatch(
  deps: Partial<PublicationDeps> = {},
): Promise<{ attempted: number; delivered: number; failed: number }> {
  const config = academyCapacityPublicationConfig();
  if (!config.enabled) return { attempted: 0, delivered: 0, failed: 0 };
  if (
    !config.valid ||
    !config.siteUrl ||
    !config.siteKey ||
    !config.cloudflareZoneId ||
    !config.cloudflareToken
  )
    throw new Error(`academy-capacity-publication:${config.reason}`);
  const runtime = { ...defaultDeps, ...deps };
  const now = runtime.now();
  const pending = await runtime.query(
    `SELECT x.id::text,p.pool_key,d.delivery_block_key,x.public_state,
            x.pool_version,x.payload_sha256,x.attempt_count,x.created_at
       FROM business_v2.academy_capacity_publications x
       JOIN business_v2.academy_seat_pools p ON p.id=x.pool_id
       JOIN business_v2.academy_delivery_blocks d ON d.id=p.delivery_block_id
      WHERE x.state IN ('pending','failed') AND x.next_attempt_at <= $1
      ORDER BY x.next_attempt_at,x.id
      LIMIT 20`,
    [now],
  );
  let delivered = 0;
  let failed = 0;
  for (const row of pending.rows as QueryResultRow[]) {
    const payload = buildCapacityPublicationPayload({
      poolKey: String(row.pool_key),
      deliveryBlockKey: String(row.delivery_block_key),
      publicState:
        String(row.public_state) === 'available' ? 'open' : 'sold_out',
      poolVersion: Number(row.id),
      generatedAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
    });
    if (!payload || payload.payload_sha256 !== String(row.payload_sha256)) {
      await runtime.query(
        `UPDATE business_v2.academy_capacity_publications
            SET state='failed',attempt_count=attempt_count+1,
                last_error_code='payload_drift',next_attempt_at=$2,
                updated_at=$1,updated_by='academy-capacity-publication:host'
          WHERE id=$3::bigint`,
        [
          now,
          new Date(Date.parse(now) + 3600_000).toISOString(),
          String(row.id),
        ],
      );
      failed += 1;
      continue;
    }
    const body = stableJson(payload);
    const signature = `sha256=${crypto
      .createHmac('sha256', config.siteKey)
      .update(body)
      .digest('hex')}`;
    let ack: string | null = null;
    let errorCode = 'publication_failed';
    try {
      const response = await runtime.fetch(
        `${config.siteUrl}/wp-json/tandem/v1/capacity-status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tandem-Key': config.siteKey,
            'X-Tandem-Signature': signature,
          },
          body,
          signal: AbortSignal.timeout(30_000),
        },
      );
      const json = (await response.json()) as Record<string, unknown>;
      if (
        response.ok &&
        json.success === true &&
        json.cache_complete === true &&
        typeof json.ack_sha256 === 'string' &&
        /^[0-9a-f]{64}$/.test(json.ack_sha256)
      ) {
        const paths = SITE_PATHS[payload.program];
        const files = paths.map((path) => `${config.siteUrl}${path}`);
        const purge = await runtime.fetch(
          `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(config.cloudflareZoneId)}/purge_cache`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.cloudflareToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ files }),
            signal: AbortSignal.timeout(30_000),
          },
        );
        if (!purge.ok) {
          errorCode = 'cloudflare_purge_failed';
        } else {
          let warm = true;
          for (const file of files) {
            const warmed = await runtime.fetch(file, {
              method: 'GET',
              redirect: 'follow',
              signal: AbortSignal.timeout(30_000),
            });
            if (!warmed.ok) warm = false;
          }
          if (warm) ack = json.ack_sha256;
          else errorCode = 'page_prewarm_failed';
        }
      } else {
        errorCode = response.ok ? 'cache_refresh_incomplete' : 'site_rejected';
      }
    } catch {
      errorCode = 'site_unavailable';
    }
    if (ack) {
      await runtime.query(
        `UPDATE business_v2.academy_capacity_publications
            SET state='delivered',attempt_count=attempt_count+1,
                last_error_code=NULL,ack_sha256=$2,delivered_at=$1,
                updated_at=$1,updated_by='academy-capacity-publication:host'
          WHERE id=$3::bigint AND state IN ('pending','failed')`,
        [now, ack, String(row.id)],
      );
      delivered += 1;
    } else {
      const attempt = Number(row.attempt_count) + 1;
      const delayMs = Math.min(
        6 * 3600_000,
        60_000 * 2 ** Math.min(attempt, 8),
      );
      await runtime.query(
        `UPDATE business_v2.academy_capacity_publications
            SET state='failed',attempt_count=$2,last_error_code=$3,
                next_attempt_at=$4,updated_at=$1,
                updated_by='academy-capacity-publication:host'
          WHERE id=$5::bigint AND state IN ('pending','failed')`,
        [
          now,
          attempt,
          errorCode,
          new Date(Date.parse(now) + delayMs).toISOString(),
          String(row.id),
        ],
      );
      logger.warn(
        { publicationId: String(row.id), errorCode, attempt },
        'Academy capacity website publication retained for retry',
      );
      failed += 1;
    }
  }
  return { attempted: pending.rows.length, delivered, failed };
}
