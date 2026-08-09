# NC-20260809-003 — Migration-116 proposal/outcome slice and source-next review, Claude R5

- Round: R5, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-PROPOSAL-SOURCE-CODEX-REQUEST-R5.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-09T21:45Z–22:03Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; deployed runtime
  `9aa23b4e7c39`
- Change class: C0 design review. No production, database, browser, or network
  access; no secrets, opportunity, customer, pricing, proposal, or receipt
  content read; no vault file opened; nothing implemented, committed, or
  deployed.

Labels: `FACT` = verified in this worktree with a citation · `INFERENCE` ·
`RECOMMENDATION` · `OWNER DECISION`.

---

# Verdict: READY TO IMPLEMENT

The design below is decision-complete. It needs no new architectural pattern —
every control reuses one already proven in 114/115: host-only typed writes,
card/epoch/version binding, in-transaction receipts into the acknowledged
outbox, append-only events, optimistic concurrency, and RLS with a bounded view.

Three owner choices (§9) gate **enablement**, not implementation. Each becomes
typed configuration in the same style as `PROCUREMENT_OPERATOR_UIDS`, so 116 can
be built and dark-deployed before they are answered. I am deliberately not
elevating them to blockers.

**The one genuinely new problem this slice introduces**, and the axis I designed
around: `FACT` — the proposal vault is mounted **read-write** into the container
(`scripts/register-procurement.ts:36-40`, `hostPath: '~/Vaults/My Notes/Tandem/Procurement'`,
`readonly: false`). The artifacts a human approves therefore live in a store the
agent can rewrite at any moment, outside Git and outside PostgreSQL. Every
integrity control in §3 follows from a single decision: **the host hashes vault
bytes; the container never supplies a hash, and approval binds to bytes the host
measured itself.**

---

## 1. What 116 must add, and what it must not

`FACT`. 115 already declares `proposal_ready` and `submitted` in the
`pursuit_state` CHECK (`115_procurement_pursuit.sql:86-90`) while
`fn_apply_procurement_pursuit_advance` rejects them
(`115:628`). That was the R1 anti-dead-end guard and it pays off now: **116 adds
no pursuit state and does not touch the 115 constraint.**

`RECOMMENDATION`. Keep it that way. Outcome is *not* a pursuit state. A pursuit
that reaches `submitted` is complete from the workflow's perspective; the award
decision arrives weeks later and is a property of the submission, not a step an
operator drives. Modelling outcome as a child record rather than a state:

- leaves the 115 CHECK untouched, so `rollback_116` never has to reason about
  `rollback_115`'s constraint text — the two rollback boundaries stay
  independent;
- keeps `submitted` genuinely terminal, so the pursuit queue empties;
- matches the owner boundary, where outcome is *recorded*, never driven.

Terminal map after 116: `passed` (no-bid, from 115) · `expired_undecided`
(reconciler, from 115) · `submitted` (new terminal, receipt-bound) — with
`procurement_outcomes` carrying `won | lost | no_award | withdrawn | cancelled`.

---

## 2. State machine

```
                                115 (deployed)                    116 (new)
qualifying ──► assessing ◄──► blocked ──► passed            assessing ──► proposal_ready ──► submitted
     │              │                                            ▲               │
     └──────────────┴──────────────► passed                      │               ▼
                                                          (approval act)  procurement_outcomes
                                                                            won|lost|no_award|
                                                                            withdrawn|cancelled
                                                                                  │
                                                                                  ▼
                                                                             debrief (required)
```

`RECOMMENDATION` — exact preconditions, all enforced in PostgreSQL, not the host:

| Transition | Command | Preconditions (every one required) |
| --- | --- | --- |
| `assessing` → `proposal_ready` | `APPROVE #<packet_id> v<packet_version> — <reason>` | packet exists for this pursuit; `packet_hash` recomputed by the host at approval time equals the stored hash; zero compliance items in `open`/`blocked`; every artifact's re-measured `sha256` matches its manifest row; card/thread/epoch bound; named approver; pursuit at expected version |
| `blocked` → `proposal_ready` | — | **Not permitted.** A blocked pursuit must return to `assessing` first (115 already allows `blocked → assessing`), so the blocker is explicitly cleared on the record |
| `proposal_ready` → `submitted` | `RECORD-SUBMISSION #<packet_id> v<n> <method> <reference> — <note>` | an approval row exists and is unsuperseded; host re-verifies every artifact hash **again** at this moment; `method` in a closed enum; non-empty `reference`; named operator; bound thread/epoch |
| `submitted` → outcome | `OUTCOME #<submission_id> <won\|lost\|no_award\|withdrawn\|cancelled> — <debrief>` | submission exists; no prior outcome; debrief non-empty; named operator |
| any → `passed` | `ADVANCE … passed` (115) | unchanged |

