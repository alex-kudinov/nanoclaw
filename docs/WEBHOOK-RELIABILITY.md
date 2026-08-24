# Webhook Reliability — Design & Process

Owner: NanoClaw core
Status: implementation active; the phase table below is authoritative
Related: [ARCHITECTURE.md](ARCHITECTURE.md), [DATA-MODEL.md](DATA-MODEL.md), [REQUIREMENTS.md](REQUIREMENTS.md)
First report: [reports/webhook-reconciliation-2026-04-27.md](reports/webhook-reconciliation-2026-04-27.md)

## 1. Problem

Inbound webhook delivery (Trafft, Stripe, GravityForms, Gmail Pub/Sub, Zoom, transcript-worker) is non-guaranteed today. Phase 0 forensics on 2026-04-27 found:

- Trafft: 21 of 33 (`booked` events) and 15 of 27 (`customer_created` events) lost in 30-day window
- Plutio sync: 44 parties in window with no `plutio_refs` link
- Root cause for the Plutio gap: `fn_create_party()` does not enqueue `plutio_outbox` on insert
- Root cause for Trafft loss: pending (gated on Trafft admin UI inspection or new `trafft/list-webhooks` tool)

The Jamie Maak case (party 10046, appt 44) was the trigger but the data shows a systemic pattern, not a single anomaly.

## 2. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Single `business_v2.webhook_inbox` for all sources | One reaper, one search surface |
| 2 | Plutio = system of record for person identity; **email = join key**; Trafft is an inlet | Two flows (Trafft-first vs. Plutio-first) converge on the same `party_id` |
| 3 | n8n stays in every path. **No bypass.** | Security perimeter pattern |
| 4 | Sweepers run every **6h**. Must be **convergent within one run**. | "in short order" — no multi-run backlog accumulation |
| 5 | Dead-letter target: `#gru-chief` for all sources | Aligns with existing plutio + hive reaper alerting |

## 3. Architecture

### 3.1 Inbound envelope archive — `business_v2.webhook_inbox`

```sql
CREATE TABLE business_v2.webhook_inbox (
  id              bigserial PRIMARY KEY,
  source          text NOT NULL,            -- 'trafft' | 'stripe' | 'gravity-forms' | 'gmail-push' | 'zoom' | 'course-recap'
  event_id        text,                     -- provider idempotency key (Stripe evt_*, Trafft 'appt:{id}:{event_type}', GF entry id, Gmail messageId)
  event_type      text,                     -- 'appointment.booked', 'customer.created', 'checkout.session.completed', …
  received_at     timestamptz NOT NULL DEFAULT now(),
  delivery_path   text NOT NULL,            -- 'n8n' | 'direct' | 'sweep'
  raw_headers     jsonb,
  raw_body        jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'received',
                                            -- received → dispatched → handled | failed | duplicate | dead_lettered
  attempts        int NOT NULL DEFAULT 0,
  last_error      text,
  last_attempted_at timestamptz,
  handled_at      timestamptz,
  handled_by      text,
  party_id        bigint REFERENCES business_v2.parties(id),
  related_entity  jsonb                     -- {kind:'interaction',id:183}
);

CREATE UNIQUE INDEX webhook_inbox_idempotency
  ON business_v2.webhook_inbox (source, event_id) WHERE event_id IS NOT NULL;

CREATE INDEX webhook_inbox_reaper_idx
  ON business_v2.webhook_inbox (status, received_at) WHERE status IN ('received','failed');
```

### 3.2 Receiver flow (modified `webhook-server.ts`)

1. Compute `event_id` via per-source extractor.
2. `INSERT … ON CONFLICT (source, event_id) DO NOTHING RETURNING id` — true idempotency at perimeter.
3. If conflict (duplicate), respond 200 immediately and stop. Updates `status='duplicate'` is implicit (the original row still wins).
4. Mark `dispatched` before the queued agent task begins.
5. Treat both a rejected run and a resolved `status='error'` result as failed;
   neither may become `handled` or authorize a downstream action.
6. Mark handled only after source-specific completion gates pass. Under the
   deployed NC-013 Booking path, canceled/rescheduled delivery must also enqueue
   its durable Plutio action from the archived row.

### 3.3 Identity-join layer (Trafft ↔ Plutio via email)

