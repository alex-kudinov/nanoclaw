# NanoClaw engineering changelog

This is the shared, append-only engineering and operations record for Claude
Code, Codex, and human collaborators. It records change evidence, not product
marketing.

Protocol: `docs/CHANGE-PROTOCOL.md`

## Unreleased

### NC-20260802-008 — Sales routing retries and work-cycle identity are bounded

- Date: 2026-08-02T19:58Z
- Owner/client: Codex + Claude validator
- State: deployed_unverified
- Commit/PR: `aa1c82187b7fbf10050a4863bdbe8d07e87af82c` on
  `codex/nc-20260802-003-company-os-sequence`
- Change class: C3 — Slack routing and Sales operator workflow
- Affected systems: Slack routing/queue, queue-owned container provenance, IPC
  cross-channel policy, channel health, Sales instructions, focused tests
- Implementation: per-lead sends serialize before resolving/rolling anchors;
  scheduled re-post equivalence expires after six hours; every historical-root
  rejection reason has negative coverage. Connected delivery failures schedule
  bounded exponential retries, and partial multi-chunk delivery persists only
  the unsent remainder under the established root. Queue context must be active;
  same-channel non-lead Sales status may inherit that host-owned work unit, but
  explicit or inherited timestamps never cross into another channel. Resolver
  downgrade count/time and queue retry state are visible through `/health`.
- R5 review/reconciliation: Claude approved the NC-008 half and identified
  bounded follow-ups. The source-group lookup now fails closed by stripping a
  timestamp when the source cannot be registered, the downgrade counter is
  explicitly named as process-lifetime, and the six-hour prompt wording is
  measured from root creation. Resolver failure remains visibly unanchored
  rather than inventing a second lead identity; that fallback is explicitly
  declined because it would create a second lead authority.
- Verification so far: Node 22.23.2 typecheck, combined focused regression at
  7 files / 186 tests, and full regression at 144 files / 1,827 tests pass.
  Documentation continuity, schema sanitizer self-test, source formatting, and
  diff whitespace pass. Exact-session Claude Opus R6 approved with follow-ups
  and no commit/deploy blockers. Commit and deployment are now complete; live
  Sales observation remains a separate pending state.
- Deployment: the exact `aa1c821` artifact and reviewed Sales prompt are live on
  the production Mac Mini. Health reports Slack/Gmail connected, zero active or
  waiting containers, `outgoingQueueDepth=0`, `outgoingRetryAttempt=0`, and
  `leadResolverDowngradeCountSinceStart=0`. No synthetic Slack post was sent;
  one natural handoff/draft/operator-revision cycle and scheduled work card are
  still required before the operator outcome is validated.

### NC-20260802-007 — Release activation makes lock and rehearsal behavior truthful

- Date: 2026-08-02T19:58Z
- Owner/client: Codex + Claude validator
- State: complete
- Commit/PR: `aa1c82187b7fbf10050a4863bdbe8d07e87af82c` on
  `codex/nc-20260802-003-company-os-sequence`
- Change class: C5 — production activation lock and fail-closed diagnostics
- Affected systems: release activation executor/planner, macOS plist integration
  test, release/security documentation
- Implementation: the activator delegates its PID claim to macOS `shlock`,
  whose final `link(2)` claim is atomic and which refuses every extant lock. A
  dead numeric holder is reported as stale; recovery is a documented operator
  proof/removal/rehearsal sequence, not an automatic unlink that can race a new
  owner. Cleanup remains owner-checked. Dry-run proves `lsof` and `shlock`;
  pruned rollback roots and same-real-directory targets get direct errors; the
  successful rollback branch is asserted; and a Darwin-only test uses real
  `plutil` to render, lint, decode, and compare the candidate plist.
- R5 review/reconciliation: Claude's real-host probe proved that macOS
  `shlock` refuses stale locks, contrary to the first implementation's claim.
  The mock now mirrors that behavior; errors distinguish live, stale, and
  unreadable owners; dry-run proves the lock tool; docs require an operator to
  prove no activator is running before exact-path removal and a fresh rehearsal;
  and symlink aliases of the active release fail directly.
- Verification so far: Node 22.23.2 typecheck, combined focused regression at
  7 files / 186 tests, and full regression at 144 files / 1,827 tests pass.
  Documentation continuity, schema sanitizer self-test, source formatting, and
  diff whitespace pass. Exact-session Claude Opus R6 approved with follow-ups
  and no commit/deploy blockers. Commit, release build, activation, and live
  infrastructure verification are now complete.
- Release/deployment: Node 22.23.2 built archive
  `nanoclaw-aa1c82187b7f.tar.gz` with SHA-256
  `74865da1899008cca7cf533c716a7b84fea4ec44e5c247d17ad87e7913a1d60a`;
  the target contains 512 verified artifact files with digest
  `491a8c12f7398000dedceea0d89f54e865ba0df72e0da465f6ec482063e502d6`.
  Production dry-run changed exactly the executable, code root, and expected
  commit, then apply switched `23ffb07` → `aa1c821` and retained rollback plist
  `com.nanoclaw.plist.rollback-23ffb07d4751-2026-08-02T20-39-35-826Z`.
- Live verification: the installed plist, in-place bundle, and operational
  Sales prompt match the reviewed release. A first immediate post-switch health
  request sampled retiring PID 7169 while launchd/listener had advanced; a
  subsequent no-cache probe converged on PID 14460 across health, `lsof`,
  launchd, and `ps`. Health proves commit/root match, Node 22.23.2, both channels
  connected, and no active/waiting containers; the activation lock is absent.

### NC-20260802-006 — Sales channel roots are inbound work items, not draft broadcasts

- Date: 2026-08-02T18:22Z
- Owner/client: Codex + Claude validator
- State: deployed_unverified
- Commit/PR: `93e8d00cbe2525436c4202e412af2c278efafff0` on
  `codex/nc-20260802-003-company-os-sequence`
- Change class: C3 — Slack routing and Sales operator workflow
- Affected systems: lead-key derivation, Slack anchor lifecycle/broadcast policy,
  Sales and Inbox prompts, project map, focused routing tests
- Trigger: the operator confirmed Sales still scattered drafts arbitrarily
  between channel and thread. The host explicitly set `reply_broadcast=true` on
  lead-anchor replies and applied the generic anchor TTL, so even correctly
  anchored drafts appeared in the channel timeline and old threads could roll
  into new top-level posts.
- Implementation: every inbound `*→sales` handoff and every scheduled
  `[FOLLOW-UP]`/`[COLD]` control card now starts a fresh top-level work-item root
  and repoints the lead anchor. All subsequent lead cards,
  revisions, status, approvals, and handoffs resolve quietly inside that root;
  they never broadcast and never roll merely because the generic TTL elapsed.
  A host-recorded older root remains valid after the same lead gets a newer work
  item, so concurrent cycles do not steal each other's drafts. The runner now
  labels output with its container identity and the host defaults omitted Sales
  `thread_ts` values from that exact queue-registered work unit; older cycles no
  longer depend on the model to originate their root. A repeated scheduled card
  with the same stored marker/lead is treated as a revision, not a second root.
  Quoted handoff
  markers cannot start work; partial long-message retries reuse the root already
  established by chunk one. Reconnect delivery re-enters the same router.
- Verification: the post-R3 focused release/Sales/IPC/queue suite passes (7
  files / 178 tests); Node 22.23.2 typecheck passes.
  Combined full Node 22.23.2 suite passes serially (143 files / 1,810 tests), including
  the isolated-worktree Chaos reconciler fixture after its logger mock was made
  independent of a local `.env` file. Typecheck passes; remaining gates are
  Claude implementation review and reconciliation. Source formatting,
  documentation continuity, and diff checks passed before R2. Claude Opus 5 R2
  approved NC-003 with follow-ups and found two NC-006 blockers; the scheduled
  work-item and host-recorded historical-root changes above reconcile both.
  Claude Opus 5 R3 then approved with follow-ups and no commit/deploy blockers.
  The exact-session R4 delta review also approved with follow-ups and no commit
  or deploy blockers, independently reproducing 7 files / 178 focused tests.
  Its bounded scheduled-cycle, active-state, and non-lead inheritance findings
  are recorded under planned task NC-008 rather than hidden in review prose.
- Pre-deployment boundary: no Slack message, database row, installed prompt,
  service, or production process was changed. Live behavior requires a separate
  reviewed deployment and one real handoff/draft/revision observation.
- Deployment addendum: the NC-006 runtime and prompt shipped as part of exact
  release `aa1c82187b7fbf10050a4863bdbe8d07e87af82c`. Release identity, prompt
  hash, channel connections, listener ownership, and idle queue are verified.
  No synthetic Sales message was posted, so the natural handoff/draft/revision
  observation remains pending.

### NC-20260802-003 — Release activation is one validated, rollback-safe identity switch

- Date: 2026-08-02T18:15Z
- Owner/client: Codex + Claude validator
- State: complete
- Commit/PR: `93e8d00cbe2525436c4202e412af2c278efafff0` on
  `codex/nc-20260802-003-company-os-sequence`, based on deployment-record commit
  `0f20224`
- Change class: C5 — production release activation and runtime provenance
- Affected systems: release integrity/health, release bundle inventory,
  installed launchd activation procedure, release/security/project-map docs
- Trigger: the `23ffb07` deployment exposed a two-field coordination gap: code
  root and expected commit were updated separately, while the tracked plist also
  differed from machine-local Node and runtime settings.
- Implementation: production startup reports and enforces the resolved code
  root against the verified release. The new dry-run-by-default activator parses
  the installed plist, permits exactly three identity changes, verifies current
  rollback and target bundles plus the actual interpreter and candidate plist,
  captures an exclusive rollback file, performs one bounded switch, requires
  commit/root proof from health, and restores once on failure. Apply is guarded
  by a fixed exclusive lock; rollback health is verified without masking the
  original failure. An explicit `--recover-from-down` path repairs a stopped or
  unhealthy current daemon without weakening bundle, interpreter, hostname, or
  target-health checks. Atomic `shlock` claiming refuses every extant lock; a
  dead holder gets an explicit operator recovery runbook rather than a racy
  automatic unlink. Host tool probing is proven before mutation, and lock
  cleanup cannot mask activation evidence. The release bundle includes the
  activation command.
- Validation so far: Node 22.23.2 typecheck passes; focused release integrity,
  activation planning, and activation executor tests pass (3 files / 21 tests);
  combined full suite passes serially (143 files / 1,810 tests) with normal local-server
  permissions; independent
  agent-runner build/tests pass (3 files / 22 tests); production build and CLI
  help load successfully. The first sandboxed webhook attempt was invalid only
  because socket binding was denied and is not counted as a product failure.
  Continuity, source formatting, and diff checks passed before R2. Claude Opus 5
  R2 approved this slice with follow-ups; its activation-lock, rollback-report,
  stopped-daemon recovery, and path-normalization findings are now reconciled
  and path-normalization findings were reconciled. Claude Opus 5 R3 approved
  with no blockers. The exact-session R4 delta review also approved with
  follow-ups and no commit or deploy blockers, independently proving the
  focused 7-file / 178-test delta and the host `lsof` command shape. Its
  double-reclaimer stale-lock race and dry-run probe-placement findings are
  recorded under planned task NC-007; the race must close before the first
  production `--apply`.
- Deployment: exact release `aa1c82187b7fbf10050a4863bdbe8d07e87af82c`
  successfully exercised the dry-run and apply paths on the production Mac
  Mini, atomically changing only the three release-identity fields from
  `23ffb07`. The subsequent no-cache health probe, `lsof`, launchd, and `ps`
  converged on sole PID 14460 with `codeRootMatchesRelease=true`; the rollback
  plist remains available and the activation lock was cleaned up.

### NC-20260802-002 — Container timeout is an absolute lifetime, including after adoption

- Date: 2026-08-02T17:03Z
- Owner/client: Codex
- State: deployed_unverified
- Commit/PR: `23ffb07d47512ae9c889a87328ff71dc38b443f8` on
  `codex/nc-20260802-001-release`
- Change class: C3 — production container lifecycle and queue capacity
- Affected systems: `src/container-runner.ts`, `src/index.ts`, focused timeout
  tests, production NanoClaw release
- Trigger/evidence: the NC-001 restart adopted the still-live
  `nanoclaw-sales-1785689606073` run. It continued emitting heartbeats well past
  the Sales group's configured runtime and was adopted again on restart.
- Root cause: heartbeat and output markers called `resetTimeout()`, so the
  documented hard timeout measured inactivity rather than total runtime.
  `adoptSidecarContainer()` then applied no deadline based on the sidecar's
  durable `startedMs`; adopted states are deliberately excluded from the queue's
  duplicate liveness cleanup.
- Intended fix: calculate one effective absolute lifetime, never extend it for
  heartbeats/output, reject already-expired sidecars, and schedule adopted runs
  to stop at the remaining original deadline. Heartbeats continue to prove
  liveness for freeze/spawn checks; they no longer grant runtime extensions.
- Verification: 37 focused container-runner/group-queue tests pass, including
  a heartbeat immediately before the deadline and adopted remaining-lifetime
  arithmetic; typecheck, targeted formatting, diff check, release verification,
  and the 30-row continuity check pass.
- Deployment: exact archive SHA-256
  `627f981166f05860b4869de2df0a989cd65ba3723486ad87114de088cfc91487`
  was independently verified locally and on the Mac Mini, then activated at
  `/Users/xbohdpukc/.local/share/nanoclaw-releases/23ffb07d47512ae9c889a87328ff71dc38b443f8`.
  Fresh health reports release verified, Node 22.23.2, Slack/Gmail connected,
  one launchd-owned listener, and zero active/waiting containers. The named
  stale Sales container had exited before this restart, so the next natural
  wall-clock expiry remains the live outcome check; no synthetic stale work was
  created.

### NC-20260802-001 — MrGru grader file delivery is host-owned and idempotent

- Date: 2026-08-02T16:28Z
- Owner/client: Codex
- State: complete
- Commit/PR: isolated release branch `codex/nc-20260802-001-release` based on
  `0a39380`; exact release commit recorded by the deployment evidence
- Change class: C5 — new container-to-host file capability and external Slack
  side-effect boundary
- Affected systems: container MCP, per-group IPC attachments, host IPC watcher,
  Slack root/file persistence, shared toolbox, Heartbeat grading procedure
- Trigger: the enabled Brave file input could not be driven through the browser
  extension bridge, making each Heartbeat attachment require a native picker and
  visual Slack inspection. MrGru already has `files:read` and `files:write`; no
  OAuth change was required.
- Implementation: `send_grader_file`/`slack_file_message` is accepted only from
  the registered main group or `chief`, fixes the target to `grader`, validates
  real path, regular-file type, 25-MB ceiling, size and SHA-256, then snapshots
  the bytes. A request-bound pending receipt precedes Slack; completion records
  the root timestamp. Pending/uncertain and completed duplicates never repost.
- Slack contract: post one clean root, upload the source artifact into its
  thread with `filesUploadV2`, then persist an inline-readable copy so the grader
  wakes only after upload success. Failed upload attempts best-effort delete the
  file-less root and do not wake the grader.
- Operator surface: shared `slack/post-grader-file` stages only from macOS temp
  roots or Downloads over the existing authenticated SSH route to the production
  Mac Mini, fails closed until its compiled runtime advertises support, emits
  official IPC, waits for the receipt, and returns the root timestamp. The
  Heartbeat skill now prefers this path and uses visual Slack/native picker only
  as a fallback.
- Registration drift closed: `scripts/register-grader.ts` now tracks the
  already-documented one-root/one-container behavior, instant mechanical
  processing line, and 30-second grader idle timeout. Re-registration therefore
  preserves five-way batch concurrency and releases one-shot warm capacity
  instead of silently reverting to channel serialization and the 20-minute
  global idle default.
- Verification under the direct Node 22.23.2 executable: root typecheck passes;
  focused suite passes (3 files / 88 tests); full suite passes (141 files /
  1,777 tests); independent agent-runner build and tests pass (3 files / 22
  tests); targeted Prettier and `git diff --check` pass; continuity check passes
  with 29 active/ready rows and changelog entries. Toolbox registry JSON, shell
  syntax, discovery, and an isolated temp-root queue dry run pass. The isolated
  release candidate changes only `channels/slack.js`, `index.js`, `ipc.js`, and
  the new `grader-file-message.js` relative to the running host modules; the
  remaining removed JavaScript files are stale test or dormant-channel build
  artifacts.