`INFERENCE`. The double hash verification — at approval and again at submission
recording — is what makes "retroactive mutation of approved bytes" detectable
rather than merely discouraged. Between the two checks the agent may legitimately
still hold the vault mount; the second check is what proves nobody edited the
approved packet in that window.

---

## 3. Schema (migration 116, additive)

### 3.1 Artifact manifest

```
procurement_artifacts
  id                bigserial PK
  pursuit_id        bigint NOT NULL → procurement_pursuits(id)
  kind              text NOT NULL CHECK (kind IN ('solicitation','amendment',
                      'attachment','brief','analysis','proposal_doc','form','other'))
  vault_relpath     text NOT NULL            -- relative to the mount root, never absolute
  sha256            text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$')
  bytes             bigint NOT NULL CHECK (bytes > 0)
  source_url        text
  issuer_reference  text                     -- amendment no., portal doc id
  acquired_at       timestamptz NOT NULL
  registered_by     text NOT NULL            -- 'host:ipc' or an operator UID
  superseded_by     bigint → procurement_artifacts(id)
  created_at        timestamptz NOT NULL DEFAULT now()
  UNIQUE (pursuit_id, vault_relpath, sha256)
```

`RECOMMENDATION`. Rows are **immutable except `superseded_by`**. A changed file
is a *new row*, never an update — that is what makes the manifest an evidence
ledger rather than a mutable file index. `vault_relpath` must be validated
host-side against traversal (`..`, absolute paths, symlinks) before any read;
the container supplies a path, never a hash, never a byte.

### 3.2 Compliance matrix

```
procurement_compliance_items
  id                bigserial PK
  pursuit_id        bigint NOT NULL → procurement_pursuits(id)
  requirement_key   text NOT NULL            -- stable, issuer-derived
  requirement_text  text NOT NULL
  status            text NOT NULL CHECK (status IN ('open','met','not_met','waived','blocked'))
  evidence_kind     text CHECK (evidence_kind IN ('artifact','stated_fact','not_applicable'))
  evidence_artifact bigint → procurement_artifacts(id)
  evidence_text     text
  evidence_actor    text                     -- operator UID for stated_fact
  evidence_at       timestamptz
  item_version      integer NOT NULL DEFAULT 0
  updated_at        timestamptz NOT NULL DEFAULT now()
  UNIQUE (pursuit_id, requirement_key)
  CHECK (status <> 'met' OR evidence_kind IS NOT NULL)
  CHECK (evidence_kind <> 'artifact' OR evidence_artifact IS NOT NULL)
  CHECK (evidence_kind <> 'stated_fact' OR (evidence_text IS NOT NULL AND evidence_actor IS NOT NULL))
```

`INFERENCE` — this is the control against **invented company claims**. A
requirement cannot be `met` without either a hashed artifact or a named human's
stated fact. A model can propose the requirement and the draft text; it cannot
mark anything `met` on its own narrative, because `stated_fact` demands an actor
UID the container cannot supply (§5). Staleness is a reconciler condition
(§6.5), not a hard block — which is what lets 116 ship before the company-fact
authority question is settled (§9, OD-3).

### 3.3 Packet identity

```
procurement_packets
  id              bigserial PK
  pursuit_id      bigint NOT NULL → procurement_pursuits(id)
  packet_version  integer NOT NULL CHECK (packet_version >= 0)
  packet_hash     text NOT NULL CHECK (packet_hash ~ '^[0-9a-f]{64}$')
  artifact_ids    bigint[] NOT NULL CHECK (cardinality(artifact_ids) > 0)
  compliance_snapshot jsonb NOT NULL          -- key → {status, evidence_kind, artifact sha256}
  unresolved_count integer NOT NULL CHECK (unresolved_count >= 0)
  assembled_by    text NOT NULL
  state           text NOT NULL DEFAULT 'draft'
                  CHECK (state IN ('draft','approved','superseded','submitted'))
  created_at      timestamptz NOT NULL DEFAULT now()
  UNIQUE (pursuit_id, packet_version)
  UNIQUE (pursuit_id, packet_hash)
```

