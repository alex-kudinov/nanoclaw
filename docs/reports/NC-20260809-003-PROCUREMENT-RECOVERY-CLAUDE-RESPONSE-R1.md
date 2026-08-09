# NC-20260809-003 — Procurement recovery implementation review, Claude R1

- Round: R1, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R1.md`
- Author: Claude Code (Opus 5), NanoClaw Company-OS owner role
- Date: 2026-08-09T19:55Z–20:12Z
- Implementation root: `/private/tmp/nanoclaw-nc-20260809-003`, clean worktree at
  `97ca2cc` (exact live release)
- Change class: C0 design review. No source edited, nothing built, deployed,
  migrated, queried, committed, or pushed.

Labels: `FACT` = verified in this worktree with a citation · `PREFLIGHT` =
accepted live evidence from the preflight · `INFERENCE` · `RECOMMENDATION`.
All source citations are **worktree-relative** and refer to `97ca2cc`.

**Baseline note.** `FACT`. I re-verified the baseline rather than reusing the
NC-20260809-002 tree. `src/procurement-{intake,review,policy,ipc-handlers}.ts`,
migration 114, `src/task-scheduler.ts`, `src/env.ts`, and
`groups/procurement/CLAUDE.md` are **byte-identical** to the operational
checkout, so the R2 audit applies unchanged. `src/host-router.ts`,
`src/classify-ipc-handlers.ts`, and `src/channels/gmail.ts` **differ** — the
operational tree carries uncommitted email work. Everything below is stated
against the release versions, and one R2 finding changes as a result (§2.2).

---

## 1. Verdict

**Approve the direction. Do not implement §A–§E as written — eight corrections
are required first, three of them safety-relevant.**

The proposed plan correctly identifies every real defect and proposes the right
kind of fix for each. Its problems are scope and sequencing, not diagnosis:

- it couples a standing security fix (shared CDP) to a feature canary;
- it proposes an active retry over 348 unrouted classifications that would
  produce a handoff flood on first run;
- it builds artifact/packet/submission/outcome schema before one opportunity has
  ever closed, repeating the April mistake of designing against zero evidence;
- it prefers `readEnvFile` for an authorization gate, which puts the gate value
  outside the verified release boundary;
- it targets `proposal_ready` as a canary outcome while deferring the packet
  identity that would make `proposal_ready` mean anything.

**The single most valuable finding of this round is subtractive.** `FACT` +
`INFERENCE`: the email route needs **no source change at all**. With
`auto_archive=false`, both callers already reach the host router correctly
(§5.1). The fix is one migration updating two taxonomy rows, plus tests. That
removes `src/classify-ipc-handlers.ts`, `src/channels/gmail.ts`, and
`src/host-router.ts` from the change set entirely — which is exactly the
Sales/email active-work collision the request asks to avoid (question 8).

With the corrections applied, the closure canary is reachable with **one
additive migration, two new source files, three modified Procurement-owned
files, and two small configuration edits.** No shared email or Sales file is
touched.

---

## 2. Corrections required before implementation

### C-1 — Configuration authority: choose tracked launchd, not `readEnvFile` (§A)

*(Answers question 5.)*

The request says "Prefer `readEnvFile` … so existing deployment secret handling
remains consistent." `RECOMMENDATION`: **use tracked launchd instead.** Three
reasons from repository precedent:

1. `FACT`. `readEnvFile` is explicitly the *secret* path, documented at
   `src/env.ts:32-34`: "Does NOT load anything into `process.env` — keeps
   secrets off child processes." It reads `~/dev/.env.shared` then the project
   `.env` (`:39-56`). Procurement gates are **authorization**, not secrets: the
   epoch and operator UIDs are non-secret values whose *integrity* matters more
   than their confidentiality.
2. `FACT`. Both files `readEnvFile` reads live **outside the immutable release**.
   The service asserts release integrity through
   `NANOCLAW_REQUIRE_RELEASE_MANIFEST` and `NANOCLAW_EXPECTED_RELEASE_COMMIT`
   (`setup/service.ts:125-128`). A gate value read from `.env` is therefore not
   covered by the artifact the deployment verifies, and can change without any
   release event. A gate that authorizes host action should move only when the
   service definition moves.
3. `FACT`. The repository already set this precedent for the *same class* of
   control: `setup/launchd/com.nanoclaw.healer.fast.plist` declares
   `HEALER_ACTIONS_ENABLED=0` and `HEALER_IMPLEMENT_ENABLED=0` as plist
   environment variables. Procurement gates are the same kind of default-off
   authorization switch. Two mechanisms for one concept is how the current
   confusion arose.

Counter-argument, stated fairly: `readEnvFile` is operationally lighter — epoch
rotation would not require rewriting and reloading a plist. `INFERENCE`: that is
a cost, not a benefit. Epoch rotation is a deliberate authorization event and
should leave a service-definition trace. The preflight already treats the
installed service definition as a backed-up, rollback-bearing artifact.

Required with this choice:
- add the four keys, default-off/empty, to **both**
  `setup/launchd/com.nanoclaw.plist` and the generator at
  `setup/service.ts:117-131`;
- delete the block at `.env.example:18-25` (or replace it with a pointer), so
  exactly one surface is documented;
- log the resolved policy `reason` once at startup
  (`disabled | missing_epoch | missing_operators | enabled`). It prints no
  secret and makes "is this on?" answerable from logs.

`PREFLIGHT` corroboration: the daemon environment currently contains none of the
four keys, so there is no live value to preserve and no migration cost to this
choice.

### C-2 — The `routed_at` reconciler must be alert-only in this release (§A)

`FACT`. The release already contains a **passive** replay path at
`src/classify-ipc-handlers.ts:346-389`: a same-version re-delivery more than 30
seconds old atomically claims one retry (`:353-363`) and re-routes. It is not a
reconciler — it fires only if something re-delivers `classify_label_write` for
that message, and nothing does.

`FACT`. That retry also gates on `!taxonomy?.auto_archive` (`:370`) and excludes
`rules-runner-v1` (`:358`). So under today's configuration the 348-row backlog
cannot self-heal even if replayed.

`INFERENCE`. An active reconciler that calls `routeAfterClassify` for every
`routed_at IS NULL` Procurement row would, on its first run, write **348
handoffs** into the Procurement group and create 348 opportunities. That is the
duplicate-handoff hazard question 6 asks about, and it would arrive as a single
burst into a group with no pursuit spine.

`RECOMMENDATION`. Split the concern:
- **This release:** the reconciler *counts and alerts* on Procurement
  classifications with `routed_at IS NULL`. One message, one count, no writes.
- **Separate bounded operation:** the historical backfill in §5.2, which does
  not use the routing path at all.
- **Never:** an automatic retry loop over an unbounded historical set.

### C-3 — Migration 115 must be a narrow core; defer artifacts and packets (§C)

*(Answers question 7.)*

The request's §C lists pursuit state, owner, next action, append-only events,
artifact manifest, assessments, proposal-packet identity/hash, submission
receipts, and outcomes — all in 115.

`RECOMMENDATION`: **build the first four; defer the rest to 116.**

Rationale — `INFERENCE`:
- The accepted canary closure is a durable, evidenced `passed`
  (`PREFLIGHT` decision 5). `passed` requires state, owner, a terminal reason,
  and evidence text. It requires **no** artifact manifest, packet hash, or
  submission receipt.
- Packet identity, content hashing, and unresolved-item semantics would be
  designed against **zero** real proposals (`PREFLIGHT`: two historical drafts,
  both dated April, and neither `scraped` row's `vault_path` resolves to an
  existing `Brief.md`). Designing that schema now repeats the exact April
  failure the whole task exists to correct: a provisional framework frozen
  before contact with reality.
- Every deferred concept is a *child* of a pursuit and can be added additively.

**Guard against the dead end the request rightly warns about** (question 2). Two
non-negotiables in 115 so 116 is additive rather than a rewrite:
1. the pursuit state enum contains `proposal_ready` and `submitted` **from day
   one**, even though nothing can reach them yet — so later work adds
   transitions, not a new state machine;
2. the event table is generic (`event_type`, `payload jsonb`, actor, timestamp),
   so artifacts, assessments, and receipts land as event types plus their own
   tables without altering the ledger's shape.

### C-4 — `process` must create the pursuit *inside* the existing decision transaction (§C)

`FACT`. `fn_apply_procurement_review_card_decision`
(`data/business/migrations/nanoclaw-v2/114_procurement_control_plane.sql:613-713`)
is already the single atomic decision point: it claims the card, applies the
optimistic version bump, and supersedes sibling cards in one transaction.

`INFERENCE`. "A `process` decision atomically creates exactly one pursuit job"
implemented as a *second* host call after that function re-introduces a
two-phase gap. If the decision commits and the pursuit write fails, the
opportunity is decided with no pursuit — which is precisely today's dead end,
reproduced with extra steps.

`RECOMMENDATION`. 115 issues `CREATE OR REPLACE FUNCTION` for that function,
adding the pursuit insert in the same transaction. This is additive, and rollback
is a `CREATE OR REPLACE` back to the 114 body (§10). Do not add a separate
`fn_create_procurement_pursuit` callable from the host for the `process` path;
the only host-callable pursuit mutations should be *later* transitions.

### C-5 — Source completeness must be host-owned, not model-declared (§B)

`FACT`. Today the adapter passes the model's own array length as the observed
count (`src/procurement-intake.ts:473-480`) and can emit only `complete` or
`failed` (`:473-495`); `partial` is legal in schema
(`114_procurement_control_plane.sql:130`) and unreachable in code.

`INFERENCE`. Adding "planned/observed units" fields does **not** fix RC-2 if the
model also supplies the planned set. Self-reported coverage is still
self-attestation; a scan that plans 3 keywords and observes 3 would be
`complete`.

`RECOMMENDATION`. The **planned unit set is host configuration**, not adapter
input. Move the nine CaleProcure keywords out of prose
(`knowledge/agents/procurement/procedures/scan-caleprocure.md:27-37`) into a
host-side constant or config row. The adapter submits observed units; the host
compares against its own planned set and derives the status:

- every planned unit has an observed marker → `complete`;
- some units observed, some missing → `partial` with the missing list;
- zero units observed → `failed`.

A legitimate zero-**result** run is still `complete` when every planned unit was
observed and returned nothing. That distinction — zero results vs. zero
coverage — is the whole point, and it is only expressible if the host owns the
denominator.

### C-6 — Do not replace the scheduler in this release (§D)

`FACT`. The scheduler already records failures: `runTask` writes
`status: 'error'` via `logTaskRun` (`src/task-scheduler.ts:262-269`), and
`PREFLIGHT` confirms 13 error rows including the 2026-08-09 timeout. The defect
is **notification**, not recording: scheduled *tasks* have no
`reportJobResult` path, unlike host *jobs* (`src/task-scheduler.ts:77-90`).

`FACT`. The observed 1,230,000 ms timeout equals `IDLE_TIMEOUT + 30_000`
(`src/config.ts:67`, `src/container-runner.ts:738-739`), i.e. the group's
configured container timeout is below that floor and the absolute cap won.

`INFERENCE`. "Replace the generic agent cron with a host-owned orchestration
job" is a cross-cutting change to every group's scheduling. It is the right
long-term shape and the wrong thing to bundle with a Procurement canary.

`RECOMMENDATION`. Smallest sufficient change:
1. the scan opens a source run at **start** (not at ingest), so an aborted turn
   leaves a `running` row rather than no evidence at all;
2. the reconciler escalates any run left `running` past a deadline, and any
   source with no terminal run in 48 h;
3. add a completion receipt for the Procurement task specifically.

That converts "the agent turn ended" into "the run ledger reached a terminal
state" without touching `task-scheduler.ts` semantics for other groups.

### C-7 — Decouple CDP retirement from the canary (§D)

`PREFLIGHT`. A disposable Alpine container outside Procurement reached the
unauthenticated shared gateway endpoint. This is a live exposure affecting
**every** container, not a Procurement feature concern.

`INFERENCE`. "Retire shared CDP only during verified cutover" makes a standing
security fix contingent on a feature canary succeeding. If the canary slips, the
exposure persists for no security reason. The coupling also inflates the
canary's blast radius: a CDP change breaking another group would be attributed
to the Procurement release.

`RECOMMENDATION`. Retire or isolate the shared CDP bridge as its **own** change,
with its own backup, rollback, and verification, sequenced independently — ideally
first, since the Procurement recovery does not depend on the browser at all.
Pausing the legacy scan (`PREFLIGHT` decision 6) is separable and can ship with
the canary.

### C-8 — The first real canary must target `passed`, not `proposal_ready` (§E)

`INFERENCE`. §E allows the real canary to end at `passed` **or**
`proposal_ready`, while §C's packet identity is deferred under C-3. Without
packet identity, hash, and an unresolved-item count, `proposal_ready` is an
unbacked prose claim — the exact failure mode this task exists to remove.

`RECOMMENDATION`. First real canary terminates at **`passed`** with typed
evidence. `proposal_ready` becomes reachable only after 116 supplies packet
identity, and its own canary follows then.

### C-9 — Validate the review-state constraint (missing from the proposal)

`FACT`. `114_procurement_control_plane.sql:112-119` adds
`procurement_review_state_check … NOT VALID` and never validates it.
`PREFLIGHT` confirms it exists unvalidated in production.

`INFERENCE`. A fresh database created from tracked migrations and the live
database now differ in enforced constraints. Adding pursuit states on top of an
unenforced review-state constraint compounds the divergence.

`RECOMMENDATION`. 115 runs `ALTER TABLE … VALIDATE CONSTRAINT
procurement_review_state_check` after asserting zero violating rows
(`PREFLIGHT`: every opportunity is `unreviewed`, so validation should be clean),
and a bootstrap test proves a fresh database reaches the same constraint state.

### C-10 — Do not repeat the silent-filter pattern in the pursuit queue

`FACT`. `v_procurement_review_queue` filters `close_date >= current_date`
(`114_procurement_control_plane.sql:735-737`), so expired undecided work
disappears with no transition, alert, or audit row. `PREFLIGHT`: 205 of 396
opportunities are already expired.

`RECOMMENDATION`. The pursuit queue view must **not** filter on deadline. The
reconciler transitions expired work to a terminal `expired_undecided` state with
an event and an alert. Filtering is what hid the loss; transitioning is what
records it.

---

## 3. Minimal schema and state machine

*(Answers question 2 and 3.)* Migration `115_procurement_pursuit.sql`, additive.

### 3.1 State machine

```
                    (fn_apply_procurement_review_card_decision, same txn)
