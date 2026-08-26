# NC-20260826-003 — Trafft exact identity evidence

Date: 2026-08-26

Program item: `work:relationship-context-trafft-exact-identity`

## Boundary

Exact refs are limited to provably Trafft-created Parties after adapter
registration and later appointments whose ledger Party agrees with the exact
customer ref. Legacy email-selected Parties remain held. The one-shot read
canary is content-minimized and host-only.

## Natural input

- exact live start: `416384fc`, directly containing rollout `460a51c7`;
- six new eligible appointments since rollout, three customers, one newly seen
  and two returning, zero multi-Party customer-ID collisions;
- live shadow healthy/complete at 420 observations/holds, zero projections,
  queries, grants, or Trafft refs;
- strict source-created rule identifies two safe customers/four appointments.

## Implementation and verification

- safe-candidate and appointment-agreement reconciliation is transaction-atomic;
- exact refs set deterministic receipts and verification time;
- exact observations project current; held/ambiguous rows remain null-Party;
- identity join uses exact customer refs before legacy email fallback;
- one-shot exact-ref canary records a delivered minimized query receipt;
- focused 45/45 plus canary/context tests, root typecheck, and disposable
  PostgreSQL 2/2 pass, including multi-customer creation-window refusal.
- root format, build, documentation continuity/capability checks pass;
- independent runner build and 45/45 tests pass;
- full root: 3,298 pass / 27 skip, with the sole unrelated CNPC wrapper
  assertion reproduced at exact base `416384fc`.

## Independent review

- Claude Sonnet/high R1 found two material defects: a same-family Party merge
  could make ref reconciliation abort, and a not-ready canary could leave its
  receipt pending;
- same-family refs now re-canonicalize to the winner while different-family
  conflicts refuse; failed canaries terminally mark a bounded failure code;
- R2 verdict: `NO MATERIAL FINDINGS`;
- usage audit: R1 six model calls / 101,879 maximum context tokens; R2 ten
  model calls / 96,705.

## Pending

Immutable commit/release, deployment, natural reconciliation, exact canary,
non-interference, and program closure.
