# NC-20260809-003 — Corrected migration-116 proposal/action-binding delta, Claude R6

- Round: R6, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-PROPOSAL-SOURCE-CODEX-REQUEST-R6.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-09T21:55Z–22:22Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; deployed runtime
  `9aa23b4e7c39`
- Change class: C0 design review. No production, database, browser, network,
  vault, or secret access; nothing implemented, committed, or deployed.

Labels: `FACT` = verified in this worktree this round with a citation ·
`CARRIED` = cited in an earlier round, **not** re-verified in R6 scope ·
`INFERENCE` · `RECOMMENDATION` · `OWNER DECISION`.

---

# Verdict: CHANGES REQUIRED

All five gaps are real. R5's `READY TO IMPLEMENT` was wrong and I am not
defending it. Four of the five are my errors, one is a factual overstatement,
and correcting them changes the shape of the slice materially — 9 tables rather
than 6, 9 functions rather than ~8, two migration-115 objects replaced rather
than one, and one construct (`artifact_ids bigint[]` with an implied foreign
key) that PostgreSQL cannot enforce at all.

**I also found a sixth defect that neither R5 nor this request names, and it is
the most serious item in the round.** It is in *deployed* 115 code:

`FACT` — `fn_reconcile_procurement` expires any pursuit whose public close date
has passed, excluding only two states:

```
115:762-763   AND po.close_date < (p_now AT TIME ZONE 'America/Chicago')::date
              AND p.pursuit_state NOT IN ('passed', 'expired_undecided')
```

`proposal_ready` and `submitted` are both in scope. The day after a close date,
a pursuit on which a named human attested to submitting a proposal would be
rewritten to `expired_undecided` with
`terminal_reason = 'public close date passed without a terminal decision'`.
That is a false record of the company's own decision, produced automatically,
on the exact authority boundary this whole convergence exists to protect.

`INFERENCE`. The defect is **latent, not active**: `115:628` rejects
`proposal_ready` and `submitted`, so no pursuit can currently reach either
state. 116 is the migration that makes them reachable, so 116 is where the fix
belongs. No 115 hotfix, no urgency, no separate deployment — but 116 cannot
ship without it, and this is not optional scope.

The delta below is decision-complete. R7 should be a verification round, not a
design round. The three owner items (§9) remain fail-closed configuration and
block enablement, not implementation.

---

## 0. What R5 got wrong, stated plainly

| # | R5 claim | Reality |
| --- | --- | --- |
| 1 | "Stale card/epoch — identical to 115: verified against the originating card" (§3.5) | No card exists for the three new commands. `procurement_review_cards` cannot represent them (§1) |
| 2 | The 115 event `UNIQUE` "gives replay idempotency for free… 116 is the payoff" (§3.5) | It rejects the second `artifact_registered` at one pursuit version. It blocks ordinary work (§2) |
| 3 | Drift "should also flip the packet to `superseded`" (§6) | Leaves the pursuit `proposal_ready` and in the queue. Truthful-state contradiction (§3) |
| 4 | "computed host-side with the existing `canonicalJson` helper" (§3.3) | `canonicalJson` is module-private and cannot be called from a new module (§4) |
| 5 | "`submitted` genuinely terminal, so the pursuit queue empties" (§1) | The 115 view excludes only `passed`/`expired_undecided`; a submitted pursuit stays in the queue forever (§5.4) |
| 6 | `artifact_ids bigint[] … CHECK (cardinality > 0)` (§3.3) | PostgreSQL cannot enforce a foreign key through an array. Unenforceable as written (§3.6) |
| 7 | `CHECK (verified_hash = approved_hash_of(approval_id))` (§3.4) | PostgreSQL rejects subqueries in `CHECK` and a non-immutable function in one is unsound. Must be function-enforced only (§5.2) |
| 8 | RLS pattern cited as `115:842-862` | That range is the `REVOKE` block. The RLS policies are `115:175-222`. Corrected citation |

Item 2 is the one I most want on the record: I asserted that a constraint
designed for *state transitions* would generalize to *sub-entity events*
because the table columns looked generic. I read the column list and not the
constraint's meaning. The standing check that falls out of this round: **before
reusing a table, read what its unique key asserts about the world, not what its
columns permit.**

---

## 1. F1 — durable action-card binding

### 1.1 Why `procurement_review_cards` cannot carry these commands

`FACT`. Three independent blockers, all in 114:

- `recommendation text NOT NULL CHECK (recommendation IN ('needs_info','process','drop'))`
  (`114:172-175`) and the matching `decision` CHECK (`114:179-183`). Adding
  `approve`/`record_submission`/`outcome` means altering two 114 CHECK
  constraints — which R5's own "no change to any 114 or 115 object" rule
  forbids, and which makes `rollback_116` depend on 114 constraint text.
- `UNIQUE (opportunity_id, review_version, action_epoch)` (`114:188`) is keyed
  on *review* version. Packet, submission, and outcome cards have no review
  version and would collide with each other.
- `fn_apply_procurement_review_card_decision` consumes the card
  (`115:552-558`: `state='decided'`, then supersedes every other open card for
  the opportunity). A packet card sharing that table would be superseded by the
  next DECIDE on the same opportunity.

**116 does not read, write, alter, or reference `procurement_review_cards`.**
The DECIDE path is untouched.

### 1.2 The thread-binding correction R5 and the request both miss

`FACT`. The 115 pursuit path binds by comparing the *card's own message
timestamp* against the *operator's thread timestamp*:

- `procurement-review.ts:325` — `const threadTs = message.threadTs?.trim()`
- `procurement-review.ts:379-392` — `threadTs` is passed as the `p_message_ts`
  argument to `fn_apply_procurement_pursuit_advance`
- `115:649-651` — `v_card.message_ts <> btrim(p_message_ts)` raises

That predicate holds today only because the review card **is the thread root**:
`createProcurementReviewCard` posts with a fresh entity thread key
(`procurement-review.ts:265-268`, `procurement:opp:${opportunityId}`) and
stores the returned ts as `message_ts` (`procurement-review.ts:272-285`).

`INFERENCE` — decisive for 116. A 116 action card is posted **after** that
thread exists. If it is posted into the same entity thread, its own message ts
is a reply ts, and the operator's reply still carries the *root* ts. Any card
model that stores one timestamp and compares it to `threadTs` therefore either
(a) fails every time, if it stores the card's own ts, or (b) cannot distinguish
two cards in one thread, if it stores the root. Both are unacceptable.