review_state='process' ──────────────► pursuit_state = 'qualifying'
                                              │
              ┌───────────────────────────────┼───────────────────────────┐
              ▼                               ▼                           ▼
        'assessing'  ◄──────────────►  'blocked'                    'passed'   (terminal)
              │                                                     'expired_undecided' (terminal, reconciler-only)
              ▼
      'proposal_ready'   ── reachable only after migration 116 ──►  'submitted' (terminal, receipt-bound)
```

`RECOMMENDATION`. Enum in 115:
`qualifying | assessing | blocked | proposal_ready | submitted | passed |
expired_undecided`.

`proposal_ready` and `submitted` are declared but **unreachable** in this
release: their transition functions are not created until 116 (C-3, C-8). That
keeps 116 additive.

### 3.2 Tables

```sql
CREATE TABLE public.procurement_pursuits (
  id                bigserial PRIMARY KEY,
  opportunity_id    integer NOT NULL REFERENCES public.procurement_opportunities(id),
  decision_version  integer NOT NULL CHECK (decision_version >= 0),
  pursuit_state     text NOT NULL DEFAULT 'qualifying'
                    CHECK (pursuit_state IN ('qualifying','assessing','blocked',
                                             'proposal_ready','submitted',
                                             'passed','expired_undecided')),
  pursuit_version   integer NOT NULL DEFAULT 0 CHECK (pursuit_version >= 0),
  owner_uid         text NOT NULL,
  next_action       text NOT NULL,
  next_action_due   date NOT NULL,
  terminal_reason   text,
  closed_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, decision_version)          -- replay creates none
);

