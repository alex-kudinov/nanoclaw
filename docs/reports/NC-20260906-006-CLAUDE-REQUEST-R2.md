# Re-review load-bearing corrections only

Fresh Sonnet/high follow-up to completed review R1B. Read only:

- `docs/reports/NC-20260906-006-CLAUDE-RESPONSE-R1B.md`
- `docs/reports/NC-20260906-006-CORRECTIONS-R2.diff`
- `src/bookkeeper-enrollment-contract.ts`

Write `docs/reports/NC-20260906-006-CLAUDE-RESPONSE-R2.md` with remaining
material findings or `NO MATERIAL FINDINGS`, then stop. No other reads,
no Bash, web, MCP, runtime, secrets, credentials, or real records. Read each
file once. No source edits. Limit to eight tool calls.

R1B findings independently confirmed and corrected:
1. Capacity commitments now map sourceChannel to the existing enum categories:
   website_stripe_sale/invoice/check/sponsor/manual_sale. Grants retain manual
   category because there is no grant enum; exact grant origin is retained in
   the canonical order and source reference. Each payment-channel test now
   asserts the expected category.
2. A second funded receipt for the same Party and active/pending class assignment
   opens `participant_already_enrolled` for owner_admin before materialization;
   funded commitments remain counted for explicit resolution, with no second
   assignment or projection. Nonscheduled repeated active/pending/held offer is
   likewise held; completed episodes can enroll later. This is conservative
   ambiguity handling, not cancellation/refund or guessed reconciliation.

Codex's additional independently checked corrections:
3. Exact replay now compares immutable bookkeeper_admission evidence instead of
   the order's evidenceSha256, which later correctOrderTerms commands can change.
   A regression performs such a later correction and checks exact replay no-op.
4. An UNATTESTED changed receipt cannot hold a preexisting order's queued
   projection: it is rejected before conflict mutations. Trusted host context
   must match the exact conflicting receipt. A regression asserts unchanged
   input state and still-queued original projection.
5. Expired blocks and checkout-session aliases fail closed; tests added.

Accepted predecessor mechanics (do not re-review engines): commands are pure
and clone state; materializeEnrollment checks payer/funding/order/seat holds,
increments order/seat versions; commitClassAssignment checks exact reservation,
pool, enrollment, component and assignment binding, consumes the commitment and
returns BOTH aggregates. openEnrollmentException records a canonical-subject
exception but does not change unrelated entities. correctOrderTerms can change
the mutable order evidence hash. attachEnrollmentEvidence is append-only by key.

Accepted scope remains a synthetic, unwired host composition. The authority
parameter is trusted host context, never AI or HTTP fields; an integrity hash is
not provider authentication. Future provider admission, transactional persistence,
legacy live-path replacement, replay, provider/Sheet writes, deployment,
payment/refund and communication remain excluded. No need to reopen them.

Verification: focused 130/130 including 43 new contract cases; typecheck pass.
The full root previously had only two reproduced predecessor failures; a final
full run will follow. Review the corrections and their interaction, not the
whole repository or speculative future adapter work.