`RECOMMENDATION`. The card stores **both**, with distinct jobs:

- `thread_ts` — the thread root the operator's reply will carry. **This is the
  binding predicate.**
- `card_message_ts` — the card's own timestamp. **This is the actor-independent
  posting record**, unique per channel, and the audit anchor.

The two may be equal (new thread) or differ (reply into an existing thread);
116 must be correct either way and must never assume equality. Smoke assertion
S-4 and test `procurement-action-card.test.ts` both exist to pin this.

`RECOMMENDATION`. Because `thread_ts` alone cannot disambiguate two cards in one
thread, the card is **looked up by subject and action kind**, never by
timestamp. The command text supplies the subject; the thread supplies the
authorization context.

### 1.3 `procurement_action_cards`

```
procurement_action_cards
  id                bigserial PK
  action_kind       text NOT NULL CHECK (action_kind IN
                      ('approve','record_submission','outcome'))
  subject_kind      text NOT NULL CHECK (subject_kind IN ('packet','submission'))
  subject_id        bigint NOT NULL
  subject_version   integer NOT NULL CHECK (subject_version >= 0)
  pursuit_id        bigint NOT NULL REFERENCES public.procurement_pursuits(id)
  pursuit_version   integer NOT NULL CHECK (pursuit_version >= 0)
  channel_jid       text NOT NULL
  thread_ts         text NOT NULL      -- binding predicate (thread root)
  card_message_ts   text NOT NULL      -- posting record (this card's own ts)
  action_epoch      text NOT NULL
  authority         text NOT NULL CHECK (authority IN ('operator','approver'))
  posted_at         timestamptz NOT NULL DEFAULT now()
  expires_at        timestamptz NOT NULL CHECK (expires_at > posted_at)
  state             text NOT NULL DEFAULT 'open'
                    CHECK (state IN ('open','consumed','superseded','disarmed','expired'))
  consumed_by_uid   text
  consumed_at       timestamptz
  UNIQUE (channel_jid, card_message_ts)
  UNIQUE (action_kind, subject_kind, subject_id, subject_version, action_epoch)
  CHECK (state <> 'consumed' OR (consumed_by_uid IS NOT NULL AND consumed_at IS NOT NULL))
  CHECK (subject_kind = 'submission' OR action_kind <> 'outcome')
  CHECK (subject_kind = 'packet' OR action_kind = 'outcome')

CREATE UNIQUE INDEX uq_procurement_action_cards_open
  ON public.procurement_action_cards (action_kind, subject_kind, subject_id)
  WHERE state = 'open';
```

**Cardinality.** At most one `open` card per (action kind, subject) across all
epochs — the partial unique index, not the full unique key, is what enforces
that. The full key additionally makes a re-post after epoch rotation a distinct
row rather than an overwrite, so the ledger keeps both.

**Version.** `subject_version` is the packet version (0 for a submission
subject). `pursuit_version` is the **optimistic-concurrency token**, captured at
posting time.

`RECOMMENDATION` — and this is a deliberate departure from R5. The human command
carries **only the subject version**, never the pursuit version. A second
version token in typed Slack text is a usability trap that produces stale-input
failures indistinguishable from real conflicts. Concurrency is carried by the
card: the command function requires
`pursuits.pursuit_version = card.pursuit_version`. Any intervening `ADVANCE`
bumps the pursuit version (`115:668`) and the card fails closed. **The card is
the concurrency token.**

**Expiry and epoch.** `expires_at = posted_at + 14 days`, and the reconciler
sweeps `open` cards past `expires_at` to `expired` (§6, condition 7). An epoch
rotation does not need a sweep: the epoch is compared at consumption and a
mismatch raises. Both are pre-commit.

**Posting record.** Created only by `fn_record_procurement_action_card`, granted
`EXECUTE` to `nanoclaw_admin` alone. The host posts first, then binds — the
114 sequence (`114:549-608`) — and on bind failure posts the existing disarm
notice (`procurement-review.ts:289-296` precedent) and calls
`fn_disarm_procurement_action_card`. Nothing an operator types and nothing the
container sends can create a card.

**Consumption semantics** (inside one transaction, in this order):

1. `SELECT … FOR UPDATE` the card by
   `(action_kind, subject_kind, subject_id, subject_version)`.
2. Require `state = 'open'` · `action_epoch = p_action_epoch` ·
   `channel_jid = p_channel_jid` · `thread_ts = p_thread_ts` ·
   `expires_at > now()`.
3. `SELECT … FOR UPDATE` the pursuit; require
   `pursuit_version = card.pursuit_version` and the expected state.
4. Apply the state write.
5. `UPDATE` the card to `consumed`, with `consumed_by_uid` and `consumed_at`.
6. Supersede any other `open` card for the same subject.
7. Insert the routed receipt into `procurement_reconciler_alerts`.

| Failure | Detected at | Result |
| --- | --- | --- |
| Replay | step 2, `state='consumed'` | raise, no mutation |
| Stale epoch | step 2 | raise, no mutation |
| Expired card | step 2 | raise, no mutation |
| Wrong thread | step 2, `thread_ts` mismatch | raise, no mutation |
| Wrong channel | step 2 | raise, no mutation |
| Wrong action for this subject | step 1, no row for that `action_kind` | raise, no mutation |
| Concurrent `ADVANCE` | step 3, `pursuit_version` mismatch | raise, no mutation |

Every one of these raises **before** any write, so the host's existing
pre-commit failure path emits `[PROCUREMENT ACTION NOT RECORDED]` correctly
(`procurement-review.ts:328-334, 400-415`). No new receipt mechanism.

**Allowlist honesty.** `authority` records *which gate applied when the card was
posted*. SQL cannot verify allowlist membership. Enforcement is host-side, by
the `isNamedProcurementOperator` precedent
(`procurement-review.ts:348-351`), checked again at consumption time against the
current configuration. The schema comment must say this explicitly rather than
implying the database authorizes the human.

### 1.4 Parser and prefix-guard corrections

`FACT`. `commandPrefix` is `/^\s*(DECIDE|ADVANCE)\b/i`
(`procurement-review.ts:320`). Extending it is required for malformed-input
receipts to work on the new commands.

