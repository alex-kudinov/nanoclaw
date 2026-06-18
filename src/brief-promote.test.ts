import { describe, it, expect } from 'vitest';

import { parseBriefItem } from './brief-promote.js';

describe('parseBriefItem', () => {
  it('parses a posted brief item with title, domain, and ISO due', () => {
    const text =
      '🔥 *Estimated Tax Payment — Q2 (1040-ES)*\npersonal · due 2026-06-15\n_due in 1d_';
    const item = parseBriefItem(text);
    expect(item).not.toBeNull();
    expect(item!.title).toBe('Estimated Tax Payment — Q2 (1040-ES)');
    expect(item!.domain).toBe('personal');
    expect(item!.due).toBe('2026-06-15');
  });

  it('parses an item with no due date', () => {
    const item = parseBriefItem(
      '🗓 *Render Phase 5 resource PDFs*\ndev\n_courses — in-progress_',
    );
    expect(item).not.toBeNull();
    expect(item!.domain).toBe('dev');
    expect(item!.due).toBeUndefined();
  });

  it('returns null for an ordinary bot message (no bold title)', () => {
    expect(parseBriefItem('Approved — sending the email now.')).toBeNull();
  });

  it('returns null when there is a title but no known domain', () => {
    expect(
      parseBriefItem('*Some random bolded note* with no domain word'),
    ).toBeNull();
  });

  it('ignores Slack markup and caps title length', () => {
    const long = 'x'.repeat(400);
    const item = parseBriefItem(`🔥 *${long}*\nsolera · due 2026-03-23`);
    expect(item!.title.length).toBe(280);
    expect(item!.domain).toBe('solera');
  });

  it('returns null on empty input', () => {
    expect(parseBriefItem('')).toBeNull();
  });
});
