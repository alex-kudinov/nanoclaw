import { describe, it, expect } from 'vitest';

import {
  isCheckReaction,
  isThumbsDownReaction,
  isApprovalOnlyText,
  buildApprovalContent,
} from './slack-approval.js';

describe('isCheckReaction', () => {
  it('accepts the check-mark reactions', () => {
    expect(isCheckReaction('white_check_mark')).toBe(true);
    expect(isCheckReaction('heavy_check_mark')).toBe(true);
    expect(isCheckReaction('ballot_box_with_check')).toBe(true);
  });
  it('accepts thumbs up (+1 / thumbsup), including skin tones', () => {
    expect(isCheckReaction('+1')).toBe(true);
    expect(isCheckReaction('thumbsup')).toBe(true);
    expect(isCheckReaction('+1::skin-tone-3')).toBe(true);
  });
  it('rejects other reactions', () => {
    expect(isCheckReaction('x')).toBe(false);
    expect(isCheckReaction('eyes')).toBe(false);
    expect(isCheckReaction('thumbsdown')).toBe(false);
  });
});

describe('isThumbsDownReaction', () => {
  it('accepts 👎 (-1 / thumbsdown), including skin tones', () => {
    expect(isThumbsDownReaction('-1')).toBe(true);
    expect(isThumbsDownReaction('thumbsdown')).toBe(true);
    expect(isThumbsDownReaction('-1::skin-tone-2')).toBe(true);
  });
  it('rejects check-marks and unrelated reactions', () => {
    expect(isThumbsDownReaction('+1')).toBe(false);
    expect(isThumbsDownReaction('white_check_mark')).toBe(false);
    expect(isThumbsDownReaction('eyes')).toBe(false);
  });
});

describe('isApprovalOnlyText', () => {
  it('treats a bare check-mark (unicode or shortcode) as approval', () => {
    expect(isApprovalOnlyText('✅')).toBe(true);
    expect(isApprovalOnlyText('  ✔️ ')).toBe(true);
    expect(isApprovalOnlyText('☑️')).toBe(true);
    expect(isApprovalOnlyText(':white_check_mark:')).toBe(true);
    expect(isApprovalOnlyText('✅✅')).toBe(true);
    expect(isApprovalOnlyText('👍')).toBe(true);
    expect(isApprovalOnlyText(':+1:')).toBe(true);
  });
  it('does not treat check-mark + words as a bare approval', () => {
    expect(isApprovalOnlyText('✅ but change the date')).toBe(false);
    expect(isApprovalOnlyText('looks good')).toBe(false);
    expect(isApprovalOnlyText('')).toBe(false);
    expect(isApprovalOnlyText('   ')).toBe(false);
  });
});

describe('buildApprovalContent', () => {
  it('is explicit and unambiguous', () => {
    expect(buildApprovalContent({})).toContain('Approved');
  });
  it('names the reactor and quotes the approved message', () => {
    const out = buildApprovalContent({
      reactor: 'Alex',
      quoted: 'Send draft to Jane?',
    });
    expect(out).toContain('by Alex');
    expect(out).toContain('> Send draft to Jane?');
  });
  it('truncates a long quoted message', () => {
    const out = buildApprovalContent({ quoted: 'x'.repeat(400) });
    expect(out).toContain('…');
    expect(out.length).toBeLessThan(360);
  });
});
