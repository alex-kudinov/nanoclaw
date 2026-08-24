import fs from 'fs';
import { describe, expect, it } from 'vitest';

const report = fs.readFileSync(
  new URL('./checkout-recovery-report-cli.ts', import.meta.url),
  'utf8',
);
const index = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const control = fs.readFileSync(
  new URL('../docs/CHECKOUT-RECOVERY-CONTROL.md', import.meta.url),
  'utf8',
);

describe('checkout recovery truthful timing/report contract', () => {
  it('separates Tandem capture timeout, failure fast path, and Heartbeat event-only coverage', () => {
    expect(report).toContain(
      "captured_or_payment_created: '45_minutes_after_server_capture'",
    );
    expect(report).toContain(
      "payment_failed: '5_minutes_after_provider_failure'",
    );
    expect(report).toContain("heartbeat: 'stripe_events_only'");
    expect(index).toContain('tandemCaptureTimeoutMinutes: 45');
    expect(index).toContain('tandemPaymentFailureDelayMinutes: 5');
    expect(control).toContain('five-minute fast path');
  });

  it('reports aggregates only and states no customer sends', () => {
    expect(report).toContain('customer_sends: false');
    expect(report).not.toContain('contact_email');
    expect(report).not.toContain('source_case_key');
    expect(report).not.toContain('alias_id');
  });
});