CREATE TABLE public.procurement_pursuit_events (
  id              bigserial PRIMARY KEY,
  pursuit_id      bigint NOT NULL REFERENCES public.procurement_pursuits(id),
  pursuit_version integer NOT NULL,
  event_type      text NOT NULL,                     -- generic: 116 adds types
  from_state      text,
  to_state        text,
  actor_uid       text NOT NULL,
  action_epoch    text,
  reason          text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pursuit_id, pursuit_version, event_type)    -- idempotent replay
);
```

`RECOMMENDATION`. `UNIQUE (opportunity_id, decision_version)` is the idempotency
key that makes "replay creates exactly zero additional pursuits" a database
invariant rather than application logic (C-4, request §C bullet 2).
`owner_uid`, `next_action`, and `next_action_due` are `NOT NULL` — an
un-owned or undated pursuit is unrepresentable, which is the direct schema
answer to RC-4.

### 3.3 View

```sql
CREATE OR REPLACE VIEW public.v_procurement_pursuit_queue AS
SELECT p.id AS pursuit_id, p.opportunity_id, o.source, o.source_key, o.title,
       o.agency, o.close_date, p.pursuit_state, p.pursuit_version,
       p.owner_uid, p.next_action, p.next_action_due,
       CASE WHEN o.close_date IS NULL THEN NULL
            ELSE o.close_date - current_date END AS days_until_close,
       (p.next_action_due < current_date)            AS action_overdue
  FROM public.procurement_pursuits p
  JOIN public.procurement_opportunities o ON o.id = p.opportunity_id
 WHERE p.pursuit_state NOT IN ('passed','submitted','expired_undecided');
