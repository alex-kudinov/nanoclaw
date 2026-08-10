import { describe, expect, it } from 'vitest';

import { selectNextIpcTurn } from './ipc-turn-policy.js';

const legacy = (text: string) => ({ text, isolated: false });
const grader = (text: string, runId: string) => ({
  text,
  runId,
  isolated: true,
});

describe('selectNextIpcTurn', () => {
  it('preserves legacy merge behaviour when no run id is present', () => {
    expect(
      selectNextIpcTurn([legacy('one'), legacy('two')], false).map(
        (item) => item.text,
      ),
    ).toEqual(['one', 'two']);
  });

  it('does not merge a run-id payload into an existing initial prompt', () => {
    expect(
      selectNextIpcTurn(
        [grader('grade B', 'run-b'), grader('grade C', 'run-c')],
        true,
      ),
    ).toEqual([]);
  });

  it('takes exactly one run-id payload and leaves the next turn deferred', () => {
    expect(
      selectNextIpcTurn(
        [grader('grade B', 'run-b'), grader('grade C', 'run-c')],
        false,
      ),
    ).toEqual([grader('grade B', 'run-b')]);
  });

  it('stops a legacy batch before the first isolated grader turn', () => {
    expect(
      selectNextIpcTurn(
        [legacy('one'), legacy('two'), grader('grade B', 'run-b')],
        false,
      ).map((item) => item.text),
    ).toEqual(['one', 'two']);
  });

  it('isolates a malformed run-id payload so it fails closed at the host', () => {
    const malformed = { text: 'grade B', isolated: true };
    expect(selectNextIpcTurn([malformed, legacy('later')], false)).toEqual([
      malformed,
    ]);
  });
});
