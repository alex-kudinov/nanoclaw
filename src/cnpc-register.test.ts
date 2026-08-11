import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { initDatabase, setRegisteredGroup } = vi.hoisted(() => ({
  initDatabase: vi.fn(),
  setRegisteredGroup: vi.fn(),
}));
vi.mock('./db.js', () => ({ initDatabase, setRegisteredGroup }));

import { registerCnpcRuntime } from './cnpc-register.js';

describe('CNPC runtime registration', () => {
  let runtimeRoot: string;

  beforeEach(() => {
    vi.clearAllMocks();
    runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cnpc-register-'));
  });

  afterEach(() => {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  });

  it('registers the isolated Slack group and private webhook without printing the secret', () => {
    const secret = 's'.repeat(64);
    const result = registerCnpcRuntime('C0BPG0408BW', secret, runtimeRoot);

    expect(initDatabase).toHaveBeenCalledOnce();
    expect(setRegisteredGroup).toHaveBeenCalledWith(
      'slack:C0BPG0408BW',
      expect.objectContaining({
        folder: 'cnpc',
        requiresTrigger: false,
        containerConfig: expect.objectContaining({
          threadPerMessage: true,
          model: 'sonnet',
        }),
      }),
    );
    const stored = JSON.parse(fs.readFileSync(result.webhooksPath, 'utf8'));
    expect(stored).toEqual([
      expect.objectContaining({
        id: 'cnpc-coaching-intake',
        chat_jid: 'slack:C0BPG0408BW',
        secret,
        suppress_output: true,
      }),
    ]);
    expect(fs.statSync(result.webhooksPath).mode & 0o777).toBe(0o600);
  });

  it('preserves other webhooks and replaces the CNPC definition idempotently', () => {
    const dataDir = path.join(runtimeRoot, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, 'webhooks.json'),
      JSON.stringify([
        { id: 'other' },
        { id: 'cnpc-coaching-intake', secret: 'old' },
      ]),
    );

    registerCnpcRuntime('C0BPG0408BW', 'n'.repeat(64), runtimeRoot);

    const stored = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'webhooks.json'), 'utf8'),
    );
    expect(stored).toHaveLength(2);
    expect(stored.find((item: { id: string }) => item.id === 'other')).toEqual({
      id: 'other',
    });
    expect(
      stored.find((item: { id: string }) => item.id === 'cnpc-coaching-intake')
        .secret,
    ).toBe('n'.repeat(64));
  });

  it('rejects malformed channel IDs and short secrets before writing runtime state', () => {
    expect(() =>
      registerCnpcRuntime('not-a-channel', 's'.repeat(64), runtimeRoot),
    ).toThrow(/channel ID/);
    expect(() =>
      registerCnpcRuntime('C0BPG0408BW', 'short', runtimeRoot),
    ).toThrow(/at least 32/);
    expect(initDatabase).not.toHaveBeenCalled();
    expect(setRegisteredGroup).not.toHaveBeenCalled();
  });
});