`RECOMMENDATION`. Do **not** extend it with a bare `\b` alternation.
`OUTCOME` and `APPROVE` are ordinary English words that will open human
sentences in this channel, and a bare-word match sends every such sentence
through the malformed branch, spraying `[PROCUREMENT ACTION NOT RECORDED]` at
people having a conversation. Require the subject token for the new commands
only, leaving deployed behavior untouched:

```
/^\s*(DECIDE|ADVANCE)\b/i                          // unchanged, deployed
/^\s*(APPROVE|RECORD-SUBMISSION|OUTCOME)\s+#\d/i    // new
```

`FACT` — minor, pre-existing, worth fixing in the same change:
`procurement-review.ts:325-326` returns `true` when a command-shaped message has
no `threadTs`, silently swallowing it with no log line and no operator feedback.
With five commands instead of two this becomes a real support burden. Add a
`logger.warn`. Not a blocker.

---

## 2. F2 — event idempotency

### 2.1 The collision, exactly

`FACT`. `115:116` — `UNIQUE (pursuit_id, pursuit_version, event_type)`.
`FACT`. `115:110` — `to_state text NOT NULL`.

Two problems, and the request names only the first. The second is that
`artifact_registered` and `compliance_updated` are not state transitions at all,
so they have no `to_state` to supply. Forcing the pursuit's current state into
a NOT NULL transition column would make the ledger read as a sequence of
self-transitions that never happened.

### 2.2 Decision: separate append-only ledger, not `ALTER TABLE`

I considered adding `event_key text NOT NULL DEFAULT ''` to
`procurement_pursuit_events` and widening the unique key. **Rejected**, for one
reason that outweighs the tidiness of a single ledger: it makes `rollback_116`
*conditional on data*. Restoring
`UNIQUE (pursuit_id, pursuit_version, event_type)` fails if any 116-era rows
violate it, so the rollback succeeds or fails depending on what happened in
production while 116 was live. A rollback that might not run is not a rollback
boundary. The separate ledger drops unconditionally.

`RECOMMENDATION`. **Scope rule, stated in both migration headers:**

- `procurement_pursuit_events` (115) is the **pursuit state-transition ledger**.
  Its unique key asserts "one transition of a given type per pursuit version,"
  which is true and worth keeping. **116 does not alter it.**
- `procurement_packet_events` (116) is the **sub-entity append-only ledger** for
  everything that happens *within* a pursuit version.

116 writes to the 115 table for exactly the three events that do change pursuit
state and version — `packet_approved`, `submission_recorded`,
`packet_invalidated` — where the version bump satisfies the existing unique key
without any change to it. `outcome_recorded` bumps the pursuit version too (§5.3)
and so may also live there; I put it in the 116 ledger instead, because outcome
is a property of the submission and belongs with the sub-entity record.

```
procurement_packet_events
  id            bigserial PK
  pursuit_id    bigint NOT NULL REFERENCES public.procurement_pursuits(id)
  subject_kind  text NOT NULL CHECK (subject_kind IN
                  ('artifact','compliance_item','packet','submission','outcome'))
  subject_id    bigint NOT NULL
  event_type    text NOT NULL CHECK (event_type IN
                  ('artifact_registered','artifact_superseded','compliance_updated',
                   'packet_assembled','packet_superseded','packet_invalidated',
                   'packet_approved','submission_recorded','outcome_recorded'))
  event_key     text NOT NULL CHECK (event_key ~ '^[0-9a-zA-Z][0-9a-zA-Z._:-]{0,127}$')
  actor_uid     text NOT NULL
  action_epoch  text
  reason        text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000)
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(payload) = 'object')
  created_at    timestamptz NOT NULL DEFAULT now()
  UNIQUE (subject_kind, subject_id, event_type, event_key)
```

### 2.3 `event_key` derivation — no model text anywhere

| Event | `event_key` | Why it is not model text |
| --- | --- | --- |
| `artifact_registered` | the artifact's `sha256` | Host-computed from bytes the host read |
| `artifact_superseded` | the superseding artifact's `sha256` | Same |
| `compliance_updated` | `requirement_key || ':' || item_version` | `item_version` is assigned by the database on upsert; the model cannot choose it |
| `packet_assembled` / `packet_superseded` / `packet_invalidated` | the `packet_hash` | Host-computed |
| `packet_approved` | `approval_id::text` | Database-assigned |
| `submission_recorded` | `submission_id::text` | Database-assigned |
| `outcome_recorded` | `submission_id::text` | Database-assigned; also `UNIQUE` on the outcome table |

`requirement_key` is the one component the container proposes. It is bounded to
`^[a-z0-9][a-z0-9._-]{0,63}$` (a key, not a paragraph) and is already an
identity via `UNIQUE (pursuit_id, requirement_key)`. Pairing it with a
database-assigned `item_version` means a genuine replay dedups and a genuinely
different requirement creates a genuinely different row. There is no path by
which model prose becomes an idempotency key.

**Rollback.** `DROP TABLE public.procurement_packet_events;` — unconditional,
data-independent, and with no constraint on any 115 object to restore. This
property is the entire reason for the design.

---

## 3. F3 — packet drift transition

### 3.1 `superseded` was the wrong state

`superseded` means "a newer version replaced this one" — a benign, expected
lifecycle event. Drift and missing bytes are integrity failures. Conflating them
makes the one state you would page on indistinguishable from routine
re-assembly. The packet CHECK becomes:

```
state text NOT NULL DEFAULT 'draft' CHECK (state IN
  ('draft','approved','superseded','submitted','invalidated'))
invalidated_reason text CHECK (invalidated_reason IS NULL OR invalidated_reason IN
  ('artifact_hash_mismatch','artifact_missing','artifact_unreadable',
   'close_date_passed_unsubmitted'))
invalidated_at timestamptz
CHECK ((state = 'invalidated') = (invalidated_reason IS NOT NULL))
CHECK ((invalidated_reason IS NULL) = (invalidated_at IS NULL))
```

### 3.2 `fn_invalidate_procurement_packet` — one transaction, five effects

Host detects (it must; PostgreSQL cannot read the vault), database applies.
Called with the packet id, the expected packet version, the reason code, and the
host's evidence (which artifact, expected hash, observed hash or absence).

