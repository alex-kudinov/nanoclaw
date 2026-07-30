# NC-20260729-001 — Adversarial validation of the Company-OS v2 upgrade plan

Task brief: `docs/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md`
Validator: Claude Code, model `claude-opus-5[1m]` (Opus 5, 1M context), maximum effort
Date: 2026-07-29
Change class: C1 — documentation and read-only repository validation
Repository state at review: branch `codex/continuity-reconciliation`, HEAD `cd78ad2`,
8 changed paths in the working tree, preserved unmodified.
Machine: Mac Studio development checkout, not the Mac Mini runtime host. Local
shell Node 26.5.0 against `.nvmrc` = 22.

## 0. Evidence boundary

What this review did: read the tracked documents named in the brief, then read
the implementing source, migrations, CI workflows, launchd templates, and ignore
rules to check each claim. Two local read-only host observations are recorded and
labelled: `launchctl list` on this machine, and the presence/absence of files in
this working directory.

What this review did **not** do: connect to the Mac Mini, the VPS, PostgreSQL,
Gmail, Slack, Stripe, Plutio, Trafft, Sertifier, Firebase, or n8n; start or stop
any service; read `.env*`, session, credential, log, database, or backup
**contents**; modify any application source, prompt, schema, migration,
configuration, launchd unit, knowledge file, or runtime state; or touch
`docs/COMPANY-OS-IMPROVEMENT-PLAN.md`.

Every "requires live verification" basis below means exactly that: the tracked
repository cannot settle it, and a read-only check on the runtime host is needed.

Severity scale: `critical` (unauthenticated or unbounded consequential action),
`high` (a control the plan relies on does not hold), `medium` (real defect with
bounded blast radius), `low` (accuracy/hygiene).

---

## 1. Executive verdict

**The direction is right. The stated ordering is wrong, and it is wrong in a way
that costs months.**

The modular-monolith operating-kernel thesis is correct and well argued: keep one
deployable process, add explicit internal planes, keep external systems
authoritative for the facts they originate, and make the ledger own process state
only. The four internal systems, the three bounded intelligence loops, and the
refusal to add agents or microservices are all supported by what the code
actually looks like. Nothing in this review argues for a different architecture.

The problem is that the plan describes the risk landscape at the level of
*programs* (capability gateways, manifests, ledgers, evaluation harnesses) and
therefore schedules months of work before anything closes. Reading the source
shows that the largest currently-open hole is not a missing program. It is a
missing `if` statement.

`src/ipc.ts` authorizes `classify_*` to mailman only (`:569`) and `route_lesson`
to chief only (`:524`). It applies **no source-group check whatsoever** to
`gmail_send`, `gmail_reply`, `gmail_search`, `gmail_read`, `gmail_get_thread`
(`:470-497`). The in-container MCP server registers all five for every group
(`container/agent-runner/src/ipc-mcp-stdio.ts`), and `ALLOWED_TOOLS`
(`container/agent-runner/src/index.ts:92-100`) is one hard-coded list applied
identically to all ~16 agents. The recipient guard that is supposed to be "the
last line before Gmail sends" only enforces the party allowlist when the agent
chooses to supply `leadId` (`src/gmail-ipc-handlers.ts:382-385`). And the reply
path — the path that actually sends customer email — never calls the recipient
guard at all and passes an agent-supplied `cc` straight through
(`src/gmail-ipc-handlers.ts:154-282`, `src/gmail-api.ts:405-411`).

The net effect: every agent container that ingests untrusted external content —
grader (student submissions), procurement (portal HTML), archivarista (meeting
transcripts, cloud drive), newsroom and social (web content), courses — holds an
unauthenticated primitive to read the entire company mailbox and to send or reply
from it. That is a one-hop prompt-injection-to-customer-email path. It is closable
in roughly a day of work using the exact pattern already present two screens away
in the same file.

The plan's Wave 0 does not contain that item. It contains Node 22 alignment, CI
`eval` removal, sync-conflict quarantine, and documentation reconciliation — all
correct, none of which close this.

Second-order verdict: three of the plan's headline risk statements are
miscalibrated against source. Procurement's Chrome is **already** a dedicated
isolated profile, so that "critical" is largely closed — but the CDP socket is
bound to the shared container bridge where *every* agent can reach it, which the
plan never says. The healer's "non-interpolated execution" framing mis-names the
defect; the shell escaping is correct, while the tracked launchd template ships
`HEALER_IMPLEMENT_ENABLED=1` against a source comment that says "default off —
ship dark". And the autonomy brakes the plan proposes to pull cannot be pulled:
the `AUTONOMY_*` knobs read `process.env`, which this codebase deliberately never
populates from `.env` (`src/env.ts`), and the tracked `com.nanoclaw.plist` does
not set them.

**Disposition: accept with changes.** Keep the architecture. Replace Wave 0.
Reduce the six-week slice from eight parallel workstreams to five sequential ones
and put the authorization fixes first.

---

## 2. Claim verification

Each claim is marked **verified**, **verified with correction**, or **rejected**,
with file:line evidence.

### Claim 1 — Sales autonomy sweep — **verified**

> Starts whenever Slack is available, defaults to Sales, promotes after 15
> approved-unchanged drafts into a 120-minute hold-and-auto-approval path.
> Pricing and payment issues remain guarded; other outbound C3 categories do not
> require outcome/evaluation evidence.

- Start condition: `src/index.ts:1637-1653` — `const slackForAutonomy =
  channels.find(c => c instanceof SlackChannel); if (slackForAutonomy) { …
  startAutonomySweep(autonomyDeps); }`. There is no feature flag, no
  environment gate, and no explicit enablement step. Slack connected ⇒ ladder
  running.
- Default group: `src/autonomy-policy.ts:51-56` — `process.env.AUTONOMY_GROUPS
  || 'sales'`.
- Streak and window: `src/autonomy-policy.ts:39-48` — `AUTONOMY_PROMOTE_STREAK`
  default `'15'`, `AUTONOMY_VETO_MINUTES` default `'120'`.
- Guarded set: `src/autonomy-policy.ts:33-36` — `{'pricing','payment-issue'}`;
  enforced at `:166-176` (`shouldPromote`) and `src/autonomy-ledger.ts:126`.
- Evidence used for promotion: `src/autonomy-ledger.ts:186-197` — `approved_clean`
  increments a streak; `shouldPromote` fires at 15. `approved_clean` is defined
  at `:156-169` as "an approval message arrived before any operator feedback".
  No delivery outcome, no reply, no complaint, no reversal, no sampled review,
  and no evaluation result participates.
- Auto-approval: `src/autonomy-hold.ts:120-137` injects a synthetic
  `✅ Auto-approved` message into the normal inbound pipeline; the existing
  approval machinery then drives the real send. `:139-162` fires it once
  `expires_at` passes with no operator activity in the thread.

Two details worth carrying into the plan:

- **`expired` is neutral.** `src/autonomy-ledger.ts:173-175` classifies a draft
  with no response in 72h as `expired`, and `applyOutcome` (`:205-207`) neither
  increments nor resets the streak. A quiet week does not slow promotion.
- **Promotion is announced, not authorized.** `src/autonomy-hold.ts:174-181`
  posts a 🎓 message when a category promotes. There is no acknowledgement step.

Severity: high. Basis: evidence-supported.
Backlog change: keep the Wave-0 suspension item, but see F-6 — it currently has
no working configuration lever.

### Claim 2 — Healer implementation path — **verified with correction**

> The tracked fast-healer launchd template enables code implementation. The path
> requires a human reaction but can create/switch a branch in the current
> checkout, invoke Claude with bypassed permissions, and push a draft PR. Live
> load state not established.

Verified:

- `setup/launchd/com.nanoclaw.healer.fast.plist:9-10` sets
  `HEALER_IMPLEMENT_ENABLED` = `1`. `src/healer/implement.ts:35-37` gates the
  whole path on exactly that value.
- Human reaction required: `src/healer/implement.ts:102-113`
  (`operatorRequestedImplement` reads 👍/✅ reactions or an apply/implement
  reply), and the candidate set is trust-gated at `:79-93` to
  `confidence IS DISTINCT FROM 'low' AND cause_or_symptom = 'root_cause'`.
- Branch in the current checkout: `:116-135` — `spawn('bash', ['-lc', script],
  { cwd: process.cwd(), detached: true })` where `script` begins
  `git checkout -b ${branch} … || git checkout ${branch};`.
