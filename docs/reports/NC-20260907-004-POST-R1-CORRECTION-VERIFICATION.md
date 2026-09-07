# NC-20260907-004 post-R1 correction verification

Verified at: 2026-09-07T19:58:43.758Z

Claude R1 session `e6121f53-b67d-4522-a51d-03cd85fc6553` reported one P1 packet gap and one P2 review-boundary gap. Both were independently reproduced.

P1 correction:

- All 56 records now carry explicit payer, purchaser, sponsor, participant, and student role separation.
- Neither payer nor participant identity was collected.
- Every relationship is `not_evidenced_and_never_assumed_same`.
- The proposal invariant and validation contract repeat the separation. No per-record identity inference was added.

P2 correction:

- The R2 projection now lists all nine initially selected page families from the source-authority snapshot.
- It also retains the bounded site-wide result: 33/37 active checkout slugs found, four evaluation-training slugs not found.
- The stale page index and French source-only/no-sellable-inference boundary remain explicit.

Regression checks:

- 56 source/disposition records; 37 active checkout records; 8 accepted catalog offer keys; 0 canonical orders.
- 42 checkout price declarations and 8 unscoped offer price declarations preserved.
- Exactly 3 native product/account-to-default-price relationships verified; no Cartesian association.
- 20 legacy questions remain audit-qualified.
- Deterministic generator, focused validator, JSON/privacy checks, Prettier, `git diff --check`, catalog validation, and documentation continuity pass.

R1 measured usage: 4 unique Sonnet model calls, 88,112 cache-creation tokens, 139,796 cache-read tokens, 22,567 output tokens including 19,792 thinking tokens, maximum context 88,114, no warnings.
