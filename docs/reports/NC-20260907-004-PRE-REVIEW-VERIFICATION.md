# NC-20260907-004 pre-review verification

Verified at: 2026-09-07T19:42:42.880Z

- Deterministic draft generator: passed under Node 22.23.2.
- Entitlement catalog validator: passed with 42 components, 7 bundles, 8 offers, 6 conflicts, 5 provisional components, and 20 legacy open questions.
- Disposition validator: passed with 56 source/disposition records, 47 checkout records, 37 active entries, 9 source-only counterparts, 8 accepted catalog offer keys, 0 canonical order records, and 2 candidate MCS variant links.
- Every active checkout entry has exactly one treatment and disposition.
- Publication scope: every record states observed local state and unverified deployment identity; the audit confers no grandfathering, allowlist, or enforced block. Proposed holds are explicitly not applied.
- Price declarations: all 42 nonempty checkout direct/installment price references are preserved separately. Eight offer-level catalog price declarations remain unscoped. No label-matched product receives a verified price association. Exactly three product/account-to-default-price relationships are native-verified; MCS primary remains null while MCS alt is exact.
- Stripe account scoping: all 34 retained product relationships carry namespace, account, and product identity; MCS primary and alt references remain distinct.
- Publishing discovery: bounded site-wide source scan found static references for 33/37 active checkout slugs. Four evaluation-training slugs were not found. French source/native course evidence is retained as source-only with no sellable-offer inference.
- Legacy questions: all 20 are audit-qualified with newly resolved native facts separated from remaining quantity, attachment, eligibility, procedure, completion, or source-authority evidence.
- Existing strict identity gate: expected exit 2, with 1 active canonical route and 36 active gaps.
- JSON and privacy checks: all task JSON parsed; zero email-address patterns or forbidden secret/person fields found.
- B2 provider receipt: all seven supplied SHA-256 values reproduced before integration.
- Prettier and `git diff --check`: passed.
- `npm run docs:continuity-check`: passed after installing ignored pinned-runtime dependencies in the isolated worktree.
- Primary program: validates at revision 253 with the existing NC-004 work item active.

Artifact SHA-256:

- disposition draft: `b59a80e4c7fb36cbd0748fa51d3c1081901849e7c81d171c0412fe535c7249c9`
- unapplied proposal: `d3d49d1180c3f1682a8344de9b5e5cb409cb8fb161bd997ae0fd5e6cea143922`
- owner decision brief: `305fa0eab6f77a53e2cd83873696dbe8921509935b79c4787532be94bdf7ea70`
- proposed program delta: `e79d22df9bac03d6aca59d8485392b7c469ef496e76c70812e7a071d3027f959`
- aggregate evidence report: `59e42dc7db43517520a5ccb45d9329464a4a7c722ded1a476193141119f91d92`
- deterministic generator: `adc2c5d140e24c4c424567f7c8b11201e8d39867b60f400975e7094c7968188f`
- publishing supplement: `aef89be1b7b4cbbb74476f6d607b8c5eafbada96fe2d1fccb383dd2e705f5f66`