```

`RECOMMENDATION`. No deadline filter (C-10). Terminal states are excluded
because they are closed, not because they are old.

### 3.4 Transition invariants

`RECOMMENDATION`. Enforced in SQL, not the host:

| Invariant | Mechanism |
| --- | --- |
| One pursuit per decided version | `UNIQUE (opportunity_id, decision_version)` |
| Optimistic concurrency | every transition takes `p_expected_version` and matches `pursuit_version`; `RAISE EXCEPTION` on mismatch, mirroring `114:538,684` |
| Monotonic version | `pursuit_version = pursuit_version + 1` inside the same `UPDATE` |
| Terminal is final | `WHERE pursuit_state NOT IN ('passed','submitted','expired_undecided')` in every transition |
| Every transition is evidenced | `p_reason` `NOT NULL`, non-blank, ≤1000 chars, matching `114:640-642` |
| Every transition is attributed | `actor_uid` required; named-operator check host-side, same as `src/procurement-review.ts:292` |
| Event ledger is append-only | no `UPDATE`/`DELETE` grant on the events table to any role |
| Pursuit exists only for a decided opportunity | insert occurs solely inside the decision function (C-4) |

### 3.5 Grants and RLS

`RECOMMENDATION`. Copy the 114 pattern exactly
(`114_procurement_control_plane.sql:742-789`):

- `REVOKE ALL` on both new tables and all new functions `FROM PUBLIC`;
- `GRANT SELECT ON v_procurement_pursuit_queue TO nanoclaw_procurement,
  nanoclaw_readonly, nanoclaw_admin` — the view is the container's **only**
  read path;
- `GRANT SELECT` on the two tables to `nanoclaw_readonly, nanoclaw_admin` only;
- `GRANT EXECUTE` on every new function to `nanoclaw_admin` **only**;
- **do not modify any RLS policy on `procurement_opportunities`.**

`INFERENCE`. That last point is the load-bearing one. The container gains
visibility through a granted view, not through relaxed row security. The
`114:83-104` policies stay exactly as deployed and independently proven
(`PREFLIGHT`: the direct-insert denial canary left zero residue).

### 3.6 Rollback boundary

`RECOMMENDATION`. 115 is additive: two new tables, one new view, N new
functions, one `CREATE OR REPLACE` of an existing function, one
`VALIDATE CONSTRAINT`, one taxonomy `UPDATE`. Down script:

1. `CREATE OR REPLACE FUNCTION fn_apply_procurement_review_card_decision` with
   the verbatim 114 body — **ship this text inside `115_down.sql`** so rollback
   does not depend on re-reading 114;
2. `DROP VIEW v_procurement_pursuit_queue`;
3. `DROP TABLE procurement_pursuit_events, procurement_pursuits`;
4. restore taxonomy `auto_archive=true` for the two labels (prior values
   recorded in `PREFLIGHT`);
5. leave the validated constraint validated — dropping validation is not a
   safety improvement.

No 114 table, column, policy, or grant is altered, so rollback cannot lose
observation or decision history.

---

## 4. Host API and authorization contract

`RECOMMENDATION`. Three new MCP tools (total surface grows from 3 to 6), and one
new operator command. All follow the existing directory-derived authorization at
`src/procurement-ipc-handlers.ts:143-145`.

| Operation | Caller | Gate | Semantics |
| --- | --- | --- | --- |
| `procurement_pursuit_queue` | container | none beyond group identity (read-only, mirrors `procurement_queue`) | bounded `SELECT` from `v_procurement_pursuit_queue`, limit 1-50, no raw payload, no Gmail IDs |
| `procurement_pursuit_card` | container | `PROCUREMENT_REVIEW_ENABLED` + epoch + operators | host renders **current DB truth** + a model recommendation; binds card to `(pursuit_id, pursuit_version, epoch)`; identical shape to `createProcurementReviewCard` (`src/procurement-review.ts:164-258`) |
| `procurement_pursuit_note` | container | review gate | appends an `event_type='note'` row; **cannot change state** |
| `ADVANCE #<pursuit> v<n> <state> — <reason>` | named human in the card thread | review gate + `isNamedProcurementOperator` | the only state-changing path; grammar mirrors `DECIDE` (`src/procurement-review.ts:23-24`) |

Authorization contract — `RECOMMENDATION`, all mirroring proven 114/review code:

1. **Identity is never model-supplied.** The actor UID comes from the Slack
   message, as at `src/procurement-review.ts:292`.
2. **Epoch-bound.** Every card carries `action_epoch`; a decision in a different
   epoch fails closed, as at `114:659`.
3. **Version-bound.** `ADVANCE` names the exact `pursuit_version`; stale
   commands raise, as at `114:687-691`.
4. **Thread-bound.** Commands are accepted only inside the card thread
   (`src/procurement-review.ts:276-277`).
5. **Reaction is never authority** — preserve the card footer wording at
   `src/procurement-review.ts:160`.
6. **No new Gmail authority.** `src/gmail-ipc-policy.ts:39` keeps Procurement at
   `gmail_read` only. Nothing in this design adds search, thread, reply, or
   send.
7. **Fail closed with a visible receipt.** On any rejection, post
   `[PROCUREMENT PURSUIT NOT RECORDED] <reason>` in-thread, mirroring
   `src/procurement-review.ts:279-285`. Silence is the failure mode being
   removed.
8. **Terminal states are human-only.** `passed` requires an `ADVANCE`;
   `expired_undecided` is the sole reconciler-written state and must be
   distinguishable in the event ledger by `actor_uid='host:reconciler'`.

---

## 5. Email recovery strategy

*(Answers question 6.)*

### 5.1 The route needs no source change

`FACT`. Traced in this worktree, both callers with `auto_archive=false`:

- **Path A, rules-runner** (`src/channels/gmail.ts:578-641`):
  `isAutoArchiveLabel` → `false` (`src/classify-ipc-handlers.ts:89-91`) → the
  early return at `:579` is skipped → `routeClassifiedEmail` at `:621` → on
  success `markClassificationRouted` at `:640`.
