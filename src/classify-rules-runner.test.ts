/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./business-db.js', () => ({
  query: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { query } from './business-db.js';
import {
  extractSenderEmail,
  matchRule,
  recordRuleHit,
  resetRulesCache,
} from './classify-rules-runner.js';

const mockQuery = query as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockQuery.mockReset();
  resetRulesCache();
});

describe('extractSenderEmail', () => {
  it('extracts email from "Name <email>" format', () => {
    expect(extractSenderEmail('John Smith <john@example.com>')).toBe(
      'john@example.com',
    );
  });
  it('lowercases the result', () => {
    expect(extractSenderEmail('User <User@Example.COM>')).toBe(
      'user@example.com',
    );
  });
  it('handles bare email without angle brackets', () => {
    expect(extractSenderEmail('bare@example.com')).toBe('bare@example.com');
  });
  it('returns null on null input', () => {
    expect(extractSenderEmail(null)).toBeNull();
  });
  it('returns null on empty string', () => {
    expect(extractSenderEmail('')).toBeNull();
  });
});

describe('matchRule', () => {
  it('returns null when no rules exist', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const match = await matchRule({
      sender_email: 'anyone@example.com',
      subject: 'hi',
    });
    expect(match).toBeNull();
  });

  it('matches sender_exact case-insensitively', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 1,
          pattern_type: 'sender_exact',
          pattern_value: 'RECEIPTS@stripe.com',
          target_label: 'MrGru/financial/receipt',
          source: 'seed',
        },
      ],
    });
    const match = await matchRule({
      sender_email: 'Receipts@Stripe.com',
      subject: 'Your receipt',
    });
    expect(match).not.toBeNull();
    expect(match?.target_label).toBe('MrGru/financial/receipt');
    expect(match?.rule_id).toBe(1);
  });

  it('extracts email from "Name <email>" before matching', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 1,
          pattern_type: 'sender_exact',
          pattern_value: 'alerts@github.com',
          target_label: 'MrGru/notification/system',
          source: 'seed',
        },
      ],
    });
    const match = await matchRule({
      sender_email: 'GitHub <alerts@github.com>',
      subject: 'workflow failed',
    });
    expect(match?.target_label).toBe('MrGru/notification/system');
  });

  it('matches sender_regex', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 2,
          pattern_type: 'sender_regex',
          pattern_value: '@stripe\\.com$',
          target_label: 'MrGru/financial/receipt',
          source: 'lesson',
        },
      ],
    });
    const match = await matchRule({
      sender_email: 'billing@stripe.com',
      subject: 'invoice',
    });
    expect(match?.rule_id).toBe(2);
  });

  it('matches subject_regex', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 3,
          pattern_type: 'subject_regex',
          pattern_value: '^Invitation: ',
          target_label: 'MrGru/notification/calendar',
          source: 'manual',
        },
      ],
    });
    const match = await matchRule({
      sender_email: 'cal@example.com',
      subject: 'Invitation: Team sync @ 3pm',
    });
    expect(match?.rule_id).toBe(3);
  });

  it('returns null when no rule matches', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 4,
          pattern_type: 'sender_exact',
          pattern_value: 'other@example.com',
          target_label: 'MrGru/other',
          source: 'seed',
        },
      ],
    });
    const match = await matchRule({
      sender_email: 'someone@example.com',
      subject: 'hi',
    });
    expect(match).toBeNull();
  });

  it('skips bad regex rules and continues', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 2,
      rows: [
        {
          id: 5,
          pattern_type: 'sender_regex',
          pattern_value: '[unclosed',
          target_label: 'MrGru/other',
          source: 'lesson',
        },
        {
          id: 6,
          pattern_type: 'sender_exact',
          pattern_value: 'good@example.com',
          target_label: 'MrGru/lead/inquiry',
          source: 'seed',
        },
      ],
    });
    const match = await matchRule({
      sender_email: 'good@example.com',
      subject: 'hi',
    });
    expect(match?.rule_id).toBe(6);
  });

  it('caches rules across calls within TTL', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 7,
          pattern_type: 'sender_exact',
          pattern_value: 'x@y.com',
          target_label: 'MrGru/other',
          source: 'seed',
        },
      ],
    });
    await matchRule({ sender_email: 'x@y.com', subject: '' });
    await matchRule({ sender_email: 'x@y.com', subject: '' });
    await matchRule({ sender_email: 'x@y.com', subject: '' });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('re-queries after resetRulesCache()', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
    await matchRule({ sender_email: 'a@b.com', subject: '' });
    resetRulesCache();
    await matchRule({ sender_email: 'a@b.com', subject: '' });
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('matches header_match on Return-Path-style value substring', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 8,
          pattern_type: 'header_match',
          pattern_value: 'List-Unsubscribe: mailto:',
          target_label: 'MrGru/newsletter/general',
          source: 'seed',
        },
      ],
    });
    const match = await matchRule({
      sender_email: 'news@outlet.com',
      subject: 'weekly',
      headers: { 'list-unsubscribe': '<mailto:unsub@outlet.com>' },
    });
    expect(match?.rule_id).toBe(8);
  });

  it('sender_exact rules evaluate before sender_regex (ordered by SQL)', async () => {
    // SQL orders sender_exact (1) before sender_regex (3) — the runner
    // trusts SQL ordering. Assertion: when both match, the sender_exact
    // returns first.
    mockQuery.mockResolvedValueOnce({
      rowCount: 2,
      rows: [
        {
          id: 10,
          pattern_type: 'sender_exact',
          pattern_value: 'exact@x.com',
          target_label: 'MrGru/lead/inquiry',
          source: 'seed',
        },
        {
          id: 11,
          pattern_type: 'sender_regex',
          pattern_value: '@x\\.com$',
          target_label: 'MrGru/other',
          source: 'seed',
        },
      ],
    });
    const match = await matchRule({
      sender_email: 'exact@x.com',
      subject: '',
    });
    expect(match?.rule_id).toBe(10);
  });
});

describe('recordRuleHit', () => {
  it('UPDATEs hit_count and last_hit_at', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await recordRuleHit(42);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE classification_rules/);
    expect(sql).toMatch(/hit_count = hit_count \+ 1/);
    expect(params).toEqual([42]);
  });

  it('swallows query errors (non-critical telemetry)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    await expect(recordRuleHit(1)).resolves.not.toThrow();
  });
});
