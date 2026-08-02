# NC-20260802-009 — Claude C5 deployment-record review R4

## Reviewer, scope, and limits

- Reviewer: Claude Code, model `claude-opus-5`, session
  `b361d68b-688c-4dd0-bba0-a43188673962` (same session as R1–R3)
- Review root: `/private/tmp/nanoclaw-sequence.oUOHVX/worktree`
- Base: `e1fa93e09f6dedf363c9a8c0be1723583563f533`
  ("fix: migrate legacy email actions before indexing")
- Delta reviewed: the complete uncommitted documentation delta from that
  commit — 5 paths, `114 insertions(+), 28 deletions(-)`:
  `docs/ACTIVE-WORK.md`, `docs/ENGINEERING-CHANGELOG.md`,
  `docs/PROJECT-MAP.md`, `docs/RELEASE-INTEGRITY.md`,
  `docs/reports/NC-20260802-009-CONVERGENCE-STATE.md`
- Elapsed: request artifact mtime `2026-08-02T23:38:48Z` → this report,
  ≈ 8 minutes wall clock

Read-only limits observed:

- The only file created is this report. No implementation, continuity, prompt,
  or configuration file was edited.
- No send, service mutation, database write, OAuth change, or cleanup was
  performed. Nothing was staged, committed, packaged, activated, or restarted.
- `.env*`, `~/dev/.env.shared`, OAuth/token material, `store/`, and the
  operational checkout at `/Users/xbohdpukc/dev/NanoClaw` were not read. I did
  not attempt to resolve `recipientSha256` to an address.
- Production evidence in the request is treated as operator-captured. I cannot
  independently observe PID 68877, the live health response, the live database,
  or the Gmail account. What I *can* verify is whether each documented claim is
  internally consistent, consistent across the five files, and consistent with
  the tracked code — which is what this review does.
- Per the request, already-approved code is not re-reviewed. Code is consulted
  only where a documentation claim asserts something about it.
- Node here is `v26.5.0`; `better-sqlite3` in this tree is built for Node 22, so
  the SQLite-backed test files cannot execute. Test *collection* counts are
  still exact and are used below.

---

## Verdict

**APPROVE WITH FOLLOW-UPS**

The documentation delta is factually accurate, correctly bounded, and does not
overclaim. Every checkable assertion about the code holds. The `d1bfcce`
failure and rollback survive intact in all four places that recorded them. The
state is correctly `deployed_unverified`, and the natural-send boundary is
stated four times without hedging. No secret or customer address appears.

Two gaps are recorded as follow-ups. Both are exactly what request item 5 asked
me to surface, neither contradicts a fact, and neither blocks the commit:
a still-tracked unpinned-Node invocation of the canary, and a preflight that is
now a hard precondition with no tracked command implementing it.

---

## File-by-file findings

### `docs/ACTIVE-WORK.md` — accurate

- NC-009 moves `ready_for_review` → **`deployed_unverified`** and rebases the
  row on `e1fa93e`. That is the correct vocabulary: `docs/CHANGE-PROTOCOL.md:209`
  defines it as "deployment occurred, verification incomplete", and §5 (`:219`)
  requires exactly this step before live verification. `complete` would have
  been an overclaim.
- The new "Next action" is a natural-send instruction and explicitly forbids the
  synthetic substitute: "Observe the next naturally approved customer email end
  to end … without creating a synthetic customer send. The internal
  transport/OAuth canary is complete but does not validate this business
  outcome." This satisfies request item 6.
- The first-activation failure record at `:174-183` is **untouched** — the
  `no such column: action_id` failure, the `aa1c821` restore, "No canary or
  customer email ran", and the prompt restoration all survive verbatim above
  the new success record. Request item 3 is met here.
- The new "Corrected deployment" and "Internal transport canary" bullets carry
  the digests, the 520-file count, the PID/Node identity, and the zero-row
  schema checks. The canary bullet correctly attributes the temp-directory
  bridge to the release's intentional absence of `.env` and points the defect at
  NC-010.
- "Remaining boundary" restates the natural-send limit. Consistent.
- NC-010 gains **N6** (canary environment binding), its scope line gains
  "explicit canary environment binding", and the safety line correctly widens
  "N3-N5" to "N3-N6". It also drops the now-stale clause "None … blocks
  NC-009's reviewed deployment/canary", which is right — that deployment has
  happened. Request item 6 is met.

