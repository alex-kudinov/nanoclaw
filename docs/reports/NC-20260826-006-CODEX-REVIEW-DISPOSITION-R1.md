# NC-20260826-006 — Codex disposition of Claude review R1

Claude session: `1a39f986-0c5a-48d3-8500-457c160c1a6f`

Model/mode: Claude Sonnet/high, bounded read-only review with one response write.

## Finding disposition

Claude reported one High finding: raw Party-ID joins could drop role and Stripe
evidence after a Party merge.

Disposition: **not reproduced; underlying merge premise is false for these two
source tables**.

Independent source verification found:

- `data/business/migrations/nanoclaw-v2/11_helpers.sql` moves every
  `party_roles.party_id` from loser to winner before tombstoning the loser;
- migration 137's `fn_relationship_context_party_merged` trigger moves every
  `party_context_observations.current_party_id` from loser to the canonical
  winner on the tombstone update;
- the same trigger moves or conflict-refuses current projections. Historical
  `original_party_id` remains unchanged by design.

The review response had explicitly not read migration 137 and inferred behavior
from external-reference resolution. External refs and role/observation child
rows do not share the inferred physical-merge behavior.

## Added regression proof

The disposable PostgreSQL integration now creates a merge loser with:

- one active recorded client-role row;
- one exact succeeded Stripe PaymentIntent observation;

It merges that Party into a clean winner through
`business_v2.fn_merge_parties`, runs the client projection, and proves:

- the canonical winner is `paid_customer`;
- the winner retains `recorded_client_role=true` and paid history;
- the merged loser receives no active projection;
- full coverage and exact replay still pass.

The full disposable Relationship Context suite remains 5/5 passing, including
the 1,400+ Party scale/replay case. No implementation change was required for
the reviewed finding. The new regression narrows future ambiguity.

## Review usage

- unique model calls: 9;
- cache creation tokens: 116,135;
- cache read tokens: 550,498;
- output tokens: 29,603;
- maximum observed context: 116,137.

The maximum exceeded the bounded-review 100k target despite the file-scoped
packet. This is recorded as orchestration debt, not additional confidence.
There are no unresolved material review findings.