Two flows must converge on the same `party_id`:

**Flow A — Trafft-first** (About Us → Schedule a call, no prior contact):
```
Trafft customer.created (email X)
  → business_v2.parties lookup by primary_email = X
  → not found → fn_create_party(person, name, X, source='trafft')
  → fn_create_party also enqueues plutio_outbox(create-person)  ← Phase 0 fix
  → reaper resolves Plutio ID → plutio_refs row written
  → next Trafft event for X reuses the party_id
```

**Flow B — Plutio-first** (form/email first, then they book):
```
Form submission → fn_create_party(source='wordpress') → plutio_outbox enqueue
  …
Trafft customer.created (email X)
  → parties lookup by email → FOUND (existing party)
  → no Plutio create needed; bind: write plutio_refs(entity_type='trafft_customer', entity_id=28, party_id=N)
Trafft appointment.booked (customer_id 28)
  → resolve party via plutio_refs OR by email
  → INSERT interaction(channel='booking', event_type='booked', party_id=N)
  → handoff to sales
```

The unifying invariant: **every Trafft customer_id and every form submission must resolve to a single `party_id`**, and that party must have a `plutio_refs` entry within one reaper cycle.

### 3.4 Reapers

Two complementary jobs; both follow the existing `plutio-outbox-reaper.ts` shape.

- **`webhook-inbox-reaper.ts`** (5-min cron) — claim rows in `('received', 'failed', 'dispatched-stale')`, re-render prompt, re-`runAgent`, apply the same source completion gate as initial delivery, and dead-letter at `MAX_ATTEMPTS=5` to `#gru-chief`.
- **`plutio-outbox-reaper.ts`** — processes the general Plutio outbox plus replay-safe `booking_activity:*` rows; Booking dispatch re-loads the archived Trafft event and stores its remote marker receipt.
- **Operational execution boundary** — `tools/plutio/run-reaper.sh` reads the
  Node interpreter and `NANOCLAW_CODE_ROOT` from the installed NanoClaw
  LaunchAgent, verifies that immutable release, and executes its compiled
  `dist/plutio-outbox-reaper-cli.js` while retaining the operational checkout
  only as the state/config working directory. It must never execute source via
  `npx tsx` from the mutable operational checkout.

### 3.4a Booking lifecycle completion gate (NC-013 deployed_unverified)

Canceled/rescheduled interactions use `webhook_inbox.event_id` as their
`interactions.source_id`, not the appointment id shared by the original booked
interaction. Initial delivery and inbox replay both require:

1. an archived `source='trafft'` canceled/rescheduled row with a valid event id;
2. `runAgent` to return success;
3. a persisted Booking interaction matching that event id, appointment id, and
   event type.

Only then may the host insert or reuse one opaque `booking_activity:*` outbox
row and mark the inbox row handled with its party, interaction, and outbox
references. A missing interaction or enqueue error leaves the inbox retryable.
The container never receives the Plutio secret or tool path. Initial NC-013
release `77064e9` activated the boundary, and installed negative verification
proved Booking receives only `business_db`, `knowledge`, and `agent_docs`; all
configured Trafft/Plutio source names and legacy mounts are absent.

The authorized normal-ingress canary created archived inbox `4469`, party
`11333`, interaction `3034`, processed party-sync row `1311`, and activity row
`1312`. It exposed a runner lifecycle defect that retried a successful agent
turn and posted two Booking notices, plus a PostgreSQL receipt-cast failure
after the remote activity write. The host gate was recovered exactly and the
inbox marked handled before further agent retries. Release `67f16d5` fixes
one-shot scheduled-task exit and the cast, rebuilds the production image, and
refreshes all runner snapshots. A third pre-replay failure proved the scheduled
Plutio launcher still used the operational checkout; exact active release
`02ce48f` adds the compiled CLI and release-bound launcher described above.

The repaired real launcher processed only row `1312`; marker readback returned
`already_recorded`, persisted marker/person/note receipts and interaction
metadata, and left no active outbox row without a second activity. The one
authorized duplicate webhook returned HTTP 200 for inbox `4469` with stable
inbox, party, interaction, and outbox counts. Because the first normal event
required operator recovery, this path remains `deployed_unverified` until one
fresh post-fix natural canceled/rescheduled event exits after one agent turn,
posts one Booking notice, and reaches a terminal receipt without intervention.
The first automatic post-fix 15-minute Plutio cycle exited 0 and durably
recorded an all-zero work receipt, proving the scheduler now invokes the
release-bound compiled launcher without consuming another retry.