- Bypassed permissions: `:121` — `claude -p '${task}' --permission-mode
  bypassPermissions`.
- Draft PR: `:62-63` — the task text instructs `open a DRAFT PR to origin with
  gh. Do NOT merge, do NOT push to main/master or the upstream remote.`
- Live load state: on **this** machine `~/Library/LaunchAgents/` contains no
  `com.nanoclaw.healer.*` plist and `launchctl list` shows only
  `com.nanoclaw.recording-watcher` and `com.nanoclaw.repo-hygiene`. This machine
  is not the runtime host, so this is evidence of nothing about the Mini.

**Correction to the plan's framing.** The Wave-0 item says "redesign it around
disposable worktrees and *non-interpolated execution*". The interpolation is not
the defect. `src/healer/implement.ts:118` applies correct POSIX single-quote
escaping (`.replace(/'/g, "'\\''")` yields `'\''`), so a quote in the diagnosis
cannot break out of the `claude -p '…'` argument. The three real defects are:

1. **The tracked template contradicts the source's stated intent.** The file
   header comment (`:10-11`) says "Fenced like Phase 2: HEALER_IMPLEMENT_ENABLED
   (default off — ship dark until the headless pipeline invocation is verified)".
   The tracked plist ships it on. Whichever is correct, the repository currently
   asserts both.
2. **The blast radius is the live operational checkout, not the shell string.**
   `git checkout -b` carries any uncommitted work onto the fix branch. This
   repository, by its own documentation (`AGENTS.md`: "This repository commonly
   carries operational work that is not yet committed"; `docs/PROJECT-MAP.md`
   §19: 102 changed paths at the last snapshot), habitually has a dirty tree. The
   dev-pipeline is then told to "commit and open a DRAFT PR", which sweeps
   unrelated operational work into that PR, and leaves the checkout the daemon
   builds from sitting on `healer/fix-N`.
3. **The prompt is the untrusted input.** `buildTask` (`:51-65`) interpolates
   `inc.diagnosis` and `inc.proposed_fix` — both produced by an LLM that read
   incident `raw_context`, which is derived from logs containing content the
   system ingested from email, webhooks, and web pages. That text becomes the
   task for a host-level Claude run with `bypassPermissions`, `gh` credentials,
   and write access to the repository. Escaping is irrelevant to this; content
   authority is the control.

Severity: critical (if loaded live). Basis: evidence-supported for the code and
the template; **requires live verification** for whether the unit is loaded on
the Mini.
Backlog change: replace "non-interpolated execution" with "(a) set
`HEALER_IMPLEMENT_ENABLED=0` in the tracked template today, (b) run in a
disposable `git worktree` rooted outside the deploy checkout, (c) treat
diagnosis text as untrusted input to a host-level agent run."

### Claim 3 — `learn_lesson` writes before the contradiction check — **verified**

- `src/learn-ipc-handler.ts:66` — `fs.appendFileSync(learnedPath, …)`.
- `:73-80` — `// Contradiction check — fire-and-forget; the lesson is already
  captured.` then `void checkLessonConflict(...)`.
- `src/lesson-conflict.ts:12-14` states the design intent explicitly: "the lesson
  always lands first (capture must never lose data); the check annotates
  afterwards."

Three findings the claim does not capture, all in the same path:

- **Bridge failure leaves the lesson silently operative.** `src/lesson-conflict.ts:142-144`
  catches every error into `logger.warn`. If the Print Bridge is down, rate-limited,
  or returns unparseable output (`parseVerdict` returns `undefined` at `:56-66`),
  the lesson is neither flagged nor escalated.
- **The operator is told something untrue.** The Slack message at `:128-130` says
  "Both are now marked CONTESTED in `{agent}/LEARNED.md`". `flagContested`
  (`:69-80`) inserts the status line under the **new** lesson only; the
  conflicting prior lesson is untouched.
- **The copy agents read never carries the flag.** `route_lesson` copies
  `knowledge/agents/{agent}/LEARNED.md` to `knowledge/shared/LEARNED-{agent}.md`
  at `src/learn-ipc-handler.ts:205-214`, **before** launching the check at `:228`.
  Nothing re-syncs after `flagContested` writes. The shared file is the durable
  artifact; the CONTESTED marker never reaches it.
- **The file header asserts a control that does not exist.** `LEARNED_HEADER`
  (`:125-133`) reads "_Lessons that override all other knowledge._" and "_Each
  lesson was provided or approved by a human._" The second sentence is false for
  the `learn_lesson` path, which is an agent writing its own override rule.

Severity: high. Basis: evidence-supported.
Backlog change: the Wave-0 "make learned rules quarantined candidates" item is
correct and should additionally require that (a) the promotion artifact is what
agents mount, and (b) the header text matches the enforced control.

### Claim 4 — Containers receive scoped PostgreSQL plus raw integration credentials — **verified**

`src/container-runner.ts:390-631` (`readSecrets`). Per-group injection:

| Group | Injected |
| --- | --- |
| all with a role mapping | `BUSINESS_DB_URL` with role+password, `PGOPTIONS` (`:474-523`) |
| `main` | `BUSINESS_DB_ROLE_ADMIN` / `PASS_ADMIN` (`:491-494`) |
| `archivarista` | `OBSIDIAN_API_KEY` (`:526-531`) |
| `booking` | `TRAFFT_API_URL` / `CLIENT_ID` / `CLIENT_SECRET` (`:534-544`) |
| `courses` | `HEARTBEAT_API_KEY`, `EMAIL_USER`, `EMAIL_PASS` (`:547-556`) |
| `inbox`,`booking`,`sales`,`certifier` | `PLUTIO_API_CLIENTID` / `CLIENTSECRET` / `SUBDOMAIN` (`:559-567`) |
| `procurement` | `BONFIRE_USERNAME` / `BONFIRE_PASSWORD` (`:570-576`) |
| `contador` | `STRIPE_RESTRICTED_KEY`, `STRIPE_SECRET_KEY_ALT`, `SHEETS_PAYMENTS_ID`, `SHEETS_ROSTER_ID` (`:615-628`) |
| all | Claude OAuth token pool + `ANTHROPIC_API_KEY_FALLBACK` (`:455-471`) |

Two refinements: the `main` group receives the **admin** database role, not a
group-scoped one — worth stating separately in the risk register because it is
the DDL-capable identity. And `courses` receives a raw mailbox
`EMAIL_USER`/`EMAIL_PASS` pair, a second outbound-email primitive distinct from
the Gmail IPC path.

Severity: high. Basis: evidence-supported.
Backlog change: P0.2 is correctly scoped. Add "remove the admin role from any
runtime container" as an explicit sub-item; it is a one-line map change.

### Claim 5 — Procurement CDP to a persistent host Chrome — **verified, and the plan's associated risk is both overstated and understated**

Verified: `src/container-runner.ts:577-611` resolves
`http://192.168.64.1:9250` and writes `agent-browser.json` with `cdp` plus a
**host** `downloadPath` (`~/Vaults/My Notes/Tandem/Procurement`).
`scripts/start-procurement-browser.sh` runs Chrome with
`--remote-debugging-port=9250` and bridges it with
`socat TCP-LISTEN:9250,bind=192.168.64.1,fork,reuseaddr`.

**Overstated.** `docs/COMPANY-OS-IMPROVEMENT-PLAN.md` §4.2 says "Procurement can
connect to a logged-in host Chrome CDP endpoint" and the risk register rates
"Procurement agent reaches operator Chrome sessions" as *critical*. The script
already uses a dedicated profile — `--user-data-dir="$HOME/Library/Application
Support/Google/Chrome/NanoClaw-Procurement"`, `--disable-sync`, with the inline
comment "Dedicated profile keeps this isolated from personal Chrome." The
Wave-0 item "Disable general host Chrome CDP; retain only a dedicated
procurement profile if the workflow is justified" is therefore **already
substantially implemented**. Rate it medium and mark the containment as done;
what remains is deciding whether the Bonfire session itself is worth the
residual exposure.

**Understated.** The socket is bound to `192.168.64.1` — the Apple Container
vmnet gateway, reachable from **every** agent VM on that bridge, not only
procurement's. `buildContainerArgs` (`src/container-runner.ts:633-691`) sets no
`--network` isolation for any group. CDP has no authentication. Consequences,
available to any container: drive the browser with the procurement session
cookies; `Page.navigate` to `file://` to read host files readable by the user;
and cause downloads to be written to a host path outside every container mount.
This is a container→host escalation the plan does not describe. See F-7.