- **Path B, LLM classification** (`src/classify-ipc-handlers.ts:399-440`): the
  guard `data.classifier_version !== 'rules-runner-v1' && !taxonomy?.auto_archive`
  (`:403-404`) passes → dedup on `routed_at` (`:409-413`) →
  `routeAfterClassify` (`:431`) → `markClassificationRouted`.

`INFERENCE`. The host code is already correct. **The only change required for
live email routing is the taxonomy data.** This eliminates
`src/classify-ipc-handlers.ts`, `src/channels/gmail.ts`, and
`src/host-router.ts` from the change set — precisely the files shared with the
active Sales/email lineage (question 8).

Two consequences to state explicitly:

- `FACT`. `maybeCreateAutoRule` returns early unless `autoArchive === true`
  (`src/classify-ipc-handlers.ts:120`). After the flip, **no new** Procurement
  sender rules are auto-created, so new mail flows through Path B. That is the
  better path — content-aware rather than sender-inferred — and matches the
  comment's own reasoning at `:106-109`.
- `INFERENCE`. Rules auto-created **before** the flip persist and will drive
  Path A. Both paths route correctly, so this is safe; but it means routing may
  arrive by either path. The tests in §8 must cover both. Whether such rules
  exist is a live check (§11 R-8).

### 5.2 The 348-row backlog: observation backfill, not route replay

`RECOMMENDATION`. Do **not** replay the routing path (C-2). Instead, a bounded,
explicitly-authorized, host-only backfill:

`FACT` — why this works without any Gmail access:
`ingestEmailProcurementObservation` (`src/procurement-intake.ts:319-352`) stores
**only routing metadata**: label, sender, subject-as-title, message ID, thread
ID. Every one of those fields already exists in `email_classifications`
host-side. **No Gmail API call is required to create the observation.**

Procedure:

1. Read the 348 rows host-side (`gmail_message_id`, `gmail_thread_id`,
   `sender_email`, `subject`, `label`).
2. For each, call `ingestEmailProcurementObservation` under a dedicated run key
   `email-backfill-<UTC-date>`, so backfilled work is distinguishable from live
   intake in `procurement_source_runs`.
3. **Write no handoff and post no message.** The queue is the delivery
   mechanism; a human triages it.
4. **Grant no Gmail resource at backfill time.** Grant lazily, per opportunity,
   only when a review card is requested for it.
5. Set `routed_at` after a successful observation so the reconciler count
   converges.

Why each hazard is closed — `FACT` unless noted:

| Hazard | Closure |
| --- | --- |
| Arbitrary Gmail search | No Gmail call at all; `src/gmail-ipc-policy.ts:39` stays `gmail_read`-only, granted per-opportunity later |
| Duplicate handoffs | Backfill writes zero handoffs |
| Duplicate opportunities | `fn_record_procurement_observation` is idempotent on `(source, source_key, payload_hash)` (`114:437`); `source_key` is the message ID (`src/procurement-intake.ts:337`) |
| Flood | `INFERENCE`: 348 queue rows, zero messages. Run in batches with a per-batch cap and a stop-on-error rule |
| Grant-cap eviction | Avoided by not granting in bulk. `FACT`: grants are in-memory, capped at 5,000 per kind with FIFO eviction (`src/gmail-ipc-policy.ts:43,126-134`), and are lost on restart |
| Stale/expired items | `INFERENCE`: many of the 348 are months old. Backfill everything (cheap, idempotent), and let the reconciler transition undated/expired rows to `expired_undecided` rather than hiding them (C-10) |

`RECOMMENDATION`. Record explicitly that `routed_at` now means "host-processed,"
not "handoff written," for backfilled rows — otherwise a future reader will
misread the receipt.

Sequencing: the backfill runs **after** the canary proves the pursuit spine
works, not before. Otherwise 348 rows land in a queue with no exit.

---

## 6. Source-completeness contract

`RECOMMENDATION`. Extend `procurement_source_runs` additively:

| Column | Purpose |
| --- | --- |
| `adapter_version` | pin the extraction contract |
| `planned_units jsonb` | **host-written at run open** (C-5) |
| `observed_units jsonb` | adapter-reported markers |
| `missing_units jsonb` | host-derived difference |
| `coverage_evidence jsonb` | per-unit result count, cursor/page markers |
| `terminal_reason text` | why the run ended |

Status derivation, host-side and non-negotiable (C-5):

```
observed ⊇ planned                     → 'complete'   (zero results allowed)
observed ⊂ planned, observed ≠ ∅       → 'partial'    + missing_units
observed = ∅                           → 'failed'
run open with no terminal status       → reconciler escalates after N minutes
```

`FACT`. Two current defects this must also fix:

1. **`partial` unreachable.** `src/procurement-intake.ts:473-495` emits only
   `complete`/`failed`. Add the `partial` branch.
2. **Mid-batch failure is neither atomic nor resumable.** On error the code marks
   the run `failed` (`:486-493`) while observations already inserted persist;
   a retry with the same run key throws
   "already failed; use a new run key" (`:455-459`). `RECOMMENDATION`: allow a
   `failed`/`partial` run to resume when the batch hash matches — the hash
   equality check at `114:240-245` already makes that safe — and make per-unit
   persistence the atomic boundary rather than the whole batch.

`RECOMMENDATION`. Adapter acceptance and source completion become distinct
facts: the ingest IPC reply says "batch accepted, N rows"; only the host-derived
run status says `complete`. The container message at
`src/procurement-ipc-handlers.ts:168-172` currently announces "Run N is
complete" on acceptance — that line must report the derived status instead.

---

## 7. Reconciler and scheduler contract

`RECOMMENDATION`. One host job (a *job*, not an agent task, so it uses the
existing `reportJobResult` path at `src/task-scheduler.ts:77-90`), daily, that
**escalates and never mutates** — with one exception.

