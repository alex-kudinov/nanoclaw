# NC-20260806-001 — Claude review response R2

## Verdict

`CHANGES REQUIRED`

Scope of the objection is one item. F1, F2, F4, and F5 are verified repaired.
F3 is repaired for the general case but its stated guarantee is false: the
shared constant removes *constant* drift, not *predicate* drift. `src/ipc.ts:537`
and `src/channels/slack.ts:1029-1033` evaluate different expressions, and I
reproduced a valid card that the IPC preflight accepts and the Slack transport
rejects as overlong — the exact R1-F3 shape, in a narrow band.

Nothing found here weakens an approval, content, thread, or container-isolation
boundary. If the owner prefers to ship as-is, the honest alternative is to
correct the guarantee in `docs/ENGINEERING-CHANGELOG.md` and
`docs/PROJECT-MAP.md` rather than leave a claim on record that the code does not
make (D1 below).

## Independent evidence reproduced

Pinned runtime `/opt/homebrew/opt/node@22/bin/node` `v22.23.2` (matches `.nvmrc`):

| Check | Result |
| --- | --- |
| `tsc --noEmit` | pass |
| `prettier --check "src/**/*.ts"` | pass |
| focused: `approval-recap`, `ipc-handoff-echo`, `channels/slack`, `send-watchdog`, `group-queue` | 5 files / 197 tests pass |
| `container/agent-runner`: `tsc --noEmit` + `vitest run` | pass; 4 files / 29 tests pass |
| `node scripts/run-email-critical-tests.mjs` | 19 files / 510 tests pass |
| `npm run docs:continuity-check` | pass (47 active/ready rows, 43 changelog entries) |