| Effect | Detail |
| --- | --- |
| Packet | `approved` → `invalidated`, `invalidated_reason`, `invalidated_at`. Version unchanged — invalidation is not a new version |
| Pursuit | `proposal_ready` → `blocked`; `pursuit_version + 1`; `next_action = 'Approved packet invalidated: <reason>. Re-verify artifacts and re-assemble.'`; `next_action_due = now() + interval '2 days'`; `closed_at` stays NULL |
| 115 event | `packet_invalidated`, `from_state='proposal_ready'`, `to_state='blocked'`, `actor_uid='procurement-reconciler'`. Unique key satisfied by the version bump |
| 116 event | `packet_invalidated` keyed on `packet_hash`, payload carries the artifact id and expected/observed hashes |
| Alert | `procurement_reconciler_alerts` insert in the same transaction, `condition_key='packet_drift'`, `subject_kind='packet'`, `subject_version = packet_version || ':' || <America/Chicago date>`, routed to the **approval card's** `channel_jid`/`thread_ts` so it lands where the human approved |
| Cards | Any `open` card for that packet → `superseded` |

**The reconciler never approves.** It may invalidate and block; it has no path
to `proposal_ready` or `submitted`. `fn_invalidate_procurement_packet` cannot
express an advance — that is a structural guarantee, not a policy statement.

### 3.3 Recovery

The approval row is **never deleted**. It is the record of what was approved,
by whom, and against which bytes — including the case where those bytes later
broke. Recovery is: re-register the changed artifact as a *new* row
(§4.3 immutability), clear the compliance items it supported, assemble
`packet_version = max + 1`, and obtain a fresh `APPROVE` on a fresh card. The
old packet stays `invalidated` forever.

### 3.4 Drift on a `submitted` packet

Neither R5 nor the request covers this, and it is the case where getting it
wrong is worst. A human already sent those bytes to an external party. The
pursuit must **not** move backwards, and the packet must **not** be invalidated
— the submission record's truth claim is about bytes as of the recording
moment, and it remains true.

`RECOMMENDATION`. Detection only: `condition_key='submitted_artifact_drift'`,
daily bucket, alert routed to the submission thread, one
`procurement_packet_events` row. Zero state change. The schema comment states
why: post-submission drift is an internal-hygiene signal, not a correction to
what was submitted.

---

## 4. F4 — the executable host/SQL boundary

### 4.1 `canonicalJson` — dedicated module

`FACT`. `src/procurement-intake.ts:112` — `function canonicalJson(value: unknown): string`,
with no `export`. `payloadHash` (`:126`) is likewise private. R5 said "the
existing helper" as if it were callable. It is not.

`RECOMMENDATION`. **Introduce `src/canonical-json.ts`**, exporting
`canonicalJson` and `sha256Canonical(value, maxBytes)`. `procurement-intake.ts`
imports it and deletes its private copies. Not an export from
`procurement-intake.ts`: that would make a packet module import an intake module
for a pure utility, and the two subsystems should not become coupled through a
string function. A ~25-line pure module also satisfies the acyclic-import and
file-size conventions.

`RECOMMENDATION` — **required guard, not a nicety.** `115:270-275` raises
`'procurement run key % was reused with different evidence'` when a run key
returns with a different `batch_hash`, and that hash comes from
`canonicalJson` (`procurement-intake.ts:565-576`). If the extracted function's
output shifts by even one byte, every in-flight CaleProcure retry hard-fails.
Ship a golden-vector test asserting byte-identical output for the existing batch
inputs, including the key-ordering, nested-array, `undefined`, and non-ASCII-key
cases. This test must exist before the extraction lands.

### 4.2 What the host validates, in order, before any SQL

All of it in the host. PostgreSQL sees only the results.

| # | Check | Failure mode closed |
| --- | --- | --- |
| 1 | `relpath` is a string, non-empty, ≤ 512 bytes, contains no NUL; normalize to NFC and use the normalized form everywhere | Encoding-variant paths hashing to different keys for the same file |
| 2 | Reject `path.isAbsolute(relpath)` and any drive-letter or UNC prefix | Absolute-path injection |
| 3 | Resolve the vault root **once at startup** with `fs.realpath`; cache it; fail closed if missing | Root itself being a symlink that moves |
| 4 | `target = path.resolve(root, relpath)`; require `target.startsWith(root + path.sep)` | Lexical `..` traversal |
| 5 | `real = await fs.realpath(target)`; require `real.startsWith(root + path.sep)` | Symlink escape — must be checked on the **resolved** path, not the lexical one |
| 6 | Open `real` **once** with `fs.promises.open(…, 'r')`; `fstat` the **descriptor** | Path-based re-stat racing the read |
| 7 | Require `isFile()`, `size > 0`, `size <= 64 MiB`, and `stat.dev === rootStat.dev` | Directories, devices, FIFOs, oversized reads, cross-filesystem indirection |
| 8 | Hash from that same descriptor. Never re-open by path | Time-of-check/time-of-use |
| 9 | `fstat` the descriptor again after hashing; require `ino`, `dev`, `size`, `mtimeMs` unchanged; close in `finally` | Mutation during the read |

`INFERENCE` — **residual gap, stated rather than papered over.** A hard link
created *inside* the vault pointing at a file *outside* it is invisible to
`realpath`, because a hard link has no target path to resolve. Same-device
checking narrows it but does not close it. Two honest mitigations: the vault
root is operator-owned and not a container-writable staging area for arbitrary
link creation, and `nlink > 1` on a registered artifact is recorded in the
manifest payload so it is auditable. I am not claiming this is closed.

### 4.3 What SQL revalidates — and what it must not pretend to

SQL cannot see the filesystem. It revalidates structure only, as
defense-in-depth against a host bug persisting something obviously wrong:

- `sha256 ~ '^[0-9a-f]{64}$'` (the `114:150` precedent) and `bytes > 0`.
- `vault_relpath !~ '(^/|^[A-Za-z]:|(^|/)\.\.(/|$)|\\)'` and no NUL byte.
- `kind` in the enum; the pursuit is not terminal; `registered_by` non-empty.
- For a packet: every artifact in the link table exists, belongs to the **same**
  pursuit, and is not superseded.
- **`unresolved_count` is computed inside `fn_propose_procurement_packet`, never
  accepted as a parameter.** R5 had it as a supplied column. That was wrong: a
  caller able to assert "zero unresolved items" defeats the approval
  precondition entirely. Same rule for `compliance_snapshot` — the function
  builds it from the live rows it just locked.
- SQL stores `packet_hash` and never recomputes it. The schema comment says so.

### 4.4 The hash-parameter question, answered directly

The request says: *do not claim the container supplies no hash while accepting
an unverified hash parameter through IPC.*