| # | Condition | Action |
| --- | --- | --- |
| 1 | Queue row undecided with `close_date` within 14 days (`PREFLIGHT` decision 4) | alert once |
| 2 | Queue row undecided past `close_date` | **transition** to `expired_undecided` + event + alert (C-10; the sole mutation) |
| 3 | Pursuit with `next_action_due < today` | alert once |
| 4 | Pursuit in `proposal_ready` past `close_date` with no submission | alert once |
| 5 | Pursuit in `submitted` past the award window with no outcome | alert once (inert until 116) |
| 6 | Source with no terminal run in 48 h, or a run `running` beyond its deadline | alert once |
| 7 | Count of Procurement classifications with `routed_at IS NULL` | alert with count only (C-2) |

Exactly-once semantics — `RECOMMENDATION`: a `procurement_reconciler_alerts`
table keyed `(condition, subject_id, subject_version)` with
`ON CONFLICT DO NOTHING`, mirroring the nonce-claim pattern already proven at
`114:648-704`. Escalation state must not live in memory; the daemon restarts.

Scheduler changes, deliberately minimal (C-6):
- the Procurement scan opens its source run at start;
- the task emits a completion receipt even when the agent emits nothing —
  necessary because `groups/procurement/CLAUDE.md:95` forbids narration, making
  "no output" indistinguishable from "crashed";
- `task-scheduler.ts` semantics for other groups are untouched.

---

## 8. Test plan with current-failure reproductions

*(Answers question 4.)* Every test below **fails on `97ca2cc`** and must pass
after repair. New files only, so no shared test file is edited (question 8).

**`src/procurement-email-route.test.ts`** (new)

| # | Test | Fails today because |
| --- | --- | --- |
| T1 | Path B: `auto_archive=false` + `procurement/rfp` → `routeClassifiedEmail` called exactly once, one handoff, `grantHostGmailResources('procurement', {messageId})` once, `routed_at` set | no caller-level test exists; `src/host-router.test.ts:580` calls the router directly |
| T2 | Path A: rules-runner + `auto_archive=false` → no early return, exactly one route, `markClassificationRouted('rules-runner-v1')` | same |
| T3 | `auto_archive=true` → **no** route, **no** grant, archive-only; locked as intentional | no test covers a routable label with the flag true |
| T4 | Path B retry claim (`classify-ipc-handlers.ts:353-363`) with `auto_archive=false` routes once and only once within the 30 s window | untested |

**`src/procurement-pursuit.test.ts`** (new)

| # | Test | Fails today because |
| --- | --- | --- |
| T5 | `process` decision → exactly one pursuit visible in the pursuit queue with owner and due date | no pursuit table, view, or code |
| T6 | Replaying the same `DECIDE` → zero additional pursuits, zero additional events | same |
| T7 | `ADVANCE` with a stale `pursuit_version` → rejected, no state change, failure receipt posted | same |
| T8 | `ADVANCE` from a non-named UID → rejected, no state change | same |
| T9 | `ADVANCE` to `passed` requires a non-blank reason; blank → rejected | same |
| T10 | Terminal pursuit rejects any further `ADVANCE` | same |
| T11 | `procurement_pursuit_note` cannot change `pursuit_state` | same |

**`src/procurement-source-completeness.test.ts`** (new)

| # | Test | Fails today because |
| --- | --- | --- |
| T12 | Observed ⊂ planned → run status `partial` with `missing_units` | `partial` is unreachable (`procurement-intake.ts:473-495`) |
| T13 | Zero results but full coverage → `complete` with evidence | today a zero-row batch is `complete` with no coverage concept |
| T14 | Mid-batch failure then same-key retry → resumes, no duplicate observations | `:455-459` throws on retry |
| T15 | Same run key with a different batch hash → rejected | passes today (`114:240-245`); lock it against regression |
| T16 | Model-supplied `planned_units` is ignored in favour of host config | no host-owned planned set exists |

**`src/procurement-reconciler.test.ts`** (new) — T17-T23: each of the seven §7
conditions produces exactly one alert; re-running produces none; condition 2
writes the transition and its event. All fail today (no reconciler).

**`src/procurement-config.test.ts`** (new)

| # | Test | Fails today because |
| --- | --- | --- |
| T24 | The plist generated by `setup/service.ts` contains all four `PROCUREMENT_*` keys, default-off | `setup/service.ts:117-131` emits six unrelated keys only |
| T25 | The documented surface is the surface actually read by `currentProcurementReviewPolicy` | `.env.example:18-25` documents an inert surface |

**`src/procurement-migration-contract.test.ts`** (extend — Procurement-owned)

| # | Test | Fails today because |
| --- | --- | --- |
| T26 | `procurement_review_state_check` is `VALIDATED` after 115 | added `NOT VALID` at `114:112-119`, never validated (C-9) |
| T27 | Pursuit tables/functions are host-admin only; the container's sole read path is the view | no such objects exist |
| T28 | 114 RLS policies are byte-unchanged by 115 | regression guard for the containment |

**Backfill**: T29 — running the backfill twice produces the same observation
count and zero handoffs.

---

## 9. Implementation sequence and exact files

*(Answers question 8.)* Ownership chosen so no file in the active Sales/email
lineage is modified.

### Step 1 — Configuration authority (C-1)

- `setup/launchd/com.nanoclaw.plist` — add four keys, default-off *(modified)*
- `setup/service.ts` — same four keys in the generator *(modified, shared but
  additive and Procurement-scoped)*
- `.env.example` — remove lines 18-25 *(modified)*
- `src/procurement-policy.ts` — add the startup `reason` log *(Procurement-owned)*
- `src/procurement-config.test.ts` *(new)*

### Step 2 — Email route by data, not code (§5.1)

- `data/business/migrations/nanoclaw-v2/115_procurement_pursuit.sql` — includes
  the two-row taxonomy `UPDATE`, safe when rows are absent *(new)*
- `src/procurement-email-route.test.ts` *(new)*
- **No change** to `src/classify-ipc-handlers.ts`, `src/channels/gmail.ts`, or
  `src/host-router.ts`.

### Step 3 — Migration 115 core (§3)

- `115_procurement_pursuit.sql` — pursuit tables, view, transition functions,
  `CREATE OR REPLACE` of the decision function (C-4), `VALIDATE CONSTRAINT`
  (C-9), grants *(new)*
