import { describe, it, expect } from 'vitest';

import {
  isGmailDeliveryStale,
  gmailDeliverySeed,
  GMAIL_DELIVERY_STALE_MS,
  GMAIL_DELIVERY_FP,
  GMAIL_DELIVERY_SOURCE,
} from './gmail-liveness.js';

const NOW = 1_783_458_000_000;

describe('isGmailDeliveryStale', () => {
  it('is fresh within the threshold', () => {
    expect(isGmailDeliveryStale(NOW - 5 * 60_000, NOW)).toBe(false);
    expect(isGmailDeliveryStale(NOW - 19 * 60_000, NOW)).toBe(false);
    expect(isGmailDeliveryStale(NOW, NOW)).toBe(false);
  });

  it('is stale past the threshold', () => {
    expect(isGmailDeliveryStale(NOW - 21 * 60_000, NOW)).toBe(true);
    expect(isGmailDeliveryStale(NOW - 60 * 60_000, NOW)).toBe(true);
  });

  it('treats exactly-at-threshold as fresh (strict >)', () => {
    expect(isGmailDeliveryStale(NOW - GMAIL_DELIVERY_STALE_MS, NOW)).toBe(
      false,
    );
    expect(isGmailDeliveryStale(NOW - GMAIL_DELIVERY_STALE_MS - 1, NOW)).toBe(
      true,
    );
  });

  it('never pages when the heartbeat is absent or non-numeric', () => {
    expect(isGmailDeliveryStale(null, NOW)).toBe(false);
    expect(isGmailDeliveryStale(NaN, NOW)).toBe(false);
    expect(isGmailDeliveryStale(Infinity, NOW)).toBe(false);
  });

  it('honors a custom threshold', () => {
    expect(isGmailDeliveryStale(NOW - 6 * 60_000, NOW, 5 * 60_000)).toBe(true);
    expect(isGmailDeliveryStale(NOW - 4 * 60_000, NOW, 5 * 60_000)).toBe(false);
  });
});

describe('gmailDeliverySeed', () => {
  it('builds a stable critical incident seed', () => {
    const seed = gmailDeliverySeed(NOW - 25 * 60_000, NOW);
    expect(seed.severity).toBe('critical');
    expect(seed.source).toBe(GMAIL_DELIVERY_SOURCE);
    expect(seed.fingerprint).toBe(GMAIL_DELIVERY_FP);
    expect(seed.raw_context.minutes_stale).toBe(25);
    expect(seed.raw_context.last_delivery).toBe(
      new Date(NOW - 25 * 60_000).toISOString(),
    );
  });

  it('fingerprints identically across occurrences (dedup-safe)', () => {
    const a = gmailDeliverySeed(NOW - 25 * 60_000, NOW);
    const b = gmailDeliverySeed(NOW - 40 * 60_000, NOW + 900_000);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('renders an absent heartbeat without throwing', () => {
    const seed = gmailDeliverySeed(null, NOW);
    expect(seed.raw_context.last_delivery).toBe('never');
    expect(seed.raw_context.minutes_stale).toBeNull();
  });
});
