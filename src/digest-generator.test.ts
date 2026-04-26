/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./business-db.js', () => ({
  query: vi.fn(),
}));

vi.mock('./claude-bridge.js', () => ({
  bridgePrint: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { query } from './business-db.js';
import { bridgePrint } from './claude-bridge.js';
import { generateDigest } from './digest-generator.js';

const mockQuery = query as unknown as ReturnType<typeof vi.fn>;
const mockBridge = bridgePrint as unknown as ReturnType<typeof vi.fn>;

function row(overrides: Partial<Record<string, any>> = {}) {
  return {
    gmail_message_id: 'm-' + Math.random().toString(36).slice(2, 6),
    gmail_thread_id: 'thr-abc',
    label: 'MrGru/financial/receipt',
    subject: 'Stripe payment',
    sender_email: 'receipts@stripe.com',
    classified_at: '2026-04-09T08:00:00Z',
    digest_priority: 1,
    category: 'financial',
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockBridge.mockReset();
  mockBridge.mockResolvedValue('PROSE SUMMARY\n\n## financial\n- item');
});

describe('generateDigest', () => {
  it('returns empty result when the query yields zero rows', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const res = await generateDigest({
      recipientName: 'cherie',
      sinceISO: '2026-04-08T00:00:00Z',
    });
    expect(res.itemCount).toBe(0);
    expect(res.markdown).toBe('');
    expect(res.html).toBe('');
    expect(mockBridge).not.toHaveBeenCalled();
  });

  it('passes recipient and sinceISO params into the SQL query', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await generateDigest({
      recipientName: 'alex',
      sinceISO: '2026-04-08T00:00:00Z',
    });
    const [, params] = mockQuery.mock.calls[0];
    expect(params[1]).toBe('alex');
  });

  it('clamps sinceISO to a 7-day window when older', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const veryOld = '2020-01-01T00:00:00Z';
    await generateDigest({ recipientName: 'alex', sinceISO: veryOld });
    const [, params] = mockQuery.mock.calls[0];
    const sinceUsed = new Date(params[0]).getTime();
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(now - sinceUsed).toBeLessThan(sevenDays + 5_000);
    expect(now - sinceUsed).toBeGreaterThan(sevenDays - 5_000);
  });

  it('renders HTML and markdown as plain entries without deep links', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        row({ subject: 'Invoice #42', sender_email: 'vendor@example.com' }),
      ],
    });
    const res = await generateDigest({
      recipientName: 'cherie',
      sinceISO: '2026-04-08T00:00:00Z',
    });
    expect(res.itemCount).toBe(1);
    expect(res.html).toContain('<li>Invoice #42 — vendor@example.com</li>');
    // Regression guard: no anchor tags in the HTML output — deep-linking was
    // dropped for V1 because Gmail API hex thread IDs don't navigate in the
    // web SPA and forwarded copies have different Message-IDs from the source.
    expect(res.html).not.toMatch(/<a\s+href=/i);
    expect(res.html).not.toContain('mail.google.com');
  });

  it('groups items by category in the HTML output', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        row({ category: 'financial', gmail_thread_id: 'thr-1' }),
        row({ category: 'lead', gmail_thread_id: 'thr-2' }),
        row({ category: 'financial', gmail_thread_id: 'thr-3' }),
      ],
    });
    const res = await generateDigest({
      recipientName: 'cherie',
      sinceISO: '2026-04-08T00:00:00Z',
    });
    expect(res.itemCount).toBe(3);
    expect(res.html).toContain('<h2>financial</h2>');
    expect(res.html).toContain('<h2>lead</h2>');
  });

  it('escapes HTML-sensitive characters in subjects and senders', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        row({
          subject: '<script>alert(1)</script>',
          sender_email: 'a&b@example.com',
          gmail_thread_id: 'thr-xss',
        }),
      ],
    });
    const res = await generateDigest({
      recipientName: 'alex',
      sinceISO: '2026-04-08T00:00:00Z',
    });
    expect(res.html).toContain('&lt;script&gt;');
    expect(res.html).not.toContain('<script>alert');
    expect(res.html).toContain('a&amp;b@example.com');
  });

  it('invokes bridgePrint with the haiku model', async () => {
    mockQuery.mockResolvedValue({ rows: [row()] });
    await generateDigest({
      recipientName: 'alex',
      sinceISO: '2026-04-08T00:00:00Z',
    });
    expect(mockBridge).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'haiku' }),
    );
  });

  it('falls back to raw markdown when bridgePrint throws', async () => {
    mockQuery.mockResolvedValue({
      rows: [row({ subject: 'Receipt A', gmail_thread_id: 'thr-a' })],
    });
    mockBridge.mockRejectedValue(new Error('bridge timeout'));
    const res = await generateDigest({
      recipientName: 'cherie',
      sinceISO: '2026-04-08T00:00:00Z',
    });
    // With bridge failure, markdown is the raw base list (still contains the item)
    expect(res.markdown).toContain('Receipt A');
    expect(res.itemCount).toBe(1);
  });
});