- Deployment/canary: the first exact production release was commit `3368831`;
  it was superseded by timeout-fix release `23ffb07` without changing the grader
  delivery contract. Release-mode health verifies the exact commit/artifact and
  Node 22.23.2 with Slack/Gmail connected. Sanitized file delivery produced
  Slack root `1785690984.409549`, file `F0BM10JEXN3`, a durable complete receipt,
  and exactly one grader wake. The grader safely flagged the synthetic identity
  instead of emitting a learner verdict. Replaying the same adapter request
  after the final release returned the same root/file with `duplicate: true` and
  no repost. MrGru already had `files:read` and `files:write`; no OAuth mutation
  occurred.
- Deployment lessons: production launchd requires legacy `unload`/`load`; the
  release root resolves pinned dependencies from the shared parent
  `nanoclaw-releases/node_modules`; and both `NANOCLAW_CODE_ROOT` and
  `NANOCLAW_EXPECTED_RELEASE_COMMIT` must be changed together. The rollback plist
  is `com.nanoclaw.plist.pre-23ffb07`.

### NC-20260731-003 — One real Node 22 release replaces the production hand patches, and per-lead status lines anchor by entry id

- Date: 2026-07-31T18:05Z
- Owner/client: Claude Code
- State: deployed_unverified
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `0a39380`;
  production now runs a compiled artifact, not hand patches
- Change class: C3 — production runtime, release process, Slack threading
- Affected systems: Mac Mini runtime and launchd, NanoClaw `dist/`, Slack
  outbound threading, `~/dev` source propagation
- Trigger: `rescueUnhandedSends` was built and tested but undeployed; production
  `dist/` was hand-patched; per-lead status lines still posted at channel root.
- Root cause of the deployment blockage: the `~/dev` Syncthing folder is paused
  on the Mac Studio, so the Mini's `src/` had been frozen at `a6e4b13` since
  before NC-004. The Mini's Syncthing reported `idle / needFiles: 0`, which is
  true of a receiver whose sender is paused and therefore proves nothing. Any
  `npm run build` on the Mini would have silently reverted NC-004 — the reason
  the fixes were hand-patched in the first place.
- Second blocker, found in pre-flight rather than in production:
  `verifyRuntimeRelease()` asserts an exact `.nvmrc` Node match on both the
  manifest-present and manifest-absent paths, with no escape hatch. The Mini ran
  Node 25.8.2 against a `22.23.2` pin. The previously deployed `index.js`
  predated the guard, so nothing had failed yet; a fresh build would have
  crash-looped, and launchd throttling would have kept it down.
- Fix: installed Node 22.23.2 at `~/.local/node/22.23.2`, repointed
  `com.nanoclaw.plist` at it, rebuilt `better-sqlite3` for that ABI, reconciled
  the Mini's `src/` with the Studio worktree, and deployed one compiled artifact.
  Verified by rebuilding on the Mini and hash-comparing to the deployed tree —
  identical, so the host can now rebuild without reverting anything. Import
  pre-flight over all 125 modules reported zero unresolved specifiers; restart
  produced `runs = 1` and an empty error log.
- Also shipped by this release: the NC-004 (P1-1, P1-2, P2-1) and NC-002 (P1-1,
  P1-2) remediations, which had been fixed in source on 2026-07-30 but were
  stranded behind the stale `dist/`.
- Threading change: `deriveLeadEntryRef` reads the pipeline entry id out of a
  per-lead status line and `lead-email-resolver.ts` resolves it to the lead's
  address, so "Lead #611 …" and "[NO ACTION] Entry #85 …" join the same
  `lead:{email}` thread as the card and the send. Narrow by construction: the id
  must open the message and the message must name exactly one entry, because a
  false merge is worse than no merge. Resolver failures are logged and drop the
  anchor rather than the message. 140 files / 1,760 tests pass.
- Record correction: the Mac Mini does **not** sleep overnight. 61 days uptime,
  no sleep/wake events, and 1,590 Gmail pushes processed between 00:00 and 08:00
  — 279 during the hour it was reported down. The unreachability is
  `macmini-eth.kudinov.com` → `192.168.1.50` on `en8`, which holds a `/32`
  netmask on a `/24` LAN and answers ICMP but not TCP. Use `192.168.1.171` or
  `100.115.115.206`. `en8` carries the default route and was left alone.

### NC-20260731-002 — The host lead anchor outranks an agent-supplied thread_ts

- Date: 2026-07-31T16:18Z
- Owner/client: Claude Code
- State: deployed_unverified
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `0a39380`;
  production carries a hand-patched `dist/channels/slack.js`
- Change class: C2 — operator-facing Slack threading; no external send path
- Affected systems: Slack outbound threading for lead-bearing messages
- Trigger: for Entry #871 sales replied in the lead's thread with
  "[draft updated]" and then posted the updated draft into the channel.
- Root cause: `sendMessage` consulted the host-derived lead anchor only when the
  caller passed no `threadTs`. The agent passed one — `1785510996.909199`, a
  timestamp that does not exist, apparently retyped from the `ts` attributes in
  its prompt (the thread root is `…909209`; the operator's in-thread reply ends
  `.509199`). Slack silently posts an unknown `thread_ts` to the channel. The
  anchor table held the correct root the whole time.
- Fix: a derived `leadKey` now outranks an agent-supplied `threadTs`, extending
  the principle already stated in `lead-thread-key.ts` to the last place the
  agent could override the host. `opts.threadKey` is agent-supplied and keeps its
  old, lower precedence, so non-lead threading is untouched.
- Files: `src/channels/slack.ts`, `src/channels/slack.test.ts`,
  `docs/ACTIVE-WORK.md`, this entry.
- Verification: pinned Node 22.23.2 — typecheck passes; full suite **138 files /
  1,720 tests** passes; format passes. The regression test was proven to fail
  against the old precedence before being accepted; the pre-existing
  "explicit threadTs wins over threadKey" test still passes unmodified.
- Deployment: `dist/channels/slack.js` hand-patched, daemon restarted
  (pid 20788). Backup `/tmp/slack.js.bak-*`. Still not a build from source — the
  Mini's `src`/`dist` divergence (NC-20260730-005) remains the blocking issue.
- Rollback/recovery: restore the backup and restart.
- Follow-up: per-lead status lines with no labelled address field still post at
  channel root, because the anchor can only be derived from an email address.
  Resolving `Lead #<id>` / `Entry #<id>` to the party email host-side would close
  it, at the cost of a business-DB lookup on the Slack send path.

### NC-20260731-001 — One wake rule for cross-group handoffs, at the single consumer

- Date: 2026-07-31T15:33Z
- Owner/client: Claude Code
- State: deployed_unverified
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `0a39380`;
  production carries a hand-patched `dist/db.js`
- Change class: C3 — controls whether an approved customer email is ever composed
- Affected systems: host message loop (`getNewMessages`), IPC handoff routing,
  every channel that delivers a cross-group handoff
- Trigger: `[HANDOFF: mailman→sales]` for Entry #871 routed and posted to
  `#gru-sales` at 15:16:36Z; sales never spawned and no draft was produced.
- Root cause: `getNewMessages` — the only query that can start a container —
  excluded every `is_bot_message = 1` row. A cross-group handoff is host-authored
  and therefore a bot row, so it could not wake its target. It only rode along as
  context when something else happened to wake that group.
  `NC-20260730-005` patched this for non-Slack targets by flipping the flag in
  `ipc.ts`; Slack targets self-persist via `channels/slack.ts:1203` and were
  still broken. Every channel has its own persistence path, so a per-producer fix
  cannot hold.
- Fix: the rule now lives once, at the consumer. Human/inbound wakes; a group's
  own echo never wakes it (the 2026-07-05 noop-container swarm guard); a row
  whose `from_group` differs from the channel's owning folder wakes the target.
  Unknown owner keeps the previous conservative behaviour. `src/index.ts` supplies
  the jid→folder map; `src/ipc.ts` reverts to a uniform `is_bot_message: true` so
  the flag stops encoding routing semantics.
- Files: `src/db.ts`, `src/index.ts`, `src/ipc.ts`, `src/db.test.ts`,
  `src/ipc-handoff-echo.test.ts`, `docs/ACTIVE-WORK.md`, this entry.
- Verification: pinned Node 22.23.2 — typecheck passes; full suite **138 files /
  1,719 tests** passes; `npm run format:check` passes. New cases cover
  wake-on-cross-group, no-wake-on-own-echo, no-wake-on-untagged-host-noise,
  cursor advance past suppressed rows, and the unknown-owner path.
- Deployment: `dist/db.js` hand-patched with the rule expressed purely in SQL (a
  correlated `registered_groups.folder` lookup), validated against live rows
  before restart, daemon restarted (pid 2469). Two minutes of observation showed
  one container spawn — no spawn storm. Backup `/tmp/db.js.bak-*`. Still not a
  build from source; the Mini's `src`/`dist` divergence from NC-20260730-005 is
  unresolved.
- Operator-authorized data change: one `store/messages.db` row flipped to wake
  sales for Entry #871 before the fix shipped; the card posted at 15:26:45.
- Coordination: `src/ipc-handoff-echo.test.ts` gained a concurrent Codex
  assertion on the producer flag. It was relaxed, not removed — the behaviour is
  still covered by the consumer rule and the new `db.test.ts` cases.
- Rollback/recovery: restore `/tmp/db.js.bak-*` and restart to return to the
  suppressed-handoff behaviour; revert the five source files to undo the fix.
- Follow-ups:
  1. Per-lead status lines (e.g. "Lead #611 …", "[NO ACTION] Entry #85 …") carry
     no labelled address field, so `deriveLeadThreadKey` yields nothing and they
     post at channel root instead of the lead's thread. The Entry #871 draft card
     itself threaded correctly. Resolving `Lead #<id>` / `Entry #<id>` to the
     party email host-side would close it without trusting the agent.
  2. A routed handoff that produces no target spawn within one poll interval
     should alert on its own — carried over from NC-20260730-005 and now twice
     demonstrated.

### NC-20260730-006 — Observable email handoffs and provenance-bearing releases

- Date: 2026-07-31T01:52Z
- Owner/client: Codex; Claude review pending
- State: validating
- Commit/PR: uncommitted composite worktree on
  `codex/continuity-reconciliation` @ `0a39380`; the previously staged
  `NC-20260730-003/004` slice is preserved in the index
- Change class: C5 — email-send observability plus fail-closed production
  startup, artifact provenance, service runtime, and deployment contract
- Affected systems: Sales/Mailman prompt contract; host IPC and message loop;
  SQLite pending-send schema; watchdog; daemon health; build/release scripts;
  exact Node pin; launchd/setup; container code source; architecture, security,
  project map, schema reference, active work, and release runbook
- Outcome:
  - Sales is instructed and contract-tested to process one approved lead per
    turn, make the typed `send_message` call, emit no final prose after a
    successful handoff, and omit rather than invent a missing Thread-ID;
  - the host records the durable handoff and actual Mailman process start as
    separate stages, alerts once when the latter never occurs, and retains the
    later Gmail-confirmed-send expectation;
  - a PostgreSQL-realistic bigint-string regression exercises the stored
    non-bot handoff, Mailman-visible SQLite read, and real Gmail handler path;
  - the Mailman-start join uses both source group and recipient so concurrent
    workflows to one address cannot satisfy each other;
  - production startup verifies the complete compiled file set, exact build and
    runtime Node `22.23.2`, manifest schema, and operator-pinned full commit
    before initializing external systems;
  - `/health` includes the verified non-secret release identity;
  - a clean-commit builder produces a manifest and checksummed archive; the
    independent verifier rejects compiled tampering, malformed metadata,
    unlisted bundle files, duplicate/escaping inventory paths, release-manifest
    disagreement, wrong Node, and wrong expected commit;
  - container skills and agent-runner source resolve from
    `NANOCLAW_CODE_ROOT`, allowing immutable release code with the established
    operational checkout as working/state directory.
- Declared residual: writable live group workspaces are not yet
  cryptographically bound to the archived prompt copies. Deployment must
  compare/copy reviewed prompt files and record hashes; separating immutable
  instructions from writable group output remains follow-up architecture.
- Verification under Node `22.23.2`:
  - root typecheck passes;
  - focused email/release/setup set passes **11 files / 122 tests**;
  - complete serial suite passes **138 files / 1,715 tests** outside the
    restricted sandbox required by its loopback/IPC tests;
  - independent agent-runner build and **3 files / 22 tests** pass;
  - repository TypeScript format check and both staged/unstaged diff checks
    pass;
  - documentation continuity passes **25 active/ready rows / 25 changelog
    entries** after updating the exact-Node assertion.
  - production TypeScript build passes, and `npm run release:build` was
    deliberately exercised against this dirty review worktree: it refused
    before compilation/packaging with the required clean-commit error.
  - the full-suite webhook test's guessed fixed-port range collided twice with
    macOS listeners (`rapportd` owns `49152`); tests now request a
    kernel-assigned ephemeral port. The webhook suite passes twice
    independently (**35/35**) and the following full suite is clean.
- Deployment/migration: not yet performed. The SQLite columns are additive at
  daemon initialization. No customer email, Procurement gate, healer action,
  production database write, service restart, or external message occurred
  during this implementation/validation boundary.
- Rollback/recovery: restore the prior service pointer and reviewed Sales prompt
  files, then verify the prior full commit and channels. Retain additive SQLite
  columns. Full procedure: `docs/RELEASE-INTEGRITY.md`.
- Next: obtain Claude's adversarial review of the composite dirty-worktree
  boundary; reconcile findings; commit the already staged Procurement slice and
  this email/release slice without unrelated knowledge/copier/renderer changes;
  build the clean artifact; deploy and live-verify the exact commit.

### NC-20260730-005 — Approved sales email reaches the customer again

- Date: 2026-07-30T22:47Z
- Owner/client: Claude Code + Codex reconciliation
- State: validating
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `0a39380`;
  production carries two hand-patched `dist/` files
- Change class: C3 — customer-email execution path; one email delivered
- Affected systems: Gmail IPC recipient verification, Gmail search
  authorization, host IPC handoff routing, `store/messages.db` (three
  operator-authorized mutations), Mac Mini daemon (two restarts)
- Trigger: an approved draft for Lead #962 produced only `[SEND NOT OBSERVED]`
  with no `[EMAIL BLOCKED]`, no quarantine entry, and no explanation.
- Outcome:
  - `gmail_send` with a `lead_id` works again. Party IDs are `bigint`, returned
    by node-postgres as strings, and were compared with `!==` against the
    agent's JSON number — so `11119 !== '11119'` blocked every send with the
    reason "claimed party 11119 does not match host-resolved party 11119".
    Regression from `NC-20260729-004`; blocked the whole outbound sales path
    because `groups/mailman/OUTBOUND-EMAIL.md` requires `lead_id` on every call.
  - a `sales→mailman` handoff can now wake mailman. The host stored it with
    `is_bot_message: true` while `getNewMessages` — the only loop that starts a
    container — filters bot rows, and the Gmail channel's `sendMessage` is a
    no-op. Handoffs were invisible to the spawn loop and only rode along when an
    unrelated inbound email woke mailman anyway. Pre-existing; masked by inbound
    volume until a quiet mailbox exposed it.
  - a bare-address `gmail_search` is normalized to `from:X OR to:X` instead of
    being quarantined; queries carrying operators or extra terms are still
    refused, and the executed query now equals the authorized one.
- Test-integrity fix: `gmail-ipc-handlers.test.ts` mocked party IDs as JS
  numbers, which is why 1,661 tests passed while production could not send. The
  mock now reproduces bigint-as-string. Against the original code the corrected
  suite fails 6 tests; it previously failed none.
- Files: `src/gmail-ipc-handlers.ts`, `src/gmail-ipc-policy.ts`, `src/ipc.ts`,
  `src/gmail-ipc-handlers.test.ts`, `src/gmail-ipc-policy.test.ts`,
  `docs/ACTIVE-WORK.md`, this entry.
