#!/usr/bin/env node

import { withAgentContext } from './business-db.js';
import { checkoutRecoveryHealth } from './checkout-recovery-store.js';

interface AggregateRow {
  stripe_account: 'tandem' | 'heartbeat';
  state: string;
  consent_state: string;
  eligibility_state: string;
  cases: string;
  amount_cents: string;
  oldest_started_at: string | null;
  newest_observed_at: string | null;
}

async function main(): Promise<void> {
  const health = await checkoutRecoveryHealth();
  const rows = await withAgentContext(
    'checkout-recovery-report:host',
    async (client) =>
      (
        await client.query<AggregateRow>(
          `SELECT stripe_account, state, consent_state, eligibility_state,
                  count(*)::text AS cases,
                  COALESCE(sum(amount_cents), 0)::text AS amount_cents,
                  min(started_at)::text AS oldest_started_at,
                  max(last_observed_at)::text AS newest_observed_at
             FROM business_v2.checkout_recovery_cases
            GROUP BY stripe_account, state, consent_state, eligibility_state
            ORDER BY stripe_account, state, consent_state, eligibility_state`,
        )
      ).rows,
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        mode: 'shadow',
        customer_sends: false,
        timeout_coverage: {
          tandem: {
            captured_or_payment_created: '45_minutes_after_server_capture',
            payment_failed: '5_minutes_after_provider_failure',
          },
          heartbeat: 'stripe_events_only',
        },
        health,
        aggregates: rows.map((row) => ({
          stripe_account: row.stripe_account,
          state: row.state,
          consent_state: row.consent_state,
          eligibility_state: row.eligibility_state,
          cases: Number(row.cases),
          amount_cents: Number(row.amount_cents),
          oldest_started_at: row.oldest_started_at,
          newest_observed_at: row.newest_observed_at,
        })),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `checkout-recovery-report failed: ${
      err instanceof Error ? err.message : String(err)
    }\n`,
  );
  process.exitCode = 1;
});
