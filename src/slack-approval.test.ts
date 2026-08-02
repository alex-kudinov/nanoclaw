import { describe, it, expect } from 'vitest';

import {
  isCheckReaction,
  isThumbsDownReaction,
  isApprovalOnlyText,
  isExplicitApprovalText,
  buildApprovalContent,
  resolveApprovalThreadTs,
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

  it('recognizes only an unambiguous whole-message typed approval', () => {
    expect(isExplicitApprovalText('Approved')).toBe(true);
    expect(isExplicitApprovalText(' approved! ')).toBe(true);
    expect(isExplicitApprovalText('✅')).toBe(true);
    expect(isExplicitApprovalText('Approved with these edits')).toBe(false);
    expect(isExplicitApprovalText('Please send it')).toBe(false);
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

describe('resolveApprovalThreadTs', () => {
  const jid = 'slack:C0AKPNJ7MDW';
  const reactedTs = '1782870547.453979';

  it('routes to root when the reacted message is a root message', () => {
    // The regression: a certificate request + the bot email-ask both live in the
    // root session; the reaction must resume root, not fork a new `group||<ts>`.
    const reacted = { chat_jid: jid, thread_ts: undefined };
    expect(resolveApprovalThreadTs(reacted, jid, reactedTs)).toBeUndefined();
  });

  it('routes to the parent thread when the reacted message is a reply', () => {
    const reacted = { chat_jid: jid, thread_ts: '1700000000.000001' };
    expect(resolveApprovalThreadTs(reacted, jid, reactedTs)).toBe(
      '1700000000.000001',
    );
  });

  it('never keys on the reacted message own ts when the row is known', () => {
    const reacted = { chat_jid: jid, thread_ts: undefined };
    expect(resolveApprovalThreadTs(reacted, jid, reactedTs)).not.toBe(
      reactedTs,
    );
  });

  it('falls back to the reacted ts when the message is not in our store', () => {
    expect(resolveApprovalThreadTs(undefined, jid, reactedTs)).toBe(reactedTs);
  });

  it('falls back to the reacted ts when the stored row is from another chat', () => {
    const reacted = { chat_jid: 'slack:OTHER', thread_ts: undefined };
    expect(resolveApprovalThreadTs(reacted, jid, reactedTs)).toBe(reactedTs);
  });
});
