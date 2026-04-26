/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('pg', () => {
  class FakePool {
    query = vi.fn();
    connect = vi.fn();
    on = vi.fn();
    end = vi.fn().mockResolvedValue(undefined);
    opts: any;
    constructor(opts: any) {
      this.opts = opts;
    }
  }
  return { Pool: FakePool };
});

vi.mock('./env.js', () => {
  const envStub: any = {};
  return {
    readEnvFile: (keys: string[]) => {
      const out: any = {};
      for (const k of keys) if (envStub[k]) out[k] = envStub[k];
      return out;
    },
    __setEnv: (k: string, v: string) => {
      envStub[k] = v;
    },
    __clearEnv: () => {
      for (const k of Object.keys(envStub)) delete envStub[k];
    },
  };
});

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import * as envMod from './env.js';
import {
  getBusinessPool,
  resetBusinessPool,
  resolveConnectionString,
  withAgentContext,
} from './business-db.js';

const setEnv = (envMod as any).__setEnv as (k: string, v: string) => void;
const clearEnv = (envMod as any).__clearEnv as () => void;

beforeEach(async () => {
  clearEnv();
  await resetBusinessPool();
});

describe('resolveConnectionString', () => {
  it('prefers BUSINESS_DB_URL when present', () => {
    setEnv('BUSINESS_DB_URL', 'postgresql://u:p@h:5432/db');
    expect(resolveConnectionString()).toBe('postgresql://u:p@h:5432/db');
  });

  it('assembles from role/pass when URL missing', () => {
    setEnv('BUSINESS_DB_HOST', '192.168.64.1');
    setEnv('BUSINESS_DB_PORT', '5432');
    setEnv('BUSINESS_DB_NAME', 'nanoclaw_business');
    setEnv('BUSINESS_DB_ROLE_ADMIN', 'nanoclaw_admin');
    setEnv('BUSINESS_DB_PASS_ADMIN', 'p@ss word');
    expect(resolveConnectionString()).toBe(
      'postgresql://nanoclaw_admin:p%40ss%20word@192.168.64.1:5432/nanoclaw_business',
    );
  });

  it('defaults port to 5432 when BUSINESS_DB_PORT missing', () => {
    setEnv('BUSINESS_DB_HOST', 'h');
    setEnv('BUSINESS_DB_NAME', 'db');
    setEnv('BUSINESS_DB_ROLE_ADMIN', 'u');
    setEnv('BUSINESS_DB_PASS_ADMIN', 'p');
    expect(resolveConnectionString()).toContain(':5432/');
  });

  it('throws when required vars are missing', () => {
    expect(() => resolveConnectionString()).toThrow(/BUSINESS_DB_URL/);
  });
});

describe('getBusinessPool', () => {
  it('returns a singleton across calls', () => {
    setEnv('BUSINESS_DB_URL', 'postgresql://u:p@h:5432/db');
    const a = getBusinessPool();
    const b = getBusinessPool();
    expect(a).toBe(b);
  });

  it('registers an error handler on the pool', () => {
    setEnv('BUSINESS_DB_URL', 'postgresql://u:p@h:5432/db');
    const pool = getBusinessPool() as any;
    expect(pool.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('constructs the Pool with the resolved connection string', () => {
    setEnv('BUSINESS_DB_URL', 'postgresql://u:p@h:5432/db');
    const pool = getBusinessPool() as any;
    expect(pool.opts.connectionString).toBe('postgresql://u:p@h:5432/db');
  });

  it('propagates query errors from the underlying pool', async () => {
    setEnv('BUSINESS_DB_URL', 'postgresql://u:p@h:5432/db');
    const pool = getBusinessPool() as any;
    pool.query.mockRejectedValue(new Error('pg boom'));
    await expect(pool.query('SELECT 1')).rejects.toThrow('pg boom');
  });
});

describe('withAgentContext', () => {
  it('sets agent identity and commits on success', async () => {
    setEnv('BUSINESS_DB_URL', 'postgresql://u:p@h:5432/db');
    const pool = getBusinessPool() as any;
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);

    const result = await withAgentContext('test-agent', async (client) => {
      await client.query('SELECT 1');
      return 42;
    });

    expect(result).toBe(42);
    const calls = mockClient.query.mock.calls.map((c: any[]) => c[0]);
    expect(calls).toEqual([
      'BEGIN',
      'SELECT set_config($1, $2, true)',
      "SELECT set_config('app.current_agent_role', current_user::text, true)",
      'SELECT 1',
      'COMMIT',
    ]);
    expect(mockClient.query.mock.calls[1][1]).toEqual([
      'app.current_agent',
      'test-agent',
    ]);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('rolls back and propagates error on failure', async () => {
    setEnv('BUSINESS_DB_URL', 'postgresql://u:p@h:5432/db');
    const pool = getBusinessPool() as any;
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);

    await expect(
      withAgentContext('test-agent', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const calls = mockClient.query.mock.calls.map((c: any[]) => c[0]);
    expect(calls).toContain('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });
});