- `115_procurement_pursuit_down.sql` — with the verbatim 114 function body
  *(new)*
- `src/procurement-pursuit.ts` — host module, parameterized calls only, modelled
  on `src/procurement-intake.ts` *(new)*
- `src/procurement-pursuit.test.ts` *(new)*
- `src/procurement-migration-contract.test.ts` *(extended)*

### Step 4 — Host API (§4)

- `src/procurement-ipc-handlers.ts` — three new bounded operations
  *(Procurement-owned)*
- `src/procurement-review.ts` — `ADVANCE` grammar + handler beside `DECIDE`
  *(Procurement-owned)*
- `container/agent-runner/src/ipc-mcp-stdio.ts` — three tool definitions
  *(shared; additive, Procurement-namespaced)*
- `src/ipc.ts` — extend `isProcurementIpcType` dispatch *(shared; the smallest
  possible edit, ~3 lines)*

### Step 5 — Source completeness (§6)

- `src/procurement-intake.ts` — planned/observed/derived status, resumable runs
  *(Procurement-owned)*
- `src/procurement-source-config.ts` — host-owned planned unit sets *(new)*
- `src/procurement-source-completeness.test.ts` *(new)*
- `knowledge/agents/procurement/procedures/scan-caleprocure.md` — keywords now
  host-owned *(Procurement-owned)*

### Step 6 — Reconciler (§7)

- `src/procurement-reconciler.ts` *(new)*, `src/procurement-reconciler.test.ts`
  *(new)*
- job registration + Procurement task receipt *(smallest possible edit)*

### Step 7 — Prompt reconciliation

- `groups/procurement/CLAUDE.md` — remove the RLS-dead legacy commands
  (`:135-161`), document pursuit operations *(Procurement-owned)*

### Step 8 — Canary, then backfill, then sources

Per §10. The 348-row backfill runs **after** the canary (§5.2).

**Explicitly out of this release:** CDP retirement (C-7, separate change);
artifact/packet/submission/outcome schema (C-3, migration 116); SAM.gov adapter;
any Sales or email-lineage file.

---

## 10. Deployment, canary, and rollback gates

*(Answers question 9.)*

**Gate A — release integrity.** Node 22.23.2 typecheck; full suite; all §8 tests
pass; `npm run docs:continuity-check`; `git diff --check`; one immutable release
artifact built from a **clean commit** on this lineage and independently
verified (SHA-256 + runner digest). Release `97ca2cc` and its service definition
are retained as host-code rollback (`PREFLIGHT` mutation prerequisites).

**Gate B — migration.** Backup taxonomy rows, task row, service definition, and
schema definitions first. Apply 115 in a transaction; assert: zero violating
rows before `VALIDATE CONSTRAINT`; 114 policies and grants unchanged (T28); new
functions `nanoclaw_admin`-only (T27); both taxonomy rows now `auto_archive=false`.
`115_down.sql` rehearsed before the forward run.

**Gate C — deploy dark.** Deploy with all four gates still off. Verify `/health`
reports the new release, matching code root, Slack and Gmail connected. Confirm
the startup log prints policy `reason=disabled`. Confirm the empty control tables
are still empty. **Pause the legacy daily scan here** (`PREFLIGHT` decision 6).

**Gate D — synthetic denial canaries** (all before any real data):
wrong user · stale review version · stale pursuit version · wrong thread · old
epoch · replayed `DECIDE` · replayed `ADVANCE` · disabled gate · oversized batch ·
unknown row field · same run key with a different batch hash · mid-batch failure
then resume. Each must fail closed **and post a visible receipt**.

**Gate E — sanitized positive canary.** Enable collection only → one sanitized
fixture batch → run status derived `complete` with coverage evidence. Enable
review → one card → named `DECIDE … process` → **assert the opportunity appears
in the pursuit queue with owner and due date** (the step that does not exist
today) → `ADVANCE … passed` with evidence. Force one collection failure; confirm
the reconciler escalates exactly once and the run is resumable without manual
SQL.

**Gate F — one real public opportunity.** Terminates at **`passed`** with typed
evidence (C-8). No email, registration, signature, attestation, pricing
commitment, or submission. Reconcile source run → observation → opportunity →
card → decision → pursuit → events → Slack thread → terminal state by stable
identifiers.

**Gate G — backfill.** Only after Gate F. Bounded batches, stop on first error,
zero handoffs, idempotent on re-run (T29).

**Gate H — source expansion.** Blocked until Gate F passes and 116 lands. SAM.gov
first, per the converged R2 §7 ordering and its five caveats.

**Rollback triggers** — any of: a denial canary that does not fail closed; a
decision that produces zero or two pursuits; a reconciler alert storm; a taxonomy
flip that produces duplicate handoffs; `/health` not reporting the expected
release. **Rollback order:** revert the service definition to `97ca2cc` → run
`115_down.sql` → restore the two taxonomy rows to `auto_archive=true` → confirm
the empty control tables and the 114 policies are intact.

---

## 11. Remaining risks

Not owner questions — engineering risks that survive this design.

