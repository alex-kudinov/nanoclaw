/**
 * Postgres connection pool for nanoclaw_business.
 * Used by host-side classification handlers, digest generator, and reaper.
 *
 * Connection URL resolution order:
 *   1. BUSINESS_DB_URL env var (explicit override)
 *   2. Assembled from BUSINESS_DB_HOST/PORT/NAME + BUSINESS_DB_ROLE_ADMIN/PASS_ADMIN
 *      (matches container-runner.ts role-based credential pattern).
 */

import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { Pool } from 'pg';

import { readEnvFile } from './env.js';
import { logger } from './logger.js';

let cachedPool: Pool | null = null;

/** Exported for tests. */
export function resolveConnectionString(): string {
  const env = readEnvFile([
    'BUSINESS_DB_URL',
    'BUSINESS_DB_HOST',
    'BUSINESS_DB_HOST_LOCAL',
    'BUSINESS_DB_PORT',
    'BUSINESS_DB_NAME',
    'BUSINESS_DB_ROLE_ADMIN',
    'BUSINESS_DB_PASS_ADMIN',
  ]);
  if (env.BUSINESS_DB_URL) return env.BUSINESS_DB_URL;
  const host = env.BUSINESS_DB_HOST_LOCAL || env.BUSINESS_DB_HOST;
  const port = env.BUSINESS_DB_PORT || '5432';
  const name = env.BUSINESS_DB_NAME;
  const role = env.BUSINESS_DB_ROLE_ADMIN;
  const pass = env.BUSINESS_DB_PASS_ADMIN;
  if (!host || !name || !role || !pass) {
    throw new Error(
      'business-db: set BUSINESS_DB_URL or BUSINESS_DB_HOST/NAME/ROLE_ADMIN/PASS_ADMIN in .env',
    );
  }
  return `postgresql://${role}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
}

export function getBusinessPool(): Pool {
  if (cachedPool) return cachedPool;
  const connectionString = resolveConnectionString();
  cachedPool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  cachedPool.on('error', (err) => {
    logger.error({ err }, 'business-db: idle client error');
  });
  return cachedPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  const pool = getBusinessPool();
  return pool.query<T>(sql, params);
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getBusinessPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Run fn inside a transaction with agent identity set via session vars. */
export async function withAgentContext<T>(
  agentName: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withTransaction(async (client) => {
    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_agent',
      agentName,
    ]);
    await client.query(
      "SELECT set_config('app.current_agent_role', current_user::text, true)",
    );
    return fn(client);
  });
}

/** Test-only: reset the cached pool (end it first). */
export async function resetBusinessPool(): Promise<void> {
  if (cachedPool) {
    await cachedPool.end().catch(() => undefined);
    cachedPool = null;
  }
}
