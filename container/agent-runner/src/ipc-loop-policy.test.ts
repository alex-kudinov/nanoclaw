import fs from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  drainBeforeClose,
  prepareScheduledTaskPrompt,
  SCHEDULED_TASK_PREFIX,
  shouldExitAfterTurn,
} from './ipc-loop-policy.js';

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

describe('scheduled-task loop policy', () => {
  it('prefixes the task once across credential retries', () => {
    const first = prepareScheduledTaskPrompt('do work', true);
    expect(first).toBe(`${SCHEDULED_TASK_PREFIX}\n\ndo work`);
    expect(prepareScheduledTaskPrompt(first, true)).toBe(first);
    expect(prepareScheduledTaskPrompt('human message', false)).toBe(
      'human message',
    );
  });

  it('exits after one emitted scheduled result but keeps conversations warm', () => {
    expect(shouldExitAfterTurn(true)).toBe(true);
    expect(shouldExitAfterTurn(false)).toBe(false);
    expect(shouldExitAfterTurn(undefined)).toBe(false);
  });

  it('wires the one-shot decision into the real runner loop and preserves it across retries', () => {
    const source = fs.readFileSync(
      new URL('./index.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain(
      'if (shouldExitAfterTurn(containerInput.isScheduledTask))',
    );
    expect(source).not.toContain('containerInput.isScheduledTask = false');
  });
});