### 3.5a Customer-event sweep is skipped by design

Trafft's API exposes appointment `created_at` but NOT customer `created_at`. There's no way to watermark customer reconciliation, so a customer_created sweeper would re-synthesize every customer on every run. Two reasons we skip it instead of papering over:

1. **Booked events carry full customer fields** (`customerId`, `customerEmail`, `customerFirstName`, `customerLastName`). Identity-join (Phase 4) resolves party from those fields on the booked path. There's no signal in customer_created that booked doesn't already carry.
2. **Walk-in case** (customer registers without booking) is uncommon and fully covered by the live `/hook/trafft` `customer_created` webhook with idempotency (Phase 2).

The trafft-sweeper iterates customers only for future cross-checks but does not synthesize envelopes for them. See comment in `src/trafft-sweeper.ts`.

### 3.5 Sweepers (6h cadence, convergent in one run)

One sweeper per source. Each is "given the source's API, find anything that has no `webhook_inbox` row, synthesize one with `delivery_path='sweep'`, drive it to terminal state, advance watermark."

| Sweeper | Source-of-truth | Match key | Cadence |
|---|---|---|---|
| `trafft-sweeper` | `trafft/list-appointments`, `trafft/list-customers` | `(source='trafft', event_id='appt:{id}:{event_type}')` | 6h |
| `stripe-sweeper` | `stripe/list-events` (TBD: needs new toolbox tool) | `event.id` | 6h |
| `gmail-sweeper` | `users.history.list` | gmail `messageId` | 6h (Pub/Sub already retries 5m) |
| `gravity-forms-sweeper` | WP REST `/gf/v2/entries?since=…` | GF entry id | 6h |
| `zoom-sweeper` | `zoom/list-recordings` since cutoff | recording uuid | 6h |

**Convergence-in-one-run contract:**

```
sweeper run:
  1. read watermark (last_seen_id, last_seen_at)
  2. fetch all source events since watermark (paginate fully)
  3. for each missing event:
       - resolve party_id via identity-join
       - INSERT webhook_inbox + dispatch
  4. wait/poll (up to 30 min) for all dispatched rows to reach terminal state
  5. if all terminal: advance watermark
     if any still ('received'|'failed'|'dispatched'): leave watermark; alert chief
  6. log {processed, recovered, failed_to_recover}
```

A sweeper that can't drive its synthetic events to terminal in one run does **not** advance the watermark. Next run resumes from the same point. Backlog cannot grow silently.

### 3.6 n8n hardening (no bypass)

Per locked decision #3, n8n stays in every path. Two cheap changes per workflow:

1. **HTTP node** (e.g. `POST to Gru …`) — `retryOnFail: true`, `maxTries: 5`, `waitBetweenTries: 5000ms`. Catches Mac Mini restart / Tailscale blip.
2. **Error workflow** — single shared workflow that posts to `#gru-chief` Slack via the bot, with `executionId` URL and payload preview. Wired as `errorWorkflow` on every Trafft / Stripe / Gmail / Zoom flow.

n8n hardening catches F2/F4/F5 (provider→n8n, n8n→NC HTTP). Sweepers cover F1/F3 (provider never fired, n8n JS path silently dropped).

### 3.7 Failure-mode coverage matrix

| Hop | Failure | Caught by | Detection latency |
|---|---|---|---|
| Source → n8n | Provider never fires | sweeper | up to 6h |
| Source → n8n | Provider fires, n8n returns 5xx | provider retry (Stripe/Pub/Sub) or sweeper | minutes-6h |
| n8n trigger | Workflow disabled / token mismatch / JS throws | sweeper | up to 6h |
| n8n → NC HTTP | NC offline / Tailscale blip | n8n retryOnFail (Phase 6) | seconds |
| n8n → NC HTTP | sustained NC outage | sweeper + n8n error workflow | seconds-6h |
| NC receive | bad secret / malformed JSON | NC log + chief alert | seconds |
| NC dispatch | runAgent throws or returns `status='error'` | webhook-inbox-reaper | 5 min |
| Agent execution | Booking lifecycle run has no exact DB interaction (F8) | receiver/reaper completion gate | immediate, then 5-min retry |
| Agent partial (F9) | agent writes Slack but not DB | webhook-inbox-reaper deadline + sweeper | 5 min - 6h |

