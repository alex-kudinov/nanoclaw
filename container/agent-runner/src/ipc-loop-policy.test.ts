import { describe, expect, it, vi } from 'vitest';

import { drainBeforeClose } from './ipc-loop-policy.js';

describe('IPC loop close ordering', () => {
  it('drains exact pending input without consuming a stale close request', () => {
    const close = vi.fn(() => true);
    expect(drainBeforeClose(() => 'rejection result', close)).toEqual({
      turn: 'rejection result',
      close: false,
    });
    expect(close).not.toHaveBeenCalled();
  });

  it('honors close only after the input queue is empty', () => {
    const close = vi.fn(() => true);
    expect(drainBeforeClose(() => undefined, close)).toEqual({ close: true });
    expect(close).toHaveBeenCalledOnce();
  });
});
