import { describe, expect, it, vi } from 'vitest';

import {
  parseWebsiteCheckoutLiveArguments,
  runWebsiteCheckoutLiveEntrypoint,
  WEBSITE_CHECKOUT_LIVE_USAGE,
} from './website-checkout-live-entrypoint.js';

function sink() {
  let value = '';
  return {
    stream: { write: (chunk: string | Uint8Array) => ((value += chunk), true) },
    value: () => value,
  };
}

describe('website checkout LIVE compiled entrypoint', () => {
  it('prints help without constructing a service', async () => {
    const stdout = sink();
    const stderr = sink();
    const start = vi.fn();
    await expect(
      runWebsiteCheckoutLiveEntrypoint(['--help'], {
        start,
        stdout: stdout.stream,
        stderr: stderr.stream,
      }),
    ).resolves.toBe(0);
    expect(start).not.toHaveBeenCalled();
    expect(stdout.value()).toBe(`${WEBSITE_CHECKOUT_LIVE_USAGE}\n`);
    expect(stderr.value()).toBe('');
  });

  it('rejects a relative config before constructing a service', async () => {
    const stderr = sink();
    const start = vi.fn();
    await expect(
      runWebsiteCheckoutLiveEntrypoint(['--config', 'private.json'], {
        start,
        stderr: stderr.stream,
      }),
    ).resolves.toBe(1);
    expect(start).not.toHaveBeenCalled();
    expect(stderr.value()).toBe(
      'ERROR website-checkout-live code=invalid_arguments\n',
    );
  });

  it('validates an absolute private config without opening a database or listener', async () => {
    const stdout = sink();
    const start = vi.fn();
    const validate = vi.fn().mockReturnValue({ mode: 'live' });
    const verifyRelease = vi.fn();
    await expect(
      runWebsiteCheckoutLiveEntrypoint(
        ['--check-config', '/private/config.json'],
        { start, validate, verifyRelease, stdout: stdout.stream },
      ),
    ).resolves.toBe(0);
    expect(validate).toHaveBeenCalledWith('/private/config.json');
    expect(verifyRelease).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    expect(stdout.value()).toBe(
      'VALID website-checkout-live config=accepted\n',
    );
  });

  it.each(['--check-config', '--config'])(
    'refuses a bad release before %s validation, database, or listener',
    async (mode) => {
      const stderr = sink();
      const start = vi.fn();
      const validate = vi.fn();
      await expect(
        runWebsiteCheckoutLiveEntrypoint([mode, '/private/config.json'], {
          start,
          validate,
          verifyRelease: vi.fn(() => {
            throw new Error('wrong commit or mutated artifact');
          }),
          stderr: stderr.stream,
        }),
      ).resolves.toBe(1);
      expect(validate).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
      expect(stderr.value()).toBe(
        'ERROR website-checkout-live code=release_integrity_failed\n',
      );
    },
  );

  it('starts once, reports only the loopback endpoint and installs no test handlers', async () => {
    const stdout = sink();
    const stop = vi.fn();
    const start = vi.fn().mockResolvedValue({
      host: '127.0.0.1',
      port: 23456,
      stop,
    });
    await expect(
      runWebsiteCheckoutLiveEntrypoint(
        ['--config', '/private/website-checkout-live.json'],
        {
          start,
          verifyRelease: vi.fn(),
          stdout: stdout.stream,
          installSignalHandlers: false,
        },
      ),
    ).resolves.toBe(0);
    expect(start).toHaveBeenCalledWith('/private/website-checkout-live.json');
    expect(stdout.value()).toBe(
      'READY website-checkout-live host=127.0.0.1 port=23456\n',
    );
    expect(stop).not.toHaveBeenCalled();
  });

  it('keeps startup errors content-free', async () => {
    const stderr = sink();
    await expect(
      runWebsiteCheckoutLiveEntrypoint(['--config', '/private/config.json'], {
        start: vi.fn().mockRejectedValue(new Error('secret provider body')),
        verifyRelease: vi.fn(),
        stderr: stderr.stream,
        installSignalHandlers: false,
      }),
    ).resolves.toBe(1);
    expect(stderr.value()).toBe(
      'ERROR website-checkout-live code=startup_failed\n',
    );
    expect(stderr.value()).not.toContain('secret provider body');
  });

  it('parses only exact help or one absolute config pair', () => {
    expect(parseWebsiteCheckoutLiveArguments(['-h'])).toEqual({
      kind: 'help',
    });
    expect(
      parseWebsiteCheckoutLiveArguments(['--config', '/private/config.json']),
    ).toEqual({ kind: 'start', configPath: '/private/config.json' });
    expect(
      parseWebsiteCheckoutLiveArguments([
        '--check-config',
        '/private/config.json',
      ]),
    ).toEqual({ kind: 'check', configPath: '/private/config.json' });
    expect(() => parseWebsiteCheckoutLiveArguments([])).toThrow(
      WEBSITE_CHECKOUT_LIVE_USAGE,
    );
  });
});