### `docs/ENGINEERING-CHANGELOG.md` — accurate

- `State: ready_for_review` → `deployed_unverified`; `Commit/PR` now names
  `d1bfcce` **plus** the correction `e1fa93e`, rather than replacing the first.
- The pre-existing "First activation attempt at 2026-08-02T23:08Z" bullet at
  `:84` is retained in full, immediately above the new corrected-release bullet.
  The failure is not overwritten.
- The canary bullet states what the code actually does and no more: returned
  **and re-read** the receipt, recipient recorded only as SHA-256, "wrote no
  Slack, customer, action-ledger, or business state, changed no OAuth
  configuration, and was not retried." It then names the ergonomics defect as
  "a non-blocking NC-010 follow-up" rather than hiding it.
- "Residual boundary" is extended with the customer-path limit. Correct.
- Minor, non-blocking: the entry's top-level `Date: 2026-08-02T21:30Z` now
  precedes events it describes at ~23:4xZ. The body carries its own timestamps,
  so nothing reads as misleading; I raised the same nit in R3 and do not raise
  it as a change request.

### `docs/PROJECT-MAP.md` — accurate

- The production-release paragraph correctly moves from `aa1c821` to `e1fa93e`,
  and correctly updates the prior-release reference from `23ffb07` to `aa1c821`
  — the previous text described the previous activation, so this is a required
  correction, not a rewrite of history.
- The `d1bfcce` failure is preserved here too: "An earlier activation of
  `d1bfcce` failed on the exact legacy SQLite schema and automatically restored
  `aa1c821`, its prompt files, and health before the migration-order correction
  was reviewed."
- "the five affected live group instructions match the reviewed release copies"
  replaces the older single-Sales-prompt claim, consistent with the rollback
  record's "five live group instructions were restored byte-for-byte".
- The canary paragraph keeps its bounding sentence unchanged — "a transport/OAuth
  canary only, never evidence that the full approved-customer path or inbox
  delivery succeeded" — and appends the receipt plus the environment caveat.
- Outcome observations are correctly enumerated as still-open: "A natural
  approved customer-email action, a Sales handoff/draft/revision cycle, and a
  real daemon-down healer recovery remain separate outcome observations."

### `docs/RELEASE-INTEGRITY.md` — safe, with one reproducibility gap

The rewritten canary procedure is materially safer than the one it replaces.
Checked against request item 5, point by point:

| Hazard | Status |
| --- | --- |
| Executes JS without pinned Node | Addressed **in this file** — the command is now `/absolute/pinned/node /absolute/activated/release/dist/email-transport-canary.js`, replacing `npm run email:transport-canary`. See D1 for the surface this file does not control. |
| Mutates the immutable release | Addressed — the manifest is copied **into the temporary directory's** `dist/`, and the text says "never copy secrets into the release". Nothing is written to the release root. |
| Prints credentials | Addressed — "Verify only credential presence before the send, never print values." Consistent with the code: `src/gmail-auth.ts:27-31` names missing variables and never echoes values, and `src/env.ts` logs a missing `.env` at `debug` with no content. |
| Encourages retry after ambiguous acceptance | Addressed — "Do not retry if Gmail accepted the send but later receipt retrieval is uncertain." This matches the code's own failure text at `src/email-transport-canary.ts:116-125`, which names the accepted ids and says "do not rerun blindly". |
| Leaves the bridge in place | Addressed — "remove the exact temporary files after the attempt." |

The stated reason for the bridge is verifiably correct, not a rationalization:

- `scripts/build-release.mjs:111-131` builds the bundle from `git ls-files` over
  a fixed path list (`.nvmrc`, `package.json`, `package-lock.json`, `container`,
  `groups`, `launchd`, `setup/launchd`) plus `dist` and two scripts. `.env` is
  gitignored and not in that list, so a release **structurally cannot** contain
  one. "Immutable releases omit `.env`" is a property of the builder, not an
  accident.
- `src/email-transport-canary.ts:145-152` resolves the manifest at
  `path.join(process.cwd(), 'dist', 'release-manifest.json')` — working-directory
  relative, as claimed.