- Verification: pinned Node 22.23.2 — typecheck passes; full suite **134 files /
  1,695 tests** pass; `npm run format:check` passes; `git diff --check` passes.
  The regression test was proven to fail against the original code before being
  accepted.
- Deployment: both fixes applied to the Mac Mini's compiled `dist/` by hand and
  the daemon restarted (pids 61600, 65516). **Not** a build from source — see
  the integrity note below. One customer email delivered at 22:42:02Z (message
  `19fb5311a98be747`), body byte-identical to the approved draft and recovered
  from `store/messages.db` rather than regenerated; interaction logged and the
  `pending_sends` expectation cleared by the confirmed send.
- Integrity problem, open: production `dist/` does not correspond to the Mini's
  `src/`. `verifyPartyRecipient` exists only in the compiled artifact, and
  `npm run build` on that host would silently revert the entire
  `NC-20260729-004` Gmail boundary. Both fixes therefore had to be applied to
  `dist/`. Backups at `/tmp/gmail-ipc-handlers.js.bak-*` and `/tmp/ipc.js.bak-*`.
- Rollback/recovery: restore the two `dist/` backups and restart to return to
  the blocked-send state; revert the five source files to undo the fixes.
- Follow-ups:
  1. Reconcile the Mini's `src/` with reviewed source and redeploy from a real
     build. Until then no host rebuild is safe.
  2. Sales emitted the handoff as final assistant text instead of calling
     `mcp__nanoclaw__send_message`, so nothing routed at all — the original
     stall. It made a correct call for a different lead 16 seconds earlier in
     the same run. Prompt hardening (one lead per approval turn; handoff must be
     a tool call, never prose; never a `Thread-ID` placeholder) is unowned.
  3. `[SEND NOT OBSERVED]` remains the only operator-visible signal when the
     failure is upstream of the Gmail handlers. A routed handoff that produces
     no mailman spawn within one poll interval should alert on its own.
- Codex pickup 2026-07-31T01:52Z: all three source fixes are now included in
  the Node-22-green composite worktree. `NC-20260730-006` closes follow-ups
  1-3 with typed-handoff prompt rules, Mailman-start observability, and a
  clean-commit release boundary. The production hand patches remain active
  until that reviewed source is committed and deployed.

### NC-20260730-004 — Default-off CaleProcure collection and named-human review

- Date: 2026-07-30T19:14Z
- Owner/client: Codex
- State: deployed_unverified
- Commit/PR: uncommitted Procurement slice on
  `codex/continuity-reconciliation` @ `bc8a71b`; production was built from the
  isolated release recorded below, not from the shared dirty checkout
- Change class: C5 — Slack identity/authorization boundary plus production
  migration, agent image, host artifact, prompt activation, and service restart
- Affected systems: migration 114, Procurement intake/review policy, host IPC,
  Slack card transport and inbound human messages, container MCP, Procurement
  prompt/procedure/schema, environment example, architecture/security/project
  map, resurrection plan, and continuity records
- Outcome:
  - adds a Procurement-only, maximum-200-row CaleProcure IPC whose host supplies
    observation time and owns strict validation, batch hashing, run-key
    idempotency, deduplication, parameterized writes, and terminal run evidence;
  - keeps that write path off unless
    `PROCUREMENT_CALEPROCURE_INGEST_ENABLED=1`;
  - generates review cards from current database queue truth, anchors them to
    `procurement:opp:{id}`, and durably binds opportunity/version, Slack
    channel/message, action epoch, recommendation, and reason;
  - accepts only an exact, reason-required `DECIDE` command inside the bound
    card thread from a Slack UID in `PROCUREMENT_OPERATOR_UIDS`, with both the
    review enable flag and current epoch present;
  - atomically consumes the open card and optimistic review version, so wrong
    callers, unnamed users, root commands, unrecorded cards, stale versions,
    old epochs, and replays fail closed;
  - keeps reactions advisory-only and preserves manual registration, email,
    proposal commitments, submission, signature, attestation, and terms.
- Files: `.env.example`; migration 114; `src/procurement-{policy,review}*`;
  Procurement intake/IPC plus tests; Procurement IPC watcher authorization
  test; root index/IPC; agent-runner MCP; Procurement prompt, CaleProcure
  procedure, schema/DB references, architecture, security, project map,
  resurrection plan, active work, and this changelog.
- Verification:
  - pinned Node 22.23.2 typecheck passed;
  - 104 focused tests passed across 9 files, covering typed intake, policy,
    card binding, wrong caller/user/thread, disabled gates, stale/replay
    rejection, migration grants, email/Gmail containment, and host routing;
  - pinned Node 22.23.2 complete serial suite passed 134 files / 1,685 tests;
  - independent `container/agent-runner` build and 3 files / 22 tests passed;
  - repository formatting, schema-sanitizer self-test, documentation continuity
    (23 active/ready rows, 22 pre-entry changelog entries), and
    `git diff --check` passed at the full-suite snapshot;
  - after that snapshot, concurrent `NC-20260730-002` edits made the current
    root typecheck fail at `src/healer/approval.ts:63`. Repository-wide
    formatting, the current Procurement-focused 104 tests, schema sanitization,
    final 23/23 continuity check, and diff checks pass. This task does not
    rewrite the Healer fix.
- Deployment/migration: none. Migration 114 is unapplied. The example
  collection/review flags are off, the epoch/operator list is empty, and no
  live configuration was inspected or changed.
- Rollback/recovery: before deployment, discard only NC-20260730-004-owned
  source/docs and restore the prior staged migration 114 version. After an
  authorized migration, disable both gates and roll back host/runner/prompt
  source first; retain additive audit rows unless a separately reviewed
  retention migration is approved.
- Documentation: reconciled the old direct-SQL CaleProcure procedure with the
  typed host path and documented exact authority, default state, deployment
  boundary, and canary sequence.
- Follow-ups: review the combined `NC-20260730-003/004` slice; name primary and
  backup Slack operator IDs; authorize backup/precondition inspection,
  migration 114, gates-off dark deployment, and synthetic denial/success
  canaries separately. Schedule cutover and all Bonfire work remain unapproved.

#### Addendum 2026-07-30T21:53Z — migration-first gates-off production deployment

- Authorization and isolation: the user explicitly authorized migration and
  deployment at 2026-07-30T21:34Z. The release was reconstructed from the
  previously deployed `1689527` host base plus only Procurement-owned
  source/prompt/runner files. The production checkout's 96 pre-existing dirty
  paths and committed `NC-20260730-002` Healer slice were not used as the host
  build source.
- Preflight: one healthy daemon and listener, zero active containers, both
  Procurement gates off, no operator IDs or review epoch, all three expected
  database roles present, 309 legacy opportunity rows, and none of the migration
  114 control-plane relations present.
- Boundary correction before migration: live inspection showed the legacy
  `nanoclaw_procurement` role still had direct `SELECT/INSERT/UPDATE`. Migration
  114 now enables row-level security: admin retains full access, readonly
  retains full read, and Procurement can directly read/insert/update only
  source-keyless `source='bonfire'` rows. New CaleProcure/email rows remain
  host-owned and are exposed only through the bounded queue view.
- Recovery: restricted backup
  `~/.local/share/nanoclaw-deploy-backups/NC-20260730-004-20260730T2146Z`
  contains the prior runtime/prompts, a native PostgreSQL dump, and the current
  agent image retained as
  `nanoclaw-agent:rollback-NC-20260730-004-20260730T2146Z`. The runtime archive
  SHA-256 is `ac0392c6f981618f9664e2ea174daefc2e80907fbf00d700f6b902a623beb36e`;
  the database dump SHA-256 is
  `cd432848c3ad4ce1cefad78f6a9662abfc96a635b19f28aaa627894d35493f5d`.
  An earlier `...T2145Z` directory is an incomplete, unused backup attempt.
- Release evidence: archive
  `~/.local/share/nanoclaw-releases/NC-20260730-004-20260730T2136Z` was copied
  from SHA-256
  `1e4b402aacf953addc01ce532d2adbfffc50ef9591cf3f2fb77e354656a3e18d`.
  Local pinned Node 22.23.2 typecheck/build, 87 focused pre-RLS tests, 26
  focused post-RLS tests, and the independent runner build/tests passed. The
  isolated full run passed 1,661 of 1,662 tests; its only failure was the
  pre-existing `webhook-server.test.ts` ephemeral-port race. On the target's
  unpinned Node 25.8.2, root typecheck/build and 87 focused tests passed. A
  fresh Node 22 agent-image build compiled the runner and a no-credential
  container canary found both Procurement MCP symbols.
- Migration: migration 114 committed successfully in one transaction. The
  three control tables, queue view, and six functions exist; all four new
  queue/control row counts are zero; all 309 legacy opportunities remain.
  Procurement directly sees 298 source-keyless Bonfire rows and zero
  source-keyed/non-Bonfire rows; readonly/admin each see all 309. A direct
  CaleProcure insert under the Procurement role was denied and left zero
  sentinel rows.
- Activation: the byte-exact host `dist/`, Procurement prompt/schema/procedure,
  and schema references were activated; the prior host artifact remains at
  `dist.pre-NC-20260730-004-20260730T2152Z`. The built agent image became
  `nanoclaw-agent:latest` at digest
  `sha256:004e711111abf9fdde65cf26a58b24894c8414ba77d89432e63613eb90e73c7f`.
  Launchd restarted successfully at 2026-07-30T21:52:49Z.
- Live verification: exactly one daemon (PID 42265) owns the single `:8088`
  listener; `/health` reports Slack and Gmail connected. Host `dist/` and the
  three Procurement prompt/procedure files are byte-exact to the release.
  The live artifact resolves collection `false` and review `false` with zero
  operators and no epoch. The existing daily `0 8 * * *` task was not changed.
  Restart resumed two unrelated Sales/Contador containers; they were not
  stopped or inspected.
- State boundary: migration and dark deployment are live, but no Procurement
  batch, observation, review card, decision, schedule change, browser action,
  email/message, proposal, or submission was performed. State remains
  `deployed_unverified` until an explicitly approved gates-on synthetic fixture
  and named-human review canary complete; business outcomes remain unvalidated.

### NC-20260730-002 — Fail-closed healer action boundary and completion plan

- Date: 2026-07-30T18:13Z
- Owner/client: Codex
- State: deployed_unverified
- Commit/PR: `bc8a71b62ca952d7d919144f91609e761d382641` on
  `codex/continuity-reconciliation`; not pushed
- Change class: C5 — host command, restart, and self-modification authorization
- Affected systems: healer action policy, proposal/approval lifecycle,
  automatic reruns, daemon restart, code implementation, diagnosis trust,
  tracked fast-healer configuration, security and self-healing authorities
- Outcome:
  - added one default-off action boundary above model-authored healer commands,
    automatic reruns, and implementation while leaving collection, digest,
    heartbeat observation, and read-only diagnosis available;
  - replaced the any-non-bot approval fallback with an explicit operator
    allowlist and required action epoch;
  - host-bound executable proposals to expiring one-time nonces, rechecked
    policy/trust/class/fix/review at the final boundary, and atomically claimed
    approval, implementation, and automatic-rerun work before execution;
  - made failed, missing, or unparsable adversarial review manual-only; an
    initial refutation requires the independent tie-breaker to issue a passing
    synthesized review before execution;
  - recorded exact approvers, redacted command/output audit data, recovered
    stale claims, and prevented completed draft PRs from entering the shell
    approval queue;
  - separated fixed, capped daemon recovery into default-on
    `HEALER_RESTART_ENABLED`, preserving availability while model-authored
    actions and implementation remain off in the tracked launchd template;
  - reconciled the incomplete system into
    `docs/SELF-HEALING-COMPLETION-PLAN.md`, with typed actions and separated
    diagnosis required before autonomy can be enabled.
- Evidence:
  - pinned Node 22.23.2 typecheck passed;
  - pinned Node 22.23.2 healer suite passed after review remediation: 20 files /
    197 tests;
  - pinned Node 22.23.2 complete serial repository suite passed after review
    remediation: 134 files / 1,689 tests;
  - denial coverage includes disabled/quiet/missing-operator policy, wrong
    user, stale epoch, expired proposal, failed trust review, lost atomic claim,
    replay, implementation gate, automatic-rerun gate, and daemon-restart gate.
- Files: `src/healer/action-policy.ts` and test; healer trust, orchestration,
  proposal, approval, remediation, implement, collector source/tests;
  `setup/launchd/com.nanoclaw.healer.fast.plist`;
  `docs/SELF-HEALING-{DESIGN,PHASE0-SPEC,ORCHESTRATED-DIAGNOSIS,COMPLETION-PLAN}.md`;
  `docs/SECURITY.md`, `docs/PROJECT-MAP.md`, `docs/ACTIVE-WORK.md`, this entry.
- Deployment/migration: none. The installed healer artifact/unit, production
  incident rows, Slack reactions, operator configuration, action epoch, daemon,
  and services were not changed. The installed implementation-off containment
  from `NC-20260729-004` remains the only live action-related change.
- Rollback/recovery: discard only the NC-20260730-002 task-owned local diffs.
  No production rollback is required because nothing was installed or enabled.
- Documentation: added the current completion authority and reconciled design,
  diagnosis, Phase-0, security, project-map, and continuity surfaces.
- Follow-ups: independent C5 review; separately authorized commit and dark
  deployment with actions off; then Gate B diagnosis separation and Gate C
  typed host actions. Do not enable the existing raw-command or shared-checkout
  implementation paths.

#### Addendum 2026-07-30T19:02Z — independent Claude Opus C5 review

- Reviewer: Claude Code 2.1.220, model `claude-opus-5[1m]` (Opus 5, 1M context)
  at maximum effort, account label `info-tandem`. No token, key, or credential
  value entered any prompt, log, diff, document, or command output.
- Report: `docs/reports/NC-20260730-002-CLAUDE-C5-REVIEW.md`.
- **Verdict: CHANGES REQUIRED.** State remains `ready_for_review`. The change is
  a clear net improvement on a boundary that previously accepted any non-bot
  Slack user and left `runApprovals` entirely ungated; the required changes are
  small.
- Verification independently reproduced under pinned Node 22.23.2 outside the
  restricted sandbox: typecheck passes; the healer suite passes **20 files /
  193 tests**; the full repository suite passes **130 files / 1,661 tests**;
  `npm run docs:continuity-check` passes; `npm run format:check` passes across
  `src/**/*.ts`; `git diff --check` passes. Every recorded figure matched.
- Verified as claimed: the any-non-bot fallback is gone; model-supplied
  `action_epoch`/`approval_nonce`/`approval_created_at` are stripped
  unconditionally before host values are issued; every executing path claims its
  work with one conditional `UPDATE`, each with a lost-claim test; the seven
  pre-existing `awaiting_approval` rows carry no nonce and would be disarmed
  rather than executed if actions were enabled; the `implement.ts:124`
  single-quote escaping is correct and no shell-injection path exists.
- Deployment-blocking, P1: gating `restartDaemon()` behind the default-off
  global switch removes the healer's only live availability function. The
  restart takes no model input — fixed `launchctl kickstart -k` argv, already
  capped and idempotent — and collapsing it with arbitrary model-authored shell
  means a dark deployment leaves a dead daemon unrecovered until a human reads
  Slack. Add a separate default-on `HEALER_RESTART_ENABLED`, or record the
  trade-off with a named owner for daemon-down recovery. Decide before
  authorizing deployment.
- Commit-blocking, P1: the implementation executor never re-evaluates trust at
  the final boundary. `runApprovals` calls `isActionable`;
  `loadImplementable`/`dispatch` check only confidence, cause_or_symptom, and
  the nonce binding, so the adversarial-review requirement is enforced
  indirectly and does not survive a trust change after arming. Two lines in
  `dispatch()` plus one test.