### 3.8 Community student-lifecycle dark foundation (`NC-20260824-004`)

Live migration 134 and `src/student-lifecycle*.ts` provide a Community-only
deterministic receiver. The exact configured path is matched
before generic `/hook/:id`; it requires a timestamped HMAC, a streaming 64 KiB
limit, schema version 1, and `workspace='community'`. The host minimizes names,
email, content, callback details, and credentials before archive. Email-bearing
events retain only a keyed fingerprint made with a distinct host-only identity
secret plus transient in-memory email for the first post-archive identity
attempt. Relay-secret rotation therefore does not change durable fingerprints.

`student-lifecycle` rows replay through an explicit mechanical branch before
webhook config, group, prompt, or agent lookup. The branch records normalized
facts, projections, or durable exceptions and marks the inbox handled only
after that receipt. It cannot run an agent or emit an action/message. The
fixtures-only reconciliation runner records registry/catalog/membership/
progress completeness and retains its watermark on partial or quarantined
input; it has no live Heartbeat/toolbox/network/schedule wiring.

`NC-20260824-007` adds a separately governed four-action shadow manifest,
protected 18-registration baseline, inactive-first n8n workflow, safe provider
inventory/ensure/delete tooling, catalog and reconciliation CLIs, and aggregate
store health. The relay uses runtime references and disables success, error,
and progress retention. Rollout must preserve every legacy receiver and verify
exactly four additive `USER_JOIN`, `USER_UPDATE`, `GROUP_JOIN`, and
`COURSE_COMPLETED` registrations. Circle, cutover, and action/message consumers
remain excluded. See `docs/STUDENT-LIFECYCLE-SHADOW-RUNBOOK.md`.

## 4. Phase plan

| Phase | Scope | Status | Blocks |
|---|---|---|---|
| **0** | Read-only forensics report | ✅ done 2026-04-27 | — |
| **0.5** | Trafft admin webhook config audit | ⏳ gated on admin UI or new `trafft/list-webhooks` tool | informs P5 priority but doesn't block |
| **0.6** | Add `plutio_outbox` enqueue to `fn_create_party()` new-insert branch | ✅ done 2026-04-27 (migration `95_fn_create_party_outbox_enqueue.sql`) | unlocked Plutio sync for new parties |
| **1** | `webhook_inbox` table + envelope archive in `webhook-server.ts` | ✅ done 2026-04-27 (migration `96_webhook_inbox.sql`, `src/webhook-inbox.ts`, daemon restarted, end-to-end probe verified) | foundation |
| **2** | Per-source `event_id` extractors + idempotency unique constraint | ✅ done 2026-04-27 (`src/webhook-extractors.ts`; trafft / stripe / course-recap wired; contact-form returns null pending GF entry-id forward; gmail-push, zoom: out of scope here) | makes n8n retries safe |
| **3** | `webhook-inbox-reaper.ts` (5-min in-daemon loop, dead-letter chief) | ✅ done 2026-04-27 (`src/webhook-inbox-reaper.ts` + `markHandled` on receiver success path + chief-alert chatJid wired; end-to-end probe → row dead_lettered → Slack message delivered to `slack:C0AHDHX1NBH`) | sweepers depend on it |
| **4** | Identity-join helpers (`resolveOrCreateParty(email, ...)`, `resolveTrafftCustomer(customer)`) | ✅ done 2026-04-27 (`src/identity-join.ts`; live-verified Trafft-first creates party + Plutio enqueue, idempotent on email) | sweeper depends |
| **5** | Sweepers (trafft → stripe → gmail → gravity-forms → zoom) | 🟡 trafft done 2026-04-27 (`src/trafft-sweeper.ts` + migration `97_sweeper_watermarks.sql`); stripe/gmail/gravity-forms/zoom planned. Customer_created sweep deliberately skipped (Trafft API lacks customer.created_at watermark; booked events carry full customer fields). Backfill of 21 historical missing booked events is operator-triggered via `scripts/run-trafft-sweeper.ts` (not yet run). | the actual capability |
| **6** | n8n hardening (retryOnFail + error workflow) | planned; can ship in parallel with 1-5 | independent |
| **7** | Observability: daily `#gru-chief` digest of `sweep_recovered` counts | planned | feedback loop |
| **Backfill** | One-time backfill operation for Phase-0 backlog (21 booked + 15 customer_created + 64 plutio enqueues) | planned | ships after Phase 4 |