Severity: critical (as restated). Basis: evidence-supported for the binding and
the missing network isolation; **requires live verification** that the socat
bridge is currently up on the Mini.

### Claim 6 — No single final-boundary global external-write safe mode — **verified**

Repository-wide search for `DRY_RUN`, `SAFE_MODE`, `safeMode`, `KILL_SWITCH`,
`EXTERNAL_WRITES`, `READ_ONLY_MODE` across `src/**/*.ts` (excluding tests and
sync-conflict copies) returns nothing. Every switch that exists is
healer-scoped: `HEALER_QUIET` (`src/healer/orchestrator.ts:41`,
`remediate.ts:125`, `implement.ts:205`), `HEALER_AUTO_REMEDIATE`
(`remediate.ts:4`), `HEALER_IMPLEMENT_ENABLED`, `HEALER_DIAGNOSE_ENABLED`.

One partial lever exists and the plan should name it, because its asymmetry is
itself the finding: `GMAIL_TEST_RECIPIENT` redirects outbound mail
(`src/gmail-ipc-handlers.ts:284-306`) but `applyTestRouting` is called **only**
from `handleGmailSend` (`:424`). `handleGmailReply` — the path that carries
approved customer replies — never calls it. An operator who set
`GMAIL_TEST_RECIPIENT` believing they had contained outbound email would still
send real replies.

Severity: high. Basis: evidence-supported.
Backlog change: the Wave-0 safe-mode item stands. Add an explicit acceptance
clause that the drill must cover `gmail_reply` and the `courses` SMTP path, not
only `gmail_send`.

### Claim 7 — Skill CI executes a manifest command with shell `eval` — **verified, and there are two more sinks**

- `.github/workflows/skill-pr.yml:116-124` — `TEST_CMD` is read from the PR's own
  `.claude/skills/${{ matrix.skill }}/manifest.yaml` and executed with
  `eval "$TEST_CMD"`.
- `:109` and `:119` interpolate `${{ matrix.skill }}` — a value derived from a
  PR-controlled directory name (`:72-77`) — directly into `run:` shell. That is
  the standard GitHub Actions script-injection sink and is independent of `eval`.

**Correction to the acceptance criterion, not to the claim.** P0.6 states the
acceptance as "a malicious skill PR cannot execute arbitrary shell through
manifest data." That is not achievable by removing `eval`, because the same job
already runs `npm ci` (`:101`) and `npx tsx scripts/apply-skill.ts` (`:109`) over
PR-controlled content — lifecycle scripts and the applied skill are arbitrary
code by design. Removing `eval` is still correct and cheap; it just is not the
control that makes the claim true. The control that does is **containment**: no
secrets in the job, `permissions: contents: read`, and no `${{ }}` in `run:`.

Also relevant: `skill-pr.yml` declares no `permissions:` block at all (only
`skill-drift.yml:17` does), so it inherits the repository default.

Severity: medium. Basis: evidence-supported.

### Claim 8 — Runtime enforcement is incomplete — **verified, and wider than stated**

- `.nvmrc` = `22`; `.github/workflows/ci.yml:14` uses `node-version-file: .nvmrc`.
- `package.json:50-52` — `"engines": { "node": ">=20" }`. This admits Node 20 and
  also admits Node 26, which is the version actually running on this workstation
  (`node --version` → `v26.5.0`) and the source of the native-binding failures
  recorded in `docs/PROJECT-MAP.md` §17. A `>=` range cannot express the
  requirement.
- `.github/workflows/skill-pr.yml:99`, `skill-drift.yml:35`, `skill-drift.yml:63`
  — `node-version: 20` hard-pinned.
- No startup enforcement: no reference to `process.version` anywhere in `src/`.

Severity: medium. Basis: evidence-supported.
Backlog change: "Finish Node 22 enforcement" should read "pin `engines` to an
exact major, replace the three `node-version: 20` pins with `node-version-file`,
and add a startup refusal" — the exact-major pin is the part that actually stops
Node 26.

### Claim 9 — Gmail history expiry creates an unmeasured gap — **verified**

`src/channels/gmail.ts:711-723`:

```ts
} catch (err) {
  if (err instanceof HistoryExpiredError) {
    logger.warn({ start, notifHistoryId },
      'Gmail history expired, resetting baseline (data loss window)');
    setStoredHistoryId(notifHistoryId);
    return;
  }
```

No bounded backfill, no count of skipped messages, no alert beyond a `warn`, no
watermark-age metric. `src/gmail-push.ts:30-33` names the condition
`HistoryExpiredError` (">7 days"). A related unbounded case sits at
`src/channels/gmail.ts:699-707`: with no stored baseline the first push seeds
from the notification and returns, explicitly unable to backfill.

Severity: high. Basis: evidence-supported. Business impact — a silently dropped
inbound lead or client email — is the highest-value failure in the whole system
and is currently invisible.

### Claim 10 — At least one webhook path lacks a stable upstream event ID — **verified, three instances**

`src/webhook-extractors.ts`:

- `:131-133` — `extractContactForm` returns `event_id: null` with the comment
  "Returning null disables idempotency" and `TODO: ask n8n to forward GF entry_id
  so we can dedup intentional retries."
- `:45-47` — the `default` branch returns `NONE` for **any** hook id not in the
  switch. New webhook sources are un-deduplicated by omission, silently.
- `:184-196` — `extractFormSubmitted` keys on a UTC minute bucket computed from
  `received_at`/`submitted_at` **or `Date.now()`**. When the payload carries no
  timestamp, a genuine provider redelivery more than 60 seconds later produces a
  different key, so intentional-retry dedup fails there too.

Severity: medium. Basis: evidence-supported.
Backlog change: the Wave-1 "converge on one deduplication contract" item should
require that the `default` branch **fails closed** (reject or quarantine an
un-keyable envelope) rather than silently disabling idempotency.

### Claim 11 — Outbound email without a canonical interaction because thread lineage was absent — **verified, and it is a bootstrap defect**

Tracked evidence: `docs/ENGINEERING-CHANGELOG.md` NC-20260728-003 records the
send completing (`gmail_reply processed`, `[EMAIL SENT]`) with no
`business_v2.interactions` row, and `gmail-ipc` logging `reply leadId missing, no
thread history for lookup`.

The source explains why it is structural, not incidental.
`src/gmail-ipc-handlers.ts:94-103`, the thread fallback in `resolvePartyId`:

```sql
SELECT party_id FROM business_v2.interactions
 WHERE metadata->>'thread_id' = $1
   AND channel = 'email' AND direction = 'outbound'