- Recommended in the same commit, P2: redact `command` and `out` in
  `remediate.ts` auto-rerun as `approval.ts` already does; and correct four
  statements — the P1-1 deployment consequence, `HEALER_INVESTIGATE_BASH=1`
  granting Bash under `bypassPermissions` outside the gate (which contradicts
  both `action-policy.ts`'s header and the new `SECURITY.md` paragraph), the
  "refuting review → manual-only" claim that the `synthesize` tie-breaker path
  contradicts, and `implement.ts`'s claimed time-box that `spawnPipeline` does
  not implement.
- Accepted residual, P2/P3: the verify loop can close an implement-dispatched
  incident as `verified_fixed` while its unbounded detached pipeline still runs;
  the trust gate compares `review.reason` against free-text literals produced in
  an untouched file; `applied_action` is one last-write-wins column rather than
  an audit log; `emojiVerdict` lets reaction order decide approve-vs-reject; the
  5-minute stale-claim window depends implicitly on the 120-second shell
  timeout. Raw model-authored `bash -lc` remains the design's core exposure and
  is correctly deferred to Gate C.
- Record correction for `NC-20260730-003`: its verification notes cite this task
  as blocking continuity and repository-wide formatting. Both now pass.
- Validator state boundary: repository reads plus the report and two continuity
  edits. No implementation code was edited; nothing was staged or committed; no
  deployment, service, launchd, migration, incident mutation, Slack reaction,
  operator/epoch configuration, credential, schedule, or production write
  occurred. The 65-path dirty worktree, including concurrent NC-20260730-001 and
  NC-20260730-003 work, was preserved unchanged.

#### Addendum 2026-07-30T19:22Z — Claude review remediation

- Resolved P1-1 by moving the fixed, capped, model-independent
  `launchctl kickstart` recovery to a separate default-on
  `HEALER_RESTART_ENABLED` control. The tracked template keeps
  `HEALER_ACTIONS_ENABLED=0` and `HEALER_IMPLEMENT_ENABLED=0`;
  `HEALER_QUIET=1` disables all three execution classes.
- Resolved P1-2 by applying `isTrustworthy` in both the implementation candidate
  filter and the final dispatch boundary before credentials or the atomic claim.
  A regression test changes review trust after arming and proves that no claim
  or process spawn occurs.
- Resolved the audit finding by redacting automatic-rerun command and output
  fields before `recordAction`.
- Closed two accepted review races in the same bounded slice: generic
  recurrence verification skips `implement_dispatched` work so only its
  completion poller decides the outcome, and named rejection wins when Slack
  carries conflicting named-operator approve/reject reactions.
- Corrected blank approval TTL handling to use the 24-hour bounded default and
  documented the stale-claim/shell-timeout dependency.
- Corrected the completion, design, diagnosis, security, project-map, and code
  claims: diagnostic Bash remains an off-by-default
  `bypassPermissions` escape hatch outside the model-authored action gate; an
  initial refutation can be overturned only by the existing independent
  tie-breaker; deterministic restart is independently controlled; and the
  detached implementation pipeline has no enforced timeout.
- Post-remediation verification under pinned Node 22.23.2 passed: focused
  **5 files / 60 tests**; typecheck; healer **20 files / 197 tests**; complete
  serial repository suite **134 files / 1,689 tests**; repository formatting;
  documentation continuity (**23 active/ready rows / 23 changelog entries**);
  and `git diff --check`.
- No deployment, service or launchd reload, incident mutation, Slack action,
  operator/epoch configuration, credential action, or production write
  occurred. The concurrent Procurement, knowledge, copier, and email-renderer
  changes remain outside this task.

#### Addendum 2026-07-30T21:38Z — Mac Mini dark deployment

- User separately authorized deployment after the isolated commit. The stale
  `mini-claw` SSH alias pointed to `.204`; the current Tailscale control-plane
  record identified the authenticated Mac Mini at `.206`. No SSH configuration
  was edited.
- Preflight: production used Node 25.8.2; the operational checkout had 96 dirty
  paths and remained untouched; NanoClaw was healthy on PID 68325 with Slack
  and Gmail connected, zero active containers, and no waiting work. The loaded
  fast healer had 46 successful runs, implementation off, no action-policy
  artifact, and no action/restart variables.
- Release: exact commit
  `bc8a71b62ca952d7d919144f91609e761d382641` was transferred as an immutable
  Git archive with SHA-256
  `77ba774119e9edf48726d3f1e0e26072ba11ba2f33406450304b84154f634437`
  to `~/.local/share/nanoclaw-releases/bc8a71b`.
- Target-runtime verification under Node 25.8.2 passed: typecheck, focused
  healer **5 files / 60 tests**, and build.
- Activation replaced only the compiled `dist/healer/` subtree and installed
  fast-healer plist. The main daemon, all other compiled host files, source,
  prompts, databases, schedules, pending proposals, and concurrent Procurement
  work were not changed.
- Loaded and evaluated policy: `HEALER_ACTIONS_ENABLED=0`,
  `HEALER_RESTART_ENABLED=1`, `HEALER_IMPLEMENT_ENABLED=0`; runtime evaluation
  returned `actions=false`, `restart=true`, `implementation=false`. Deployed
  `dist/healer/action-policy.js` SHA-256:
  `f5624020fe26ee105ef5dc740bf12327e262dff2da4eec8a34ae791fd40e943b`.
- Live fast-cycle canary: one launchd run exited `0`; its aggregate outcome was
  zero collected/reported/diagnosed/acted/closed/approved/implemented,
  `gmailStalled=false`, and `daemonDown=false`. The main daemon remained PID
  68325 with Slack/Gmail connected, zero active containers, and no waiting
  groups.
- Rollback bundle:
  `~/.local/share/nanoclaw-deploy-backups/NC-20260730-002-20260730T213639Z`
  contains the prior compiled healer subtree and installed plist.
- State boundary: `deployed_unverified`. The dark policy and ordinary healthy
  fast cycle are live-verified. A controlled daemon-down recovery canary was
  not induced against the healthy production daemon, so actual restart
  execution and longer-term outcomes remain unverified.

### NC-20260730-003 — Procurement host intake and review control plane

- Date: 2026-07-30T18:13Z
- Owner/client: Codex
- State: deployed_unverified
- Commit/PR: uncommitted on `codex/continuity-reconciliation`; task started at
  `1689527` and the shared branch advanced to `04292cd` during implementation
- Change class: C2 — additive source and migration; deployed gates-off with
  `NC-20260730-004`
- Affected systems: Procurement PostgreSQL model, CaleProcure normalization,
  classified-email host router, Gmail resource policy, host/container IPC,
  Procurement prompt/schema, architecture/security/continuity documentation
- Outcome:
  - adds tracked migration 114 with source-run completion, immutable
    observations, canonical source keys, a bounded review view, and optimistic
    host-only decision transitions;
  - replaces free-form email-body SQL with a host parameterized intake that
    stores metadata before handoff and fails closed on database errors;
  - grants Procurement `gmail_read` only for the exact host-assigned message;
    mailbox search, thread reads, send, and reply remain denied;
  - provides deterministic CaleProcure row validation, date normalization,
    cross-keyword deduplication, conflict rejection, payload hashing, and
    complete/failed source-run evidence;
  - exposes a Procurement-only, read-only queue IPC that omits raw payload and
    Gmail identifiers.
- Important boundaries:
  - migration 114 and the isolated host/container/prompt artifacts were later
    deployed gates-off under `NC-20260730-004`;
  - the daily scanner, Bonfire/CDP bridge, schedule, 309 legacy rows, and vault
    artifacts are unchanged;
  - CaleProcure browser collection is not yet wired to the adapter;
  - review transitions exist as a host-only optimistic function but are not
    exposed to the model; submission and all outbound actions remain manual.
- Files: migration 114; `src/procurement-intake*`,
  `src/procurement-ipc-handlers*`, sanitized fixture, host router/classifier,
  Gmail policy, root IPC, agent-runner MCP, Procurement authorities, schema
  references, architecture/security/project map, resurrection plan, and shared
  lifecycle records.
- Verification:
  - 87 focused tests pass across Procurement intake/queue, host routing, Gmail
    authorization, classifier routing, and Gmail channel paths;
  - pinned Node 22.23.2 root typecheck passes;
  - pinned Node 22.23.2 complete serial suite passes 130 files / 1,661 tests;
  - independent `container/agent-runner` build passes and its suite passes
    3 files / 22 tests under pinned Node 22.23.2;
  - Procurement-owned TypeScript formatting and `git diff --check` pass;
  - repository continuity is currently blocked only because overlapping
    `NC-20260730-002` has no engineering-changelog entry; the repository-wide
    formatting check is currently blocked only by three `src/healer/*` files
    owned by that task. Neither blocker is rewritten under this task.
- Migration/deployment: pending and separately gated. Apply migration 114
  before the matching host and agent-runner source; back up and inspect live
  constraints first.
- Rollback/recovery: before deployment, revert only NC-20260730-003 source and
  documentation. After migration, keep the additive tables/columns by default
  and roll back host routing first; destructive schema removal requires a
  separately reviewed data-retention decision.
- Follow-ups: host-verified human review action; CaleProcure collection/cutover;
  Bonfire isolate-or-retire/value trial; framework provenance and outcome loop.

### NC-20260730-001 — Procurement Scout investigation and resurrection design

- Date: 2026-07-30T17:43Z
- Owner/client: Codex
- State: ready_for_review
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `1689527`
- Change class: C1 — read-only investigation and internal target design
- Affected systems: Procurement group, scheduled scan, Bonfire/CaleProcure and
  email intake, procurement PostgreSQL state, local proposal framework, browser
  security boundary, Company-OS continuity
- Outcome:
  - reconstructed the original opportunity-to-outcome thesis from the group
    prompt, procedures, local framework, history, schemas, and implementation;
  - verified that production discovery remains live but the qualification,
    decision, proposal, submission, outcome, and calibration loop is mostly
    dormant;
  - documented the smallest credible resurrection: deterministic source
    observations, host-owned transitions and database operations, CaleProcure
    plus exact-resource email first, an isolated-or-retired Bonfire path,
    provenance-aware proposal evidence, manual submission, and required
    outcome closure;
  - left seven leadership decisions as explicit gates before any C2-C5
    implementation or production change.
- Evidence:
  - production read-only audit found one registered group and active daily task,
    70 successful/9 error task-run rows, a running Procurement browser service,
    and healthy loopback plus shared-gateway CDP endpoints;
  - the 309-row opportunity store contains 163 `new`, 138 `expired`, 6
    `rejected`, and 2 `scraped` records; 127 of the `new` records are classified
    as noise, while no record has reached a proposal/submission/outcome status;
  - aggregate vault evidence contains 12 briefs, 6 analyses, 2 proposal drafts,
    2 status files, and zero bid-history rows;
  - local dated scan artifacts use 44 distinct top-level JSON shapes;
  - live email routing and its tests explicitly keep procurement labels at
    `classify_only`, despite the group prompt describing a Mailman handoff;
  - the live status constraint contains proposal states absent from the
    Git-ignored procurement DDL, confirming non-portable schema drift.
- Files: `docs/PROCUREMENT-RESURRECTION-PLAN.md`,
  `docs/PROJECT-MAP.md`, `docs/ACTIVE-WORK.md`, this entry.
- Verification: 2026-07-30T17:48Z —
  `npm run docs:continuity-check` passed (20 active/ready rows and 20 changelog
  entries; schema-sanitizer self-test passed), and `git diff --check` passed
  with no output. These documentation-only checks ran under the current
  shell's Node 26.5.0; `.nvmrc` remains Node 22, and no product/runtime suite
  was needed or run.
- Deployment/migration: not applicable. Production was inspected read-only; no
  prompt, browser, schedule, service, database, message, proposal, or portal
  state changed.
- Rollback/recovery: revert only the four NC-20260730-001 documentation edits.
  The production scanner and current dirty worktrees were not changed.
- Documentation: new Procurement current-state/target-design authority plus
  project-map and shared lifecycle records.
- Follow-ups: human resolves the seven design gates; accepted implementation
  phases receive separate C2-C5 task IDs with exact rollback and deployment
  boundaries. Coordinate browser containment with `NC-20260729-004`.

### NC-20260729-004 — Week-1 Company-OS containment: Gmail authority and healer default

- Date: 2026-07-30T03:26Z
- Owner/client: Codex with required Claude Opus validator
- State: deployed_unverified
- Commit/PR: `16895273e4a387eb12e2bfcfb869abb9aba85c32` on
  `codex/continuity-reconciliation`; not pushed
- Change class: C3 — host authorization and customer-email final-send boundary
- Affected systems: Gmail IPC watcher and handlers, inbound Gmail routing,
  classifier correction routing, Mailman/Sales/Contador/Chief/Archivarista
  procedures, approved-send watchdog integration, tracked fast-healer launchd
  template, Company-OS/security/continuity documentation
- Outcome:
  - container-originated Gmail actions are authorized from the
    directory-derived group identity against an explicit operation matrix;
  - thread IDs, message IDs, and exact search addresses require host-issued
    resource grants, with model-authored handoffs limited to propagating
    resources the source already holds;
  - scheduled Sales work can reconstruct only an exact thread/address after a
    restart and only when PostgreSQL proves it belongs to a Party with a
    non-terminal pipeline entry; operator-approved replies can reconstruct the
    exact approved thread/recipient from durable host-held SQLite state;
  - denied Gmail requests are quarantined rather than executed and receive a
    best-effort negative acknowledgement in the caller's input;
  - new sends and Gmail-derived reply recipients fail closed unless the host
    resolves a Party and verifies every To/CC address against that Party;
  - both sends and replies honor `GMAIL_TEST_RECIPIENT`, strip test-routed CC,
    and do not falsely discharge a real customer's approved-send expectation;
  - the tracked fast-healer template now defaults implementation off. No
    installed unit or live service was changed.
- Operation matrix:
  - `mailman`: send, reply, exact search, exact message read, exact thread read;
  - `sales`: assigned/active-pipeline exact search and thread read;
  - `contador`, `archivarista`, `chief`: exact host-routed message reads only;
  - all other groups and operation combinations: denied.
- Important implementation details:
  - caller-supplied `groupFolder` and `leadId` remain candidates, not authority;
    source identity comes from the IPC directory and Party identity from host
    data;
  - search accepts only an exact `from:<address>` / `to:<address>` grammar and
    rejects broader Gmail query operators;
  - business-database errors fail closed;
  - process-local resource grants expire after 24 hours of inactivity and are
    bounded; only narrowly verified Sales pipeline state and an exact durable
    pending human approval can reconstruct a grant after restart;
  - handoff email propagation reads structured headers only, before any body or
    message delimiter;
  - reply recipient validation runs after Gmail resolves the original sender
    but before raw message construction or send, and the Gmail-derived address
    must equal the host-approved recipient for approval-backed replies.
- Regression prevented during validation: the first process-local-only design
  would have blocked scheduled Sales follow-ups after every daemon restart. The
  durable active-pipeline resolver was added before review. The overlapping
  NC-20260729-003 callback also initially cleared a customer's expectation after
  a test-routed delivery; it now fires only for a production recipient.
- Verification:
  - Qodo rule lookup followed the canonical Claude skill; no
    `~/.qodo/config.json` exists, so no Qodo repository rules were available;
  - 2026-07-30T03:22Z — focused authorization/recipient/watchdog set: 51 tests
    pass;
  - 2026-07-30T03:25Z — pinned Node 22.23.2:
    `npm run typecheck` passes and the complete root suite passes **127 files /
    1,625 tests**, including native SQLite coverage;
  - 2026-07-30T03:26Z — independent `container/agent-runner` build passes and
    its suite passes **3 files / 22 tests** under Node 22.23.2;
  - Claude Opus adversarial review completed with `CHANGES REQUIRED`; its report
    and the implemented remediation are recorded below.
- Deployment/migration: deployed 2026-07-30 as recorded in the production
  addendum below. The additive local SQLite
  `pending_sends.gmail_thread_id` migration and index are live.
- Rollback/recovery: revert the NC-004 source/prompt/template changes together.
  The overlapping NC-003 send-watchdog work has separate deployed-unverified
  evidence and must not be represented as rolled back unless the live host is
  separately changed and verified.
- Documentation: `docs/PROJECT-MAP.md`, `docs/SECURITY.md`,
  `docs/COMPANY-OS-IMPROVEMENT-PLAN.md`, `docs/ACTIVE-WORK.md`, this record, and
  the relevant group procedures.
- Remaining boundaries: the production host still runs Node 25.8.2 rather than
  the pinned Node 22; the dirty operational source/prompt checkout was preserved
  rather than overwritten; a real approved/test-routed success and business
  outcomes remain unverified.

#### Addendum 2026-07-30T04:00Z — independent Claude Opus pre-commit review

- Reviewer: Claude Code 2.1.220, model `claude-opus-5[1m]` (Opus 5, 1M context)
  at maximum effort, account label `info-tandem`. No token, key, or credential
  value entered any prompt, log, diff, document, or command output.
- Report: `docs/reports/NC-20260729-004-CLAUDE-IMPLEMENTATION-REVIEW.md`.
- **Verdict: CHANGES REQUIRED.** State remains `validating`; the change is not
  yet cleared for commit and must not be deployed until P1-1 is resolved rather
  than only documented.
- Verification independently reproduced on the Mac Studio checkout under pinned
  Node 22.23.2, outside the sandbox: `npm run typecheck` passes; the complete
  root suite passes **127 files / 1,625 tests**; the independent
  `container/agent-runner` build passes and its suite passes **3 files / 22
  tests**; `npm run docs:continuity-check` passes (19 active/ready rows, 19
  changelog entries); `git diff --check` passes. Every figure recorded above
  reproduced exactly. Qodo absence re-confirmed — `~/.qodo/` does not exist and
  no config file was created.
- Model disposition: of the fourteen intended security-model items, twelve hold
  as written. Item 7 (grant expiry plus durable Sales reconstruction) partially
  holds. Item 6 (denials quarantined rather than dispatched or discarded) holds
  for the file but not for the calling agent.
- Blocking, P1: `gmail_reply` has no grant-reissue source. The durable fallback
  (`src/gmail-ipc-business-scope.ts:24`) accepts only `sales` with
  `gmail_get_thread`/`gmail_search`, and the only grant origins are
  `src/channels/gmail.ts:454` and `src/classify-ipc-handlers.ts:404`. After a
  daemon restart an operator-approved reply cannot be authorized by any path in
  this change; Sales-side recovery additionally requires an interactions row
  carrying `metadata->>'thread_id'`, which only a prior successful outbound send
  writes, so first replies to new inbound leads and all `chief` support replies
  never recover. Fails loud through the NC-20260729-003 watchdog after roughly
  six minutes, but is a customer-facing outage of the primary outbound path.
- Blocking, P1: a quarantined `gmail_*` request returns no negative
  acknowledgement, while the container tool has already reported the operation
  as queued. This reproduces the stalled-agent/fabricated-cause sequence
  recorded under NC-20260728-003 and defeats the new "stop and escalate"
  instruction in the group prompts.
- Recommended in the same commit, P2: narrow `clearPendingSendsByRecipient`
  (`src/db.ts:960-970`) to the oldest matching row so two concurrent
  expectations for one address are not collapsed; and correct the
  NC-20260729-003 entry below, which now describes the `GMAIL_TEST_RECIPIENT`
  callback suppression introduced by NC-004 and absent from the Mac Mini build
  of 2026-07-30T00:09Z.
- Accepted residual risk, P2: resource grants are group-global and accumulate
  for the process lifetime, so `mailman`'s address set makes "a resource the
  source already holds" a weak constraint and lets an attacker-controlled email
  body propagate a previously-seen third-party address to `sales`. Also, no
  expression index supports `interactions.metadata->>'thread_id'` on the
  authorization hot path; that index needs its own migration and task ID. Seven
  P3 items are listed in the report.
- Pre-deployment observability gap: quarantine has no metric, alert, or
  retention policy, yet quarantine volume is the primary production signal for
  the P1 grant gap.
- Validator state boundary: repository reads plus the report and two continuity
  edits. No implementation code was edited; nothing was staged, committed, or
  pushed; no deployment, service, launchd, migration, credential, schedule,
  message, email, approval, or production-data change occurred; no secret,
  session, log body, database row, or backup content was read or reproduced. The
  51-path dirty worktree, including the unrelated NC-20260728-006,
  NC-20260729-001 and NC-20260729-002 changes, was preserved unchanged.

#### Addendum 2026-07-30T11:31Z — Claude findings remediated

- **P1-1 resolved:** approvals persist the exact Gmail thread and recipient in
  `pending_sends`. The host grants that thread at approval time and can
  reconstruct the same grant from the pending approval after restart. It
  overwrites any container-supplied approved recipient before dispatch; the
  final handler then requires Gmail's resolved recipient to match.
- **P1-2 resolved:** quarantine writes a best-effort `[gmail_* DENIED]` response
  into the caller's input. The watcher excludes both the `errors` and
  `quarantine` administrative directories.
- **P2-1 resolved:** a confirmed send clears only the oldest pending row for a
  recipient. **P2-3 resolved:** the NC-003 entry below describes the deployed
  Mac Mini behavior, with its later NC-004 test-routing change in a separate
  dated addendum.
- **P2-2 narrowed:** handoff propagation extracts addresses only from structured
  `From`/`To`/`CC`/`Email` headers before a body/message delimiter, so a
  previously granted address injected into body text cannot propagate; grant
  sets are capped at 5,000. Full work-item scoping remains deferred.
- Additional review hardening: spoofed `groupFolder` and quarantine reprocessing
  tests, a default-deny Gmail statement in the group template, and explicit
  documentation of the host-direct proposal and digest exceptions.
- Post-remediation verification under pinned Node 22:
  - focused authorization/recipient/watchdog/SQLite set: **6 files / 126 tests
    pass**;
  - `npm run typecheck` passes;
  - two normal parallel root runs each reached **126 files / 1,629 tests** and
    exposed one different ephemeral webhook listener failure (`EADDRINUSE`,
    then `socket hang up`); `src/webhook-server.test.ts` passes alone
    (**35/35**), and the deterministic single-worker root suite passes **127
    files / 1,631 tests**;
  - independent `container/agent-runner` build passes and suite passes **3 files
    / 22 tests**.
- Deferred, not concealed: a PostgreSQL expression index for
  `interactions.metadata->>'thread_id'` needs a separate migration; a
  work-item-scoped grant ledger, quarantine metrics/alerts/retention, and the
  remaining P3 recommendations remain backlog.
- State boundary: Claude-reviewed remediation and all recorded local checks are
  committed. No deployment, production migration, daemon restart,
  service/configuration change, push, email, message, approval, credential
  action, or production-data write was performed.

#### Addendum 2026-07-30T17:50Z — deployed with live safety canaries

- Production preflight: the Mac Mini checkout was dirty, the managed daemon was
  healthy, Node was 25.8.2 rather than pinned Node 22, pending sends and active
  jobs were zero, and the installed fast-healer implementation flag was `1`.
  The target source worktree was preserved.
- Recovery evidence: created restricted backup
  `~/.local/share/nanoclaw-deploy-backups/NC-20260729-004-20260730T172332Z`
  with the prior source/dist artifacts, installed plists, and a native SQLite
  backup. The reviewed archive was staged at
  `~/.local/share/nanoclaw-releases/1689527`; its SHA-256 is
  `5114fe4b9b0e062f4dd822337adac1eddf0932bb81cac43e1744e117265ce703`.
- Pre-activation verification: target-runtime typecheck, focused authorization
  tests, and build passed under the installed Node 25.8.2. The release build
  contains the reviewed Gmail authorization, quarantine, durable grant, and
  recipient-boundary symbols.
- Activation: symlinked release attempts exited cleanly because the direct-run
  guard compares the invoked path with `import.meta.url`; automatic recovery
  restored the prior daemon each time. The final activation copied the
  immutable release `dist/` to the existing runtime path and restarted the
  launchd-managed service. At verification time exactly one daemon, PID 68325,
  was running; Slack and Gmail were connected; PostgreSQL `SELECT 1` passed;
  the copied artifact matched the release; and no actual NanoClaw Apple
  Containers were present.
- Migration/configuration: production SQLite now has
  `pending_sends.gmail_thread_id` and
  `idx_pending_sends_gmail_thread`. The installed fast-healer implementation
  flag was changed from `1` to `0`, reloaded, and verified as `0` in the live
  launchd environment.
- Live safety evidence: a synthetic unauthorized `gmail_send` was quarantined
  and produced `[gmail_send DENIED]` for its caller without dispatch. A separate
  synthetic pending approval reissued only its exact Gmail thread/recipient
  after in-memory grants were cleared. Both canaries were removed; neither sent
  a customer email.
- Residuals/state boundary: one stale adopted-container health record remained
  while the actual container inventory was empty. Production still uses Node
  25.8.2, and the dirty operational source/group-prompt checkout was not
  overwritten; only the reviewed host artifact is exact to `1689527`. State is
  `deployed_unverified` until an explicitly approved genuine or test-routed
  end-to-end send succeeds. No customer message was sent during deployment.

### NC-20260729-003 — Only a confirmed send discharges an approved send

- Date: 2026-07-30T00:12Z
- Owner/client: Claude Code
- State: deployed_unverified
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `cd78ad2`
- Change class: C3 — host runtime change on the customer-email send path
- Affected systems: NanoClaw host daemon (IPC watcher, Gmail IPC handlers,
  approved-send watchdog), `store/messages.db` (`pending_sends` lifetime), and
  the root TypeScript build graph
- Outcome: an approved send that is blocked by a guard, fails at the Gmail call,
  or is answered `[ALREADY-HANDLED]` now raises `[SEND NOT OBSERVED]` in the
  draft's own Slack thread. Previously all three were indistinguishable from a
  delivered email.
- Trigger: on 2026-07-29 an approved reply to a lead was blocked by the content
  guard for the banned AI-ism "thank you for reaching out". The block posted one
  line to `#gru-chief` and stopped. `#gru-sales` showed the operator's approval
  followed by silence, and the watchdog added by NC-20260728-003 stayed quiet.
- Root cause: `src/ipc.ts` called `observeOutbound` on the outbound group
  message, i.e. on the `[HANDOFF: sales→mailman]` line, and
  `src/send-watchdog.ts` deleted the `pending_sends` row there. That handoff is
  emitted _before_ mailman composes the mail, so every downstream refusal —
  recipient guard, content guard, Gmail error, `[ALREADY-HANDLED]` — happened
  after the expectation had already been discharged. NC-20260728-003 chose the
  handoff deliberately ("the agent got that far"); this narrows it to the only
  signal that actually proves delivery.
- Change:
  - `src/send-watchdog.ts` — `observeOutbound` keeps observing the handoff but
    logs it as progress only and no longer clears. New `observeConfirmedSend`
    clears on a confirmed send, unwrapping a `Name <addr>` form and matching
    case-insensitively. `alertText` reworded: it no longer claims "no handoff has
    been seen" (a handoff usually _has_ been seen) and now points the operator at
    the `🚫 [EMAIL BLOCKED]` line in `#gru-chief` that names the violation.
  - `src/db.ts` — new `clearPendingSendsByRecipient`. The recipient is the join
    key because the send executes as `mailman` while the expectation belongs to
    `sales`, so group folder cannot match.
  - `src/gmail-ipc-handlers.ts` — optional `onSendConfirmed` dep on
    `dispatchGmailIpc`/`handleGmailReply`/`handleGmailSend`, fired only after
    `replyToThread`/`sendEmail` returns. The build deployed at 00:09Z passes the
    original recipient even under `GMAIL_TEST_RECIPIENT`; NC-004 later
    supersedes that test-routing behavior in the worktree.
  - `src/ipc.ts`, `src/index.ts` — wiring.
  - `tsconfig.json` — `exclude` now covers `src/**/*.sync-conflict-*`. The 15
    Syncthing conflict copies in `src/` are Git-ignored and `.stignore`-ignored,
    so they are invisible to review and to sync, yet `"include": ["src/**/*"]`
    pulled them into the build graph. Three of the four typecheck errors seen
    while making this change came from stale duplicates of `index.ts`.
- Accepted trade-off: if an approved card carries no `Email:` line the row has no
  recipient, nothing can clear it, and a false `[SEND NOT OBSERVED]` fires ~6
  minutes later. That is fail-loud rather than fail-silent, and the `Email:` line
  was made mandatory by NC-20260728-001.
- Verification:
  - 2026-07-29T19:07Z (local) — `npx tsc --noEmit` clean; 65 tests pass across
    `send-watchdog.test.ts`, `gmail-ipc-handlers.test.ts`,
    `ipc-handoff-echo.test.ts`.
  - Test contract changed deliberately, with evidence: five tests asserting that
    the handoff clears the expectation encoded the defect and were replaced. New
    coverage: handoff-does-not-clear, confirmed-send-clears, case-insensitive
    match, display-name unwrap, wrong-recipient-does-not-clear, undefined
    recipient no-op, and an end-to-end case asserting the alert DOES fire when a
    handoff arrived but the send was blocked.
  - Regression caught and fixed during the change: `ipc-handoff-echo.test.ts`
    mocked `./db.js` with a bare const reference that broke under the renamed
    import; rewritten with the deferred-arrow pattern the same file already uses.
  - `src/db.test.ts` could not run in the authoring shell — `better_sqlite3.node`
    is built for NODE_MODULE_VERSION 127 (Node 22) and that shell runs Node
    26.5.0 (147). Not a product failure and not caused by this change.
  - 2026-07-30T00:08Z — on the Mac Mini: typecheck clean and **115 tests pass**
    across all four files including `db.test.ts`.
  - 2026-07-30T00:09Z — clean rebuild on the Mini after removing
    `tsconfig.tsbuildinfo`; `clearPendingSendsByRecipient` present in
    `dist/db.js`, `dist/ipc.js`, `dist/index.js` and `observeConfirmedSend` in
    `dist/send-watchdog.js` and `dist/ipc.js`. `dist/` contains zero
    sync-conflict artifacts, confirming the tsconfig exclude.
  - 2026-07-30T00:09:36Z — daemon restarted via `launchctl kickstart -k` with no
    containers in flight; running as pid 2480, startup log clean, Slack and Gmail
    both connected.
  - Duplicate-daemon check: exactly one `dist/index.js` process (pid 2480) and it
    owns the `:8088` listener.
  - **Not yet verified live:** an actual `[SEND NOT OBSERVED]` from a blocked
    send. That needs a real block, which cannot be manufactured without
    withholding a customer email.
- Deployment/migration: no schema change — only the lifetime of existing
  `pending_sends` rows changes. Deployed to the Mac Mini only.
- Rollback/recovery: revert the six source files and rebuild. Reverting restores
  the silent-failure behaviour, so it needs explicit review.
- Documentation: this entry and the active-work row.
- Addendum 2026-07-30T03:26Z: NC-20260729-004 changes send and reply
  confirmation so `GMAIL_TEST_RECIPIENT` deliveries do not discharge the
  intended customer's expectation. The Mac Mini build deployed at
  2026-07-30T00:09Z does **not** contain that guard. This addendum separates the
  worktree correction from NC-003's deployed evidence.
- Follow-ups:
  1. Optional instant notice: post the `🚫 [EMAIL BLOCKED]` line into the
     draft's own thread as well as `#gru-chief`, using the `pending_sends` row to
     resolve the channel and thread. Would cut operator notice from ~6 minutes to
     immediate. Not done here to keep the change on one behaviour.
  2. `/health` reports `pid` and `uptime` from the heartbeat file, not live
     process state — during this deploy it showed pid 46358 / 34h uptime while
     the actual daemon was pid 2480 / 28s. Misleading at exactly the moment
     post-deploy verification needs it.
  3. Runtime drift is wider than recorded: `.nvmrc` and CI pin Node 22, the
     authoring shell runs 26.5.0, and **the Mac Mini production host runs
     25.8.2**. No enforced version matches the pin.

### NC-20260729-002 — Coaching Supervision Mastery is quotable in the sales/inbox knowledge base

- Date: 2026-07-29T21:55Z
- Owner/client: Claude Code
- State: ready_for_review
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `cd78ad2`
- Change class: C2 — knowledge/instruction writes that affect C3 agent email output
- Affected systems: sales and inbox agent knowledge, shared knowledge, and the
  sales learned-lesson override file. No code, schema, or runtime change.
- Outcome: the sales and inbox agents can now quote the real Coaching Supervision
  Mastery offer — dates, hours, format, inaugural and regular price — instead of
  refusing on a "PRE-LAUNCH, no public price" guardrail that had been stale since
  the program went on sale.
- Trigger: Lead #611 (Jennifer Watson, EPA) — two PCC coaches wanting to enrol.
  The draft escalated with "pricing not yet public" while `SCHEDULE.md` showed a
  live October 7 cohort.
- Root cause: `knowledge/agents/sales/SCHEDULE.md` is regenerated daily from the
  program calendars by `tools/refresh-schedule.py` and carries dates only, so the
  October 7 cohort appeared on its own (written 2026-07-28 06:30).
  `knowledge/agents/sales/KNOWLEDGE.md` carries price and policy and was last
  written 2026-07-22 15:52, still holding "Do NOT quote a student price — none is
  public." The agent obeyed its knowledge and surfaced the contradiction; this
  was knowledge drift between two independent update paths, not agent error.
- Files:
  - `knowledge/agents/sales/KNOWLEDGE.md` — CSS/Coaching Supervision Mastery
    section rewritten: AACS granted July 2026 (valid to July 2029, 72-hour
    program); inaugural cohort October 7, 2026 – February 10, 2027, Wednesdays
    09:00 CT / 10:00 ET, 16 weekly 2-hour live classes with a winter-holiday
    break; ~72 contact hours at 64% live (32h live + 14h fieldwork + ~26h
    self-paced); cohort 9–12; instructor of record Cherie Silas; 5 observed
    supervision sessions with written feedback; 6h supervision-on-supervision;
    learning journal + capstone; Techniques Book included; **$3,996 inaugural or
    $999/month × 4, $4,796 regular**; Stripe checkout. Adds an explicit
    "still NOT published — ask, never improvise" block, a warning never to
    compute the end date from the start date (the holiday break is why 16 weekly
    sessions reach February 10), and a note that only the morning-ET track
    exists for this program.
  - `knowledge/agents/inbox/KNOWLEDGE.md` — same facts at qualification depth;
    `Status: PRE-LAUNCH … no public student price` replaced with the live offer.
  - `knowledge/shared/KNOWLEDGE.md` — two stale statements corrected: "Tandem is
    preparing for this transition", and an FAQ answer claiming ICF "has not yet
    released full specifics, timelines, or application process" for CSS.
  - `knowledge/agents/sales/LEARNED.md` and `knowledge/shared/LEARNED-sales.md` —
    Lesson 23 carries a dated PARTLY SUPERSEDED status line. Its CSS half
    asserted ICF had published nothing; because learned lessons override
    KNOWLEDGE.md by design (`groups/sales/CLAUDE.md:31`), leaving it would have
    defeated the whole update. The MCC-exam half of the lesson was preserved.
- Provenance: every price, date, and hour figure was read from
  https://tandemcoach.co/coaching-supervisor-training/ and
  https://tandemcoach.co/coaching-supervisor-specialization-css/ on 2026-07-29.
  Nothing was inferred. Superseded KB figures corrected in the process: 60–70
  hours at ~50% live, AACS applications "open mid-June 2026" written as a future
  event, and a ~5-hour practicum.
- Deliberately not done: no attendance/missed-session policy and no
  refund/cancellation/deferral policy were written, because neither is published
  on either page. Both are now named in the KB as operator-escalation items.
  Lead #611's first question remains unanswerable until the operator supplies
  the attendance rule.
- Verification: 2026-07-29T21:55Z — `npm run docs:continuity-check` and
  `git diff --check` results recorded below. No test suite is applicable to a
  knowledge-content change; the effective check is the next live sales draft on a
  supervision lead.
- Deployment/migration: not applicable. Knowledge files reach the runtime host by
  file sync; not yet confirmed synced to the Mac Mini and not yet live-verified.
- Rollback/recovery: revert the five knowledge files as one provenance unit.
  Reverting restores a guardrail that now blocks a real, purchasable program.
- Documentation: active-work row and detail subsection plus this entry.

#### Addendum 2026-07-29T23:59Z — attendance rules, corrected accreditation floor, MCS price reconciliation, deployed

- State: `ready_for_review` → `deployed_unverified`.
- Attendance rules supplied by the operator and recorded: **Coaching Supervision
  Mastery — at most 2 of 16 live classes missable; Mentor Coach Training (MCS
  Standard Path) — at most 1 of 12.** Both are stated in the KB as **program
  policy** with an explicit instruction not to justify them with hour
  arithmetic. Whether a missed class can be made up remains unspecified and is
  still flagged for escalation.
- Operator confirmed the student-led fieldwork counts toward the synchronous
  total, so Coaching Supervision Mastery is **46 synchronous hours of 72 (64%)**
  — 32 class + 14 fieldwork. The KB now states this explicitly with a warning
  not to recompute 32/72 = 44% and wrongly conclude the ≥50% rule is missed.
- **Correction issued and pushed within the same session:** an intermediate
  version of this change justified the 2-class ceiling arithmetically against a
  "41-hour CSS floor" and asserted that a third absence would break CSS
  eligibility. The operator corrected the premise: **41 hours is the floor for a
  CCE course, not for an ICF-accredited program. The AACS/AAMC standard is 60+
  total hours with 50%+ synchronous.** Under the correct standard the hour
  arithmetic permits far more than 2 absences, so the derivation was wrong and
  the attendance ceilings are program policy only. The fabricated justification
  was live on the Mac Mini for roughly 2 minutes before replacement; no agent
  run consumed it (no sales container was running). Both attendance bullets now
  carry an explicit "do NOT justify with hour arithmetic" instruction so the
  same reasoning cannot be reconstructed by an agent.
- **MCS / Mentor Coach Training price reconciled across the whole knowledge
  base.** Operator confirmed **$2,997, or 3 × $999**. The stale
  `$1,997 founding / $2,497 list` pair was present 7× each in **10 agent
  KNOWLEDGE.md files** (archivarista, booking, campanero, chief, contador,
  courses, inbox, mailman, procurement, social) plus 1× in
  `knowledge/shared/KNOWLEDGE.md`. Only `knowledge/agents/sales/KNOWLEDGE.md`
  had ever been updated, so sales and every other agent were quoting different
  prices for the same program. All 71 occurrences replaced; zero stale figures
  remain in any KNOWLEDGE.md. The identical line numbers across all 11 files
  (180, 279, 281, 294, 334, 362, 453) show these files share a common generated
  base and drift as a set — a single hand-edit to one agent does not propagate.
- **`LEARNED.md` files deliberately NOT price-edited.** Their `$1,997`
  references are historical `Problem:` fields describing past leads and a real
  past invoice (TCA-358-PL). Rewriting them would falsify the record. One
  operative price statement inside a `Rule:` field does exist at
  `knowledge/shared/LEARNED-sales.md:274` and remains stale — carried as a
  follow-up because that file is a divergent lineage (see below).
- **Merge hazard encountered and avoided.** Syncthing is running on both the Mac
  Studio and the Mac Mini but is not propagating this folder in either
  direction: the Mini held a `knowledge/agents/sales/LEARNED.md` written
  2026-07-29 15:40 that had never reached the Studio, while Studio edits from
  18:05 had never reached the Mini. A blind push would have destroyed the Mini's
  **Lesson 52** (self-learned at 15:40: an outbound email to a lead was blocked
  by the content guard for the banned AI-ism "thank you for reaching out"; the
  email was not sent). Resolution: adopted the Mini's 52-lesson file as the
  base, re-applied the Lesson 23 correction to it, pushed that back. Pre-merge
  Studio copy retained in the session scratchpad.
- Deployment: 12 `KNOWLEDGE.md` files and `knowledge/agents/sales/LEARNED.md`
  copied to the Mac Mini by `scp` and verified byte-identical by `md5`. No build
  or daemon restart is required — knowledge reaches agents through a live bind
  mount. No sales container was running at push time, so the next run reads the
  new files with no stale session context. `knowledge/shared/LEARNED-sales.md`
  was deliberately NOT pushed.
- Not verified: no live agent run has yet consumed the new knowledge. The
  effective test is the next supervision or MCS draft.

- Follow-ups, each needing its own `planned` row and owner:
  1. Whether a missed class can be made up, and the refund/cancellation/deferral
     policy — both still unpublished and flagged in the KB for escalation.
  2. `knowledge/agents/sales/LEARNED.md` (51 lessons / 217 lines) and
     `knowledge/shared/LEARNED-sales.md` (73 lessons / 302 lines) have diverged,
     and the agent copy holds a CONTESTED marker the shared copy lacks. The sales
     container reads the agent copy, so 22 lessons present only in the shared
     file are not in force. Needs a provenance review, not a mechanical merge.
  3. `tools/refresh-schedule.py` emits no cohort end date, which is why the Lead
     #611 draft said "through late January" against an actual February 10, 2027
     finish.
  4. Confirm these hand edits survive the next `tools/regen-kb-delta.py` run —
     both edited KNOWLEDGE.md files carry a `manifest-hash` header.

### NC-20260729-001 — Claude validation task for the Company-OS v2 plan

- Date: 2026-07-29T12:23Z
- Owner/client: Claude Code
- State: planned
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `cd78ad2`
- Change class: C1 documentation and read-only repository validation
- Affected systems: Company-OS roadmap and shared engineering continuity only
- Outcome: created a self-contained, source-checking adversarial validation task
  for the latest available Opus model at maximum effort.
- Files: `docs/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md`,
  `docs/ACTIVE-WORK.md`, `docs/ENGINEERING-CHANGELOG.md`
- Verification: task registration passes `npm run docs:continuity-check` (16
  active/ready rows and 16 changelog entries) and `git diff --check`. These
  documentation-only checks ran under the current shell's Node 26 because the
  pinned Node 22 version manager is not installed in this environment; no
  product/runtime suite was needed or run. Claude execution remains pending and
  no validator verdict exists yet.
- Deployment/migration: not applicable; no runtime or external business state
  change is authorized.
- Rollback/recovery: remove only the new task brief and its NC-20260729-001
  lifecycle entries; preserve all pre-existing worktree changes.
- Documentation: task brief plus active-work and changelog registration.
- Follow-ups: Claude writes the report, records its evidence boundary, and runs
  the continuity and diff checks. Codex/human then reconcile accepted findings.

#### Addendum 2026-07-29T13:05Z — validation executed, report delivered

- State: `planned` → `ready_for_review`.
- Validator: Claude Code, model `claude-opus-5[1m]` (Opus 5, 1M context),
  maximum effort, executed from the Mac Studio development checkout on
  `codex/continuity-reconciliation` @ `cd78ad2`.
- Output: `docs/reports/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md` (new file).
- Method: read the twelve documents named in the brief in order, then read the
  implementing source, migrations, CI workflows, launchd templates, and ignore
  rules to check each of the thirteen current-state claims against file/line
  evidence. Two read-only local host observations are recorded and labelled as
  such. No remote system was contacted.
- Claim results: 13 verified, 0 rejected. Two carry material corrections —
  Claim 2 (the healer defect is the enabled tracked template, the live
  operational checkout, and LLM-authored task text under
  `bypassPermissions`; the shell escaping at `src/healer/implement.ts:118` is
  correct, so "non-interpolated execution" mis-names it) and Claim 5 (the
  procurement Chrome already runs a dedicated `NanoClaw-Procurement` profile
  with `--disable-sync`, so that risk is overstated, while the socat bridge on
  the shared container gateway `192.168.64.1:9250` is reachable by every agent
  VM and is missing from the plan).
- Twelve findings absent from the plan were added; four rated critical:
  `gmail_*` IPC has no source-group authorization (`src/ipc.ts:470-497`, versus
  the gates at `:524` and `:569`); the outbound recipient guard is opt-in via
  the agent-supplied `leadId` (`src/gmail-ipc-handlers.ts:382-385`,
  `src/email-recipient-guard.ts:76-80`); `gmail_reply` applies neither the
  recipient guard nor `applyTestRouting` and passes an agent-supplied `cc`
  through (`src/gmail-ipc-handlers.ts:154-282`, `src/gmail-api.ts:405-411`);
  and every container can reach the unauthenticated CDP bridge.
- Four accuracy corrections to the plan's current-state section: test density is
  now 104 test files / 115 non-test source files (not 99/109); seven source
  files exceed 1,000 lines and `webhook-server.ts`/`channels/slack.ts` displace
  `ipc.ts` from the top five; two risk-register severities are miscalibrated;
  and the Wave-0 autonomy suspension cannot be performed by configuration
  because `src/autonomy-policy.ts:39-55` reads `process.env`, which
  `src/env.ts` deliberately never populates and
  `setup/launchd/com.nanoclaw.plist:7-15` does not set.
- Overengineering challenged: the 13-process catalog, the eleven-SLI list, the
  eleven-module decomposition list, the fuller decision-envelope list, the
  privacy/records program, and three overlapping Wave-4 deliverables.
- Nine acceptance criteria corrected, including P0.6's "a malicious skill PR
  cannot execute arbitrary shell through manifest data", which is unachievable
  while `.github/workflows/skill-pr.yml:101,109` run `npm ci` and
  `apply-skill.ts` over PR-controlled content; removing the `eval` at `:124` is
  still correct but is not that control.
- Disposition: **accept with changes**. Architecture, loop designs, authority
  model, change classes, and measurement chain accepted as written; Wave 0
  contents reordered and the six-week slice replaced.
- Verification: 2026-07-29T13:05Z — `npm run docs:continuity-check` passed
  (schema sanitizer self-test passed; 16 active/ready task rows, 16 changelog
  entries) and `git diff --check` passed with no output. As with the original
  NC-20260729-001 registration, both ran under this shell's Node 26.5.0 because
  the pinned Node 22 version manager is not installed in this environment; both
  are documentation-only checks and no product or runtime suite was needed or
  run. `git status --porcelain` after the change shows the two continuity edits
  plus the new report, with all five pre-existing dirty paths
  (`knowledge/agents/sales/LEARNED.md`, `scripts/copiers/copy_chat.py`,
  `scripts/copiers/copy_people.py`, `src/markdown-to-email-html.ts`,
  `src/markdown-to-email-html.test.ts`) untouched.
- Deployment/migration: not applicable. No runtime, database, credential, agent,
  external system, deployment, or machine setting was changed; the pre-existing
  dirty worktree was preserved.
- Rollback/recovery: delete `docs/reports/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md`
  and revert the NC-20260729-001 rows in `docs/ACTIVE-WORK.md` and this file.
- Documentation: report plus active-work and changelog lifecycle updates. The
  improvement plan was deliberately not modified, per the brief.
- Follow-ups requiring their own `planned` rows and owners: (1) read-only check
  on the Mac Mini for whether `com.nanoclaw.healer.fast` is loaded and whether
  the procurement CDP bridge is bound; (2) `com.nanoclaw.repo-hygiene` is loaded
  on the Mac Studio and exits 127 daily because
  `tools/clean-sync-conflicts.sh` is absent from the repository, leaving fifteen
  `*.sync-conflict-*.ts` files in `src/` and inside the `tsconfig.json`
  `include` graph; (3) reconciliation of accepted findings into
  `docs/COMPANY-OS-IMPROVEMENT-PLAN.md` by human/Codex under a new task ID.

### NC-20260728-007 — Drop ingestion subsystem stopped pending redesign

- Date: 2026-07-28T23:09Z
- Owner/client: human (redesign); Claude Code (stop + record)
- State: planned
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `cd78ad2`
- Change class: C2 — reversible; scheduler/job disable, no data deleted
- Affected systems: launchd jobs `com.nanoclaw.copy-calendar`, `copy-chat`,
  `copy-email`, `copy-people`
- Action: all four jobs booted out and their plists renamed to
  `*.plist.disabled` so the stop survives reboot. No copier process is running.
  Nothing was removed from `Drop`.
- Rationale: the upstream Solera export is dead. Last delivery by file mtime —
  Chats 2026-07-15 16:00, People 2026-07-15 17:19, Calendar 2026-07-16 10:17,
  Email 2026-03-28. The copiers had spent roughly twelve days retrying a frozen
  pile, which is what pinned `fileproviderd`.
- Effect: `fileproviderd` fell from 109% to 48.9% CPU. The remaining load is the
  finite OneDrive upsync delete backlog draining on its own.
- Correction to the NC-20260728-006 record: that entry described `Drop/` as a
  live ingest channel. It is not, and has not been since 2026-07-16. The code
  dependency is real; the data flow is not.
- Residual state: 161,887 files in `Drop/Calendar`, 4,782 in `Drop/Chats`, left
  in place deliberately.
- Not done: no investigation of why the upstream export stopped. That is
  off-machine and belongs to the redesign.

### NC-20260728-006 — Chat/people copiers materialize OneDrive placeholders instead of failing every file

- Date: 2026-07-28T23:05Z
- Owner/client: Claude Code
- State: deployed_unverified
- Commit/PR: uncommitted on `codex/continuity-reconciliation` @ `cd78ad2`
- Change class: C2 — reversible internal write; scheduler/job + incident fix
- Affected systems: `scripts/copiers/copy_chat.py`,
  `scripts/copiers/copy_people.py`, launchd job `com.nanoclaw.copy-chat`
- Symptom: `fileproviderd` held 100-110% CPU with visible keyboard and trackpad
  stutter. `sample` attributed the hot serial queue to
  `com.microsoft.OneDrive-mac.FileProvider/…: database`. Of five FileProvider
  domains, only OneDrive was making progress; iCloud (27,542), Synology (17,172),
  and Google Drive (57,743) reconciliation counts were unchanged across a
  six-minute interval and therefore idle, not spinning.
- Root cause: launchd-spawned processes can run with dataless-file
  materialization disabled, making every read of a OneDrive placeholder fail
  with `EDEADLK`, including `shutil.copy2`. `copy_calendar.py` and
  `copy_email.py` opt in via `setiopolicy_np(3, 0, 2)`; `copy_chat.py` and
  `copy_people.py` carried the explanatory comment but never the call. Each
  failure skipped `f.unlink()`, so the file remained in the drop and launchd
  retried all 4,850 chat files every 300s indefinitely.
- Secondary defect: neither script had the 10 MB log-rotation guard present in
  `copy_calendar.py`. `copy_chat.log` had reached 18.6 GB.
- Change: ported the `setiopolicy_np` opt-in and the rotation guard into both
  scripts.
- Evidence:
  - before: `copy_chat.log` contained 1,116 `FAILED` lines in its final 400 KB
    and zero `COPIED`, with the most recent failure at 17:59 local;
  - after a 60s manual run: 23 `COPIED`, 0 `FAILED`; `Drop/Chats` went from
    4,848 to 4,825 files;
  - `fileproviderd` fell from 109% to 74.3% CPU.
- Containment applied before the change: `com.nanoclaw.copy-chat` booted out and
  `copy_chat.log` truncated, reclaiming 17 GB of disk. The job was bootstrapped
  again after the fix.
- Not verified: steady-state drain of the 4,825-file `Drop/Chats` backlog under
  launchd; sustained CPU after the backlog clears.
- Production/external state: OneDrive remains linked, so the copiers' `unlink`
  calls continue to replicate deletions to the Solera tenant. Unchanged by this
  work.
- Known remaining defect, not addressed here: `copy_calendar.py` fails with
  `[Errno 60] Operation timed out` rather than `EDEADLK` — 125,321 `FAILED`
  against 85 `COPIED` in the current log. It has the materialization opt-in, so
  the cause is distinct: 161,887 files in `Drop/Calendar` are rescanned in full
  every 300s with no per-file state, and most materialization fetches time out.
  This is now the dominant remaining `fileproviderd` load and needs its own task.

### NC-20260728-005 — Restore the Node 22 test baseline

- Date: 2026-07-28T12:25Z
- Owner/client: Codex + Claude validator
- State: validating
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C2 — test/implementation reliability; no production state
- Affected systems: SQLite tests, Gmail IPC/content-guard fixtures, container
  runner/runtime tests, group queue tests, and formatting expectations
- Baseline evidence:
  - pinned Node 22 typecheck passes;
  - clean `a6e4b13`: 41 failures, 1,436 passes, 9 unhandled errors;
  - current Claude batch before repair: 49 failures, 1,546 passes, 9 errors;
  - all eight added failures were IPC handoff tests whose database mock omitted
    the new watchdog accessor; adding that mock restored all 12 IPC tests;
  - the repaired pinned suite passes all 124 files and 1,595 tests with zero
    failures or unhandled errors. Webhook and `tsx` migration tests require
    temporary local listeners and therefore ran with local-listener permission;
    their sandbox-only failure mode was `listen EPERM`.
- Product defects repaired:
  - bot-authored SQLite rows no longer re-enter ordinary inbound polling;
  - retry keys remain stable instead of growing `||root` on every attempt;
  - scheduled tasks and root-message containers now share queue state, so task
    priority and the one-container-per-destination boundary hold.
- Test contracts reconciled with intentional behavior: per-message thread
  metadata, outbound email content guards, detached file-backed container logs,
  and bounded container-runtime commands.
- Guardrail: do not alter production behavior merely to satisfy a stale
  assertion. Product changes require an independently valid failure mode and
  focused regression evidence.
- Production/external state: none.
- Follow-ups: complete build/package/document checks and obtain Claude review.
- Validator boundary: Claude Code 2.1.220 was configured for a tool-disabled,
  sessionless Opus review of an email/path-redacted staged patch. The sandboxed
  attempt failed with `ENOTFOUND`; the network retry was blocked by the privacy
  gate pending explicit user approval for private repository egress. No review
  result was produced.

### NC-20260728-004 — Company-OS continuity reconciliation

- Date: 2026-07-28T12:03Z
- Owner/client: Codex + Claude validator
- State: validating
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation` from `a6e4b13`;
  push pending
- Change class: C2 repository writes; reconciliation includes source for a C5
  least-privilege database boundary but performs no identity or production write
- Affected systems: Git tracking policy, continuity records/checker, CI Node
  selection, group/business source authority, generated schema documentation,
  and the full July 23-28 uncommitted batch
- Findings:
  - four Claude tasks were registered after implementation began;
  - five additional post-protocol change clusters had no task/changelog record;
  - migration 113, the entire ordered migration history, the business database
    guide, and required Sales support procedures were Git-ignored;
  - NC-20260728-001 was marked `complete` while uncommitted;
  - the SQLite schema snapshot embedded live sample rows;
  - the continuity checker validated document shape but not tracking,
    authoritative artifacts, unsafe schema samples, or misleading completion;
  - the active shell runs Node 26 while `.nvmrc` requires Node 22.
- Remediation in progress:
  - promote named group operating support, the business guide, and ordered
    `business_v2` migrations to Git while retaining runtime/auth/conversation
    exclusions;
  - register retrospective work with explicit evidence limits;
  - normalize lifecycle state and update the project/data authority maps;
  - make tracked schema snapshots structure-only and make sanitization part of
    every refresh;
  - strengthen continuity checks and CI; validate under Node 22; obtain an
    inspectable Claude review before handoff.
- Verification so far:
  - pinned Node 22 typecheck and formatting pass;
  - the root suite passes all 124 files / 1,595 tests;
  - the independent container runner builds and passes all 22 tests;
  - schedule and knowledge-regeneration test scripts passed;
  - schema-sanitizer self-test passed;
  - the staged continuity checker passed with 13 task rows and 13 changelog
    entries;
  - a read-only production metadata query confirmed migrations 111-112 are live:
    the view and role exist, with zero unexpected relation grants.
- Claude validation boundary: an email/path-redacted, tool-disabled review was
  prepared with Claude Code 2.1.220 and Opus. The initial call could not reach
  the API; the requested network retry was blocked pending explicit privacy
  approval for private repository egress. No Claude verdict is claimed.
- Production/external state: read-only metadata inspection only; no deployment,
  service restart, message/email, approval, schedule, credential, or data write.
- Rollback/recovery: revert only NC-20260728-004 reconciliation edits; do not
  revert the preserved Claude implementation batch or live database migrations.
- Documentation: active work, changelog, project map, business guide, schema
  references, tracking rules, and validation contract.
- Follow-ups: obtain explicit approval for the sanitized Claude API review,
  reconcile its findings, then create the committed/pushed handoff.

### NC-20260728-003 — Approved-send watchdog

- Date: 2026-07-28T11:50Z
- Owner/client: Claude Code
- State: deployed_unverified
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C3 — host runtime change plus one customer-facing email sent
- Affected systems: the NanoClaw host daemon (Slack approval path, IPC routing),
  `store/messages.db` (new `pending_sends` table), and one outbound email
- Outcome: the host now records that a send is owed whenever a `[SALES REVIEW]`
  card is approved, clears it when the matching `[HANDOFF: *→mailman]` is seen,
  and posts `[SEND NOT OBSERVED]` into the draft's thread when the grace period
  lapses with no handoff.
- Files:
  - `src/send-watchdog.ts` (new) + tests — `recordApproval`, `observeOutbound`,
    `sweepPendingSends`. Recipient-matched clearing: a handoff naming a
    different lead must not discharge this lead's expectation, or unrelated
    traffic would mask a real drop. One alert per approval; a failed post
    leaves the row for the next sweep.
  - `src/db.ts` — `pending_sends` table and accessors.
  - `src/ipc.ts` — `observeOutbound` on every outbound group message, called
    before routing so a held-then-cancelled send still counts as "the agent got
    that far".
  - `src/index.ts` — approval listener registered as an OBSERVER returning
    false, so the agent still receives the approval; 60s sweep interval.
- Deliberately NOT done: the host does not send the email itself. It holds the
  approved text, but re-deriving a body risks sending something other than what
  was approved — the 2026-07-23 regeneration failure. Alerting restores operator
  control without that risk.
- Remediation performed: Entry 938's approved reply was delivered at 11:43:12Z
  by injecting a `[HANDOFF: sales→mailman]` whose body was sliced verbatim from
  the approved card, not regenerated. Confirmed by `gmail_reply processed` and
  `[EMAIL SENT] to=… subject=Re: Questions about the AAMC Program and MCQ-PCC
Qualification`, i.e. correctly threaded on her original subject.
- Verification:
  - 2026-07-28T11:45Z — `npx tsc --noEmit` clean; 15 watchdog tests pass,
    covering grace period, recipient mismatch, alert-once, and post-failure
    retry.
  - 2026-07-28T11:47Z — clean rebuild and restart on the Mac Mini (pid 48854);
    `pending_sends` confirmed created in the live schema; startup log clean.
  - Not yet verified live: an actual `[SEND NOT OBSERVED]` alert. That requires
    a stalled approval, which cannot be manufactured without withholding a real
    customer email.
- Open gap recorded, not fixed: the send wrote no `business_v2.interactions`
  row. `gmail-ipc` logged `reply leadId missing, no thread history for lookup`;
  Oana's inbound interaction (id 2472) carries a NULL `source_thread_id`, so the
  thread-based party lookup had nothing to match. This breaks the outbound-based
  Thread-ID recovery path and follow-up cadence for affected parties.

### NC-20260728-002 — Readable ODF/iWork attachments, no silent drops

- Date: 2026-07-28T11:26Z
- Owner/client: Claude Code
- State: deployed_unverified
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C2 — host runtime behaviour and one agent-instruction line
- Affected systems: the NanoClaw host daemon's Slack attachment path (all
  groups, not only the grader) and the grader agent instructions
- Outcome: `.odt` / `.ods` / `.odp` uploads are extracted to text, Apple
  Pages/Numbers are extracted when they carry an embedded preview PDF, and every
  other attachment now yields an explicit note instead of nothing at all.
- Root cause: `downloadAndInlineFiles` had two branches (text, markitdown-doc)
  and no else. `application/vnd.oasis.opendocument.text` matches neither —
  `DOC_MIME_RE`'s `officedocument` alternative does not match `opendocument` —
  so the file contributed no content and no note, and the agent read the message
  as having no submission.
- Files:
  - `src/attachment-convert.ts` (new) — `classifyAttachment` routing plus
    `odfXmlToText`, `extractOdfText`, `extractIWorkPdf`. Zip entries are read
    with `unzip -p` (`/usr/bin/unzip`, present on the Mini), matching the
    existing shell-out-to-a-converter pattern. `odfXmlToText` converts block
    boundaries to line breaks BEFORE stripping tags, so paragraphs and table
    cells do not concatenate, and drops `office:annotation` so reviewer comments
    are not graded as submission text.
  - `src/channels/slack.ts` — dispatches on `classifyAttachment`; new
    `inlineOdfFile` / `inlineIWorkFile`; `fetchDocBuffer` extracted so all three
    converting paths share one size-check + download; a `default` branch that
    always emits a note.
  - `groups/grader/CLAUDE.md` — one line: a note-only `<attached_file>` means a
    file arrived that could not be read, so never answer it with "please attach
    the submission". Constrained to one line by the 200-line CLAUDE.md hook.
- Verification:
  - 2026-07-28T11:18Z — markitdown confirmed to REJECT `.odt`
    (`UnsupportedFormatException: The formats ['.odt'] are not supported`), so
    a dedicated ODF path was necessary rather than a routing fix.
  - 2026-07-28T11:22Z — extraction run against the real failing submission,
    `MENTORCOACHINGENGAGEMENTAGREEMENTCARLOSF.odt`: 6,723 characters recovered
    including the heading and the session table (`Carlos Flores` rows intact).
  - 2026-07-28T11:22Z — `submissions.numbers` (real, modern format) correctly
    yields no preview PDF and therefore takes the note path.
  - 2026-07-28T11:23Z — `npx tsc --noEmit` clean; 30 tests in
    `attachment-convert.test.ts` and 71 in `slack.test.ts` pass.
  - 2026-07-28T11:24Z — clean rebuild on the Mac Mini; `dist/attachment-convert.js`
    emitted and the new symbols present in `dist/channels/slack.js`. Daemon
    restarted via `launchctl kickstart -k`, running as pid 17587, startup clean.
  - Behaviour change to note: one existing test asserted images were skipped
    silently. That assertion was inverted deliberately — images now emit a note
    with image-appropriate wording, in every channel.
  - Not yet verified: a live `.odt` upload to `#gru-grader` grading end to end,
    and any live `.pages`/`.numbers` upload (no real sample with an embedded
    preview was available to test the success path).

### NC-20260728-001 — One Slack thread per sales lead

- Date: 2026-07-28T10:30Z
- Owner/client: Claude Code
- State: ready_for_review
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; deployed and
  live-verified before the review checkpoint; push pending
- Change class: C2 — host runtime behaviour, agent instructions, and one
  reversible per-group config write
- Affected systems: the NanoClaw host daemon (Slack send path and the agent
  output relay), the sales and inbox agent instructions, and
  `registered_groups.container_config` in `store/messages.db`
- Outcome: a lead now occupies one Slack thread — inbound message at the root,
  approval card and every later post threaded beneath it — and an over-length
  draft splits on a line boundary instead of inside a word.
- Reproduction: Entry 938 (Oana Tue), `#gru-sales`, 2026-07-28T09:22–09:27Z
  produced three root-level posts (handoff `1785230544.590929`, card
  `1785230834.912489`, recap `1785230838.601159`) and one mid-word continuation
  (`1785230835.048329`, opening "estation letter for the Standard Path").
- Files:
  - `src/lead-thread-key.ts` (new) — derives the canonical `lead:{email}`
    anchor. Scoped to lead-bearing messages (`[HANDOFF: *→sales]`,
    `[HANDOFF: sales→mailman]`, `[SALES REVIEW]`) and to labelled address
    fields only, because a false merge of two leads into one thread is worse
    than no merge. Tandem's own domains are skipped so the anchor is the lead.
  - `src/message-split.ts` (new) — boundary-aware splitting: blank line, then
    newline, then space, with a 60% fill floor so honouring an early boundary
    cannot emit a two-line chunk followed by a full one. Hard cut only when no
    boundary exists.
  - `src/channels/slack.ts` — a derived lead key overrides the author-supplied
    `threadKey`; lead threads do not set `reply_broadcast`, since broadcasting
    the card back to the channel bottom is the duplication the key removes; the
    over-length path uses `splitForSlack`.
  - `src/index.ts`, `src/types.ts` — `containerConfig.suppressFinalText` stops
    the host relaying the agent's final assistant text. It still marks
    `outputSentToUser`, so a late error cannot roll the cursor back and
    re-draft a lead that was already handled.
  - `groups/sales/WORKFLOWS.md` — the card gains a mandatory `Email:` line (the
    host threads on it) and replaces the verbatim `THEIR REQUEST` block with a
    one-or-two-line `THEIR ASK` summary. The mailman `Original-Message:` field
    is explicitly repointed at the handoff post at the thread root, which is
    the only remaining verbatim copy.
  - `groups/sales/CLAUDE.md`, `groups/sales/CLAUDE-MAIN.md`,
    `groups/inbox/CLAUDE.md`, `knowledge/shared/LEARNED-sales.md` — matching
    instruction updates, including an explicit "never post a recap".
- Verification:
  - 2026-07-28T10:24Z — `npx tsc --noEmit` clean.
  - 2026-07-28T10:24Z — 93 tests pass across `message-split.test.ts` (11),
    `lead-thread-key.test.ts` (11), and `slack.test.ts` (71, including 5 new
    canonicalization cases). Full suite: 172 failures, measured as identical to
    the pre-existing set by stashing this change and re-running the failing
    files; no new failures introduced.
  - 2026-07-28T10:26Z — `suppressFinalText` written for `sales` and `inbox` and
    read back from `registered_groups`; all 17 other groups confirmed UNSET.
  - 2026-07-28T10:26Z — source pushed to the Mac Mini after diffing every file
    against the Mini copy to confirm the only differences were this change.
  - 2026-07-28T10:27Z — clean rebuild on the Mac Mini after removing
    `tsconfig.tsbuildinfo`; `dist/lead-thread-key.js` and `dist/message-split.js`
    emitted, both symbols present in `dist/channels/slack.js`, and
    `suppressFinalText` present in `dist/index.js`.
  - 2026-07-28T10:27Z — daemon restarted via `launchctl kickstart -k`; startup
    log clean and Slack sends resumed.
  - 2026-07-28T10:39Z — a `[HANDOFF: chief→sales]` for the reproduction lead was
    injected through the real IPC path (`data/ipc/chief/messages/`) rather than
    posted to Slack by hand, so the host send path ran. The post anchored on
    `lead:oana.tue.coach@gmail.com`, confirming host-side derivation. The agent
    then correctly refused to re-draft (`[ALREADY-HANDLED]`, Entry 938 already
    at `sales review`), so this run did not exercise the card itself.
  - 2026-07-28T10:44–10:45Z — live end-to-end on the same lead via an operator
    correction and re-draft. The revised card carried the new format (`Email:`
    line, one-line `THEIR ASK`, no verbatim re-quote) at 1,994 characters
    against 4,782 across two parts for the 09:27 card — under Slack's limit, so
    it posted as a single message with no split at all. Zero sales posts
    followed the card, and the daemon logged
    `Final agent text suppressed (suppressFinalText)` at 10:45:28, confirming a
    recap was generated and dropped. The card threaded under the operator's
    active thread, which is the intended precedence: an explicit `threadTs`
    outranks the anchor, because that is where the human is reading.
  - Known residue: anchors created before this change keep their old namespaces
    (`sales:entry:*`, `inbox:lead:*`). A non-card post carrying a legacy key
    still resolves to the old thread — observed once on the `[ALREADY-HANDLED]`
    reply. Not backfilled: `SLACK_THREAD_TTL_MS` (8h) rolls dormant anchors over
    on their next use, and only two legacy anchors were inside that window.

### NC-20260727-001 — Durable party-scoped follow-up drop

- Date: 2026-07-27T15:10Z
- Owner/client: Claude Code
- State: deployed_unverified
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C3 — schema addition, host runtime behaviour, and a production
  data remediation
- Affected systems: `nanoclaw_business` (business_v2 schema), the NanoClaw host
  daemon, the sales agent instructions, and the daily `task-followup-daily` cron
- Outcome: an operator instruction to stop following someone up is now recorded
  against the party, honoured by the follow-up queue view, executed by the host
  on both the 👎 and the typed path, and confirmed from the rows the database
  returned rather than from the agent's intent.
- Files:
  - `data/business/migrations/nanoclaw-v2/113_followup_suppression.sql` — adds
    `parties.no_followup_at` / `no_followup_reason`, `fn_drop_followups`,
    `fn_resume_followups`, and the matching `v_sales_followup_queue` exclusion.
    `parties.dnd_at` was deliberately not reused: it means "unsubscribed via the
    email link" and is honoured by `v_active_pipeline`, so reusing it would also
    hide the lead from pipeline reporting.
  - `src/followup-drop.ts`, `src/followup-drop-parse.ts`,
    `src/followup-drop-deps.ts` and their tests — party-scoped drop plus a
    typed-instruction path.
  - `src/index.ts` — observes human messages in `#gru-sales`.
  - `groups/sales/WORKFLOWS.md` — the agent is told to use `fn_drop_followups`
    (party_id, no stage argument), to read back any state change before
    reporting it, and that skipping is not dropping.
- Safety properties of the typed path: it only ever drops a lead present in
  `v_sales_followup_queue`; it refuses to guess when a name matches more than
  one queued lead; it stays silent on draft edits that name no lead ("drop the
  pricing"); and it replies "matched no lead" instead of doing nothing silently
  when an explicit `#id` resolves to nothing.
- Verification:
  - 2026-07-27T14:55Z — `npx tsc --noEmit` clean.
  - 2026-07-27T14:55Z — 47 unit tests across the two new test files pass. Full
    suite: 172 failures, identical to the pre-existing failure set measured on a
    clean `HEAD` worktree (environment-dependent tests on this machine); the
    change adds 46 passing tests and no new failures.
  - 2026-07-27T14:58Z — migration 113 applied to `nanoclaw_business` on the Mac
    Mini; all statements committed.
  - 2026-07-27T14:59Z — clean rebuild on the Mac Mini after removing
    `tsconfig.tsbuildinfo`; `dist/followup-drop-parse.js`,
    `dist/followup-drop-deps.js`, `dist/followup-drop.js` emitted and
    `handleTypedDrop` present in `dist/index.js`.
  - 2026-07-27T14:59Z — daemon restarted via `launchctl kickstart -k`, running
    as pid 69020; startup log clean.
  - 2026-07-27T15:00Z — deployed wiring confirmed against the live
    `registered_groups` row mapping `slack:C0AHV1SGT6W` to folder `sales`.
  - Not yet verified: a live operator drop through the typed path, and a clean
    follow-up cron run. The next cron fires 2026-07-28 at 09:00.
- Deployment/migration: migration 113 applied and the daemon restarted, both on
  the Mac Mini only. The Mac Studio clone is not a runtime host.
- Data remediation: parties 10247, 10281, 10083, and 10407 suppressed;
  entries 213 and 239 moved to `nurture`. Entry 374 remains `won` and entry 345
  remains `lost` — the function does not touch terminal stages. The follow-up
  queue now returns zero rows for those parties.
- Rollback/recovery: `fn_resume_followups(party_id, reason)` per party; revert
  the view to migration 105 and drop the two functions and two columns to remove
  the schema change; revert the source files and rebuild.
- Documentation: `groups/sales/WORKFLOWS.md` updated in the same change.
- Follow-ups: commit the working tree; confirm the 2026-07-28 cron run drafts
  nothing for the suppressed parties; the duplicate `pipeline_entries` per party
  and duplicate parties per person remain an open data-quality issue that this
  change works around rather than resolves.

### NC-20260726-002 — Least-privilege inbound-document reader

- Date: 2026-07-26T21:44Z
- Owner/client: Claude Code (retrospectively registered)
- State: ready_for_review
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; deployed and
  live-verified before the review checkpoint; push pending
- Change class: C5 — new login identity and authorization boundary
- Affected systems: `business_v2.v_inbound_documents`, PostgreSQL role
  `bizmgr_reader`, and the bookkeeping read path
- Outcome: migration 111 exposes a normalized, one-row-per-document inbound-bill
  view; migration 112 creates a login role with only schema usage and SELECT on
  that view. The migration intentionally contains no password.
- Files: `data/business/migrations/nanoclaw-v2/111_v_inbound_documents.sql` and
  `112_bizmgr_reader_role.sql`.
- Verification:
  - 2026-07-28T12:03Z — read-only metadata query through the documented
    production host returned view exists = true, role exists = true, unexpected
    relation grants = 0;
  - migration 112 contains an assertion that rejects any additional relation
    grant at apply time;
  - no business rows, passwords, or credential values were retrieved during
    reconciliation.
- Protocol deviation: no active-work/changelog entry was created before the C5
  implementation or apparent production application. Original authorization,
  migration time, credential provisioning, and consumer end-to-end evidence are
  not reconstructable from tracked records.
- Deployment/migration: live objects verified; password/consumer connectivity
  deliberately not inspected.
- Rollback/recovery: revoke the view grant/schema usage and drop the role, then
  drop the view only under a separately authorized C5 rollback.
- Documentation: business guide, project map, active work, and this entry.
- Follow-ups: review and commit the migrations; confirm the downstream consumer
  through its own authorized release evidence.

### NC-20260726-001 — Structure-only schema reference refresh

- Date: 2026-07-26T08:00Z
- Owner/client: Claude Code + Codex reconciliation
- State: ready_for_review
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C2 — internal generated documentation and refresh tooling
- Affected systems: `agent_docs/messages-db-schema.md`,
  `agent_docs/nanoclaw-business-pg-schema.md`, and `tools/refresh-schemas.sh`
- Outcome: the July 26 snapshots captured current SQLite/PostgreSQL structure.
  During NC-20260728-004, the SQLite output was found to contain one live sample
  row per table. All sample sections were removed; both schema files had trailing
  whitespace normalized; refresh now applies a deterministic sanitizer before
  replacing the tracked SQLite document.
- Verification:
  - sanitizer self-test covers populated and empty sample blocks while retaining
    multiple schema sections;
  - tracked schema documents contain no `Sample row:` marker;
  - the PostgreSQL snapshot is annotated with a migration-113 overlay because
    its generated timestamp predates that migration.
- Protocol deviation: the original schema refresh had no active-work/changelog
  entry and published live operational samples into a tracked file.
- Production/external state: the original refresh read live schemas; the
  reconciliation performed no database write.
- Rollback/recovery: revert the generated docs/tooling only; never reconstruct
  removed samples from Git.
- Documentation: project map and this entry.
- Follow-ups: after an authorized live refresh, verify the generated PostgreSQL
  snapshot supersedes the migration overlay without publishing rows.

### NC-20260724-002 — Bounded knowledge regeneration

- Date: 2026-07-24T17:08Z
- Owner/client: Claude Code (retrospectively registered)
- State: ready_for_review
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C2 — internal knowledge/tool writes affecting C3 agent outputs
- Affected systems: `tools/regen-kb-delta.py`, its tests, knowledge
  manifest/state/source pieces, `KNOWLEDGE.md`, and shared/agent learned files
- Outcome: regeneration requests only affected sections and applies returned
  edits deterministically. Missing, ambiguous, or non-heading anchors fail
  closed before any knowledge/state write.
- Verification:
  - 2026-07-28 — 18 local splice/parser/batching/fail-closed checks passed;
  - the reconciliation did not call the external bridge or regenerate facts;
  - source-piece, manifest, state, and resulting knowledge changes remain
    available together for provenance review.
- Protocol deviation: implementation and generated knowledge changed after the
  protocol was introduced without an active-work/changelog entry.
- Deployment/external state: not established; tracked knowledge may be mounted
  by live agents through machine-local synchronization.
- Rollback/recovery: revert tool and knowledge artifacts as one provenance unit;
  never revert only the state file or only `KNOWLEDGE.md`.
- Documentation: active work and this entry.
- Follow-ups: human/Claude provenance review before commit; no external
  regeneration during code review.

### NC-20260724-001 — Fail-closed program schedule refresh

- Date: 2026-07-24T11:48Z
- Owner/client: Claude Code (retrospectively registered)
- State: ready_for_review
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C2 — scheduler/tool and generated agent-context behavior
- Affected systems: `tools/refresh-schedule.py`, its tests, the
  machine-local `schedule-refresh` job, and Sales/Inbox/Booking schedule files
- Outcome: calendar-debug structures are rendered by program type; dates remain
  attached to their timezone track; a failed program fetch prevents every write.
- Verification: 2026-07-28 — 16 rendering/selection/fail-safe checks passed. No
  credential values or live calendar payloads were printed.
- Protocol deviation: implementation occurred after the protocol was introduced
  without an active-work/changelog entry.
- Deployment/external state: job registration and last-run state are
  machine-local and were not established from the repository.
- Rollback/recovery: disable the job before reverting the tool; retain the last
  known-good schedule rather than writing a partial file.
- Documentation: `docs/MINION-FRAMEWORK.md`, active work, and this entry.
- Follow-ups: review and commit; verify job registration/last result separately
  on the runtime host.

### NC-20260723-003 — Email program-language guard

- Date: 2026-07-24T00:37Z
- Owner/client: Claude Code (retrospectively registered)
- State: ready_for_review
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C2 — host-side outbound content guard affecting C3 email
- Affected systems: `src/email-content-guard.ts` and its focused tests
- Outcome: block the known invented `MCT` acronym while allowing authoritative
  ICF URLs under `coachingfederation.org`.
- Verification: 2026-07-28 — all 10 content-guard tests passed as part of the
  195-test focused reconciliation set.
- Protocol deviation: implementation began after the shared protocol was added
  but no task/changelog entry was created.
- Deployment/external state: not established from tracked evidence.
- Rollback/recovery: revert the guard and tests; a rollback weakens outbound
  terminology enforcement and therefore requires explicit review.
- Documentation: active work and this entry.
- Follow-ups: review, commit, and establish deployment state before relying on
  the guard in production.

### NC-20260723-002 — Cross-client documentation continuity

- Date: 2026-07-23T16:19Z
- Owner/client: Codex
- State: ready_for_review
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C2 reversible internal CI/documentation control
- Affected systems: engineering workflow, documentation entry points, and
  pull-request CI
- Outcome: adds a shared change protocol, active-work register, engineering
  changelog, and required Claude/Codex entry-point links.
- Files: `CLAUDE.md`, `AGENTS.md`, `docs/CHANGE-PROTOCOL.md`,
  `docs/ACTIVE-WORK.md`, `docs/ENGINEERING-CHANGELOG.md`,
  `docs/PROJECT-MAP.md`, `docs/COMPANY-OS-IMPROVEMENT-PLAN.md`,
  `scripts/check-doc-continuity.mjs`, `package.json`,
  `.github/workflows/ci.yml`
- Verification: Claude adversarial protocol review completed; accepted
  corrections are incorporated. 2026-07-23T16:21Z — `node --check
scripts/check-doc-continuity.mjs`, `npm run docs:continuity-check`,
  `npm run typecheck`, and `git diff --check` passed.
- Deployment/migration: not applicable; no application or external state change
- Rollback/recovery: revert only these documentation changes
- Documentation: this entry is part of the change
- Follow-ups: review and commit the documentation set

### NC-20260723-001 — Company operating-system improvement plan

- Date: 2026-07-23T16:19Z
- Owner/client: Codex with Claude Code/Opus adversarial validation
- State: ready_for_review
- Commit/PR: `157cb1b` on `codex/continuity-reconciliation`; push pending
- Change class: C1 documentation/plan
- Affected systems: none yet; roadmap covers the full NanoClaw operating system
- Outcome: creates a source-evidenced, phased improvement plan and prioritized
  first 20 tickets.
- Files: `docs/COMPANY-OS-IMPROVEMENT-PLAN.md`,
  `docs/PROJECT-MAP.md`
- Verification: `git diff --check` passed; document has unique headings; Claude
  validation record includes accepted, corrected, and rejected findings
- Deployment/migration: not applicable; plan is proposed, not implemented
- Rollback/recovery: remove the plan and project-map index row
- Documentation: project map indexes the plan
- Follow-ups: leadership decisions and review before implementation

## Released

Add committed/released entries here without rewriting their historical
evidence. Include commit, deployment, migration, and live-verification details
only after each boundary is actually crossed.