Phase 6 has no NC dependencies — can run in parallel with 1-5.

## 5. Operational runbook

### 5.1 When `#gru-chief` posts `[REAPER-DEAD-LETTER]` for `webhook-inbox`

1. Read the message: which source, which `event_id`, last_error.
2. `SELECT * FROM business_v2.webhook_inbox WHERE id = N` to inspect raw body + headers.
3. If transient (network/DB), reset `status='failed'` and let reaper re-pick.
4. If structural (schema change, agent regression), fix root cause; manually mark `status='handled'` after backfilling the downstream side.

### 5.2 When sweeper logs `failed_to_recover > 0`

Watermark stays put. The same events will be retried next run. If two runs in a row fail to recover, escalate — manual investigation needed. Don't bump the watermark by hand without confirming all events upstream are accounted for.

### 5.3 Rotating webhook secrets

`webhook_inbox` is the audit trail. Update `data/webhooks.json` secret + n8n `X-Webhook-Secret` header simultaneously; receiver returns 401 until both sides are in sync. No data loss because n8n's retryOnFail will replay once secrets match.

### 5.4 Adding a new webhook source

1. Add row to `data/webhooks.json` (existing process).
2. Add per-source `event_id` extractor in `webhook-server.ts`.
3. Add a `*-sweeper.ts` if the source has a queryable history API (most do).
4. Add `errorWorkflow` wiring in n8n.
5. Update this doc's tables in §3.5 and §3.7.

## 6. Open follow-ups

- **0.5** Trafft admin webhook config — verify all 5 event types are configured for the n8n endpoints; check token. Either inspect via admin UI or build `trafft/list-webhooks` toolbox tool.
- **Stripe toolbox tool** — `stripe/list-events` with `created[gte]` filter must exist before Phase 5 stripe-sweeper.
- **GravityForms entry-list access** — confirm WP REST `/gf/v2/entries` is enabled; otherwise WP DB direct access via toolbox.
- **GravityForms entry id forward** — n8n's contact-form workflow currently strips `entry_id` before forwarding. Patch the n8n flow to include `entry_id`, then update `extractContactForm` to use `gf:{entry_id}`. Until then, contact-form is the only source without idempotency.
- **Pre-existing chief alert bug** — `plutio-outbox-reaper.ts` and `hive-sync-reaper.ts` use the same `{type:'message', text}` IPC envelope but omit `chatJid`. The IPC handler in `src/ipc.ts:152` requires `chatJid` to route, so both reapers' dead-letter alerts have been silently dropped (logged as "Unknown IPC message type" then deleted). `webhook-inbox-reaper.ts` resolves the chief group's chatJid before writing. Pattern to apply to the other two reapers in a follow-up.
- **Watermark storage** — design choice: dedicated `business_v2.sweeper_watermarks` table vs. `webhook_inbox` aggregate. Lean toward dedicated table for clarity.
- **Course-recap and zoom-class pipelines** — same shape, deferred until after Phase 5 covers the 4 highest-pain sources.

## 7. Why this design (rationale)

- **Single inbox table over per-source tables**: one reaper, one search, one alerting surface. Pattern matches `plutio_outbox`.
- **Idempotency at perimeter**: lets every other layer assume "if we received it, we processed it, exactly once." Removes a class of bugs that compounds with retries.
- **Sweepers separate from reapers**: reapers retry what we received; sweepers find what we missed. Different failure modes need different machinery.
- **Convergence-in-one-run for sweepers**: 6h cadence is fine for normal ops, but any single run that can't fully reconcile its window must alert. Otherwise we paper over silent backlog growth (which is exactly how we got here).
- **n8n stays as the security perimeter**: token validation, schema sanitization, and signature verification (Stripe, Zoom) all live there. NC trusts the perimeter; sweepers prove the perimeter is honest.
