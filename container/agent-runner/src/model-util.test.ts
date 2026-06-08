import { describe, it, expect } from 'vitest';
import { resolveModel, formatUsageLine } from './model-util.js';

describe('resolveModel', () => {
  it('returns the explicit model when set', () => {
    expect(resolveModel('haiku')).toBe('haiku');
  });

  it('defaults to sonnet when undefined', () => {
    expect(resolveModel(undefined)).toBe('sonnet');
  });
});

describe('formatUsageLine', () => {
  it('emits a greppable event=agent.usage line with token fields', () => {
    const line = formatUsageLine(2, 'haiku', { input_tokens: 1500, output_tokens: 320 }, 3);
    expect(line).toBe(
      'event=agent.usage turn=2 model=haiku input_tokens=1500 output_tokens=320 num_turns=3',
    );
  });

  it('treats missing token fields as zero', () => {
    const line = formatUsageLine(1, 'sonnet', {}, 1);
    expect(line).toBe(
      'event=agent.usage turn=1 model=sonnet input_tokens=0 output_tokens=0 num_turns=1',
    );
  });
});