```

The only way to resolve a thread is a **prior outbound** interaction on the same
thread. The first reply on any thread, with `leadId` absent, therefore can never
resolve — so no interaction is logged — so the next reply on that thread also
cannot resolve. The failure is self-perpetuating per thread.

`source_thread_id` exists as a column (`data/business/migrations/nanoclaw-v2/08_interactions.sql:21`)
and is referenced nowhere in `src/`, `tools/`, `scripts/`, or `container/` — a
repository-wide search finds it only in `docs/ACTIVE-WORK.md`,
`docs/ENGINEERING-CHANGELOG.md`, and the generated schema snapshot. Nothing
writes it.

Severity: high. Basis: evidence-supported.
Backlog change: this is cheaper than the Wave-1 item implies — populate
`source_thread_id` on inbound classification and resolve by it. It does not
require the ledger.

### Claim 12 — Process truth is fragmented — **verified**

Concrete inventory from source:

- **SQLite** `store/messages.db`, 15 tables (`src/db.ts`): `chats`, `messages`,
  `sessions`, `registered_groups`, `slack_thread_anchors`, `scheduled_tasks`,
  `task_run_logs`, `jobs`, `job_run_logs`, `email_tracking`, `pending_sends`,
  `router_state`, `autonomy_trust`, `autonomy_draft_events`, `autonomy_pending`.
- **PostgreSQL** `business_v2`, 49 tracked migration artifacts including
  `96_webhook_inbox.sql`, `97_sweeper_watermarks.sql`, `100_incidents.sql`,
  `10_outbox.sql`, `113_followup_suppression.sql`.
- **Gmail labels** `MrGru/*` as classification state (`docs/ARCHITECTURE.md`
  §"Email Classification Pipeline").
- **Slack threads** as work identity (`slack_thread_anchors`, `lead:{email}`
  anchors from NC-20260728-001).
- **Markdown** as agent-operative policy: `groups/*/CLAUDE.md`,
  `knowledge/agents/*/LEARNED.md`, `knowledge/shared/LEARNED-*.md`.
- **JSON files** as runtime definitions: `data/webhooks.json`, `data/jobs/`,
  `data/ipc/*/current_jobs.json`, `data/heartbeat.json`,
  `groups/procurement/agent-browser.json`.
- **launchd** on the host (`setup/launchd/` plus `~/Library/LaunchAgents/`, four
  units currently renamed `*.plist.disabled`).
- **n8n** on the VPS as ingress perimeter.
- **External systems** authoritative for their own facts: Stripe, Trafft, Plutio,
  Sertifier, Hive/Firestore, Google Sheets.

Severity: high. Basis: evidence-supported. The plan's response (ledger owns
process state; external systems own their facts) is the correct one.

### Claim 13 — Ignored sync-conflict files and operational backups are present — **verified, with a material addition**

Present in this working directory, all Git-ignored (`.gitignore:68,78,87-88,92`),
none committed:

- **15 `*.sync-conflict-*.ts` files, all in `src/`** — three copies each of
  `index.ts`, `db.ts`, `send-watchdog.ts`, `attachment-convert.ts`, and
  `attachment-convert.test.ts`, timestamped `20260728-0904`.
- `.env.bak`, `.env.bak-billing-20260712`,
  `.env.bak-gmail-push-20260408-185632`, `.env.bak.1777938842` — not opened.
- `.stignore.bak`, `dist.wip-bak-20260516/` (404 entries), `data/heartbeat.json.bak`.

**Material addition the claim does not make: those 15 files are inside the
TypeScript build graph.** `tsconfig.json:18` sets `"include": ["src/**/*"]` with
no exclusion for the conflict pattern. So `npm run typecheck` and `npm run build`
compile stale duplicate copies of the four most safety-relevant modules in the
system, while `.gitignore` and `.stignore` both hide them from review and from
sync. This is not only a hygiene/exposure risk; it means part of the green
baseline recorded by NC-20260728-005 was measuring dead files, and it means a
future interface change will produce typecheck errors in files nobody can see in
`git status`. `dist/` currently contains no corresponding output, so the last
build here predates them.

Severity: medium. Basis: evidence-supported.

---

## 3. Critical corrections

### CC-1 — Wave 0 omits the largest open hole

Severity: **critical**. Basis: evidence-supported.

Wave 0 as written contains nine items. None of them close the unauthenticated
`gmail_*` path (F-1/F-2/F-3 below). The plan's own risk register rates
"wrong recipient/thread/entity" and "prompt injection uses raw credentials" as
critical, but treats both as consequences of missing *programs* (capability
gateway, egress policy) rather than of a missing authorization check that already
exists for two sibling IPC families in the same switch statement.

Recommended change: add three items to the front of Wave 0, before Node
alignment and before the CI `eval` removal.

### CC-2 — The autonomy brake cannot currently be applied

Severity: **high**. Basis: evidence-supported. See F-6.

Wave 0 item 1 is "Suspend new Sales L2 auto-send promotion until
evaluation/outcome gating replaces approval streaks." `AUTONOMY_PROMOTE_STREAK`,
`AUTONOMY_VETO_MINUTES`, and `AUTONOMY_GROUPS` are read from `process.env`
(`src/autonomy-policy.ts:39-55`). `src/env.ts` documents, in its own words, that
`readEnvFile` "Does NOT load anything into process.env — keeps secrets off child
processes", and the tracked `setup/launchd/com.nanoclaw.plist:7-15` sets only
`HOME`, `MAX_CONCURRENT_CONTAINERS`, and `PATH`. Under launchd the defaults are
therefore effective constants. Writing `AUTONOMY_GROUPS=` into `.env` will do
nothing.

Recommended change: state the suspension as a code or plist change with a
verification step ("confirm from a running daemon that the sweep reports zero
enabled channels"), not as configuration. Same defect class applies to
`CONTAINER_MEMORY` / `CONTAINER_CPUS`, which `src/container-runner.ts:663-670`
reads from `process.env` while its own comment says "the CONTAINER_MEMORY /
CONTAINER_CPUS envs (plist) are the global defaults" — they are not in the plist.

### CC-3 — Two risk-register severities are miscalibrated

Severity: **medium**. Basis: evidence-supported.

- "Procurement agent reaches operator Chrome sessions — critical" →
  **medium**, containment already implemented (dedicated profile, `--disable-sync`).
  Replace with "any agent container can reach the unauthenticated CDP bridge —
  critical" (F-7).
- "unrestricted agent egress enables exfiltration — critical" → correct in
  principle, but the plan should note that `src/email-content-guard.ts:36-76`
  already enforces a **link whitelist** on outbound email bodies, which closes the
  most obvious exfiltration channel through the email path. The channels that
  remain open are `WebFetch`/`WebSearch`/`Bash` egress and the unguarded
  `gmail_reply` `cc` (F-3).

### CC-4 — Stale figures in the current-state assessment

Severity: **low**. Basis: evidence-supported.

- §4.1(6): "99 root test files for 109 production TypeScript files" → now
  **104 test files / 115 non-test source files** (excluding sync-conflict copies).
- §4.2 "architecture": the five files listed as exceeding 1,000 lines are
  `index.ts`, `db.ts`, `container-runner.ts`, `group-queue.ts`, `ipc.ts`. Measured:
  `index.ts` 2158, `db.ts` 1859, `container-runner.ts` 1449, `group-queue.ts`
  1330, `webhook-server.ts` 1295, `channels/slack.ts` 1258, `ipc.ts` 1133 —
  **seven** files over 1,000, and `webhook-server.ts` and `slack.ts` displace
  `ipc.ts` from the top five.

---

## 4. Missing risks and functionality

### F-1 — `gmail_*` IPC has no source-group authorization

Severity: **critical**. Basis: evidence-supported.

`src/ipc.ts` gates two IPC families and not the third:

| Family | Gate | Line |
| --- | --- | --- |
| `classify_*` | `sourceGroup !== 'mailman'` → quarantine to `data/ipc/quarantine/` | `:569-585` |
| `route_lesson` | `sourceGroup !== 'chief'` → reject with warning | `:524-528` |
| `gmail_*` | *(none)* — `{...data, groupFolder: sourceGroup}` passed straight to `dispatchGmailIpc` | `:470-497` |

The container side offers the same surface to everyone:
`container/agent-runner/src/ipc-mcp-stdio.ts` registers `send_message`,
`schedule_task`, `list_tasks`, `pause_task`, `resume_task`, `cancel_task`,
`register_group`, `gmail_reply`, `gmail_send`, `gmail_search`, `gmail_read`,
`gmail_get_thread`, `jobs` unconditionally, and
`container/agent-runner/src/index.ts:92-100` hands every group the identical
`ALLOWED_TOOLS` list (`Bash`, `Read`, `Write`, `Edit`, `WebSearch`, `WebFetch`,
`Task`, `TeamCreate`, `Skill`, `mcp__nanoclaw__*`) under
`--dangerously-skip-permissions` (`:291`).

`handleGmailSearch` (`src/gmail-ipc-handlers.ts:539-562`) takes a free-form Gmail
query from any group and writes the results back into that group's context. That
is unrestricted read of the entire company mailbox — leads, contracts, financial
correspondence, legal notices — from the grader, the newsroom, procurement, and
archivarista containers, which are precisely the ones whose inputs are attacker-
controlled.

Recommended change: **new Wave-0 item, first position.** Add a per-group
capability map for the `gmail_*` family in `src/ipc.ts`, mirroring the existing
quarantine pattern. This is the smallest possible version of P0.3's capability
manifest and should ship before the manifest system is designed.

### F-2 — The recipient guard is opt-in via a model-supplied field

Severity: **critical**. Basis: evidence-supported.

`src/gmail-ipc-handlers.ts:382-385`:

```ts
const knownEmails = data.leadId ? await getPartyEmails(data.leadId) : undefined;
const recipientCheck = checkRecipient(data.to, knownEmails);
```

`src/email-recipient-guard.ts:65-87` enforces the party allowlist only when
`knownPartyEmails` is supplied **and non-empty** (`:76-80`); otherwise the check
reduces to "address-shaped and not an RFC-2606 reserved domain". `leadId` is
supplied by the agent. An agent that omits it — accidentally, or because injected
content told it to — sends to any real address it names.

The guard's own header documents the incident it was built for
(`tina@example.com`, 2026-06-29: "the sales agent invented
`{firstname}@example.com` despite being handed the real address"). The fix
adopted stops fabricated *placeholder* domains unconditionally and fabricated
*real-looking* addresses only when the agent volunteers the key that enables the
check.

Recommended change: **new Wave-0 item.** Resolve the party from the recipient
address and the thread on the host side; fail closed when no party can be
established for a C3 send. Do not let the caller select whether it is checked.

### F-3 — `gmail_reply` bypasses the recipient guard, the test-routing lever, and passes `cc` unchecked

Severity: **critical**. Basis: evidence-supported.

`handleGmailReply` (`src/gmail-ipc-handlers.ts:154-282`) calls `checkContent`
(`:165`) and nothing else. It does not call `checkRecipient`. It does not call
`applyTestRouting`. `data.cc` is handed to `replyToThread`
(`src/gmail-api.ts:313-317`) and on to `buildRawMessage` (`:405-411`) without
validation.

The `to` address is host-derived from thread headers
(`src/gmail-api.ts:377-397`) — that part is good design and should be preserved.
But `threadId` is agent-supplied, and `gmail_search` (F-1) lets any agent
enumerate threads. So the composition of F-1 and F-3 is: any container can find
any thread in the mailbox, reply into it with arbitrary text, and CC an arbitrary
external address, with no recipient validation and no containment lever.

Recommended change: **new Wave-0 item.** Apply `checkRecipient` to every `cc`
entry, route `gmail_reply` through `applyTestRouting`, and restrict the
`threadId` an agent may act on to threads the host handed it for this work item.

### F-4 — Approval is not bound to the action executed

Severity: **high**. Basis: evidence-supported.

The approval path stores no action object. `src/channels/slack.ts:392-417`
resolves a quoted body and injects a text message into the pipeline; the agent
then resumes and, one or two LLM turns later, a *different* agent (mailman)
composes and emits `gmail_reply`. Nothing binds the sent body to the approved
body.

Both failure directions have already occurred and are in the tracked record:

- **Approved, never sent** — NC-20260728-003. The remediation entry states the
  design decision explicitly: "the host does not send the email itself. It holds
  the approved text, but re-deriving a body risks sending something other than
  what was approved — the 2026-07-23 regeneration failure."
- **Approved, something else sent** — the 2026-07-23 regeneration failure that
  sentence refers to.

Additionally, `src/channels/slack.ts:351-355` documents "Anyone in-channel may
approve." That is a defensible choice for a solo operator, but it is inconsistent
with the healer, which pins approval to `HEALER_OPERATOR_UID` when set
(`src/healer/approval.ts:41-44`), and it means any channel member's ✅ builds the
autonomy streak toward auto-send.

Recommended change: promote P0.4 into the six-week slice in a minimal form —
persist the approved recipient + body hash against the existing `pending_sends`
row at approval time, and have `handleGmailSend`/`handleGmailReply` refuse to
send a body whose hash does not match an open approval for that work item. This
reuses infrastructure that already exists.

### F-5 — The risk category that selects the money guard is model-supplied

Severity: **high**. Basis: evidence-supported.

`GUARDED_CATEGORIES` (`src/autonomy-policy.ts:33-36`) keeps `pricing` and
`payment-issue` at L1 forever. The category comes from
`parseDraftCategory` (`:69-76`), which reads a `Category:` line the sales agent
writes into its own draft, falling back to `heuristicCategory` (`:104-127`), a
keyword classifier. So the agent decides whether the agent is guarded. A pricing
question self-tagged `program-content` or `other` accrues streak and, at 15,
auto-sends after 120 minutes.

Recommended change: the Wave-2 item "Replace approval streaks with sampled
correctness…" should carry a prerequisite: the gating category must be derived
host-side from the inbound content and the pipeline entry, never from the draft.

### F-6 — Autonomy and container-sizing knobs are read from an environment the process never populates

Severity: **high**. Basis: evidence-supported. Detailed in CC-2.

### F-7 — Every agent container can reach the unauthenticated CDP bridge

Severity: **critical**. Basis: evidence-supported for the binding and the absence
of network isolation; **requires live verification** that the bridge is up.
Detailed under Claim 5.

Recommended change: replace the Wave-0 Chrome item. The dedicated profile is
done. What is needed is (a) bind socat to a per-container address or gate it, or
(b) put procurement on an isolated Apple Container network, or (c) run the
browser inside procurement's own container and accept the Cloudflare cost. Add
"no agent VM can reach a host service that is not an intended capability" to the
egress work.

### F-8 — A tracked launchd job points at a script that does not exist and has been failing daily

Severity: **medium-high**. Basis: evidence-supported (local host observation).

`setup/launchd/com.nanoclaw.repo-hygiene.plist:20-23` runs
`/bin/bash /Users/xbohdpukc/dev/NanoClaw/tools/clean-sync-conflicts.sh` daily at
04:00. That script does not exist in the repository. On this machine
`launchctl list` reports `com.nanoclaw.repo-hygiene` with last exit status
**127**, and `~/.local/log/nanoclaw-repo-hygiene.stderr.log` repeats
`No such file or directory`. This is why the 15 sync-conflict files (Claim 13)
are still there: the cleaner that was supposed to remove them was never
delivered, and nothing noticed for weeks.

This is the plan's own scheduling-fragmentation thesis with a live example
attached, and it exposes a weakness in the Wave-1 wording. "Inventory all timers,
host jobs, launchd, n8n, and remote schedules" and "every recurring execution has
one owner" would both pass for this job — it has an owner and it is in the
inventory. It is simply broken.

Recommended change: the schedule-inventory item's exit gate must include a
**liveness/executability probe** — every registered unit must have a last-run
timestamp and a last exit status, and a non-zero status must raise an incident.
The healer's collector already reads `job_run_logs` for exactly this shape
(`src/healer/collector.ts`, `docs/SELF-HEALING-DESIGN.md` §3.2 source 2) but has
no visibility into launchd units it does not own.

### F-9 — Sync-conflict copies are compiled

Severity: **medium**. Basis: evidence-supported. Detailed under Claim 13.

Recommended change: the Wave-0 quarantine item should additionally add
`"exclude": [..., "src/**/*.sync-conflict-*"]` to `tsconfig.json`, or better,
move conflicts out of `src/` entirely — and ship or delete
`tools/clean-sync-conflicts.sh` so F-8 stops firing.

### F-10 — Missing functionality: nothing writes `source_thread_id`

Severity: **high**. Basis: evidence-supported. Detailed under Claim 11.

### F-11 — Missing risk: `courses` holds a second, entirely unguarded outbound-email path

Severity: **medium-high**. Basis: evidence-supported.

`src/container-runner.ts:547-556` injects `EMAIL_USER` and `EMAIL_PASS` into the
courses container along with `EMAIL_TOOL=/workspace/extra/email/send-email.sh`.
That path does not pass through `checkRecipient`, `checkContent`, the tracking/
unsubscribe machinery, `applyTestRouting`, `pending_sends`, or the interaction
log. Every control the plan proposes for outbound email would leave it untouched.

Recommended change: add to the capability inventory as a named item, and to the
safe-mode acceptance criteria.

### F-12 — Missing acceptance property: `run_migration.sh` is not portable

Severity: **low**. Basis: evidence-supported.

`data/business/migrations/nanoclaw-v2/run_migration.sh` hard-codes
`DB_URL="postgresql:///nanoclaw_business?host=/tmp&user=xbohdpukc"` — a local
socket and a specific OS username. Ordering itself is correct (`sort -V` at
`:14`, with a comment explaining the 3-digit case). The script also refuses to run
while any `com.nanoclaw.*` unit is registered (`:16-21`), which couples every
migration to a full launchd stop on the runtime host.

Recommended change: fold into P1.8 ("fresh ephemeral PostgreSQL in CI") — CI will
not be able to run this script as written, which is a useful forcing function.

---

## 5. Sequencing changes

The plan's Immediate Containment → Wave 0 → Wave 1 shape is right. The contents
of the first two stages are not.

**Move to the front (before everything, including Node 22 and CI `eval`):**

1. F-1 — group-scope `gmail_*` in `src/ipc.ts`.
2. F-2 — make the recipient guard fail closed, host-resolved.
3. F-3 — guard `gmail_reply` recipients/`cc` and route it through test-routing.
4. Set `HEALER_IMPLEMENT_ENABLED=0` in `setup/launchd/com.nanoclaw.healer.fast.plist`
   (one line, today) and verify on the Mini whether the unit is loaded.

Rationale: each is hours, not weeks. Together they convert "any container can
email anyone from the company mailbox" into "the two groups that are supposed to
can, subject to a guard that cannot be waived." Every later program — capability
manifests, host adapters, ledger, evaluation — assumes this boundary exists.

**Move into the six-week slice:**

5. F-4 — bind approval to a body hash. The slice as proposed suspends autonomy
   promotion but leaves the approve→send gap open, and that gap has already
   produced two incidents. Suspending L2 does not close it, because L1 uses the
   same unbound path.

**Move later / demote:**

6. "Build the capability inventory and move one recurring send path behind a host
   adapter" — the adapter is week-scale work whose principal risk (an agent
   sending mail it should not) is closed far more cheaply by items 1-3. Keep the
   inventory; move the adapter to Wave 1.
7. Chrome CDP disablement — already substantially done; restate as network
   isolation (F-7) and keep it in Wave 0 but not as a Chrome-profile task.

**Reuse instead of design:**

8. The work ledger (Wave 1 / P1.1) should be built as a second instance of
   `business_v2.webhook_inbox` + `sweeper_watermarks` (migrations 96/97), not as
   a new model. That pattern is already in production, already has a reaper, a
   dead-letter path, and idempotency by `(source, event_id)`, and
   `docs/SELF-HEALING-DESIGN.md` §2 records that the healer was built by cloning
   it successfully — a second, independent confirmation that the shape works
   here. This materially lowers P1.1's risk and cost and should be stated as the
   plan's default.

**Strengthen an exit gate:**

9. Schedule inventory (REL-001) must probe executability, not ownership (F-8).

---

## 6. Overengineering challenges

Each of these is governance mass that does not reduce a measured risk at current
scale. The plan already qualifies several of them in prose; the challenge is that
the *lists* remain in the document and lists become commitments.

| Item | Challenge | Recommended change |
| --- | --- | --- |
| P1.2 company process catalog, 13 processes | Pure documentation with no forcing function, produced before any ledger exists to keep it true. It will be stale within a quarter. | Catalog only the two processes being converted; generate the rest from ledger data once it exists. |
| P1.4 eleven SLIs | The plan self-corrects to three, but the eleven-item list is what a reader will implement. | Delete the eleven-item list; keep the three. |
| P1.10 privacy and records governance | A full data inventory, retention jobs, legal hold, and subject-access workflows for a solo-operator company with no stated regulator or contractual driver. | Replace with a one-page data-class inventory and one leadership decision on retention. Defer the rest until a contract or regulator requires it. |
| P2.6 eleven internal modules | Contradicts its own acceptance criterion ("extract only where current work is blocked by file boundaries"). Nothing in this review found a change blocked by a file boundary. | Delete the module list. Keep the acceptance criterion as the trigger. |
| P1.12 fuller decision envelope | Correctly flagged as at risk of becoming a second product; the "eventual fuller envelope" list is nine more fields. | Keep the seven-field minimum. Delete the aspirational list. |
| Wave 4 items 1, 5, 6 (party timeline, ROI per process, operator UI) | Three deliverables for one need — operator situational awareness — which the exception inbox already serves. | Keep the exception inbox. Fold the timeline into it as a drill-down. Drop per-process ROI until one process has a stable baseline. |
| P0.4 two-person approval | Already correctly qualified ("only when a real independent second approver exists"). No change. | — |
| P0.6 SBOM / signed provenance | Already correctly deferred. No change. | — |

One thing the plan is **not** overengineering, contrary to how it reads: the
evaluation pack (Wave 2 / EVAL-001). This repository has an unusually rich supply
of real, dated, root-caused incidents — `tina@example.com` (2026-06-29), the
Entry 938 stall (NC-20260728-003), the 2026-07-23 regeneration, the Namrata
stage/reason transposition (NC-20260727-001), the `.odt` silent drop
(NC-20260728-002), the Liz Dobbins self-addressed reply, the Marvita Franklin
bounce capture. Each is already written up with enough detail to become a test
case. Building that pack is closer to transcription than to research, and it is
the only proposed mechanism that would catch a *regression* in the guards added
above.

---

## 7. Acceptance-criteria corrections

| Plan location | Current criterion | Problem | Corrected criterion |
| --- | --- | --- | --- |
| P0.6 | "a malicious skill PR cannot execute arbitrary shell through manifest data" | Unachievable: `npm ci` and `apply-skill.ts` already run PR-controlled code (`skill-pr.yml:101,109`). Removing `eval` does not make it true. | "the skill workflow declares `permissions: contents: read`, receives no secrets, and contains no `${{ }}` interpolation inside a `run:` block; arbitrary execution on the ephemeral runner is accepted and contained." |
| P0.2 | "a tool-enabled red-team agent cannot recover business-system credentials" | Correct target, wrong first gate; today the binding constraint is that a group can call capabilities it was never granted. | Add a prior, testable criterion: "no group can invoke a capability outside its declared set; a negative test exists per group per capability family." (F-1) |
| P0.5 | "an operator can enter safe mode without stopping evidence collection" | Silent on which boundaries. The one existing partial lever covers `gmail_send` and not `gmail_reply`. | Add: "the drill demonstrates that `gmail_send`, `gmail_reply`, the `courses` SMTP path, Slack outbound, and Plutio/Stripe host calls all refuse, and that inbound processing and evidence continue." (Claim 6, F-11) |
| P1.1 | "daily source reconciliation proves `observed = accepted + rejected`" | Passes trivially for sources with no stable id, because everything is "accepted". | Add: "every accepted event carries a stable upstream id, or is explicitly recorded as un-deduplicable with a named reason; an un-keyable envelope from an unknown source fails closed." (Claim 10) |
| P1.14 | "sampled correctness exceeds a defined threshold and minimum sample size" | Silent on who assigns the risk class being gated. | Add: "the action class and risk category used for gating are derived host-side from inbound content and business records, never from the model's own tagging." (F-5) |
| Wave 0, item 1 | "Suspend new Sales L2 auto-send promotion" | Cannot be done by configuration. | Add: "verified by observing zero enabled autonomy channels in a running daemon, not by an `.env` edit." (CC-2) |
| P1.13 | learned-item provenance and review state | Silent on which artifact agents actually read. | Add: "the file mounted into agent containers carries the review state; a contested item cannot reach an agent unflagged." (Claim 3) |
| P0.3 | "no capability exists only because it happened to be present in a shared MCP" | This is exactly the current state, so the criterion is right — but it needs a today-testable precursor. | Add interim: "the `gmail_*` family is authorized per group in `src/ipc.ts` with a quarantine path, matching `classify_*`." |
| P1.6 restore drill | already strong ("A successful file extraction alone is not a restore test") | No change. | — |

---

## 8. Five highest-leverage improvements

Ranked by (safety closed × business risk removed) ÷ effort. All five are days,
not weeks.

1. **Authorize the `gmail_*` IPC family by source group** (`src/ipc.ts`).
   ~2-4 hours including tests, using the quarantine pattern already at `:569`.
   Removes an unauthenticated mailbox-read and customer-email-send primitive from
   roughly thirteen agents, including every agent that ingests untrusted content.
   This is the single highest-value change available in the repository today.

2. **Make the outbound recipient guard fail closed and apply it to the reply
   path** (`src/gmail-ipc-handlers.ts`, `src/email-recipient-guard.ts`).
   ~1 day. Host-resolve the party from recipient/thread rather than trusting
   agent-supplied `leadId`; validate `cc`; route `gmail_reply` through
   `applyTestRouting`. Converts the guard from advisory to binding and gives the
   operator one working containment lever for **all** outbound mail.

3. **Bind approval to the executed action.**
   ~2-3 days, reusing the `pending_sends` table added by NC-20260728-003. Store
   recipient + body hash at approval; refuse a send whose hash has no matching
   open approval. Closes both directions of a failure that has already occurred
   twice, and is a prerequisite for any autonomy gating being meaningful.

4. **Disable healer code-implementation in the tracked template, then move it to a
   disposable worktree.**
   The first half is one line today. The second is ~1 day. Removes a path where
   LLM-authored text derived from ingested content becomes a `bypassPermissions`
   host agent run with `gh` credentials on the live deploy checkout.

5. **One global external-write safe mode, checked at every final boundary, with a
   drill.**
   ~2-3 days. This is the plan's SEC-004 and it is correctly prioritized; the only
   change is that its boundary list must include `gmail_reply` and the `courses`
   SMTP path (F-11), which today would both survive a safe-mode that only knows
   about `gmail_send`.

Items 1-2 together are less work than the plan's proposed "move one recurring
send path behind a host adapter" and close more risk.

---

## 9. Revised six-week slice

One primary engineer/operator with AI assistance. Sequential, each week's output
verifiable before the next begins. Contains eight of the original eight
*intentions* but reorders and re-scopes them, drops one, and adds two.

**Week 1 — close the outbound hole.**
- F-1: group-scope `gmail_*` in `src/ipc.ts`, with quarantine and a negative test
  per group.
- F-2: host-resolve the party; guard fails closed for C3 sends.
- F-3: `checkRecipient` on `cc`; `applyTestRouting` on the reply path.
- `HEALER_IMPLEMENT_ENABLED=0` in the tracked plist; read-only check on the Mini
  for whether `com.nanoclaw.healer.fast` is loaded.
- Exit gate: a test proves the grader container's `gmail_send` is quarantined, and
  a `gmail_reply` with an unknown `cc` is rejected.

**Week 2 — brakes and build integrity.**
- Global external-write safe mode at all five boundaries, plus per-window
  recipient/volume/retry ceilings; drill it.
- Suspend L2 promotion **in code or plist** and verify from a running daemon
  (CC-2).
- Remove `eval` from `skill-pr.yml`; add `permissions:` blocks to all workflows;
  remove `${{ matrix.skill }}` from `run:`.
- Node: pin `engines` to an exact major, replace the three `node-version: 20`
  pins, add a startup refusal.
- Exclude `src/**/*.sync-conflict-*` from `tsconfig.json`; ship or delete
  `tools/clean-sync-conflicts.sh` and stop the daily 127 (F-8, F-9).
- Exit gate: safe-mode drill recorded; full suite green under one enforced major
  with no conflict copies in the graph.

**Week 3 — make approval mean something.**
- F-4: host-owned approved-action record with recipient + body hash against
  `pending_sends`; send refuses on mismatch; adversarial cases for replay, stale,
  superseded, wrong-thread, and post-approval mutation.
- Exit gate: the 2026-07-23 regeneration scenario, replayed, fails closed.

**Week 4 — learning becomes reviewable.**
- Lessons land in a quarantine file; promotion into the operative file is an
  explicit act; the artifact agents mount carries review state; fix the
  "Both are now marked CONTESTED" message and the shared-copy sync (Claim 3).
- Fix the `LEARNED.md` header so it states the control that is actually enforced.
- Exit gate: a self-authored lesson is not visible to any agent until promoted.

**Week 5 — stop losing work silently.**
- Populate `source_thread_id` on inbound classification; resolve outbound party by
  it; backfill nothing, just stop the bleeding (F-10, Claim 11).
- Bounded reconciliation scan on Gmail `HistoryExpiredError` instead of accepting
  the gap; alert on watermark age (Claim 9).
- Schedule/timer/launchd/n8n inventory **with an executability probe** and a
  last-exit-status field (F-8).
- Exit gate: a forced history expiry produces a measured, recovered gap; the
  inventory surfaces at least one broken unit (it will — F-8).

**Week 6 — one ledger pilot and one eval pack.**
- Mailman → Sales → Mailman work items, built as a second instance of the
  `webhook_inbox` shape (migrations 96/97), not a new model.
- Correlation ids across the pilot path; a compact daily exception brief in Slack.
- First evaluation pack transcribed from the seven already-documented incidents,
  plus direct and indirect prompt-injection cases against the guards added in
  weeks 1-3.
- Exit gate: the pack fails on a deliberately reverted week-1 guard.

**Dropped from the original slice:** "move one recurring send path behind a host
adapter." Its risk is closed more cheaply by weeks 1-2; the adapter belongs in
Wave 1 where the secret inventory can select the right target.

**Added:** approval binding (week 3) and the schedule executability probe
(week 5).

**Kept but re-scoped:** the capability inventory is a week-2 by-product of doing
F-1 (you must enumerate who needs what to write the map), not a separate
deliverable.

---

## 10. Answers to the review questions

**1. Is the modular-monolith operating-kernel direction correct?**
Yes. One deployable process, four explicit internal systems, external systems
authoritative for their own facts, ledger owning process state only. Nothing
found in the source argues for services; the composition root is large
(`index.ts` 2158 lines) but that is a file-organization problem, not a
distribution problem. The three bounded loops are also correctly shaped —
particularly the insistence that self-improvement may propose and open a draft PR
but never merge, deploy, or touch the live checkout, which is precisely the
property `src/healer/implement.ts` currently violates by operating in
`process.cwd()`.

**2. Which current risks are overstated, understated, unsupported, or missing?**
- *Overstated:* Procurement reaching operator Chrome sessions (dedicated profile
  already implemented — CC-3).
- *Understated:* agent egress (the email content-guard link whitelist already
  closes the most obvious channel; the open ones are `WebFetch`/`Bash` and the
  unguarded reply `cc`).
- *Mis-named:* healer "non-interpolated execution" (CC-2 / Claim 2).
- *Missing:* F-1 (no `gmail_*` authorization), F-2 (opt-in recipient guard), F-3
  (unguarded reply path), F-4 (approval unbound to action), F-5 (model-supplied
  guard category), F-6 (unreachable configuration knobs), F-7 (shared CDP
  bridge), F-8 (broken scheduled job), F-9 (compiled conflict copies), F-10
  (`source_thread_id` never written), F-11 (`courses` SMTP path).

**3. Does the backlog materially improve speed, leanness, effectiveness, and
functionality, or does it mostly add governance overhead?**
Mixed, and separable. Waves 0-2 are mostly real risk reduction and, after the
re-ordering above, are net-positive on speed too: an operator who can trust the
outbound boundary can delegate more, not less. Wave 3's measurement work is
genuinely enabling. The overhead concentrates in P1.2, P1.4's SLI list, P1.10,
P2.6's module list, and Wave 4's overlapping deliverables — see §6. Strip those
and the backlog is lean.

**4. Which items should be deleted, merged, split, or reordered?**
Deleted: the eleven-SLI list, the eleven-module list, the fuller decision
envelope list, per-process ROI (for now), P1.10 beyond a one-page inventory.
Merged: party timeline into the exception inbox; capability inventory into the
F-1 work. Split: "finish Node 22 enforcement" into `engines` pin / workflow pins
/ startup refusal, because only the first actually stops Node 26. Reordered: §5.

**5. Is the six-week slice credible for one primary engineer/operator?**
The original slice is not — it opens eight workstreams including a host adapter,
a work ledger, correlation evidence, an exception brief, and an evaluation pack.
Any two of those is a six-week slice. The revised slice in §9 is credible because
weeks 1-4 are bounded edits to existing files with existing test harnesses, and
only weeks 5-6 introduce new subsystems — one of which is a clone of a proven
pattern.

**6. Which five changes have the highest combined safety and business leverage?**
§8.

**7. What measurable exit gate should block broad implementation?**
A single composite gate, all four parts required:
(a) a negative test per group per capability family passes, proving no group can
invoke a capability outside its declared set;
(b) a recorded safe-mode drill in which `gmail_send`, `gmail_reply`, the
`courses` SMTP path, Slack outbound, and one financial integration all refuse
while inbound processing and evidence continue;
(c) an approved-action replay suite in which stale, replayed, wrong-thread,
wrong-user, expired, and post-approval-mutated sends all fail closed;
(d) the full root suite green under one enforced Node major, on a source tree
containing no `*.sync-conflict-*` files.
Until all four hold, no autonomy level above L1 and no new external-write
capability.

**8. What should remain permanently human-authorized?**
Money out (refunds, invoices, payment changes); anything contractual (proposals,
contracts, certificates); credential and identity operations; destructive
operations including party merges and deletions; broad publication (newsletter,
social, any send above a defined recipient count); any first outbound contact to
a party with no prior interaction record; and any merge or deploy of
machine-generated code. Note that the last item is currently *not* permanently
human-authorized in practice — the draft-PR boundary is enforced by prompt text
(`src/healer/implement.ts:62-63`), not by a mechanism.

**9. Where should deterministic code replace model judgment?**
Recipient selection and validation (already partly true — keep and extend the
host-derived reply `to`); the autonomy risk category (F-5); classification for
senders with an existing high-confidence rule (already true via
`classify-rules-runner.ts` — extend it); dedup key extraction (already
deterministic — close the `default` branch); party/thread resolution (F-10);
pipeline stage transitions (the Namrata incident was a model transposing
arguments to `fn_advance_pipeline_stage` — that call should be a typed host
capability, not agent-issued SQL); and lesson promotion (a human act, not a model
verdict).

**10. Which architecture decision, if made incorrectly, would be hardest to
reverse?**
The work ledger's ownership boundary. Everything else in this plan is a control
that can be tightened, loosened, or removed later. If the ledger is allowed to
become authoritative for *business facts* rather than *process state* — mirroring
Stripe amounts, Trafft times, or Gmail content into rows other code then reads as
truth — the system acquires a second source of truth for every external system,
and every reconciliation bug becomes a customer-visible data bug. Unwinding that
means rewriting every consumer. The plan already states the correct boundary in
P1.1 and in the validated proposal; it should be recorded as an ADR before the
first ledger table is created, not after. Second hardest: the approval object's
schema, because every historical audit record is written in it.

---

## 11. Leadership decisions required

Beyond the ten in the plan, this review surfaces five that are now blocking:

1. **Is `com.nanoclaw.healer.fast` currently loaded on the Mac Mini, and was
   `HEALER_IMPLEMENT_ENABLED=1` intentional?** The repository asserts both "ship
   dark" and "enabled". Resolve before anything else in the healer track.
2. **Should the procurement Bonfire session continue to exist at all?** The
   dedicated profile is a real control; the shared CDP bridge is not. Either
   isolate the network or retire the browser path.
3. **Who may approve?** "Anyone in-channel" (`src/channels/slack.ts:354`) versus
   the healer's pinned `HEALER_OPERATOR_UID`. Pick one model and apply it to
   both, because the streak that drives auto-send is built from those approvals.
4. **Does the `courses` SMTP path stay?** It is a complete second outbound-email
   system outside every guard. Either bring it behind the Gmail capability or
   accept it explicitly with its own ceilings.
5. **What is the acceptable Gmail ingestion gap?** Today it is unbounded and
   unmeasured. A number here (minutes of mail, or zero with mandatory
   reconciliation) determines whether Week 5's work is a scan or an alert.

---

## 12. Final disposition

**Accept with changes.**

The architecture, the loop designs, the authority model, the change classes, and
the measurement chain are sound and should be adopted as written. The current-
state assessment is largely accurate; thirteen of thirteen claims verified, two
with material corrections, none rejected outright — though three of the plan's
own risk-register severities are miscalibrated in a way that has pushed the most
urgent work out of Wave 0.

The required changes are:

1. Insert F-1, F-2, F-3, and the healer plist flag ahead of all current Wave-0
   items.
2. Restate the healer item (CC-2), the Chrome item (CC-3), and the autonomy
   suspension item (CC-2) so they describe defects that exist.
3. Replace the six-week slice with §9.
4. Apply the acceptance-criteria corrections in §7 — particularly P0.6, which is
   currently unachievable as stated.
5. Delete the governance mass listed in §6.
6. Record the ledger ownership boundary as an ADR before the first table.

Nothing here requires re-deciding the direction. It requires doing the cheap
things first.

---

## Appendix A — Files inspected

Documents: `CLAUDE.md`, `AGENTS.md`, `docs/PROJECT-MAP.md`, `docs/ACTIVE-WORK.md`,
`docs/CHANGE-PROTOCOL.md`, `docs/ENGINEERING-CHANGELOG.md`,
`docs/COMPANY-OS-IMPROVEMENT-PLAN.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`,
`docs/REQUIREMENTS.md`, `docs/SELF-HEALING-DESIGN.md`,
`docs/SELF-HEALING-ORCHESTRATED-DIAGNOSIS.md`,
`docs/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md`.

Source: `src/index.ts` (startup/autonomy wiring), `src/ipc.ts`,
`src/autonomy-policy.ts`, `src/autonomy-ledger.ts`, `src/autonomy-hold.ts`,
`src/container-runner.ts`, `src/gmail-ipc-handlers.ts`, `src/gmail-api.ts`,
`src/gmail-push.ts`, `src/channels/gmail.ts`, `src/channels/slack.ts`,
`src/email-recipient-guard.ts`, `src/email-content-guard.ts`,
`src/learn-ipc-handler.ts`, `src/lesson-conflict.ts`, `src/webhook-server.ts`,
`src/webhook-extractors.ts`, `src/env.ts`, `src/db.ts` (table enumeration),
`src/healer/implement.ts`, `src/healer/approval.ts`,
`container/agent-runner/src/index.ts`,
`container/agent-runner/src/ipc-mcp-stdio.ts`.

Configuration and infrastructure: `.github/workflows/{ci,skill-pr,skill-drift,bump-version,update-tokens}.yml`,
`package.json`, `.nvmrc`, `tsconfig.json`, `.gitignore`, `.stignore`,
`setup/launchd/*.plist`, `scripts/start-procurement-browser.sh`,
`data/business/migrations/nanoclaw-v2/` (listing, `run_migration.sh`,
`08_interactions.sql`).

Local host observations (read-only): `git rev-parse`, `git status --porcelain`
(count only), `node --version`, `launchctl list | grep nanoclaw`,
`ls ~/Library/LaunchAgents`, `tail ~/.local/log/nanoclaw-repo-hygiene.stderr.log`,
`find` for sync-conflict and backup artifacts (names, sizes, and ignore status
only — no contents read).

## Appendix B — Findings index

| ID | Severity | Basis | Summary |
| --- | --- | --- | --- |
| F-1 | critical | evidence-supported | `gmail_*` IPC has no source-group authorization |
| F-2 | critical | evidence-supported | Recipient guard is opt-in via model-supplied `leadId` |
| F-3 | critical | evidence-supported | `gmail_reply` bypasses recipient guard, test routing; unchecked `cc` |
| F-7 | critical | evidence-supported + live verification | Every container can reach the unauthenticated CDP bridge |
| CC-1 | critical | evidence-supported | Wave 0 omits the largest open hole |
| Claim 2 | critical (if live) | evidence-supported + live verification | Healer implement enabled in tracked template |
| F-4 | high | evidence-supported | Approval not bound to executed action |
| F-5 | high | evidence-supported | Model supplies the category that selects the money guard |
| F-6 / CC-2 | high | evidence-supported | Autonomy and sizing knobs read an unpopulated `process.env` |
| F-10 | high | evidence-supported | Nothing writes `source_thread_id`; party resolution cannot bootstrap |
| Claim 1 | high | evidence-supported | Streak-only promotion to auto-send |
| Claim 3 | high | evidence-supported | Lessons operative before review; header overclaims |
| Claim 6 | high | evidence-supported | No global external-write safe mode; partial lever is asymmetric |
| Claim 9 | high | evidence-supported | Unbounded, unmeasured Gmail ingestion gap |
| Claim 4 | high | evidence-supported | Raw integration credentials in containers; `main` holds the admin DB role |
| F-8 | medium-high | evidence-supported | Tracked launchd job missing its script, failing daily (exit 127) |
| F-11 | medium-high | evidence-supported | `courses` SMTP path outside every outbound control |
| CC-3 | medium | evidence-supported | Two risk-register severities miscalibrated |
| F-9 | medium | evidence-supported | Sync-conflict copies inside the TypeScript build graph |
| Claim 7 | medium | evidence-supported | CI `eval` plus two `${{ }}`-in-`run:` sinks |
| Claim 8 | medium | evidence-supported | `engines: >=20` admits both the EOL and the drifting version |
| Claim 10 | medium | evidence-supported | Three idempotency gaps, including a silent `default` |
| Claim 12 | high | evidence-supported | Process truth fragmented across ten stores |
| Claim 13 | medium | evidence-supported | 15 ignored conflict copies; `.env`/build backups present |
| CC-4 | low | evidence-supported | Stale test-density and largest-file figures |
| F-12 | low | evidence-supported | `run_migration.sh` hard-codes host and OS user |
