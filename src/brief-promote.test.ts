import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExternalWriteDeniedError } from './action-safety.js';
import {
  parseBriefItem,
  postBriefItemToThings,
  promoteBriefItem,
} from './brief-promote.js';

const SAFETY_ENV_KEYS = [
  'ACTION_SAFETY_ENFORCEMENT_ENABLED',
  'EXTERNAL_WRITE_SAFE_MODE',
  'EXTERNAL_WRITE_DISABLED_SYSTEMS',
] as const;
const savedEnvironment = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of SAFETY_ENV_KEYS) {
    savedEnvironment.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of SAFETY_ENV_KEYS) {
    const value = savedEnvironment.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnvironment.clear();
});

describe('parseBriefItem', () => {
  it('parses a posted brief item with title, domain, and ISO due', () => {
    const text =
      '🔥 *Estimated Tax Payment — Q2 (1040-ES)*\npersonal · due 2026-06-15\n_due in 1d_';
    const item = parseBriefItem(text);
    expect(item).not.toBeNull();
    expect(item!.title).toBe('Estimated Tax Payment — Q2 (1040-ES)');
    expect(item!.domain).toBe('personal');
    expect(item!.due).toBe('2026-06-15');
  });

  it('parses an item with no due date', () => {
    const item = parseBriefItem(
      '🗓 *Render Phase 5 resource PDFs*\ndev\n_courses — in-progress_',
    );
    expect(item).not.toBeNull();
    expect(item!.domain).toBe('dev');
    expect(item!.due).toBeUndefined();
  });

  it('returns null for an ordinary bot message (no bold title)', () => {
    expect(parseBriefItem('Approved — sending the email now.')).toBeNull();
  });

  it('returns null when there is a title but no known domain', () => {
    expect(
      parseBriefItem('*Some random bolded note* with no domain word'),
    ).toBeNull();
  });

  it('ignores Slack markup and caps title length', () => {
    const long = 'x'.repeat(400);
    const item = parseBriefItem(`🔥 *${long}*\nsolera · due 2026-03-23`);
    expect(item!.title.length).toBe(280);
    expect(item!.domain).toBe('solera');
  });

  it('returns null on empty input', () => {
    expect(parseBriefItem('')).toBeNull();
  });
});

describe('Things bridge write boundary', () => {
  const item = {
    title: 'Synthetic action-safety item',
    domain: 'dev',
    due: '2026-08-17',
  };

  it('preserves the default-off POST contract', async () => {
    const fetchImpl = vi.fn(
      async () => ({ ok: true, status: 200 }) as Response,
    );
    const signal = new AbortController().signal;

    await expect(
      postBriefItemToThings(item, {
        fetch: fetchImpl as typeof fetch,
        bridgeKey: 'synthetic-key',
        bridgeUrl: 'http://things.example.invalid',
        signal,
      }),
    ).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://things.example.invalid/add-todo',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Key': 'synthetic-key',
        },
        body: JSON.stringify({
          title: item.title,
          due: item.due,
          domain: item.domain,
        }),
        signal,
      },
    );
  });

  it('does not invoke fetch when the bridge key is missing', async () => {
    const fetchImpl = vi.fn();
    await expect(
      postBriefItemToThings(item, {
        fetch: fetchImpl as typeof fetch,
        bridgeKey: '',
      }),
    ).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['global', '1', '', 'global_safe_mode'],
    ['per-system', '0', 'things', 'system_safe_mode'],
  ])(
    'denies %s safe mode before fetch',
    async (_label, globalMode, disabledSystems, expectedCode) => {
      process.env.EXTERNAL_WRITE_SAFE_MODE = globalMode;
      process.env.EXTERNAL_WRITE_DISABLED_SYSTEMS = disabledSystems;
      const fetchImpl = vi.fn();

      const operation = postBriefItemToThings(item, {
        fetch: fetchImpl as typeof fetch,
        bridgeKey: 'synthetic-key',
        bridgeUrl: 'http://things.example.invalid',
      });
      await expect(operation).rejects.toBeInstanceOf(ExternalWriteDeniedError);
      await expect(operation).rejects.toMatchObject({
        system: 'things',
        code: expectedCode,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('returns false to the Slack-facing caller when action safety denies', async () => {
    process.env.EXTERNAL_WRITE_SAFE_MODE = '1';
    const fetchImpl = vi.fn();
    await expect(
      promoteBriefItem('*Synthetic action-safety item*\ndev', {
        fetch: fetchImpl as typeof fetch,
        bridgeKey: 'synthetic-key',
      }),
    ).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('retains non-OK and transport-failure handling', async () => {
    const nonOk = vi.fn(async () => ({ ok: false, status: 503 }) as Response);
    await expect(
      postBriefItemToThings(item, {
        fetch: nonOk as typeof fetch,
        bridgeKey: 'synthetic-key',
      }),
    ).resolves.toBe(false);

    const failed = vi.fn(async () => {
      throw new Error('synthetic transport failure');
    });
    await expect(
      postBriefItemToThings(item, {
        fetch: failed as typeof fetch,
        bridgeKey: 'synthetic-key',
      }),
    ).resolves.toBe(false);
  });
});