`RECOMMENDATION`. `packet_hash = sha256(canonical_json({pursuit_id,
packet_version, ordered [artifact_id, sha256], compliance_snapshot}))`, computed
**host-side** with the existing `canonicalJson` helper already used for batch
identity in `src/procurement-intake.ts`. Reusing that function keeps one
canonicalization in the codebase.

`INFERENCE` — this is the anti-**partial-packet-replacement** control. Because
the hash covers the ordered artifact hashes *and* the compliance snapshot,
swapping one attachment or flipping one requirement after assembly produces a
different `packet_hash`, which the approval check rejects. Replacement requires a
new `packet_version` and a fresh approval.

### 3.4 Approval, submission receipt, outcome

```
procurement_packet_approvals
  id            bigserial PK
  packet_id     bigint NOT NULL UNIQUE → procurement_packets(id)
  approver_uid  text NOT NULL
  approved_hash text NOT NULL            -- host-measured at approval, must equal packets.packet_hash
  reason        text NOT NULL
  action_epoch  text NOT NULL
  channel_jid   text NOT NULL
  thread_ts     text NOT NULL
  approved_at   timestamptz NOT NULL DEFAULT now()

procurement_submissions
  id             bigserial PK
  packet_id      bigint NOT NULL UNIQUE → procurement_packets(id)
  approval_id    bigint NOT NULL → procurement_packet_approvals(id)
  method         text NOT NULL CHECK (method IN ('portal_upload','email','mail','in_person','other'))
  reference      text NOT NULL             -- confirmation/reference the human received
  verified_hash  text NOT NULL             -- host re-measured at recording time
  submitted_at   timestamptz NOT NULL
  recorded_by    text NOT NULL
  note           text
  created_at     timestamptz NOT NULL DEFAULT now()
  CHECK (verified_hash = approved_hash_of(approval_id))   -- enforced in the function

procurement_outcomes
  id            bigserial PK
  submission_id bigint NOT NULL UNIQUE → procurement_submissions(id)
  outcome       text NOT NULL CHECK (outcome IN ('won','lost','no_award','withdrawn','cancelled'))
  debrief       text NOT NULL             -- required; this is the learning loop
  amount_cents  bigint
  recorded_by   text NOT NULL
  decided_at    timestamptz
  created_at    timestamptz NOT NULL DEFAULT now()
```

