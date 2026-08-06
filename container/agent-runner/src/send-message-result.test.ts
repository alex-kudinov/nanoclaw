import { describe, expect, it } from 'vitest';

import { queuedMessageResult } from './send-message-result.js';

describe('queuedMessageResult', () => {
  it.each([
    '[SALES REVIEW] Lead #1047',
    '[CLIENT SUPPORT REVIEW] Account access',
    '[SUPPORT-DRAFT] Account access',
    '[FOLLOW-UP #2] Lead #1047',
  ])('does not call an approval-card queue write a successful post: %s', (text) => {
    expect(queuedMessageResult(text)).toMatch(
      /submitted for host validation.*not confirmation.*Do not claim/i,
    );
  });

  it('preserves the ordinary message result', () => {
    expect(queuedMessageResult('Still working.')).toBe('Message sent.');
  });

  it('does not claim a cross-group approval card was sent to that target', () => {
    expect(queuedMessageResult('[SALES REVIEW] Lead #1', 'chief')).toMatch(
      /submitted for host validation.*not confirmation/i,
    );
  });

  it('preserves an ordinary explicit cross-group result', () => {
    expect(queuedMessageResult('Still working.', 'chief')).toBe(
      'Message sent to chief.',
    );
  });
});
