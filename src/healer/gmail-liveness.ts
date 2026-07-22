/**
 * Gmail inbound-delivery liveness (self-healing source 5).
 *
 * The push relay (Gmail Pub/Sub → n8n on the VPS → Mini :8088) fails on the VPS
 * side, so a dropped push writes NO line to the Mini's daemon log — the log-tailing
 * collector is structurally blind to it. The 5-min label-poll (which pulls Gmail
 * DIRECTLY from the Mini) is the delivery backstop, so a transient relay wedge is
 * a non-incident: the poll still delivers. Delivery is only truly stalled when the
 * poll ALSO stops completing — i.e. its liveness heartbeat (`gmail_last_delivery_ms`
 * router_state key, written on every successful history walk) goes stale.
 *
 * This module is the pure classifier; the router_state read + incident upsert live
 * in collector.ts. Kept IO-free so staleness/fingerprint logic is unit-testable.
 */

import { fingerprint, type IncidentSeed } from './incident-store.js';

// 4 missed 5-min poll cycles. The poll cadence is rock-steady at 300s, so 20 min
// stale is unambiguously abnormal — never a false positive under normal operation.
export const GMAIL_DELIVERY_STALE_MS = 20 * 60_000;

export const GMAIL_DELIVERY_SOURCE = 'gmail-delivery';
export const GMAIL_DELIVERY_FP = fingerprint(
  GMAIL_DELIVERY_SOURCE,
  'inbound delivery stalled',
);

/**
 * True when inbound Gmail delivery is stalled. `lastMs === null` (heartbeat never
 * written — fresh deploy, before the first poll) returns false: absence can't
 * prove a stall, and a dead poll cron is caught by job-log monitoring instead.
 */
export function isGmailDeliveryStale(
  lastMs: number | null,
  now: number,
  thresholdMs: number = GMAIL_DELIVERY_STALE_MS,
): boolean {
  if (lastMs === null || !Number.isFinite(lastMs)) return false;
  return now - lastMs > thresholdMs;
}

/** Build the critical incident seed for a stalled inbound-delivery heartbeat. */
export function gmailDeliverySeed(
  lastMs: number | null,
  now: number,
  thresholdMs: number = GMAIL_DELIVERY_STALE_MS,
): IncidentSeed {
  const minutesStale =
    lastMs === null ? null : Math.round((now - lastMs) / 60_000);
  return {
    source: GMAIL_DELIVERY_SOURCE,
    severity: 'critical',
    fingerprint: GMAIL_DELIVERY_FP,
    raw_context: {
      last_delivery: lastMs === null ? 'never' : new Date(lastMs).toISOString(),
      minutes_stale: minutesStale,
      stale_threshold_ms: thresholdMs,
      note: 'Gmail label-poll heartbeat stale — inbound push relay AND direct poll both dry. Check n8n gmail-push workflow + Mini→Gmail API reachability + gmail-label-poll cron.',
    },
  };
}