The SQL functions **do** take hash parameters — they must, since PostgreSQL
cannot read files. The claim "the container never supplies a hash" is therefore
true only if three things hold, and 116 must make all three executable:

1. `GRANT EXECUTE` on every 116 function to `nanoclaw_admin` only. The container
   role has no execute path (the 115 pattern, `115:870-886`).
2. The container has no direct write path to any 116 table — RLS enabled, no
   `nanoclaw_procurement` policy, `SELECT` only on the bounded view (§7).
3. **The IPC input schema is `.strict()`**, so a container that sends a `sha256`
   or `packet_hash` field gets a validation error rather than a silently ignored
   extra key. This is the existing idiom (`procurement-intake.ts:86-97`,
   `.strict()` on `caleProcureRowSchema`) and it is what converts the claim from
   a convention into a test-observable boundary:
   `procurement-ipc-handlers.test.ts` asserts that a payload carrying a hash
   field is **rejected**, not stripped.

Silently stripping the field would be the wrong fix — it makes a container that
tries to supply a hash indistinguishable from one that does not, and that
distinction is exactly what you want in the log.

---

## 5. F5 — versions, cards, receipts

### 5.1 `APPROVE #<packet_id> v<packet_version> — <reason>`

| Aspect | Value |
| --- | --- |
| Expected before | `packets.state='draft'`, `packets.packet_version = <v>`, `unresolved_count = 0` (recomputed in-function), every artifact re-measured by the host this moment and matching, `packet_hash` recomputed and equal to stored, `pursuits.pursuit_state='assessing'`, `pursuits.pursuit_version = card.pursuit_version` |
| After | `packets.state='approved'` (version **unchanged** — approval binds a version, it does not create one); `pursuits.pursuit_state='proposal_ready'`; `pursuits.pursuit_version = P+1`; `procurement_packet_approvals` row with `approved_hash` = the host's fresh measurement; `closed_at` stays NULL |
| Card consumed | the `approve` card for `('packet', packet_id, <v>)`, `state='open'`, matching epoch and thread |
| Receipt | one `procurement_reconciler_alerts` row, same transaction, `condition_key='packet_approval_receipt'`, `subject_kind='packet'`, `subject_id=packet_id`, `subject_version=<v>`, routed to the card's channel/thread |
| Events | 115: `packet_approved`, `assessing`→`proposal_ready`, at `P+1`. 116: `packet_approved` keyed on `approval_id` |

`blocked → proposal_ready` remains **not permitted** (R5 §2, unchanged and
correct): a blocked pursuit returns to `assessing` first via the existing 115
transition (`115:659`), so the blocker is explicitly cleared on the record.

### 5.2 `RECORD-SUBMISSION #<packet_id> v<n> <method> <reference> — <note>`

| Aspect | Value |
| --- | --- |
| Expected before | `packets.state='approved'` at `<n>`; an approval row exists; the host has re-measured **every** artifact in this moment and passes `p_verified_hash`; the function requires `p_verified_hash = approval.approved_hash = packets.packet_hash`; `pursuits.pursuit_state='proposal_ready'`; `pursuit_version = card.pursuit_version` |
| After | `packets.state='submitted'`; `pursuits.pursuit_state='submitted'`; `pursuit_version = P+1`; `next_action='Await outcome; record with OUTCOME'`; `next_action_due = now() + <OD-3 window>`; **`closed_at` stays NULL** — an outcome is still owed |
| Card consumed | the `record_submission` card for `('packet', packet_id, <n>)` |
| Receipt | `condition_key='submission_receipt'`, `subject_kind='submission'`, `subject_id=submission_id`, `subject_version='0'`, same transaction, routed to the card thread |
| Events | 115: `submission_recorded`, `proposal_ready`→`submitted`, at `P+1`. 116: `submission_recorded` keyed on `submission_id` |

`RECOMMENDATION`. Drop R5's
`CHECK (verified_hash = approved_hash_of(approval_id))`. PostgreSQL rejects
subqueries in `CHECK` and a non-immutable function there is unsound and breaks
dump/restore. Keep `CHECK (verified_hash ~ '^[0-9a-f]{64}$')` and enforce
equality in the function, where the approval row is already locked.

`RECOMMENDATION` — the framing that must appear in the schema comment, the
group prompt, and the receipt text itself, unchanged from R5 because it was
right: **a submission record is a named human's attestation, bound to bytes the
host verified. It is not evidence that a portal upload or email delivery
occurred.** The host can prove what was approved and that it did not change. It
cannot observe the outside world. `reference` is what the human says they
received; `amount_cents` on the outcome is operator-entered and never derived.

### 5.3 `OUTCOME #<submission_id> <won|lost|no_award|withdrawn|cancelled> — <debrief>`

| Aspect | Value |
| --- | --- |
| Expected before | submission exists; no prior outcome (`UNIQUE (submission_id)`); `debrief` non-empty after trim; `pursuits.pursuit_state='submitted'`; `pursuit_version = card.pursuit_version` |
| After | outcome row inserted; `pursuits.pursuit_version = P+1`; `closed_at = now()`; **`pursuit_state` stays `submitted`** — outcome is a property of the submission, not a workflow step (R5 §1, retained) |
| Card consumed | the `outcome` card for `('submission', submission_id, 0)` |
| Receipt | `condition_key='outcome_receipt'`, `subject_kind='outcome'`, same transaction |
| Events | 116: `outcome_recorded` keyed on `submission_id`. No 115 event — no state transition occurred |

### 5.4 Queue truth — the 115 view must be replaced

`FACT`. `115:709-729` — `v_procurement_pursuit_queue` excludes only `passed`
and `expired_undecided`. R5's claim that reaching `submitted` "empties the
queue" is false: a submitted pursuit stays visible forever, and after an outcome
is recorded it is still visible.

`RECOMMENDATION`. 116 replaces the view via `CREATE OR REPLACE VIEW` with an
identical column list, adding only:

```
AND NOT EXISTS (
  SELECT 1 FROM public.procurement_submissions s
    JOIN public.procurement_outcomes o ON o.submission_id = s.id
   WHERE s.packet_id IN (SELECT id FROM public.procurement_packets
                          WHERE pursuit_id = p.id))
```

`rollback_116` restores the **verbatim 115 view text inline**, never by
re-reading 115 — the same rule R5 set for the reconciler function and the same
trap R4 caught on function overloads.

