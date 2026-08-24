# NC-20260824-003 MCS localization knowledge repair

## Failure and authority

Sales denied French Mentor Coaching Foundations availability because the
release-owned KB described only the English product. Current authority was
verified before implementation:

- course release commit `7f91ec2ec7769eb1563d66238cb1947f88527bf2` records
  Spanish 25/25 Published, Japanese 25/25 Published, and French 27/27
  Published;
- the French, Japanese, and Spanish public sales pages returned HTTP 200 on
  2026-08-24 and exposed their dedicated checkout product keys;
- the owner directed correction of the minion KB failure.

This proves localized asynchronous Foundations products. It does not prove a
localized live Standard Path cohort, translated ICF recognition, or a natural
French purchase.

## Implementation and review

- `facts/catalogs/mcs-foundations-locales.json` is byte-hash-bound to the
  revision-1 minion pack.
- The sync path injects/replaces the exact block in all 13 tracked KBs after
  generic propagation; the check path refuses any missing or stale block.
- The runtime detector checks catalog ID, revision, exact raw-byte hash, exact
  English/French/Japanese/Spanish set, and exact Sales KB block. Malformed JSON
  shapes return drift instead of throwing.
- Generic KB heuristics exclude correctly paired higher-authority canonical
  blocks, then still run the exact catalog checks.
- Claude Sonnet 5/high R1 `25d7fee1-4a9a-43da-8b0a-25d0f739b245`
  found one medium fail-closed crash plus two low coverage/hash issues. All
  were corrected. R2 `8336ab3a-8677-452e-ae59-bbbfdd33cb46` returned
  `NO MATERIAL FINDINGS`.

## Verification

- Python catalog/injection tests: 5/5.
- Focused TypeScript program-facts suites: 29/29.
- Exact injection/check: 13/13 KBs, idempotent.
- Typecheck, build, shell syntax, documentation continuity, capability check,
  and diff check passed.
- Full root: 3,210 passed / 19 skipped / the unchanged CNPC source-wrapper
  literal failure.
- Release preflight: 742/742 root release tests and 43/43 runner tests.

## Release and live readback

- Implementation: `a055ea05705d600bcf7244f38ba81c01808d0d01`.
- Source tree: `72493af1e53b1ed73d1286859c1e1f7638edb19a`.
- Artifact: 944 files,
  `c5f59040ebaca594aeae6daba0e5cef4d3503e8f25bfb7ef6d4c883cdd98b15e`.
- Archive:
  `af3ecdf88e7cf3bc688e69bfbc4fc998217f0bd1ec493bacf757c3e22bed7bd6`.
- Exact archive verified locally and on `mini-claw.local` under Node 22.23.2.
- Dry-run/apply changed only the three main-daemon release pointers and retained
  rollback plist
  `com.nanoclaw.plist.rollback-7a36d79ca787-2026-08-24T20-46-18-514Z`.
- PID/listener converged to 94097 with exact release/code root, Gmail/Slack
  connected, zero active containers/work/waiting groups/outgoing Slack depth,
  and unchanged 273-line main error baseline.
- The release-owned sync checker passes all 13 KBs. The compiled detector
  returned `{"checked":1,"findings":[]}` against the exact live catalog,
  pack, and Sales KB.
- Live Sales bytes state English/French/Japanese/Spanish availability, include
  the French URL, and preserve the Standard Path/ICF recognition boundaries.
- Concurrent student-lifecycle capture remained enabled with action consumers
  false; checkout recovery remained shadow with customer sends false.

No prospect reply, Slack/email send, provider/course/enrollment/payment/
translation/entitlement/price/customer-record mutation, or manufactured event
occurred.
