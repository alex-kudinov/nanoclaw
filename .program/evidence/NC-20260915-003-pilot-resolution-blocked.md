# NC-20260915-003 pilot resolution blocked

Date: 2026-09-15

Mode: read-only Company OS reconstruction; zero writes

## Owner-selected account

The owner-selected pilot account is represented in governance only by normalized
email SHA-256 `929e062a5f6c3a1708d539ddebfaf7b05d4fbceb009de8b8362b748bb3a5cf81`.
The raw address is not copied into this artifact.

## Current Company OS result

The exact email lookup returned three active Person records:

- Party `10069`: Trafft-origin, created 2026-04-27, with 13 active exact
  references across Plutio, Trafft, Stripe and Tandem web.
- Party `11646`: WordPress-origin checkout-confirmed prospect, created
  2026-09-12, with no returned exact external reference.
- Party `11647`: WordPress-origin checkout-confirmed prospect, created
  2026-09-12, with no returned exact external reference.

All three are unmerged. The email is primary on all three and unverified on all
three. No matching versioned `verified_email_candidate` or other identity claim
exists. No open identity exception references these Parties. No accepted Google
auth account exists for any of them.

No `shared.coaching-tools-plus` component entitlement exists for any of the
three Parties. Company OS currently contains 11 such component entitlements for
11 other Parties, all in source state `included`; a future gateway must map
that canonical component state into the public `coaching_tools.plus / active`
projection contract rather than inventing a grant.

## Decision boundary

Party `10069` is the strongest canonical survivor candidate because it is the
only long-lived record with exact provider-scoped references. Email, name and
checkout timing are not sufficient authority to select or merge it silently.

Completion requires explicit owner decisions to:

1. designate Party `10069` as the canonical Party for this pilot account
   without silently merging the two checkout duplicates; and
2. either authorize a legitimate Coaching Tools Plus entitlement for that Party
   or select an already-entitled individual pilot.

A real gateway/network path remains separately gated. No Firebase user,
verification, auth binding, Party merge, entitlement, provider record, gateway,
network or deployment state changed.