### 5.5 What a Slack delivery failure may and may not say

This is the R4 boundary, restated for all three commands and unchanged in
mechanism.

**May say:** nothing at all. On delivery failure the host logs
`'procurement action recorded; durable Slack receipt remains pending'`
(`procurement-review.ts:462-472`) and the receipt stays undelivered in
`procurement_reconciler_alerts`. The reconciler's pending drain
(`115:819-824`, `delivered_at IS NULL`, ordered, limit 50) delivers it on the
next pass and acknowledges via `fn_ack_procurement_reconciler_alert`
(`115:828-840`). The operator sees the receipt late, never wrongly.

**May never say:** `[PROCUREMENT ACTION NOT RECORDED]`. That string is reserved
for pre-commit failures. `FACT` — all four current call sites are pre-commit
(`procurement-review.ts:337, 345, 349, 411`), the transition `try/catch` closes
with `return true` at `:414` before the receipt block begins at `:427`, and the
receipt block's own catch only logs (`:462-472`). 116 adds three commands to
this shape and must not add a fourth failure path.

`RECOMMENDATION`. Assert it structurally, not by inspection: a test that the
receipt-block catch contains no `postFailure`/`postThread` call, plus smoke
assertion S-19 (a forced Slack failure after a successful `APPROVE` leaves the
alert row `delivered_at IS NULL` with the committed state intact and no
`NOT RECORDED` text emitted). This is the extra canary case the R5 handoff
already flagged, now bound to the three new commands.

---

## 6. Reconciler — corrected conditions

116 replaces `fn_reconcile_procurement` via `CREATE OR REPLACE` with an
unchanged signature (`timestamptz`), and `rollback_116` restores the verbatim
115 body inline.

### 6.1 The expiry sweep — mandatory correction

`FACT`. `115:753-772` expires every pursuit past its close date except `passed`
and `expired_undecided`, and writes
`terminal_reason = 'public close date passed without a terminal decision'`.

```
-- 115, current
AND p.pursuit_state NOT IN ('passed', 'expired_undecided')

-- 116, required
AND p.pursuit_state NOT IN ('passed', 'expired_undecided', 'submitted')
```

`submitted` is **never** expired. A recorded human attestation is not
overwritten by a clock.

`proposal_ready` past the close date *is* expired — the window closed and
nothing was submitted — but with an accurate reason, and the approved packet
must not be left looking live:

| Branch | `terminal_reason` | Side effect |
| --- | --- | --- |
| `qualifying`/`assessing`/`blocked` | `'public close date passed without a terminal decision'` (unchanged) | none |
| `proposal_ready` | `'approved packet was not submitted before the public close date'` | packet → `invalidated`, reason `close_date_passed_unsubmitted`; open cards superseded; loud alert |
| `submitted` | — | never expired |

The expiry CTE therefore computes the reason per branch, and the 115 event
insert (`115:766-772`) carries it through. `event_type='reconciler_expired'` is
unchanged and its unique key still holds — one expiry per pursuit version.

### 6.2 Conditions

Established dedup: `(condition_key, subject_kind, subject_id, subject_version)`
(`115:130`), with an America/Chicago **date bucket** appended to
`subject_version` for standing conditions and a pure version key for one-time
state changes — the R3 F-2 rule, whose whole point is that a version-keyed
time-driven alert goes permanently silent on a pursuit nobody touches.

| # | Condition | `condition_key` | Subject | Bucket |
| --- | --- | --- | --- | --- |
| 1 | Packet incomplete (`unresolved_count > 0`) and close date within 14 days | `packet_incomplete` | packet + version | daily |
| 2 | Artifact drift on an **approved** packet | `packet_drift` | packet + version | daily · **also invalidates and blocks** (§3.2) |
| 3 | Approved but unsubmitted, close date within 7 days or passed | `packet_unsubmitted` | packet + version | daily |
| 4 | Submitted with no outcome after the OD-3 window | `outcome_overdue` | submission | daily |
| 5 | Evidence staleness — oldest `evidence_at` on a `met` item older than the configured max, **or older than the newest amendment artifact for that pursuit** | `evidence_stale` | pursuit + version | daily |
| 6 | Artifact drift on a **submitted** packet | `submitted_artifact_drift` | packet + version | daily · **no state change** (§3.4) |
| 7 | `open` action card past `expires_at` | `action_card_expired` | card | one-time · sweeps the card to `expired` |

R5's condition 6 (outcome without debrief) is **dropped**: `debrief` is
`NOT NULL` with a non-empty CHECK, and a condition that can only fire if a
constraint is broken is noise in the alert vocabulary, not defense.

`RECOMMENDATION`. Conditions 2 and 6 need host file reads. Implement as a host
pass in `runProcurementReconciler` that re-measures approved and submitted
packets and calls `fn_invalidate_procurement_packet` (condition 2) or a
detection-only alert function (condition 6). `CARRIED` — the outbox delivery and
ack semantics in `src/procurement-reconciler.ts` are unchanged; that file was
not in R6's authorized read set and I have not re-verified it this round.

---

## 7. RLS, grants, and the bounded view

`RECOMMENDATION`. Mirror `115:175-222` (policies) and `115:842-886`
(revoke/grant) exactly: RLS enabled on all nine tables; admin full-access and
readonly-select policies; **no `nanoclaw_procurement` policy on any base
table**; `REVOKE ALL … FROM PUBLIC` on tables and functions; `GRANT SELECT` on
base tables to `nanoclaw_readonly, nanoclaw_admin`; `GRANT EXECUTE` on every 116
function to `nanoclaw_admin` only.

```
v_procurement_packet_queue
  pursuit_id · pursuit_state · pursuit_version · packet_id · packet_version
  packet_state · unresolved_count · artifact_count · oldest_evidence_at
  close_date · days_until_close
  WHERE pursuit_state IN ('assessing','blocked','proposal_ready')
```

`GRANT SELECT` to `nanoclaw_procurement, nanoclaw_readonly, nanoclaw_admin`.
No deadline filter — the R1 C-10 rule holds: the reconciler transitions, the
view never hides. The view exposes **no** `vault_relpath`, `reference`,
`amount_cents`, `evidence_text`, `packet_hash`, or `debrief`.

`RECOMMENDATION` — implementation trap worth stating outright. `114:59-62`
records that the container's read path works *because* views are
owner-evaluated. 116's view must **not** be created
`WITH (security_invoker = true)`; doing so would make it obey the base-table
RLS, which grants `nanoclaw_procurement` nothing, and the container would read
zero rows with no error. Smoke assertion S-21 pins it.