`RECOMMENDATION` — one framing that must appear in both the schema comment and
the group prompt: **a submission receipt is a human attestation with a
host-verified packet hash. It is not proof that a submission occurred.** The
host can prove *what bytes were approved and unchanged*; it cannot observe a
portal upload. Overstating this would repeat the coverage-receipt mistake the
R2/R3 rounds corrected, and `unverified pricing` sits in the same category —
`amount_cents` is an operator-entered figure, never derived from award data
(§8, source #8).

### 3.5 Events, idempotency, concurrency

`RECOMMENDATION`. Do **not** create a second event table. Extend the existing
`procurement_pursuit_events` with new `event_type` values —
`packet_assembled`, `packet_approved`, `submission_recorded`,
`outcome_recorded`, `artifact_registered`, `compliance_updated`. `FACT`: the 115
table is already generic (`event_type`, `payload jsonb`, `actor_uid`,
`action_epoch`, `reason`) and its `UNIQUE (pursuit_id, pursuit_version,
event_type)` gives replay idempotency for free. That was the explicit reason R1
required a generic ledger; 116 is the payoff.

| Concern | Mechanism |
| --- | --- |
| Idempotency | The six `UNIQUE` keys above; every 116 function is `ON CONFLICT DO NOTHING` or raises on conflict — never silently updates |
| Optimistic concurrency | Every human command carries `v<n>`; `APPROVE` takes `packet_version`, `RECORD-SUBMISSION` takes the same, `OUTCOME` takes `submission_id` (naturally single-use via `UNIQUE`) |
| Append-only | No `UPDATE`/`DELETE` grant on any 116 table to any role; the only mutable columns are `procurement_packets.state` and `procurement_artifacts.superseded_by`, both host-function-only |
| Replay | A second `APPROVE` for the same packet hits `UNIQUE (packet_id)` and raises; a second `RECORD-SUBMISSION` hits `UNIQUE (packet_id)`; a second `OUTCOME` hits `UNIQUE (submission_id)` |
| Stale card/epoch | Identical to 115: the command must arrive in the bound thread with the current epoch, verified against the originating card before any write |

### 3.6 RLS, grants, and the bounded view

`RECOMMENDATION`. Copy the 115 pattern exactly
(`115:842-862`): RLS enabled on all six tables with **no**
`nanoclaw_procurement` policy; `REVOKE ALL … FROM PUBLIC` on tables and
functions; `GRANT SELECT` on base tables to `nanoclaw_readonly, nanoclaw_admin`
only; `GRANT EXECUTE` on every 116 function to `nanoclaw_admin` only.

One new view, the container's sole read path:

```
v_procurement_packet_queue  -- pursuit_id, pursuit_state, packet_id, packet_version,
                            -- packet_state, unresolved_count, artifact_count,
                            -- oldest_evidence_at, close_date, days_until_close
   WHERE pursuit_state IN ('assessing','blocked','proposal_ready')
```

`RECOMMENDATION`. No deadline filter — the R1 C-10 rule holds: the reconciler
transitions, the view never hides. Expose **no** `vault_relpath`, no
`reference`, no `amount_cents`, and no `evidence_text` through this view.
Counts and states are sufficient for the agent to know what to work on, and
withholding the rest keeps solicitation and pricing content out of the container
except through the file it was already given.

---

## 4. Why the host must hash, restated as a threat model

| Threat | Control |
| --- | --- |
| Agent edits an approved proposal file before submission | Host re-measures every artifact at `RECORD-SUBMISSION`; mismatch raises and the state does not advance |
| Agent registers a hash that does not match the bytes | Container never supplies a hash; the host computes it from the file it reads |
| Agent swaps one attachment after assembly | `packet_hash` covers ordered artifact hashes; approval compares against a freshly measured hash |
| Agent marks a requirement `met` with no evidence | CHECK constraints require an artifact or a named human's stated fact |
| Agent claims a submission happened | `RECORD-SUBMISSION` requires a named human in the bound thread; the container has no IPC that can reach `submitted` |
| Agent narrates an outcome | `OUTCOME` is human-only and `UNIQUE (submission_id)`; no IPC writes it |
| Path traversal out of the vault mount | Host validates `vault_relpath` against traversal and symlinks before reading; store the relative path only |
| Approved bytes deleted before submission | Re-measurement fails to find the file → raise; the reconciler surfaces it as a blocked packet |

`INFERENCE`. Nothing here needs a new capability. The host already has the vault
on a host path, and hashing is a local read.

---

## 5. Host IPC surface

Total grows from six operations to ten. Every one is directory-authorized to
`procurement` exactly as `dispatchProcurementIpc` already does
(`src/procurement-ipc-handlers.ts:143-145`).

| Operation | Direction | Gate | Notes |
| --- | --- | --- | --- |
| `procurement_packet_queue` | read | none beyond group identity | Bounded 1–50, from the view only |
| `procurement_artifact_register` | write | `PROCUREMENT_REVIEW_ENABLED` | Container gives `{pursuit_id, kind, vault_relpath, source_url?, issuer_reference?}`; **host** hashes and sizes the file |
| `procurement_compliance_upsert` | write | same | Container may set `open`/`not_met`/`blocked` and may propose `met` **only** with `evidence_kind='artifact'`; `stated_fact` and `waived` are rejected from the container |
| `procurement_packet_propose` | write | same | Host assembles from current rows, computes `packet_hash`, creates `packet_version = max+1` in `draft`, and posts the approval card |
| `procurement_pursuit_queue`, `procurement_queue`, `procurement_caleprocure_ingest`, `procurement_review_card` | existing | unchanged | — |

**Human-only commands**, each an exact bound-thread command from an allowlisted
UID, each writing its receipt into the outbox in the same transaction (the R4
pattern):

- `APPROVE #<packet_id> v<packet_version> — <reason>`
- `RECORD-SUBMISSION #<packet_id> v<n> <method> <reference> — <note>`
- `OUTCOME #<submission_id> <outcome> — <debrief>`

`RECOMMENDATION`. Keep `APPROVE` lexically distinct from `ADVANCE`. They carry
different authority — `ADVANCE` moves a workflow step, `APPROVE` blesses
specific bytes — and an operator should never be able to reach the second by
mistyping the first. `FACT`: the existing parser design returns `null` on a
malformed match and the prefix guard emits `[PROCUREMENT ACTION NOT RECORDED]`
(`src/procurement-review.ts:320-340`), so extending the prefix set to
`(DECIDE|ADVANCE|APPROVE|RECORD-SUBMISSION|OUTCOME)` gives all three new
commands correct malformed-input receipts with no new mechanism.

---

## 6. Reconciler conditions

`RECOMMENDATION`. Six new conditions in `fn_reconcile_procurement`, all using the
established `(condition_key, subject_kind, subject_id, subject_version)` dedup
with the America/Chicago **date bucket** for standing conditions and a pure
version key for one-time state changes — the R3 F-2 rule.

| # | Condition | Key | Bucket |
| --- | --- | --- | --- |
| 1 | Packet incomplete (`unresolved_count > 0`) and `close_date` within 14 days | packet + version | daily |
| 2 | **Artifact hash drift** — a re-measured artifact differs from its manifest row on an approved packet | packet + version | daily (this one should also flip the packet to `superseded` and alert loudly) |
| 3 | Approved but unsubmitted, `close_date` within 7 days or passed | packet + version | daily |
| 4 | Submitted with no outcome after the configured window | submission | daily |
| 5 | Evidence staleness — oldest `evidence_at` on a `met` item older than the configured max, or older than the newest amendment artifact for that pursuit | pursuit + version | daily |
| 6 | Outcome recorded without a debrief | outcome | one-time |

`INFERENCE`. Condition 6 is defensive only — `debrief` is `NOT NULL` — but it
costs nothing and catches a future function that forgets it. Condition 2 is the
one that earns its keep: it is the periodic proof that the double-hash check has
not been quietly bypassed by an out-of-band edit.

`RECOMMENDATION`. Condition 2 needs a host step (file reads) that PostgreSQL
cannot do. Implement it as a host pass in `runProcurementReconciler` that
re-measures approved packets and calls a `fn_flag_procurement_packet_drift`
function; keep the alert claim and delivery in the existing outbox so the R4
semantics apply unchanged.

---

## 7. Migration, rollback, smoke, tests, canary

**Forward.** `116_procurement_packet.sql` — six tables, one view, extended event
types (no DDL needed; they are text values), ~8 functions, grants, indexes.
Additive only; **no change to any 114 or 115 object**, including the
`pursuit_state` CHECK (§1). The only 115 function that must be replaced is
`fn_reconcile_procurement`, via `CREATE OR REPLACE` with an unchanged signature.

**Rollback boundary.** `rollback_116_procurement_packet.sql`, non-numeric prefix
so `run_migration.sh:14`'s `[0-9][0-9]*_*.sql` glob cannot discover it — the
convention `rollback_115` already established. It must:
drop the six tables and the view; restore the **verbatim 115**
`fn_reconcile_procurement` body inline (never by re-reading 115); drop the 116
functions by exact signature, including any overload created by a signature
change (the trap R4 caught); and leave `pursuit_state` values untouched.

`RECOMMENDATION` — state explicitly in the header: rolling back 116 while a
pursuit sits in `proposal_ready` or `submitted` leaves that pursuit in a state
115 alone cannot advance. The operator must `ADVANCE … passed` or accept a
stranded row. This is the same class of consequence as the R3 §6 finding and
belongs in the incident runbook, not in code.

**Transactional smoke matrix** (`smoke_116_…sql`, rolled back like its
predecessors):

| # | Assertion |
| --- | --- |
| 1 | Approve with a mismatched packet hash → raises; state unchanged |
| 2 | Approve with `unresolved_count > 0` → raises |
| 3 | Approve twice → second raises on `UNIQUE (packet_id)` |
| 4 | `RECORD-SUBMISSION` without an approval → raises |
| 5 | `RECORD-SUBMISSION` after a simulated artifact hash change → raises |
| 6 | `RECORD-SUBMISSION` twice → second raises |
| 7 | `OUTCOME` without a submission → raises; twice → raises |
| 8 | `OUTCOME` with empty debrief → raises |
| 9 | Packet re-assembly produces a new version; the old packet becomes `superseded` |
| 10 | Approve/submit/outcome each write exactly one routed receipt into the outbox in the same transaction |
| 11 | Container role: base tables denied, `v_procurement_packet_queue` granted |
| 12 | Compliance `met` without evidence → raises; `stated_fact` without actor → raises |
| 13 | Reconciler conditions 1, 3, 4, 5 each alert once per day and re-alert the next |
| 14 | 114/115 policies, grants, and the `pursuit_state` CHECK are byte-unchanged |

**Focused TypeScript matrix** — each must fail before implementation:

- `procurement-packet.test.ts` — host hashing rejects traversal/absolute/symlink
  paths; packet hash is order-stable and changes on any artifact or compliance
  change; container-supplied hashes are ignored.
- `procurement-approval.test.ts` — `APPROVE`/`RECORD-SUBMISSION`/`OUTCOME`
  parse exactly; malformed variants yield `[PROCUREMENT ACTION NOT RECORDED]`;
  unnamed UID rejected before any query; **no post-commit branch can emit
  `NOT RECORDED`** (the R4 regression, re-asserted for all three commands).
- `procurement-ipc-handlers.test.ts` — the container cannot set `stated_fact`,
  `waived`, or any packet state; every new IPC is group-restricted and gated.
- `procurement-reconciler.test.ts` — drift detection flags and alerts; conditions
  dedup daily.

**Bounded public canary.** After the §8 gate: one real public opportunity →
register artifacts → complete the compliance matrix → propose a packet →
human `APPROVE` → **stop**. Do not record a submission on the first canary.
`INFERENCE`: `proposal_ready` with a verified hash and zero unresolved items is
the meaningful proof that this slice works; recording a real submission adds
external commitment for no additional engineering evidence. Record a submission
only on a second, separately authorized run where the owner actually intends to
bid.

---

## 8. Source ranking and the gate before activation

`RECOMMENDATION`. **The ranking in `NC-20260809-003-PROCUREMENT-SOURCE-CANDIDATES.md`
is correct and I would not reorder it.** SAM.gov first is right for the reason
stated — it is the only candidate with a documented official opportunity API and
a clean host-owned read boundary — and it is the only entry that makes the
source-run completeness contract *meaningfully* checkable. Priorities 2–6
correctly prefer official notification streams over new HTML automation, #7
correctly isolates grants as a separate funnel, and #8 correctly labels award
data intelligence-only.

Three engineering caveats, none of which change the order:

1. **`planned_units` is keyword-shaped and SAM's is not.** `FACT`:
   `plannedCaleProcureUnits()` returns nine search keywords
   (`src/procurement-source-config.ts:10-20`) and the run contract compares
   observed against planned units. SAM's coverage unit is a date-window page or
   cursor, not a keyword. 116-era work must generalize the planned-unit concept
   **per adapter** before SAM is built, or the completeness contract will be
   retrofitted under deadline pressure.
2. **The source enum is closed.** `FACT`: `fn_record_procurement_observation`
   accepts only `caleprocure`/`email` (114:309) and the table CHECKs allow
   `caleprocure|email|bonfire` (114:127,147). Adding `sam` is a migration, not a
   config value. Plan it as part of the SAM slice.
3. **Cross-source identity must land before source #2, not after.** SAM.gov and
   a state portal will legitimately carry the same solicitation; today that is
   two opportunities, two cards, and two potentially contradictory decisions.

**Measurable gates before activation** — `RECOMMENDATION`, one per tier:

| Tier | Gate |
| --- | --- |
| **SAM.gov** | (a) the §7 canary reaches human `APPROVE` on a real public opportunity; (b) adapter contract items 1–7 from the candidates doc demonstrated on sanitized fixtures; (c) one shadow run whose coverage receipt is complete and whose unique-relevant yield is recorded; (d) generalized planned units and the `sam` source value migrated |
| **Email alerts (#2–#6)** | (a) the taxonomy route is live-verified — every new Procurement email obtains a `routed_at` receipt for 7 consecutive days with zero additions to the held backlog; (b) the backlog alert count is stable or decreasing; (c) each subscription is human-registered, with the registration recorded as an operator action |
| **HTML adapters (#4, #5, #6)** | 30 days of alert-stream data showing a specific count of unique relevant opportunities the notification feeds *missed*. Absent that number, the maintenance cost is unjustified — and the current CaleProcure adapter is the standing example of what an unmeasured HTML source costs |

`INFERENCE`. The candidates document's own closing recommendation — SAM first,
alerts in parallel, then measure before any HTML adapter — is exactly right. My
only substantive addition is that the "measure" step needs a **number agreed in
advance**, or it will resolve to "add it anyway."

---

## 9. Owner decisions

Three, all enablement-gating configuration rather than implementation blockers.
Each should become a typed setting in the launchd surface, matching
`PROCUREMENT_OPERATOR_UIDS`.

| ID | Decision | Why it is genuinely the owner's |
| --- | --- | --- |
| **OD-1** | Who may `APPROVE` a packet and `RECORD-SUBMISSION` — the same two operators, or a narrower pricing/commitment authority? | Approving a proposal packet is a commercial commitment, not a workflow step. Suggest `PROCUREMENT_APPROVER_UIDS`, defaulting to empty (fail-closed) rather than inheriting the reviewer list |
| **OD-2** | Must the approver differ from the person who assembled the packet? | A separation-of-duties question. Enforceable either way as `approver_uid <> assembled_by` behind a flag; with two operators total it is a real trade between rigour and throughput |
| **OD-3** | Outcome follow-up window before the reconciler nags (30 / 60 / 90 days), and maximum evidence age before condition 5 fires | Depends on typical award cadence in this market, which the repository cannot know |

`INFERENCE`. I considered elevating "which company facts are authoritative"
(the R1 D-4 carry-forward) to a blocker and concluded it is not. The compliance
matrix requires *a* citation — a hashed artifact or a named human's stated fact
— and staleness is reconciler condition 5. That lets 116 ship while the
company-fact authority question is settled separately, which is the right
sequencing: the schema forces the citation to exist, and the owner decides later
what may be cited without a human.

---

## 10. Attestation, commands, elapsed time, cost

### Changed files

Exactly one file created, inside the review root:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-PROPOSAL-SOURCE-CLAUDE-RESPONSE-R5.md
```

`FACT`. No source, schema, migration, rollback, smoke, configuration, prompt,
test, continuity file, or other report was edited. No vault file was opened. The
operational checkout at `/Users/xbohdpukc/dev/NanoClaw` was not accessed.

### Inspected

`NC-20260809-003-PROCUREMENT-PROPOSAL-SOURCE-CODEX-REQUEST-R5.md` ·
`NC-20260809-003-PROCUREMENT-SOURCE-CANDIDATES.md` (full) ·
`scripts/register-procurement.ts` (full — mount and timeout configuration) ·
`115_procurement_pursuit.sql` (state CHECK `:86-90`, advance guard `:628`,
outbox and grants) · `114_procurement_control_plane.sql` (source enum `:309`,
table CHECKs `:127,147`) · `rollback_115_procurement_pursuit.sql` (drop-set
convention) · `src/procurement-review.ts` (command parsing and receipt
structure) · `src/procurement-ipc-handlers.ts` (group authorization, bounded
queue shape) · `src/procurement-reconciler.ts` (outbox delivery and ack) ·
`src/procurement-source-config.ts` · `docs/PROCUREMENT-RESURRECTION-PLAN.md` ·
`groups/procurement/CLAUDE.md` · prior rounds R1–R4 (carried context).

### Commands

`sed`, `grep`, `git status --porcelain`. Read-only. No tests or typecheck were
run this round — no code changed, so there was nothing new to execute. No
database, network, browser, container, production, or deployment access.

### Elapsed time and cost

Approximately 18 minutes wall-clock (2026-08-09T21:45Z–22:03Z), file reads only.
The session reports roughly **$6.3 of a $15 budget consumed** at the start of
this round; the round itself is read-and-write-one-file, so its marginal cost is
small. Exact per-round token accounting is not observable from inside the
session and is not estimated.
