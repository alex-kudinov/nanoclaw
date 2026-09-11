# English MCS Heartbeat TEST access delivery

Status: explicit owner-approved QA target, source default-off. This is not a
general Heartbeat consumer, production activation, certificate action, progress
claim or learner-login proof.

The existing `/internal/payments/enrollment-admissions` recovery route is the
only trigger. Delivery is attempted only after authenticated Adyen TEST card
evidence has made the canonical enrollment materialized and accepted/duplicate.
Held payment, missing TEST capture evidence, wrong participant identity and any
non-canonical enrollment perform no provider call.

The hard allowlist is:

- email `test@tandemcoach.co`;
- existing Heartbeat user `97f4285a-18d4-44a9-961d-17e582aa278f`;
- group `4c54983c-0e7b-4dd0-aebc-0f0cb1c82298`;
- course `abd312e4-b01a-4718-8918-f79d081753c0`;
- cohort `f2a36eca-a017-4536-9b83-368f51219895`;
- workspace `main` and `shouldRemoveFromSiblingGroups=false`.

The coordinator re-reads the canonical enrollment and active participant Party's
primary email from PostgreSQL; browser/contact payload email is never used for the
provider call. The driver then uses only the registered toolbox from the bizmgr
workspace: `heartbeat/get-user`, `heartbeat/add-to-group`, and `heartbeat/get-user`
readback. It never calls the SaaS API directly, creates/deletes/renames a user or
group, removes siblings, sends a message, or touches a certificate.

Migration148's existing projection outbox, lease, idempotency identity, accepted/
readback receipts and uncertain-acceptance hold are reused with an enrollment
subject. Migration148 is included for new fixture databases; an existing guarded
fixture upgrades only when all six projection-foundation columns are absent and
refuses partial lineage. No new migration is introduced.

An acknowledgement lost after membership apply is held, not blindly retried.
Exact admission replay reclaims only that held item, re-reads the exact native
user/group first and records verified without a duplicate membership call when the
effect exists. The exact existing membership is likewise a no-op provider apply.

Signed enrollment readback keeps the existing object shape and widens only
`accessDelivery`:

- `not_requested`: canonical/payment gate has not made delivery eligible, or the
  TEST-only driver remains disabled;
- `queued`: exact durable projection exists and remains retryable;
- `held`: provider acceptance/readback is uncertain and needs exact replay;
- `membership_verified`: exact native user/group membership was read back.

Bounded access reason codes are `heartbeat_membership_delivery_queued`,
`heartbeat_membership_acceptance_uncertain`,
`heartbeat_membership_readback_unavailable`,
`heartbeat_membership_readback_mismatch`,
`heartbeat_membership_delivery_held`, and `heartbeat_membership_verified`.

`membership_verified` proves only group membership. The separate group-to-course
attachment and actual learner login/UI access remain unproved and must be described
that way. Refund/reversal/capture-failure lifecycle and membership removal are not
part of this one happy-path authorization and remain later readiness work.