---

## 8. Reconciled counts, migration, rollback, smoke, tests, canary

### 8.1 Counts (R5 figures corrected)

| Item | R5 | R6 | Delta |
| --- | --- | --- | --- |
| New tables | 6 | **9** | + `procurement_action_cards` (F1), `procurement_packet_events` (F2), `procurement_packet_artifacts` (array FK is unenforceable) |
| New views | 1 | **1** | unchanged (`v_procurement_packet_queue`) |
| Replaced 115 objects | 1 | **2** | + `v_procurement_pursuit_queue` (§5.4) |
| New functions | "~8" | **9** | record/disarm action card, register artifact, upsert compliance, propose packet, apply approval, apply submission, apply outcome, invalidate packet |
| Smoke assertions | 14 | **24** | §8.4 |
| Test files | 4 | **5** | + `procurement-action-card.test.ts` |
| Test cases | — | **not predicted** | See §8.5 |

The nine tables: `procurement_artifacts`, `procurement_compliance_items`,
`procurement_packets`, `procurement_packet_artifacts`,
`procurement_packet_approvals`, `procurement_submissions`,
`procurement_outcomes`, `procurement_action_cards`,
`procurement_packet_events`.

### 8.2 `procurement_packet_artifacts` — replacing the array

```
procurement_packet_artifacts
  packet_id   bigint NOT NULL REFERENCES public.procurement_packets(id)
  artifact_id bigint NOT NULL REFERENCES public.procurement_artifacts(id)
  position    integer NOT NULL CHECK (position >= 0)
  PRIMARY KEY (packet_id, artifact_id)
  UNIQUE (packet_id, position)
```

Real foreign keys, and `position` supplies the deterministic order that
`packet_hash` requires. R5's `artifact_ids bigint[]` could express neither.

### 8.3 Forward and rollback

**Forward** — `116_procurement_packet.sql`: 9 tables, 1 new view, 9 functions,
indexes, RLS, grants; `CREATE OR REPLACE` on `fn_reconcile_procurement` and
`v_procurement_pursuit_queue`. **No `ALTER` on any 114 or 115 object**,
including `procurement_pursuit_events`, `procurement_review_cards`, and the
`pursuit_state` CHECK.

**Rollback** — `rollback_116_procurement_packet.sql`, non-numeric prefix so the
`[0-9][0-9]*_*.sql` glob in `run_migration.sh` cannot discover it
(`CARRIED` from R5; the rollback_115 convention). It must: drop the nine tables
and the new view; restore the **verbatim 115** `fn_reconcile_procurement` body
and `v_procurement_pursuit_queue` text inline, never by re-reading 115; drop the
nine 116 functions by exact signature **including any overload produced by a
signature change** (the R4 trap — `CREATE OR REPLACE` with a changed signature
creates an overload, not a replacement); and leave every `pursuit_state` value
untouched.

`RECOMMENDATION` — header warning, carried from R5 and still correct: rolling
back 116 while a pursuit sits in `proposal_ready` or `submitted` strands it in a
state 115 alone cannot advance. The operator must `ADVANCE … passed` or accept
the stranded row. Runbook, not code.

### 8.4 Transactional smoke matrix — 24 assertions

Rolled back like its predecessors.

| # | Assertion |
| --- | --- |
| S-1 | `APPROVE` with a mismatched packet hash → raises; no state change |
| S-2 | `APPROVE` with `unresolved_count > 0` (derived in-function) → raises |
| S-3 | `APPROVE` twice → second raises on the consumed card, before `UNIQUE (packet_id)` |
| S-4 | `APPROVE` with `card_message_ts ≠ thread_ts` succeeds when `thread_ts` matches the reply — the card model does not assume the two are equal |
| S-5 | `APPROVE` from the wrong thread → raises; no mutation |
| S-6 | `APPROVE` against a card whose `action_kind` is `outcome` → raises |
| S-7 | `APPROVE` with a stale epoch, and with `expires_at` in the past → each raises |
| S-8 | `APPROVE` after an intervening `ADVANCE` (pursuit version moved) → raises |
| S-9 | `RECORD-SUBMISSION` without an approval → raises |
| S-10 | `RECORD-SUBMISSION` after a simulated artifact hash change → raises |
| S-11 | `RECORD-SUBMISSION` twice → second raises |
| S-12 | `OUTCOME` without a submission → raises; twice → raises; empty debrief → raises |
| S-13 | Re-assembly produces `packet_version = max+1`; the prior packet becomes `superseded`, **not** `invalidated` |
| S-14 | Drift on an approved packet: one transaction yields packet `invalidated`, pursuit `blocked`, `pursuit_version + 1`, one 115 event, one 116 event, exactly one routed alert |
| S-15 | Drift on a **submitted** packet: alert and 116 event only; packet state, pursuit state, and pursuit version all unchanged |
| S-16 | Two `artifact_registered` events at the same `pursuit_version` both persist |
| S-17 | The 115 `UNIQUE (pursuit_id, pursuit_version, event_type)` still rejects a duplicate state transition |
| S-18 | Approve / submit / outcome each write exactly one routed receipt into the outbox in the same transaction |
| S-19 | A forced Slack failure after a committed `APPROVE` leaves the alert `delivered_at IS NULL`, state intact, and emits no `NOT RECORDED` text; the next reconciler pass delivers and acks it |
| S-20 | Compliance `met` without evidence → raises; `stated_fact` without an actor → raises |
| S-21 | Container role: all nine base tables denied; `v_procurement_packet_queue` readable (proves the view is owner-evaluated) |
| S-22 | Reconciler: a `submitted` pursuit past its close date is **not** expired |
| S-23 | Reconciler: a `proposal_ready` pursuit past its close date is expired with the accurate reason and its packet is invalidated |
| S-24 | 114/115 policies, grants, the `pursuit_state` CHECK, and `procurement_pursuit_events`' unique key are byte-unchanged |

S-22 and S-23 are the assertions that would have caught the §0 defect. They are
the reason this matrix grew.

### 8.5 TypeScript test matrix — 5 files, each failing before implementation

- `canonical-json.test.ts` — golden vectors proving the extracted
  `canonicalJson` is byte-identical to the current private implementation for
  every existing batch-hash input shape (§4.1).
