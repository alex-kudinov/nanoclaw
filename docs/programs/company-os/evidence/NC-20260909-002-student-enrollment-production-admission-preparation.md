# NC-20260909-002 — production-admission preparation evidence

Status: read-only preparation evidence, 2026-09-10 UTC. This is not owner
acceptance or production/provider execution authority.

## Release and source lineage

Read-only `/health` on `mini-claw.local` reported verified release
`726f2c80b3d45ccddf80bfa0fe796281f54b19b1`, source-tree digest
`c7d3cf30170303eef0545e5d4603389d25ce6616`, artifact SHA-256
`19263ee5b693f204e9dc647c006df0f5c05c2eb6d8c5f84fe184e926a11e3544`,
Node 22.23.2, a matching immutable code root, connected Gmail and Slack, and
zero active work. The live commit's parent is the reviewed publication closure
`55c068d2c39b9295b0a79ebe65369a3cc68172dc`.

The reviewed enrollment projection closure is
`d9e298567ae87f48ae5b36152b3322fbbe9b73f6`. It contains implementation
`deaab99ca4c756f54d22d8c6e6f9b2d4a91daf69` over the separately reviewed
admission/store line, but it is not an ancestor of the current live release.
The future pilot must therefore start from the then-current live release or a
confirmed descendant and deliberately integrate these reviewed sources. Directly
deploying `d9e29856` would regress intervening live runtime work.

The live release tree contains neither the admission/store/projection source nor
migrations 146-148. Repository presence on the preparation branch is not live
runtime evidence.

Post-review live revalidation at `2026-09-10T02:31:27Z` found that another
authorized task had advanced production to verified release
`00d66184c62767a7ad8a2904c3911c130aaf1ede`, parent
`d3c390cee090b57f535f265d0373f3f7c603eb77`, source-tree digest
`d1b8086476e18e818751cd97b8e58b59ff380c59`, artifact SHA-256
`ce51f7fc428f6ddf11dffc667063fbd8ad069ba1b7ce207f46f40b2f66587060`.
Git proves it descends from `726f2c80`; it still does not descend from
`d9e29856`. One unrelated work item was active and no item was waiting. The
packet now pins `00d66184` and preserves the mandatory zero-work rollout
preflight. This post-review lineage refresh changes no safety-contract field or
reviewed digest.

## Structure-only PostgreSQL evidence

The production database identified itself as `nanoclaw_business`, PostgreSQL
16.13. Only `pg_catalog` and `information_schema` metadata were selected; no
business row, student, identity, payment, assignment, or projection data was
read.

- Migration-142 enrollment tables and migration-143 capacity tables exist.
- Migration-144 operator tables/view and migration-145 capacity-publication
  table/view shape exist.
- All inspected enrollment/capacity tables and views are owned by
  `nanoclaw_admin`; the inspected tables expose only `nanoclaw_admin` grants.
- The host operator has membership/usage in `nanoclaw_admin`; no cluster role or
  grant was changed.
- `student_projection_outbox.version` is absent, so migration 146 is unapplied.
- `student_enrollment_authenticated_receipts` and
  `student_enrollment_writer_claims` are absent, so migration 147 is unapplied.
- Migration-148 delivery identity/readback columns are absent, so migration 148
  is unapplied.

Exact source/rollback SHA-256 values and the 146, 147, 148 apply order are pinned
in the rollout packet. The future rollout must use separate exact-file `psql`
invocations rather than replaying the repository's all-migrations runner over a
populated database.

## Actual ingress and writer boundary

Current source has two real Stripe execution entries:

1. `src/webhook-server.ts` handles a new `stripe-payment` request and calls
   `handleStripePayment`.
2. `src/webhook-inbox-reaper.ts` retries the durable inbox row and calls the same
   `handleStripePayment`.

`src/stripe-payment-host.ts` resolves the fixed account and canonical Payment
Intent, creates one durable Contador case, then runs
`tools/contador/process-payment.cjs`. The script writes Payment Log, Student
Roster, and `public.payments`; exact stage receipts gate Contador completion.
The reviewed enrollment admission and writer claim remain local/unwired, and
the current store deliberately refuses non-disposable databases.

The rollout packet therefore does not pretend writer exclusion already exists
in production. It requires both host entries to share one production admission
facade, keeps accounting independent, makes the selected legacy roster path
consult the same persisted claim, preserves the disposable guard, and prohibits
runtime imports of raw store primitives.

## Student Roster metadata and capability

No student row was requested or read. The tracked native metadata snapshot pins:

- workbook ID `1bX0hvMgXyoVQXuHRjYfwmVrv9mN5W08jF4iB8LiZI70`;
- title `Tandem - Student Roster`;
- CSS tab ID `1796552584`, title `CSS`, grid index 5.

An established read-only Sheets helper executed on the Mini with its existing
configured service-account file and requested only `CSS!A1:Z1`. Current readback
was exactly `Email`, `Name`, `Coaching Supervision Mastery`, `Refunded`, `Joined`.
This proves exact-header read access, not Editor access. Google does not expose
the required write authority through that read. The later authorized rollout
must capture the blank F:M preimage, write/read back the accepted operational
headers, and restore them if activation aborts before an event.

The current production roster has no canonical projection/version columns. The
packet makes F:M explicit so a target readback can verify canonical fields rather
than synthesizing unobserved data from the request.

## Heartbeat metadata and capability

Configured Toolbox calls used only documented server APIs and returned no user
or membership data.

- Exact access group: `fa5f5f09-a10e-4dfd-8bf2-0451f7cffa83`,
  `Coaching Supervision Mastery`.
- Exact content-bearing course: `1f2febfe-eb34-463a-818e-ce7d0cac1251`,
  `Coaching Supervision Mastery`.
- Exact-name searches found no `Student Markers` parent and no
  `class:supervision:live-practicum:2026-10-07:inaugural` marker.
- The broader `supervision` name search returned only unrelated existing groups
  plus the access group; it did not establish a substitute marker.

The installed create-group operation is dry-run first and accepts parent,
isolation, and non-joinable settings. Its current readback exposes name, ID, description,
parent and archived state, but not every hidden/admin/content-attachment
invariant. The installed add-membership operation also lacks exact post-write
UUID readback and guarded removal. A previously reviewed local Toolbox commit,
`8d996ddd8dc2a24ab056b0ee1f26db18e0f38570`, supplies exact-user/exact-group
guarded removal with readback, but it is not installed in the shared Toolbox.
Those are explicit future preflights, not claims of current readiness.

## Current readiness and effects

Production admission readiness is false. Student Roster and Heartbeat remain
required; Encharge and Plutio remain explicitly `not_applicable` for
`supervision-inaugural` v1. Current read-only evidence establishes identities
and gaps only.

No current or historical student population, Heartbeat user or membership,
provider payload, credential, private endpoint, browser, UI export, CSV, or
secret was inspected. No migration, database row, Sheet, group, membership,
runtime, release, configuration, writer, payment, financial record, customer or
student communication was changed.

## Independent review and verification

Claude Code Sonnet/high R1 session
`3087d0dd-8696-41ce-a861-c8bb2addb5e6` found one material issue: omission guards
and array-length checks did not detect same-length weakening of safety-bearing
text. The verified correction computes one canonical SHA-256 over thirteen
operational safety families, stores it in the packet, hard-pins it in the
validator, and tests twelve representative weakened-content substitutions.

Fresh bounded R2 session `559bf069-6d23-44ed-a899-0c8ffbbc36b1` returned `NO
MATERIAL FINDINGS`. R2 required exact-session recovery after the initial local
runner process detached; it stayed within its five allowed files and wrote only
the response artifact. R1 used 7 Sonnet calls, 82,642 cache-create, 331,740
cache-read, 16,133 output and 92,529 maximum context tokens. R2 used 11 Sonnet
calls plus two synthetic records, 162,522 cache-create, 517,509 cache-read,
37,565 output and 82,024 maximum context tokens. Neither crossed the bounded
review warning thresholds.

Final local evidence before commit:

- validator: 186 omission-guarded paths, ten preflights, three exact migrations,
  nine exact external mutations, execution unauthorized;
- focused rollout packet: 1 file / 4 tests passed;
- pinned Node 22.23.2 TypeScript typecheck, format and documentation continuity:
  passed;
- full root with four workers: 3,778 passed / 32 skipped / three failed. All
  three are unchanged predecessor baselines: CNPC wrapper literal, date-stale
  Trafft projection, and an expired Capacity operator reservation. The exact
  failed tests and their implementation sources are unchanged from `d9e29856`;
  a one-worker rerun reproduced 8 passed / 3 failed.

Reviewed implementation and evidence commit:
`75454ddf672a33a257d78e40196d195cafc240d6`. The commit hook reformatted the
full TypeScript tree and changed no file beyond the already formatted new test.
Evidence commit `540885a454ea7a7add86947aeab1aed38396287c` and the implementation
were pushed. Local HEAD, the remote-tracking ref and `git ls-remote` agreed at
`540885a4` before the final closure addendum. Deployment, migration, live
provider execution and a natural event remain not applicable to this
preparation-only task.