| ID | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| **R-1** | **CDP exposure persists.** `PREFLIGHT` confirms a non-Procurement container reached the unauthenticated gateway. C-7 removes it from this release, so the exposure outlives the canary unless separately scheduled. | **High** | Schedule the CDP change independently and first. Do not let C-7 become "later." |
| **R-2** | **Operator UIDs are resolved host-side and never enter Git.** A typo yields silent fail-closed — indistinguishable from "gate off." | Medium | The startup `reason` log (C-1) plus a Gate-D canary proving a *known-good* UID is accepted, not only that a bad one is rejected. |
| **R-3** | **Gmail grants are in-memory and lost on restart.** `FACT` `src/gmail-ipc-policy.ts:43,126-134`. A restart between grant and agent read makes a legitimate `gmail_read` fail. | Medium | Grant lazily at card time (§5.2) so the window is seconds; treat durable grants as pre-existing NC-20260729-004 work, not this task's. |
| **R-4** | **Backfill floods the queue with stale work.** 348 observations, many long expired, arriving before any triage capacity exists. | Medium | Gate G runs after Gate F; batch it; the reconciler transitions expired rows to `expired_undecided` rather than leaving them (C-10). |
| **R-5** | **Host-owned planned units drift from the portal.** If CaleProcure renames or drops a search facet, every run becomes `partial` forever. | Medium | Treat sustained `partial` as an adapter-maintenance alert (§7 condition 6), not a data problem. Version `planned_units` with `adapter_version`. |
| **R-6** | **The pursuit spine has no capacity model.** One owner, 14-day escalation, and a queue that can hold hundreds of rows. Alert fatigue would reproduce the current "everything is `new`" failure in a new table. | Medium | Cap the canary at one opportunity; measure decision latency before backfilling; consider a WIP limit on non-terminal pursuits before Gate G. |
| **R-7** | **`proposal_ready` and `submitted` are declared but unreachable.** A reader may believe the packet lifecycle exists. | Low | Comment both states in 115 as "declared for additive 116; no transition exists." Add a test asserting no function can reach them. |
| **R-8** | **Pre-existing auto-created Procurement sender rules are unknown.** `FACT` `maybeCreateAutoRule` created rules while `auto_archive=true` (`src/classify-ipc-handlers.ts:120`). After the flip these drive Path A. | Low | Live check before Gate C: count `classification_rules` rows with a `procurement/*` target. Both paths are tested (T1, T2), so either outcome is safe — but the operator should know which path is live. |
| **R-9** | **`routed_at` changes meaning for backfilled rows** ("host-processed" vs. "handoff written"). | Low | Document it in the migration comment and in `data/business/CLAUDE.md`. |
| **R-10** | **Two release lineages exist.** `PREFLIGHT`: the operational checkout is `main` @ `a6e4b13` with 210 dirty paths; this worktree is `97ca2cc`. A future change made in the dirty tree could silently diverge from what is deployed. | Medium | This release must land as a reviewed commit on its own branch, and the operational checkout must never again be a deployment source. |
| **R-11** | **The scheduler is only patched, not fixed** (C-6). `next_run` still advances before the container runs (`src/task-scheduler.ts:126-138`), and other groups keep the silent-completion behavior. | Low for Procurement | The source-run ledger makes Procurement's completeness independent of scheduler semantics. Track the general fix separately. |
| **R-12** | **Neither `scraped` row has a usable `Brief.md`** (`PREFLIGHT`). The canary cannot reuse historical work and needs a genuinely fresh opportunity. | Low | Expected; Gate E uses a sanitized fixture and Gate F a fresh public opportunity. |

---

## 12. Files inspected, attestation, elapsed time, cost

### Inspected in this worktree (`97ca2cc`)

`docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R1.md` ·
`docs/reports/NC-20260809-003-PROCUREMENT-PRODUCTION-PREFLIGHT.md` ·
`docs/ACTIVE-WORK.md` (NC-20260809-003 row) ·
`data/business/migrations/nanoclaw-v2/114_procurement_control_plane.sql` and the
migration index · `src/procurement-{intake,review,policy,ipc-handlers}.ts` ·
`src/classify-ipc-handlers.ts:85-135,150-200,300-450` ·
`src/channels/gmail.ts:560-650` · `src/host-router.ts:32-33,190-200,250-365` ·
`src/gmail-ipc-policy.ts:39,43,126-175` · `src/task-scheduler.ts` ·
`src/config.ts:53-67` · `src/container-runner.ts:650-660,730-745` ·
`src/env.ts:32-56` · `src/ipc.ts` (procurement dispatch) ·
`container/agent-runner/src/ipc-mcp-stdio.ts` (tool inventory) ·
`setup/service.ts:117-141` · `setup/launchd/com.nanoclaw.plist` ·
`.env.example:12-32` · `groups/procurement/CLAUDE.md` ·
`knowledge/agents/procurement/procedures/scan-caleprocure.md` ·
`src/procurement-*.test.ts` (inventory)

### Read outside this worktree, read-only, as instructed

`/Users/xbohdpukc/dev/NanoClaw/docs/reports/NC-20260809-002-PROCUREMENT-SYSTEM-AUDIT-CLAUDE-RESPONSE-R2.md`
(the converged prior round). Files in the operational checkout were otherwise
touched only by `diff -q` to establish the baseline delta (§ baseline note); none
was modified.

### Commands run

`git -C … log/status`; `ls`; `grep`; `sed`; `diff -q`. All read-only. No build,
no test run, no typecheck, no database, no network, no browser, no container.

### Changed-file attestation

Exactly one file was created, inside the named implementation root:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R1.md
```

No source, schema, configuration, prompt, or continuity file was edited in this
worktree. The three pre-existing untracked reports and the two modified
continuity files (`docs/ACTIVE-WORK.md`, `docs/ENGINEERING-CHANGELOG.md`,
modified by Codex before this round) are unchanged by me. **The operational
checkout at `/Users/xbohdpukc/dev/NanoClaw` was not modified by this round.**

Attestation detail for the operational checkout: it stood at 139 dirty paths at
the end of the prior round and 141 now. Both new paths are
`NC-20260809-001-GRADER-RECALIBRATION-{CODEX-REQUEST,CLAUDE-RESPONSE}-R3.md` —
an unrelated concurrent grader round, not Procurement and not mine. No
Procurement file, no source file, and no tracked file in that tree changed
during this round; my only access to it was `diff -q` and one read of the
prior converged R2 report.

Boundaries honored: no `.env*`, credential, settings, auth-store, raw database,
raw log, browser-state, solicitation, private-proposal, or customer/student
content read. `.env.example` is tracked source. No production query; all live
facts came from the preflight. Nothing built, migrated, deployed, enabled,
scheduled, sent, committed, or pushed.

### Elapsed time and cost

Approximately 17 minutes wall-clock (2026-08-09T19:55Z–20:12Z), ~30 file
inspections plus one 791-line migration re-read, zero external calls. Token and
dollar accounting is not observable from inside the session; if required it must
come from the harness rather than an estimate.