`src/ipc-handoff-echo.test.ts` is 25 tests (22 base + R1's content-guard test +
R2's exited-container and overlong tests); `src/approval-recap.test.ts` is 10.
Both figures reconcile with the R2 brief's counts.

## Repair verification

### F1 — recap suppression: REPAIRED (residual R2 below)

Re-ran the three R1 counterexamples verbatim against the real export
(`src/approval-recap.ts`), not the test copies:

| Text | R1 | now |
| --- | --- | --- |
| `Draft is ready. I could not post the review card because gmail_get_thread returned nothing for this lead, so nothing is awaiting approval yet.` | suppressed | **visible** |
| `Draft ready for Lead #1047, but the cohort schedule is missing the September date — I cannot finish until you confirm it. Holding the draft, awaiting approval to use the August cohort instead.` | suppressed | **visible** |
| `Error: send_message failed twice. The draft posted earlier is the only one awaiting approval.` | suppressed | **visible** |
| `Draft posted for Marina Minina (Lead #1047) — ACTC matched, awaiting approval in thread.` | suppressed | **suppressed** (intended) |

All three are also literal negative tests at `src/approval-recap.test.ts:19-21`,
inside the release-blocking gate. The structure is right: `src/approval-recap.ts:13-19`
vetoes first and `20-22` requires all three positive tokens, so suppression is
now reachable only through text that positively asserts posted/ready +
awaiting approval with no negation — never through an inferred success.

The rejection path no longer depends on this predicate at all: the targeted
`[approval_card REJECTED]` turn fires from `src/ipc.ts` regardless of what the
model writes, so a predicate miss can no longer produce R1's "rejection plus
false success with no correction".

### F2 — unavailable source container: REPAIRED

`src/ipc-handoff-echo.test.ts:491-532` drives the real branch through
`startIpcWatcher` with a real content violation and `deliverSourceInput` stubbed
to `false`, then asserts the four properties that matter: the original card is
never posted, the visible rejection still posts with `threadKey:
lead:exited@example.com`, the file is quarantined as `approval-card-content-*`,
and `ipc/sales/input` is never created — that last assertion is the one that
proves no untargeted fallback and therefore no sibling delivery. This is the
assertion set R1-F2 asked for.

### F3 — overlong card: REPAIRED for the general case, **predicate still drifts**

Repaired and tested: `src/ipc.ts:537-577` rejects an overlong card while the
source container is still known, returns it to that exact container, posts one
visible rejection, and quarantines as `approval-card-overlong-*`
(`src/ipc-handoff-echo.test.ts:534-580`). Ordering is consistent with the
transport — length outranks content in both.

The drift claim does not hold. The two sites compute different quantities:

- `src/ipc.ts:537` — `data.text.length > SLACK_MESSAGE_MAX_LENGTH`
- `src/channels/slack.ts:1029-1033` — `prefix.length + text.length > MAX_MESSAGE_LENGTH`,
  where `prefix = fromGroup && !text.startsWith('[') ? '[<group>]\n' : ''`

`isApprovalCard` matches `/^\s*\[(?:…)\]/m`, so a card is still a card when it
begins with a newline or carries a preamble line before the marker — and in
exactly those cases `text.startsWith('[')` is false and the prefix applies.
Reproduced against the real `isApprovalCard` / `buildApprovedHandoff` /
`SLACK_MESSAGE_MAX_LENGTH`:

```
starts with [     len=3995  card=true parses=true prefix=0  IPC=false SLACK=false
starts with [     len=4001  card=true parses=true prefix=0  IPC=true  SLACK=true
leading newline   len=3995  card=true parses=true prefix=8  IPC=false SLACK=true   <-- DRIFT
preamble line     len=3995  card=true parses=true prefix=8  IPC=false SLACK=true   <-- DRIFT
```

A parseable, content-clean card in that band passes the preflight, reaches
`src/channels/slack.ts:1043-1048`, is replaced by the overlong rejection, and
gets **no** targeted feedback — `deliverSourceInput` is unreachable from the
channel layer. The band is `fromGroup.length + 3` characters wide: 8 for
`sales`, 17 for `client-support`.

Required change (small, and it makes drift structurally impossible rather than
currently-absent):

```ts
// src/slack-limits.ts
export function slackGroupPrefix(fromGroup: string | undefined, text: string): string {
  return fromGroup && !text.startsWith('[') ? `[${fromGroup}]\n` : '';
}
export function exceedsSlackMessageLimit(text: string, fromGroup?: string): boolean {
  return slackGroupPrefix(fromGroup, text).length + text.length > SLACK_MESSAGE_MAX_LENGTH;
}
```

Call it from both sites (`src/ipc.ts:537` passing `sourceGroup`, and
`src/channels/slack.ts:1029-1033`), and add a `src/slack-limits.test.ts`
covering the prefix and no-prefix cases — the file currently has no test of its
own, which the repo convention asks for once it holds logic rather than a bare
constant.

### F4 — approval-card tool wording: REPAIRED

`container/agent-runner/src/send-message-result.ts:9-14` now tests the marker
before the `targetGroup` early return, so a cross-group card gets the validation
wording. That matches host behaviour: `src/ipc.ts:499` forces every card to
`sourceEntry[0]` and ignores the resolved `targetGroupFolder`, so
`Message sent to chief.` would have been false on both counts. Covered at
`container/agent-runner/src/send-message-result.test.ts:19-23`, with the ordinary
cross-group result preserved at `25-29`.

Two coverage notes, neither blocking:

- The **host** half — a `[SALES REVIEW]` card carrying `targetGroupFolder` still
  posting to the source channel — is asserted only by code reading. No test in
  `src/*.test.ts` writes a card with `targetGroupFolder`.
- The runner test is not executed by anything automated. `vitest.config.ts`
  includes only `src/`, `setup/`, `skills-engine/`, `scripts/`;
  `.github/workflows/ci.yml:27-28` runs the root suite; `scripts/build-release.mjs:43`
  runs only the email gate. `container/agent-runner` tests run only when invoked
  by hand. Pre-existing (the other three runner tests are equally unenforced),
  but this one now guards a customer-approval-path string.

### F5 — wording and wrapping: REPAIRED, one residue

`docs/PROJECT-MAP.md:785-794` is rewrapped and the new prose is accurate. The
operator-visible sentences are still not byte-identical across the two layers:
`src/ipc.ts:539-540` produces "…because **the** complete exact card exceeds…"
while `src/channels/slack.ts:1048` produces "…because **its** complete exact card
exceeds…" (same for "the/its exact subject/body fail…"). The paths are mutually
exclusive per card, so this is cosmetic — but `docs/PROJECT-MAP.md` claims one
operator vocabulary, so either align the strings or stop claiming it.

## New-route inspection

- **Double visible rejection: none.** The four card branches (malformed →
  overlong → content → accept) each `continue`, so at most one
  `deps.sendMessage` rejection is emitted per card, and a rejected card never
  reaches the transport that would add a second.
- **Retry loop on a failed Slack post: none.** If `deps.sendMessage` throws
  after the targeted rejection is delivered, the outer catch at `src/ipc.ts:1537-1547`
  moves the file to `ipc/errors/`, so it is not reprocessed and the container is
  not told twice. Side effect worth knowing: on that path the card lands in
  `ipc/errors/` rather than `ipc/quarantine/<group>/`, so forensics for a
  Slack-failure rejection live in a different directory than every other
  rejection.
- **Self-wake: none.** Rejections post with `fromGroup === owner`, which
  `src/db.ts:665-670` excludes from the spawn trigger.
- **False negatives in the recap veto (accepted direction).** A pure success
  recap escapes suppression if it happens to contain a veto word or exceeds the
  500-character cap — e.g. `Draft posted for Marina, awaiting approval — nothing
  else pending.` is now visible. The failure mode is a redundant line next to a
  visible card, which is the pre-repair status quo; the veto trades that for
  never hiding a denial. Correct trade.
- **False positives that survive (residual R2).** The veto covers negation and
  failure, not interrogatives or in-progress prose. All three of these are still
  suppressed:
  - `Draft posted for Lead #1047 — awaiting approval. Should I also attach the September cohort dates?`
  - `Updated draft posted, awaiting approval. Do you want the discovery-call link in there too?`
  - `Review card ready, awaiting approval. Gmail thread lookup is still running.`

  Each positively claims the card is posted, so this is much narrower than R1
  (where pure denials were being swallowed) and the card itself is visible in
  the thread. What is lost is a rider: an unanswered question, or a stall signal
  on an otherwise-true recap. Adding `\?` and `\bstill\b` to the veto at
  `src/approval-recap.ts:14` closes all three; both are cheap and neither
  weakens the Marina suppression.

## Confirmations requested

- **Shared gate.** `scripts/run-email-critical-tests.mjs:8-12` lists
  `src/approval-recap.test.ts`, and `src/ipc-handoff-echo.test.ts` was already
  present — so every new *host* test is release-blocking via
  `scripts/build-release.mjs:43`. Reproduced at 19 files / 510 tests. The new
  host source `src/slack-limits.ts` compiles into the build and is exercised
  transitively by both suites.
- **Release packaging.** `scripts/build-release.mjs:92-110` bundles all tracked
  files under `container/`, so `send-message-result.ts` and its test ship once
  committed. The runner needs no image rebuild:
  `src/container-runner.ts:277-311` hash-copies `container/agent-runner/src` per
  group and mounts it at `/app/src`, recompiled at container start; a new file
  changes the hash and invalidates the copy on the next spawn.

## Residual risks

1. **F3 drift band** — above. Narrow (8 characters for `sales`, non-`[`-leading
   cards only), and it degrades to "visible rejection, no auto-correction turn",
   never to a posted-but-unapprovable card.
2. **Recap riders** — interrogative or "still …" clauses attached to a positive
   recap are still suppressed. Two tokens fix it.
3. **Rejection loop is still unbounded** (carried from R1): a model that cannot
   self-correct can cycle card → reject → repost, posting a visible
   `[APPROVAL CARD REJECTED]` each time. The overlong branch widens this
   slightly — a model that shortens by a few characters can re-trip the same
   limit. No counter exists in `src/ipc.ts`. A per-container consecutive-rejection
   cap that escalates to chief remains the right shape.
4. **Two round trips for a card that is both overlong and content-invalid**: the
   length reason is reported first, the content violation only after the
   shortened repost. Matches the transport's precedence, so it is consistent, not
   wrong.
5. **Runner tests unenforced by CI/release** (F4 note above).
6. `container/agent-runner/node_modules` is still an untracked symlink in this
   review checkout. `.gitignore`'s `node_modules/` does not match a symlink, so
   `scripts/build-release.mjs:19-28` (`--untracked-files=all`) would refuse to
   package from here. Must not exist in the checkout that builds the release.

## Owner decisions

- **D1 — blocking.** Fix the F3 predicate (share `exceedsSlackMessageLimit`, not
  just the constant) before commit, **or** ship as-is and correct the
  `docs/ENGINEERING-CHANGELOG.md` "A shared 4,000-character limit prevents
  IPC/Slack drift" and `docs/PROJECT-MAP.md` claims to state what is actually
  true. Either resolves the objection; leaving both is what I am declining to
  sign.
- **D2 — non-blocking.** Add `\?` and `\bstill\b` to the recap veto now, or
  accept residual 2 and track it.
- **D3 — deployment (carried from R1, still open).** Force-recycle running Sales
  containers at activation so the new runner source and tool wording take effect
  immediately, or let them age out (up to the 420s wrapper idle timeout plus
  in-flight work).
- **D4 — verification (carried from R1, still open).** Non-customer rejection
  canary versus the next natural rejection. The canary is the only thing that
  exercises a real container round trip; nothing in the suite does.
- **D5 — convergence record.** `docs/reports/NC-20260806-001-CONVERGENCE-STATE.md`
  still shows `Current round: R1`, "Latest Claude response: pending", and
  "Current Claude session UUID: pending recovery". Out of scope for this
  artifact; needs updating by the owner or Codex.

Nothing else blocks commit. The `docs/ENGINEERING-CHANGELOG.md` entry added this
round is accurate on state ("validating … not yet committed, released, deployed,
or live-canary verified") apart from the drift sentence in D1.

## Cost

R2 review elapsed 2026-08-06T22:02:36Z → 2026-08-06T22:07:20Z (~5 minutes),
single Claude session, no subagents. Independent execution: 2 typechecks,
1 format check, 4 test invocations (197 host + 29 runner + 510 gate),
1 continuity check, 2 behavioural probes against the real exports
(recap predicate, overlong drift). Cumulative with R1: ~14 minutes.