- `src/env.ts:36-56` (`readEnvFile`) resolves the project overlay at
  `path.join(process.cwd(), '.env')` — also working-directory relative. Both
  Gmail settings (`src/config.ts:171-207`) and OAuth credentials
  (`src/gmail-auth.ts:17-21`) come through it, so a release-root invocation
  genuinely cannot authenticate.
- A symlinked `.env` works: `readEnvFile` uses `fs.readFileSync`, which follows
  symlinks.

One precision note, not a correction: `readEnvFile` also reads a base layer at
`~/dev/.env.shared` before the CWD overlay (`src/env.ts:41-46`). That path is
home-relative, so it resolves identically from any working directory and the
bridge behaves the same either way — but "reads both files relative to its
working directory" describes the two named files, not the whole resolution
order. Worth a clause if the section is revised.

### `docs/reports/NC-20260802-009-CONVERGENCE-STATE.md` — accurate

Round advanced to R4; the "Production activation evidence" line now carries
**both** outcomes in order — `d1bfcce` verified-but-failed with rollback and "no
canary or customer email ran in that attempt", then `e1fa93e` verified,
activated, and canaried. Adding "in that attempt" is a precise qualifier, since
a canary did later run. `Status: converged` is defensible for the review
exchange (R3 approved, R4 is the record review); the *task* status lives in
`ACTIVE-WORK.md` and correctly reads `deployed_unverified`.

---

## Reconciliation across the five files (request item 1)

| Claim | ACTIVE-WORK | CHANGELOG | PROJECT-MAP | RELEASE-INTEGRITY | CONVERGENCE |
| --- | --- | --- | --- | --- | --- |
| Release commit `e1fa93e` | ✓ | ✓ | ✓ | n/a | ✓ |
| Source-tree `7ade5204…` | ✓ | ✓ | ✓ | n/a | — |
| Artifact `de470dd8…` | ✓ | ✓ | ✓ | n/a | — |
| Archive `e99cca9e…` | ✓ | ✓ | — | n/a | — |
| 520 files | ✓ | ✓ | ✓ | n/a | — |
| Prior release `aa1c821` | ✓ | ✓ | ✓ | n/a | — |
| Receipt `19fc4d33ccf3061e` | ✓ | ✓ | ✓ | n/a | ✓ |
| Recipient as SHA-256 only | ✓ | ✓ | ✓ | ✓ | — |
| `d1bfcce` failed + rolled back | ✓ | ✓ | ✓ | n/a | ✓ |
| Zero rows / indexes present | ✓ | ✓ | — | n/a | — |
| Canary ≠ customer-path proof | ✓ | ✓ | ✓ | ✓ | — |
| Env/manifest gap → NC-010 | ✓ | ✓ | ✓ | ✓ | — |

No digest, commit, count, or identifier disagrees between files. The three
digest values are distinct kinds (source tree, artifact, archive) and are used
consistently in each place they appear.

Test counts reconcile with the tree: `test:email-critical` collects **10 files /
295 tests** here, matching the documented "10 files / 295 tests" exactly. That
is +1 over R2's 294, accounted for by R3's added legacy-migration test — which
also matches `src/db.test.ts` holding 66 `it(` blocks and the documented
"66/66". The "145 files / 1,846 tests" full-suite figure is +1 on the same
basis and is internally consistent, though I did not run it.