- `procurement-packet.test.ts` — path validation rejects traversal, absolute,
  drive-letter, symlink-escape, non-regular-file, cross-device, and NUL cases;
  the second `fstat` catches mutation during the read; `packet_hash` is
  order-stable and changes on any artifact or compliance change.
- `procurement-action-card.test.ts` — replay, stale epoch, expired card, wrong
  thread, wrong channel, wrong action kind, and moved pursuit version each fail
  **without mutation**; `card_message_ts ≠ thread_ts` binds correctly.
- `procurement-approval.test.ts` — the three commands parse exactly; the new
  prefix guard requires `#\d` and does not fire on ordinary prose beginning with
  "Outcome" or "Approve"; malformed variants yield
  `[PROCUREMENT ACTION NOT RECORDED]`; **no post-commit branch can emit
  `NOT RECORDED`** for any of the three.
- `procurement-ipc-handlers.test.ts` — a payload carrying `sha256` or
  `packet_hash` is **rejected**, not stripped (§4.4); the container cannot set
  `stated_fact`, `waived`, or any packet state; every new IPC is
  group-restricted and gated.

`RECOMMENDATION`. **Do not state a case count until the tests exist.** R4's
request carried "8 files / 64 tests" and 64 only reproduced across nine files;
the eight procurement-named files totalled 62. A figure that cannot be
reproduced should not enter the changelog, and predicting one now guarantees
exactly that.

### 8.6 Canary — unchanged from R5

One real public opportunity → register artifacts → complete the compliance
matrix → propose a packet → human `APPROVE` → **stop**. Do not record a
submission on the first canary. `proposal_ready` with a host-verified hash and
zero unresolved items is the meaningful proof; recording a real submission adds
external commitment for no additional engineering evidence. Add S-19's live
analogue: force a Slack failure on a *successful* action and confirm the receipt
stays pending and is delivered on the next reconciler pass.

---

## 9. Owner decisions — unchanged, still three

All fail-closed configuration in the launchd surface, matching
`PROCUREMENT_OPERATOR_UIDS`. None blocks implementation; 116 can be built and
dark-deployed before any is answered.

| ID | Decision | Why it is genuinely the owner's |
| --- | --- | --- |
| **OD-1** | Who may `APPROVE` and `RECORD-SUBMISSION` — the same two operators, or a narrower commitment authority? | Approving a packet is a commercial commitment, not a workflow step. `PROCUREMENT_APPROVER_UIDS`, defaulting empty (fail-closed), never inheriting the reviewer list. This is what the card's `authority` column records |
| **OD-2** | Must the approver differ from the packet assembler? | Separation of duties. Enforceable as `approver_uid <> assembled_by` behind a flag; with two operators it is a real rigour/throughput trade |
| **OD-3** | Outcome follow-up window (30/60/90 days) and maximum evidence age before condition 5 fires | Depends on award cadence in this market, which the repository cannot know |

`INFERENCE`. "Which company facts are authoritative" (the R1 D-4
carry-forward) still does not rise to a blocker. The compliance matrix requires
*a* citation — a hashed artifact or a named human's stated fact — and staleness
is condition 5. The schema forces the citation to exist; the owner decides later
what may be cited without a human.

---

## 10. Standing items not touched by this round

- **Shared-CDP retirement.** A disposable container outside Procurement reached
  the unauthenticated gateway. This affects every container, not just
  Procurement. Flagged in five consecutive rounds; it must not drift behind the
  canary.
- **348 unrouted email classifications**, held and alerted daily; backfill
  deliberately deferred until after the public canary.
- **Both Procurement gates remain disabled** pending a safe daemon restart.
- **`planned_units` is keyword-shaped** (`CARRIED`, R5 §8) and must be
  generalized per adapter before SAM.gov, along with migrating the `sam` source
  value into the closed enum (`FACT`, `114:309`, `114:127`, `114:147`).

The R5 source ranking and activation gates (§8 of R5) are unchanged and I would
not reorder them. F1–F5 raised no source-selection question.

---

## 11. Attestation, commands, elapsed time, cost

### Changed files

Exactly one file created, inside the review root:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-PROPOSAL-SOURCE-CLAUDE-RESPONSE-R6.md
```

`FACT`. `git -C /private/tmp/nanoclaw-nc-20260809-003 status --porcelain` before
this write showed `M scripts/register-procurement.ts` (Codex's pre-existing
spawn/timeout change, untouched by me) plus four untracked report files. No
source, schema, migration, rollback, smoke, configuration, prompt, test,
continuity file, or other report was edited. No vault file was opened. The
operational checkout at `/Users/xbohdpukc/dev/NanoClaw` was read only for the
saved handoff that resumed this session; nothing there was modified.

### Inspected this round

Full reads, all four authorized sources plus the round's own inputs:

- `NC-20260809-003-PROCUREMENT-PROPOSAL-SOURCE-CODEX-REQUEST-R6.md`
- `NC-20260809-003-PROCUREMENT-PROPOSAL-SOURCE-CODEX-REQUEST-R5.md`
- `NC-20260809-003-PROCUREMENT-PROPOSAL-SOURCE-CLAUDE-RESPONSE-R5.md`
- `data/business/migrations/nanoclaw-v2/114_procurement_control_plane.sql` (791 lines)
- `data/business/migrations/nanoclaw-v2/115_procurement_pursuit.sql` (888 lines)
- `src/procurement-review.ts` (493 lines)
- `src/procurement-intake.ts` (714 lines)

Everything cited from `src/procurement-ipc-handlers.ts`,
`src/procurement-reconciler.ts`, `src/procurement-source-config.ts`,
`scripts/register-procurement.ts`, `rollback_115_procurement_pursuit.sql`, and
`run_migration.sh` is labelled `CARRIED` — cited in R1–R5, **not** re-verified in
R6 scope, because those files are outside this round's authorization.

### Commands

`ls`, `wc -l`, `git status --porcelain`, `git log --oneline`, `date`. Read-only.
No tests or typecheck were run — no code changed, so there was nothing new to
execute. No database, network, browser, container, production, or deployment
access.

### Elapsed time and cost

Approximately 27 minutes wall-clock, 2026-08-09T21:55Z–22:22Z, file reads and
one file write. The session's observable budget counter read **$2.08 of $15**
immediately before this write, cumulative across the session rather than
per-round. Exact per-round token accounting is not observable from inside the
session and is not estimated.
