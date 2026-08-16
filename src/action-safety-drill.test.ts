import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./env.js', () => ({ readEnvFile: vi.fn(() => ({})) }));

import { ACTION_SYSTEMS, assertExternalWriteAllowed } from './action-safety.js';

afterEach(() => {
  delete process.env.EXTERNAL_WRITE_SAFE_MODE;
});

describe('global external-write safe-mode drill', () => {
  it('preserves evidence reads while every named mutation remains untouched', () => {
    process.env.EXTERNAL_WRITE_SAFE_MODE = '1';
    const collectEvidence = vi.fn();
    const invokeMutation = vi.fn();

    for (const system of ACTION_SYSTEMS) {
      // Read-only evidence collection remains outside the write controller.
      collectEvidence(system);
      expect(() => {
        assertExternalWriteAllowed({
          system,
          actionClass:
            system === 'stripe' ? 'c4_financial' : 'c3_external_communication',
          source: `drill:${system}`,
        });
        invokeMutation(system);
      }).toThrow(expect.objectContaining({ code: 'global_safe_mode' }));
    }

    expect(collectEvidence).toHaveBeenCalledTimes(ACTION_SYSTEMS.length);
    expect(invokeMutation).not.toHaveBeenCalled();
  });
});