Gates reproduced here: `npm run docs:continuity-check` passes ("39 active/ready
task rows, 35 changelog entries"), and `git diff --check` is clean.

---

## Secrets, addresses, and receipt quality (request item 4)

I scanned every added line across the five files for address, `refresh_token`,
`client_secret`, bearer, `ya29.`, `sk-`, `xoxb-`, and password patterns:
**no matches**. The only new opaque values are the release digests, the Gmail
message/thread id, and the recipient hash.

The receipt evidence is suitable and correctly characterised:

- `19fc4d33ccf3061e` is a well-formed Gmail id, and the message and thread ids
  being **identical** is exactly right for the first message of a new thread —
  an internal consistency check the record passes rather than a copy error.
- The canary succeeds only after re-reading that message and comparing both ids
  (`src/email-transport-canary.ts:109-125`), so "returned and re-read" is an
  accurate description of durable receipt evidence, not merely API acceptance.
- `recipientSha256` matches the code's `sha256(recipient.toLowerCase())`
  (`src/email-transport-canary.ts:129-132`). It keeps the address out of a
  tracked file and lets an operator recompute and confirm it. It is *not*
  anonymisation — the monitored mailbox is a single guessable value — but
  anonymity is not what is claimed anywhere in the delta.

---

## Follow-ups

| ID | Item | Severity | Owner | Suggested disposition |
| --- | --- | --- | --- | --- |
| D1 | The tracked surface now disagrees with itself about how to run the canary. `docs/RELEASE-INTEGRITY.md:196-216` requires the pinned absolute-path form, but `package.json:23` still defines `"email:transport-canary": "node dist/email-transport-canary.js"` — **unpinned `node`** — and `docs/PROJECT-MAP.md:669` still refers to "the separate `email:transport-canary` command". An operator following the project map can still reach the unpinned path. Blast radius is small (fixed-content internal send; it would fail its own manifest/`.env` preconditions from a release root), but this is precisely the hazard item 5 asks to be flagged. | Low | Codex | Fold into NC-010's N6: either delete the npm script, or make it resolve the pinned Node and an explicit `--env-file`/`--manifest` argument, and align the PROJECT-MAP reference |
| D2 | `docs/RELEASE-INTEGRITY.md:198-201` makes "a non-sending preflight" a hard precondition, but no tracked command implements one — `preflight` appears exactly once in the repository, in that prose. The successful run used an operator-improvised check that is not reproducible from the tracked record. | Low | Codex | Fold into NC-010's N6: ship the preflight as a real subcommand (`--check` / `--dry-run`) that reports Boolean credential presence and the resolved release identity, and cite it from the runbook |
| D3 | Precision: "the current command reads both files relative to its working directory" omits the `~/dev/.env.shared` base layer (`src/env.ts:41-46`). Behaviourally identical from any CWD, so nothing in the procedure changes. | Informational | Codex | Optional clause on the next revision of that section |

NC-010 (N1–N6) and NC-011 remain the registered homes for the R2/R3 residuals
and are untouched by this delta.

---

## Blocking check (request item 7)

I found **no** factual contradiction, overclaim, missing rollback fact, or
continuity-check problem that must block this documentation commit.

Specifically checked and clear:

- No claim that the canary validated the customer path, inbox placement, or
  business logging — all four files state the opposite.
- No claim of `complete`; `deployed_unverified` is used consistently in both
  places that carry a status.
- The `d1bfcce` failure and rollback are present in four files and were not
  edited down, softened, or displaced by the success record.
- Nothing asserts the temp-directory bridge was part of the release or that the
  release was modified; both files that mention it say the opposite.
- The continuity checker passes, and the documentation impact matrix
  (`docs/CHANGE-PROTOCOL.md:191`, deployment/service) is satisfied: release
  evidence, runbook change, rollback, live health, and changelog are all
  present. No `.env.example` change is owed, because the canary introduced no
  new environment variable.

---

## Decisions

- **Documentation commit: proceed.** The record is accurate, reconciled across
  all five files, free of secrets and customer addresses, and correctly scoped
  to what the canary actually proved. Record D1 and D2 against NC-010 in the
  same change, or decline them with a stated reason per
  `docs/CHANGE-PROTOCOL.md` §7.
- **No further code or release action is implied by this review.** The
  implementation and migration correction were approved in R2/R3 and are
  committed as `d1bfcce` and `e1fa93e`; nothing here reopens them.
- **Remaining outcome boundary.** What is now live-verified is: the activated
  release identity, host health, the additive schema with zero rows, and Gmail
  transport plus OAuth producing a re-read receipt. What is **not** verified is
  the thing NC-009 exists to guarantee — that a real approved customer email
  flows as one exact action. The next natural approved send must be observed
  end to end for: the host's `[EMAIL ACTION] Action-ID` post landing in the
  approval thread, that ID surviving the Sales/Chief handoff into Mailman's
  tool call, the append-only stage sequence in `email_send_events`, the
  Gmail-confirmed receipt posted back to the originating thread, and a repeat
  request returning `[EMAIL ALREADY SENT]` rather than sending again. Until
  that is observed, `deployed_unverified` is the honest status, and the canary
  must not be cited as evidence of it.
