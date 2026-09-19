# NC-20260919-001 load-bearing review follow-up — response

## Verdict: not PASS — the producer evidence is internally inconsistent with "pre-existing"

The follow-up's own evidence, taken literally, cannot be simultaneously true and
leave ordinary finite manual-card installments working in production today.

Pre-diff, `finiteContractSchema` already required `selectionMethod` as a fixed
`z.literal('payment_option_and_submit')` and had **no** `initialPaymentMethod`
key at all, under `.strict()`. The cited manual-card path is described as
running unconditionally "for ordinary finite and custom schedules alike" and
always appends both `selectionMethod` and `initialPaymentMethod` to the signed
contract. If that PHP code were genuinely already live in production, every
ordinary finite manual-card activation — the default, everyday payment path,
not an edge case — would already have been rejected by the old schema on
`initialPaymentMethod` alone (an unrecognized key under `.strict()`), independent
of the Apple Pay `selectionMethod` mismatch. That contradicts finite billing's
status as an established, currently-working system (the same evidence the
follow-up itself relies on when it calls the shared `activation()` fixture
"pre-existing ordinary finite-billing tests").

Only one of these can be true:
- the manual-card path's `initialPaymentMethod`/`selectionMethod` lines are
  **not** actually live in the production PHP deployment today (they were
  written as part of the same custom-invoice rollout, in a file outside this
  diff, and "pre-existing" means only "not part of the reviewed NanoClaw diff,"
  not "already deployed and working"), or
- ordinary finite manual-card contracts are in fact already failing in
  production, which is a separate, unaddressed incident this follow-up does
  not raise.

The first is far more likely and is not itself a problem — but it changes the
compatibility question from a schema-logic question (already correct: the
required pair exactly mirrors both PHP paths' field values) to a **deployment-
ordering** question the follow-up doesn't address: this NanoClaw schema change
and the PHP producer change must ship as one coordinated, atomic release. If
the schema change reaches production before the PHP producer change does,
every ordinary finite manual-card and Apple Pay activation breaks until the
PHP side catches up — the exact incompatibility the original review flagged,
just relocated from "diff vs. schema" to "diff vs. deploy sequencing."

**Smallest safe correction:** keep the universal required pair as implemented
(no code change needed — the field values and pairing already match both PHP
paths), but do not treat this finding as closed on code evidence alone.
Confirm, before this ships, that the PHP producer change is either (a)
already live in production today — verified directly (e.g., a live manual-card
finite activation observed carrying `initialPaymentMethod` under the current
deployed schema), not asserted — or (b) sequenced to deploy atomically with
this NanoClaw change (single release train, feature-flag, or explicit
deploy-order gate in `docs/RELEASE-INTEGRITY.md`/`docs/ACTIVE-WORK.md`). Absent
that confirmation, the remaining incompatibility is: ordinary finite
manual-card and Apple Pay activations break for the window between this
schema deploying and the PHP producer deploying, if they are not the same
release.

No other question from the original review is reopened.
