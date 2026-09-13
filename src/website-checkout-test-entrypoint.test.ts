import { describe, expect, it, vi } from 'vitest';

import {
  parseWebsiteCheckoutTestArguments,
  runWebsiteCheckoutTestEntrypoint,
  WEBSITE_CHECKOUT_TEST_USAGE,
} from './website-checkout-test-entrypoint.js';

function sink() {
  let value = '';
  return {
    stream: { write: (chunk: string | Uint8Array) => ((value += chunk), true) },
    value: () => value,
  };
}

describe('website checkout TEST compiled entrypoint', () => {
  it('accepts only help or one absolute private config', () => {
    expect(parseWebsiteCheckoutTestArguments(['--help'])).toEqual({
      kind: 'help',
    });
    expect(
      parseWebsiteCheckoutTestArguments(['--config', '/private/test.json']),
    ).toEqual({ kind: 'start', configPath: '/private/test.json' });
    expect(() =>
      parseWebsiteCheckoutTestArguments(['--config', 'test.json']),
    ).toThrow(WEBSITE_CHECKOUT_TEST_USAGE);
  });

  it('verifies the immutable release before starting', async () => {
    const start = vi.fn();
    const stderr = sink();
    await expect(
      runWebsiteCheckoutTestEntrypoint(['--config', '/private/test.json'], {
        start,
        verifyRelease: vi.fn(() => {
          throw new Error('mutated release');
        }),
        stderr: stderr.stream,
      }),
    ).resolves.toBe(1);
    expect(start).not.toHaveBeenCalled();
    expect(stderr.value()).toBe(
      'ERROR website-checkout-test code=release_integrity_failed\n',
    );
  });

  it('starts once and exposes no database or private path', async () => {
    const stdout = sink();
    const stop = vi.fn();
    const start = vi.fn().mockResolvedValue({ port: 3443, stop });
    await expect(
      runWebsiteCheckoutTestEntrypoint(['--config', '/private/test.json'], {
        start,
        verifyRelease: vi.fn(),
        stdout: stdout.stream,
        installSignalHandlers: false,
      }),
    ).resolves.toBe(0);
    expect(start).toHaveBeenCalledWith({
      configPath: '/private/test.json',
    });
    expect(stdout.value()).toBe(
      'READY website-checkout-test host=127.0.0.1 port=3443\n',
    );
    expect(stdout.value()).not.toContain('/private/test.json');
  });

  it('keeps startup errors content-free', async () => {
    const stderr = sink();
    await expect(
      runWebsiteCheckoutTestEntrypoint(['--config', '/private/test.json'], {
        start: vi.fn().mockRejectedValue(new Error('secret provider body')),
        verifyRelease: vi.fn(),
        stderr: stderr.stream,
        installSignalHandlers: false,
      }),
    ).resolves.toBe(1);
    expect(stderr.value()).toBe(
      'ERROR website-checkout-test code=startup_failed\n',
    );
  });
});
