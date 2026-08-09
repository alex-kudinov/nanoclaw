# Procurement Scout resurrection plan

Status: migration 114 is deployed dark; migration 115 pursuit closure is implemented and under validation
Tasks: `NC-20260730-001`, `NC-20260730-003`, `NC-20260730-004`, `NC-20260809-002`, `NC-20260809-003`
Owner/client: Codex + Claude owner review
Date: 2026-08-09
Change class: C1 design authority with separately recorded C2/C5 implementation and deployment
Production boundary: the 2026-08-09 preflight was aggregate/read-only. The
authorized migration-115 release has not yet been applied or activated; its
disposable-database smoke test passed and rolled back.

## 1. Executive conclusion

The Procurement Scout is not dead, but its legacy daily discovery task timed
out on 2026-08-09 and has no durable proof of complete source coverage. What
has been neglected is the
idea that made the minion valuable:

> a closed, governed process that turns a procurement signal into a qualified
> opportunity, a deliberate go/no-go decision, a compliant proposal packet, a
> recorded submission, an outcome, and a better next decision.

In production today, the process is overwhelmingly a browser-driven collection
loop:

```text
portal search -> insert rows -> post scan summary
```

The intended process was much richer:

```text
discover -> normalize -> deduplicate -> qualify -> go/no-go
  -> acquire documents -> compliance analysis -> proposal draft
  -> human approval -> manual submission -> receipt -> outcome -> calibration
```

The framework for that richer loop exists in prompts and a local procurement
vault, but it is not a reliable operating system:

- discovery output is model-shaped rather than contract-shaped;
- emailed RFP intake is described in the Procurement prompt but intentionally
  disabled in the host router;
- the tracked database definition and live constraint disagree;
- most noise remains in the same `new` state as actionable work;
- proposal and outcome states are nearly unused;
- the bid-history feedback ledger has no entries;
- the core qualification and proposal framework is provisional, dated April,
  and outside Git continuity;
- the live browser bridge is reachable from every agent VM and exposes a
  powerful unauthenticated host-browser control surface;
- direct SQL, raw portal credentials, and a full browser are given to the
  language-model container instead of being mediated by host capabilities.

The right resurrection is not to make the current prompt more energetic. It is
to preserve its business thesis while replacing the improvised execution path
with typed inputs, host-enforced transitions, narrow capabilities, measurable
closure, and explicit human authority.

## 2. Evidence boundary

### Repository evidence inspected

- root and group operating instructions;
- project map, active work, change protocol, changelog, security model, data
  model, Company-OS plan, and Claude validation report;
- Procurement group prompt, schema note, knowledge, scan/scrape procedures,
  registration, scheduler, browser launcher, database setup/seed scripts;
- current container credential/browser wiring and scheduler semantics;
- tracked PostgreSQL/SQLite schema references and ignored procurement DDL;
- Git history for the Procurement surfaces from their April introduction
  through the July continuity checkpoint;
- test inventory and email-classification router behavior.

### Local operational evidence inspected

Only aggregate or structural evidence was used from ignored operational files.
No credentials, auth-state content, raw browser-profile data, email bodies,
customer rows, proposal text, or opportunity documents are reproduced here.

### Production evidence inspected read-only

On 2026-07-30, the production Mac Mini was queried read-only for:

- branch/commit and dirty-path count;
- Procurement registration and scheduled-task/run aggregates;
- Procurement browser service and endpoint health;
- aggregate `procurement_opportunities` counts, constraints, freshness, and
  funnel use;
- aggregate procurement-vault artifact counts;
- hashes/status of the narrow Procurement source surface.

No production write, restart, browser action, message, schedule change,
credential action, or row-level business-data read occurred.

## 3. What the original idea was

The strongest design is in the combination of the group prompt and the local
vault framework, not in any single file.

### 3.1 Multi-source opportunity discovery

The minion was intended to collect:

- authenticated Bonfire opportunities;
- public CaleProcure opportunities;
- emailed RFP/RFQ opportunities from Mailman;
- eventually, any other normalized procurement source.

It searched service terms aligned to Tandem's capabilities, deduplicated
opportunities, maintained deadlines, and separated new items from previously
seen items.

### 3.2 Qualification before proposal effort

The intended go/no-go system combines:

- a service-area capability profile;
- hard disqualifiers;
- soft risks;
- positive fit signals;
- budget and deadline pressure;
- named coach/capability matching;
- mandatory-versus-preferred requirement extraction;
- explicit gaps and action items.

This is the right product idea. Procurement work is expensive, deadlines are
hard, and an attractive title is not evidence that Tandem can submit a
compliant, competitive response.

### 3.3 Proposal assembly with human review

The intended proposal system:

- mirrors the solicitation's required structure;
- maps requirements to company evidence;
- selects relevant qualifications, references, methodology, and personnel;
- identifies genuine human decisions;
- proposes pricing with an internal rationale;
- versions revisions;
- marks a packet ready only after action items are resolved or explicitly
  overridden.

The current lifecycle text treats `submit` as a recording command after a human
submission. That boundary should be preserved and strengthened: the system may
prepare and verify a submission packet, but it must not submit, sign, accept
terms, or attest on a portal autonomously.

### 3.4 Outcome learning

The intended closeout loop records:

- bid/pass/no-bid decisions;
- submitted price;
- won/lost/withdrawn outcome;
- debrief and pricing feedback;
- corrections to capability, scoring, roster, compliance, and boilerplate.

This is the part that would make the process improve. It is also the part that
never became operational.

## 4. Verified current state

### 4.1 Live scanner

The production group is registered and has one active daily task at 08:00
America/Chicago. The latest read-only snapshot on 2026-07-30 showed:

| Evidence | Production result |
| --- | --- |
| group registered | yes, since 2026-04-04 |
| scheduled task | active |
| successful task-run rows | 70 |
| error task-run rows | 9 |
| latest successful run | 2026-07-30 |
| browser launchd service | running |
| Chrome loopback endpoint | healthy |
| container-gateway CDP bridge | healthy |

Recent successful runs took from roughly one minute to more than 46 minutes.
The 2026-07-30 run took about 23 minutes. The configured ten-minute value is an
inactivity timer, not a total run budget: every streamed output resets it.

The scheduler records `success` when the agent turn returns without an
explicit error. It does not prove:

- every configured source was scanned;
- every keyword/page completed;
- the snapshot matched a schema;
- deduplication and expiry completed;
- a final channel result was posted;
- the browser was closed;
- the next-action queue is usable.

### 4.2 Opportunity store and funnel

Aggregate production state on 2026-07-30:

| Status | Count |
| --- | ---: |
| `new` | 163 |
| `expired` | 138 |
| `rejected` | 6 |
| `scraped` | 2 |
| all later lifecycle states | 0 |
| total | 309 |

Source mix:

| Source | Count |
| --- | ---: |
| Bonfire | 298 |
| CaleProcure | 9 |
| email | 2 |

The `new` queue is not an actionable review queue:

| Relevance among `new` | Count |
| --- | ---: |
| noise | 127 |
| borderline | 24 |
| relevant | 11 |
| unclassified | 1 |

Fifty-five `new` rows had deadlines within seven days, but that number mixes
noise and genuine opportunities. A human cannot use it as a deadline queue
without re-filtering the model's earlier work.

Lifecycle evidence is thin:

- 15 records have a review timestamp;
- 11 have a scrape timestamp;
- 12 have a vault path;
- 7 contain a kill-screen score;
- 5 contain an analysis path;
- none contains an outcome.

The live vault contains 12 briefs, 6 analyses, 2 proposal drafts, and 2 status
files. Its bid-history table has zero outcome or correction rows.

The minion therefore demonstrates discovery activity, not a working
opportunity-to-outcome process.

### 4.3 Snapshot contract

The local operational history contains 65 dated JSON scan snapshots from April
through July. They use 44 distinct top-level key shapes. Common concepts change
names between runs, nesting changes, and arrays appear under different keys.

The live 2026-07-30 snapshot uses:

```text
bonfire
caleprocure
portals
scanned_at
```

Its nested portal summaries use another free-form shape. This makes snapshots
unsuitable for deterministic replay, comparison, alerting, or tests.

### 4.4 Database authority drift

The actual PostgreSQL table has a live status constraint that includes proposal
states such as `drafting`, `review`, `revision`, `ready`, `submitted`,
`awarded`, `lost`, and `withdrawn`.

The repository's procurement DDL:

- is ignored by Git;
- omits the `source` column present in the live schema;
- omits the proposal lifecycle states present in the live constraint;
- is invoked by a setup script as if it were portable authority.

The July tracked structure-only schema snapshot records the live columns but
not a portable ordered migration for this table's current lifecycle. Production
behavior therefore depends on untracked/manual schema history.

### 4.5 Email intake is disconnected

The Procurement prompt describes an incoming
`[HANDOFF: mailman→procurement]` flow for emailed RFPs.

The host router explicitly returns `classify_only` for every
`procurement/*` email label and writes no handoff. Tests lock that behavior in.
The knowledge taxonomy says the Procurement minion handles those messages, but
the implementation does not route them.

This is documented intent with a deliberately disconnected implementation, not
an intermittent agent failure.

### 4.6 Framework freshness and continuity

The substantive qualification, kill-screen, compliance, pricing, proposal,
roster, boilerplate, and feedback files live in a local vault outside Git.
Core decision files still identify themselves as provisional and were last
updated in early April.

The Procurement `KNOWLEDGE.md` file is primarily a replicated sales/program
knowledge pack. It contains no durable implementation of the detailed
procurement scoring system the scan procedure says to read.

Consequences:

- another machine or fresh checkout cannot reproduce the proposal system;
- no continuity check verifies that the framework exists or is current;
- company, certification, roster, reference, insurance, and pricing claims may
  drift without a freshness gate;
- corrections can modify local files but do not become shared engineering or
  business authority;
- backup copies and audit footers are not a sufficient versioned change
  protocol.

### 4.7 Production/source drift

At audit time production was on `main` at `a6e4b13` with 97 dirty paths, while
the review checkout was on `codex/continuity-reconciliation` at `1689527`.
The narrow Procurement prompt, procedures, browser launcher, registration
scripts, ignored DDL, and current `container-runner.ts` were byte-identical
between the two machines.

This means the live Procurement mechanics are current as files but are not
represented by the production commit. A commit hash alone cannot reproduce or
roll back the running system.

## 5. Failure analysis

### 5.1 The model is the integration layer

The current agent is expected to:

- drive two unstable portals;
- discover changing page/API behavior;
- extract and normalize listings;
- build SQL with scraped content;
- mutate lifecycle state;
- write snapshots;
- download and interpret documents;
- apply business scoring;
- draft and version proposals;
- maintain an audit trail;
- communicate progress.

That is too much nondeterministic work in one turn. Recent archived runs show
the agent repeatedly rediscovering how the Bonfire SPA works, switching between
DOM interaction, browser-local cache, direct APIs, and JavaScript injection.
The process is adaptive, but not repeatable.

### 5.2 Direct SQL makes data correctness prompt-dependent

The prompt and procedures interpolate portal text, email text, identifiers, and
JSON into shell-delivered SQL. Escaping guidance is not a security boundary:

- portal and email content is untrusted;
- dollar quoting is unsafe if the selected delimiter occurs in input;
- an LLM may mis-escape, transpose fields, invent a state, or omit a predicate;
- direct `UPDATE` bypasses a host-owned transition policy and idempotency
  contract;
- the role can execute business helper functions in addition to accessing the
  procurement table.

The legacy setup/seed scripts also handle credentials and SQL through shell
construction in ways that should not become the revived operating path.

### 5.3 State describes storage, not work

`new` means at least four different things:

- newly discovered relevant work;
- borderline work needing judgment;
- known noise;
- not-yet-classified work.

There is no durable owner, decision due date, next action, decision reason,
review SLA, source-run identity, or transition ledger. The status column cannot
answer "what must a human do next?"

### 5.4 Completion is not defined

A scan can be marked successful after an incomplete or partially adaptive turn.
A proposal can be marked submitted based on a command without a host-owned
receipt. An outcome is optional. No reconciler asks whether:

- a source scan has a complete watermark;
- an opportunity has a decision before its deadline;
- a ready packet was actually submitted;
- a submission received a confirmation/reference;
- a closed solicitation has an outcome;
- a lost bid generated a debrief or learning decision.

### 5.5 The learning loop has no evidence

The provisional scorecard was supposed to calibrate from wins, losses,
passes, and corrections. With zero bid-history rows and zero outcomes, its
thresholds and pricing rules remain opinions frozen in April.

### 5.6 Security controls are prompt-only

The live browser is a dedicated, non-syncing profile, which is better than
sharing an operator's general browser. It is not a capability boundary:

- the CDP bridge is live on the shared Apple Container gateway;
- every agent VM can reach it;
- CDP is unauthenticated;
- CDP can navigate, execute JavaScript, read browser session state, and direct
  host-side downloads;
- the instruction "no write actions on the portal" is not host-enforced.

The production read-only check closes the previously open evidence gap: this
bridge is live now.

The Procurement container also receives raw Bonfire credentials. A malicious
or compromised prompt has both the secret and unrestricted network egress.

## 6. Product definition for the revived minion

### Mission

Maintain a complete, deadline-aware, evidence-backed public-sector and
institutional opportunity funnel for Tandem, from discovery through outcome,
while keeping portal submission, attestations, pricing authority, and legal
acceptance under named human control.

### Non-goals

- general vendor/subscription procurement management;
- autonomous account registration;
- autonomous pre-bid conference registration;
- autonomous proposal submission;
- autonomous acceptance of portal terms, certifications, attestations, or
  contractual clauses;
- automatic claims about credentials, insurance, references, pricing, or staff
  capacity without current source evidence;
- broad browser access for other minions.

The term "procurement" is ambiguous in older architecture material. This minion
is an **opportunity/bid scout**, not an accounts-payable or vendor-spend agent.
A later naming decision should make that explicit.

## 7. Target operating loop

```text
Source run
  -> typed observations
  -> deterministic normalization + deduplication
  -> relevance triage
  -> actionable review queue
  -> named go/no-go decision
  -> document acquisition + checksum/manifest
  -> compliance and capability analysis
  -> named bid decision
  -> proposal packet + unresolved-item checklist
  -> pricing/content/legal approval
  -> manual submission
  -> receipt/reference capture
  -> outcome/debrief
  -> measured rule update
```

### Human authority

| Action | Default class | Authority |
| --- | --- | --- |
| read public listing | C0 | automatic |
| read authenticated listing through isolated capability | C0 | automatic after capability approval |
| normalize, deduplicate, expire, classify obvious noise | C2 | automatic, reversible, audited |
| recommend bid/pass/review | C1 | automatic recommendation |
| make final go/no-go decision | C2/C4 | named human |
| download solicitation documents | C0/C2 | automatic from allowlisted source |
| draft internal analysis/proposal text | C1 | automatic |
| select final personnel, references, commitments, and pricing | C4 | named human |
| register for conference/account or alter portal state | C3/C4 | explicit approval |
| submit proposal, attest, sign, accept terms | C3/C4/C5 | human manual action |
| record submission | C2 | only from receipt/reference evidence |
| record outcome and debrief | C2 | human or verified source evidence |

## 8. Target technical shape

Keep the NanoClaw modular monolith. Do not create a separate platform.

### 8.1 Source adapters

Each source produces one versioned observation contract:

```json
{
  "schema_version": 1,
  "source": "caleprocure",
  "source_run_id": "opaque-id",
  "source_opportunity_id": "opaque-id",
  "observed_at": "ISO-8601",
  "title": "text",
  "agency": "text-or-null",
  "deadline": "ISO-8601-or-null",
  "url": "allowlisted-url",
  "category": "text-or-null",
  "matched_terms": ["text"],
  "raw_artifact_ref": "opaque-ref"
}
```

The adapter, not the language model, owns:

- source completion;
- pagination/watermark;
- retry and timeout;
- stable IDs;
- extraction types;
- snapshot schema;
- checksums and run summary.

The LLM may help diagnose a changed page or interpret ambiguous text, but it
does not invent the storage contract.

### 8.2 Host-owned procurement capability

Add a narrow, source-authorized host capability family instead of direct SQL:

- `procurement_record_source_run`;
- `procurement_upsert_observations`;
- `procurement_get_review_queue`;
- `procurement_record_triage`;
- `procurement_transition`;
- `procurement_attach_artifact`;
- `procurement_record_decision`;
- `procurement_record_submission_receipt`;
- `procurement_record_outcome`.

Requirements:

- source group is bound by the host;
- operations use parameterized queries;
- transitions are enumerated and checked;
- each mutation has an idempotency key;
- requested action, decision, and result are separately recorded;
- portal/email text remains data, never SQL or shell;
- final business state can be reconstructed without conversation history.

### 8.3 Browser boundary

Preferred Bonfire design:

- a host-owned browser worker using the dedicated profile;
- listening only on a procurement-specific authenticated capability endpoint;
- allowlisted to required Bonfire domains;
- read-only commands for navigation, extraction, and downloads;
- no raw CDP socket exposed to agent VMs;
- no arbitrary JavaScript, `file://`, upload, portal write, or arbitrary URL
  primitive;
- browser actions logged by source run;
- session credentials never returned to the container.

Fallbacks:

1. run the browser inside an isolated Procurement-only network/container and
   accept the Cloudflare maintenance cost; or
2. retire authenticated Bonfire automation and use email/public exports.

The current shared-gateway CDP bridge is not an acceptable revived design.

### 8.4 Data contract

First stabilize the existing `public.procurement_opportunities` table through a
Git-tracked ordered migration. Do not silently move it into `business_v2`
during recovery.

Minimum additions/normalization:

- source + source opportunity ID as a unique pair;
- source-run ID and observation freshness;
- deterministic relevance state distinct from workflow state;
- owner and next-action fields;
- review/decision due dates;
- explicit go/no-go decision + reason + actor + timestamp;
- proposal packet state separate from opportunity state;
- submission receipt/reference evidence;
- outcome/debrief state;
- append-only transition/action history;
- artifact manifest with checksum, source, and retrieval timestamp.

After the loop is stable, decide whether Procurement becomes a first-class
`business_v2` domain. Migration should be driven by identity/reporting needs,
not by cleanup aesthetics.

### 8.5 Framework authority

Move the non-secret, reusable decision framework into a Git-tracked
Procurement source tree with provenance and freshness metadata:

- qualification profile;
- kill-screen rules;
- proposal/compliance templates;
- methodology;
- approved company facts;
- claim/evidence registry;
- pricing policy structure without sensitive deal data.

Keep raw solicitations, customer-specific drafts, reference contacts, private
pricing history, and submission receipts outside Git in an encrypted,
backup-tested business artifact store.

Each generated proposal claim must identify:

- authoritative source;
- verified date;
- permitted use;
- expiry/revalidation rule;
- human-verification requirement where applicable.

### 8.6 Email intake

Replace `classify_only` for procurement labels with a narrow host handoff:

- exact Gmail message/thread resource assigned to Procurement;
- sanitized sender/subject/deadline hints in the handoff;
- full content read only through an exact granted message;
- deterministic dedup against portal observations;
- visible exception if routing or content retrieval fails;
- no mailbox-wide search/read capability.

This must build on the Gmail authorization boundary from
`NC-20260729-004`, not bypass it.

### 8.7 Completion and reconciliation

A source run is complete only when it records:

- started/finished time;
- source and adapter version;
- success/partial/failure state;
- pages/items observed;
- created/updated/unchanged counts;
- watermark or explicit full-scan assertion;
- error/exception list;
- next retry;
- stable snapshot reference.

A reconciler should surface:

- relevant/borderline opportunities without a decision;
- deadlines inside the review SLA;
- accepted bids without complete document manifests;
- proposal packets with unresolved mandatory requirements;
- approved packets without submission receipt;
- submitted bids with overdue outcome follow-up;
- closed work without outcome/debrief;
- source runs that are partial, stale, or anomalous.

## 9. Recommended implementation sequence

### Phase 0 — Decision and containment

No code should begin until these are decided:

1. Keep Bonfire automation only if the browser is isolated; otherwise retire it.
2. Name the business owner and backup owner for go/no-go and pricing decisions.
3. Confirm that all proposal submission remains manual.
4. Decide the authoritative non-secret framework location and private artifact
   backup/retention owner.
5. Confirm whether the product name should distinguish bid opportunities from
   vendor purchasing.

Operationally, the current bridge should be isolated or disabled under a
separate C5 task. This C1 plan does not authorize that service change.

### Phase 1 — Restore a truthful control plane

Scope:

- create the tracked ordered migration for the actual live table/constraint;
- define versioned source-run and observation schemas;
- separate relevance from workflow;
- define enumerated transitions and idempotency;
- add aggregate funnel and deadline health queries;
- add focused migration/transition/authorization tests;
- write a read-only reconciliation report for current rows.

Do not reclassify or rewrite the 309 production rows in this phase. Produce a
reviewable dry-run remediation plan first.

### Phase 2 — CaleProcure and email first

Why first:

- CaleProcure requires no account credentials;
- email routing can use the new exact-resource Gmail boundary;
- both paths can prove normalization, deduplication, triage, deadlines, and
  human decisions without the shared CDP risk.

Run in shadow mode until:

- the source-run contract is stable;
- repeated runs are idempotent;
- page fixtures and extraction tests pass;
- results are compared with the current scanner;
- false-positive/false-negative samples are reviewed.

### Phase 3 — Bonfire behind an isolated capability

Build or adopt the narrow browser worker. Acceptance must prove:

- unrelated agent VMs cannot reach its control plane;
- session credentials are absent from the Procurement container;
- only allowlisted Bonfire domains/actions are possible;
- portal writes, uploads, arbitrary JavaScript, and arbitrary navigation fail;
- downloads have a source URL, checksum, and artifact manifest;
- scanner completeness is independent of agent narration.

Run old and new Bonfire scans in read-only shadow comparison for a bounded
period. Retire the old bridge only after the new path meets recall and
reliability criteria—or retire Bonfire automation if its measured value does
not justify the control.

### Phase 4 — Refresh qualification and proposal preparation

Before producing a new proposal:

- verify every company/certification/compliance/roster claim;
- classify evidence as public, private, expired, or human-confirmed;
- recalibrate the kill-screen with owner decisions;
- build fixed fixtures for mandatory/preferred/evaluation extraction;
- produce a compliance matrix and unresolved-item checklist;
- keep pricing rationale internal and C4 human-approved;
- render proposal packets from typed state and evidence references.

### Phase 5 — Submission receipt and outcome closure

The human submits. The system then records:

- portal/source;
- submitted timestamp;
- packet checksum/version;
- human submitter;
- confirmation/reference;
- final approved price/commitments;
- expected decision date;
- follow-up date.

Outcome/debrief becomes required closure. Rule changes are proposed from
evidence and approved; they are not automatically written from one anecdote.

## 10. Smallest credible first slice

The first implementation slice should be:

> a CaleProcure + emailed-RFP review queue with a tracked schema, deterministic
> observations, host-owned transitions, deadline health, and explicit go/no-go
> decisions—without Bonfire CDP, proposal generation, or portal writes.

This slice proves the business loop rather than the riskiest integration.

Deliverables:

1. tracked migration and schema reference;
2. source-run/observation TypeScript types and validators;
3. deterministic CaleProcure fixture extractor;
4. exact-resource email handoff;
5. host Procurement IPC authorization and parameterized operations;
6. one Slack review card per opportunity with a stable thread key;
7. named `bid`, `pass`, and `needs-info` decisions;
8. deadline and stale-source reconciliation;
9. negative authorization/idempotency/transition tests;
10. shadow-run report with no production writes beyond a separately approved
    isolated test namespace.

## 11. Acceptance criteria for resurrection

The minion is not "resurrected" merely because a daily task runs.

### Discovery

- one versioned snapshot contract across every run;
- stable source IDs and idempotent repeated scans;
- explicit complete/partial/failure state per source;
- bounded runtime, page count, model cost, and retry behavior;
- no model-built SQL or shell from portal content.

### Triage

- noise is not mixed into the actionable queue;
- every relevant/borderline item has an owner, review deadline, and next action;
- sampled false-positive and false-negative reviews are recorded;
- source freshness and deadline risk are visible.

### Security

- no unrelated agent VM can reach the Procurement browser control plane;
- the container does not receive raw Bonfire credentials;
- browser operations are domain/action allowlisted and read-only;
- portal content cannot invoke a host action;
- Procurement DB writes are source-authorized, parameterized, idempotent, and
  transition-checked;
- portal submission and attestations remain human actions.

### Proposal

- every mandatory requirement has met/not-met/evidence/owner status;
- every company claim has source and freshness;
- pricing and commitments have named C4 approval;
- packet version/checksum is bound to the approval;
- submission is recorded only with receipt/reference evidence.

### Closure

- every submitted bid reaches won/lost/withdrawn/cancelled with evidence;
- every loss has a debrief-request state and owner;
- every rule change cites aggregated evidence or an explicit owner decision;
- funnel, effort, conversion, and quality metrics can be computed from durable
  state.

### Continuity

- a fresh Claude Code or Codex session can reproduce the implemented behavior
  from tracked source plus documented private-data restoration;
- migrations, prompts, framework, tests, and project map agree;
- production commit/deployment state is explicit and rollback-tested.

## 12. Metrics that justify keeping the system

Measure value before expanding automation:

| Question | Metric |
| --- | --- |
| Does discovery find real work? | relevant opportunities per source per month |
| Is it timely? | source freshness and review-before-deadline rate |
| Is it usable? | actionable queue precision; noise leakage |
| Does it save effort? | human review minutes per qualified opportunity |
| Does qualification help? | bid/pass decision agreement and override rate |
| Does proposal support help? | time from bid decision to reviewable packet |
| Is the work competitive? | submission rate, shortlist rate, win rate |
| Is the process learning? | debrief capture and evidence-backed rule changes |
| Is Bonfire worth its risk? | qualified/submitted/won value attributable to Bonfire |
| Is it reliable? | complete source-run rate, anomaly rate, duplicate rate |

Use a 30-day shadow/stabilization window before deciding whether authenticated
Bonfire automation merits its operational and security cost.

## 13. Leadership decisions required

1. **Bonfire:** isolate and retain for a measured trial, or retire the automated
   authenticated browser path?
2. **Owner:** who makes final go/no-go and pricing decisions, and who is backup?
3. **Submission:** confirm that submission, attestations, signatures, and terms
   acceptance remain manual.
4. **Scope/name:** keep "Procurement Scout," or rename to make bid opportunities
   distinct from vendor purchasing?
5. **Framework authority:** which non-secret files may be Git-tracked, and which
   private artifacts require an encrypted external store?
6. **Initial source:** approve CaleProcure + exact-resource email as the first
   implementation slice?
7. **Current scanner:** keep it temporarily as a read-only comparison source,
   or pause it until the live CDP bridge is contained?

## 14. Recommended decisions

- Retain the business idea.
- Keep submission manual.
- Start with CaleProcure and exact-resource email intake.
- Keep Bonfire only through an isolated capability and a 30-day value trial.
- Treat current production rows as migration evidence, not clean authority.
- Move the non-secret framework into tracked, provenance-aware source.
- Keep sensitive bid artifacts and contact details outside Git with an explicit
  backup/restore contract.
- Rebuild the minion around a host-owned work ledger and action boundary.
- Do not tune the current free-form prompt as the primary repair.

## 15. Authorized first slice

On 2026-07-30 the owner approved proceeding with the recommended initial
direction. `NC-20260730-003` implements the local C2 slice:

- tracked migration 114 reproduces the legacy opportunity table for fresh
  installs and adds source runs, immutable observations, normalized source
  keys, an actionable review view, and optimistic host-only review
  transitions;
- `src/procurement-intake.ts` validates and hashes bounded observations, uses
  parameterized functions, normalizes sanitized CaleProcure result rows, and
  leaves explicit complete/failed run evidence;
- `procurement/*` email routing now stores metadata before handoff, grants
  Procurement only the exact Gmail message read, and never copies the email
  body into the handoff or SQL;
- the container exposes a bounded, read-only `procurement_queue` operation;
- the minion cannot search the mailbox, fetch arbitrary threads, send/reply,
  apply review decisions, submit, sign, attest, or accept terms through this
  slice.

This began as source implementation rather than an operational cutover. The
later `NC-20260730-004` dark deployment applied migration 114 and activated the
matching host/container/prompt artifacts with both gates off. The current
schedule and all 309 legacy rows remain unchanged, and no CaleProcure batch,
review card, browser collection, or business action has run through the new
path.

## 16. Remaining gates and next action

The initial-source and manual-submission decisions are accepted. The named
business owner/backup, long-term name/scope, framework storage authority,
Bonfire isolate-or-retire choice, and old-scanner shadow/pause choice remain
open.

Next:

1. review the NC-20260730-003 source and migration;
2. ~~take a production database backup and inspect migration preconditions;~~
   completed 2026-07-30;
3. ~~apply migration 114 before deploying the matching host and agent-runner
   source;~~ completed as a gates-off isolated release on 2026-07-30;
4. run one separately authorized sanitized CaleProcure fixture canary and one
   named-human review canary without changing the daily schedule;
5. expose a host-verified human review action in a separate task;
6. wire CaleProcure collection only after source-run completeness and rollback
   are live;
7. coordinate any Bonfire work with the separate CDP containment decision.

The 2026-08-09 owner authorization resolves the earlier ownership and cutover
questions for `NC-20260809-003`: Alex is primary and Cherie backup (Slack IDs
remain host-only); the decision actor initially owns the pursuit; escalation is
14 days; the legacy daily scan pauses at cutover; the shared CDP bridge is a
separate retirement task; and no source is added until one public,
non-submission opportunity reaches an evidenced `passed` closure. Coverage
receipts prove plan/receipt completeness, not independent browser execution.
Migration 115 and its rollback are implemented and rehearsed only in an
isolated schema-only database at this writing; they are not yet production
state. Successful human decisions and pursuit advances write their exact Slack
receipt into the acknowledged outbox in the same transaction as the state
change; delivery failure leaves a bound-thread receipt pending and can never
relabel a committed action as unrecorded.

## 17. Authorized continuation: dark collection and named-human review

On 2026-07-30 the owner asked to continue implementation.
`NC-20260730-004` extended and then dark-deployed the same slice:

- the minion can submit at most 200 typed public CaleProcure result rows through
  `procurement_caleprocure_ingest`; the host supplies the observation time and
  owns validation, batch hashing, run-key idempotency, deduplication,
  parameterized writes, and complete/failed run evidence;
- the collection path is off unless
  `PROCUREMENT_CALEPROCURE_INGEST_ENABLED=1`;
- `procurement_review_card` accepts only an advisory recommendation. The host
  reloads current queue truth, anchors one Slack card to
  `procurement:opp:{id}`, and records the exact channel/message, review version,
  action epoch, recommendation, and reason;
- a human decision is an exact, reason-required `DECIDE` command inside that
  card thread. Slack supplies the actor UID, which must appear in
  `PROCUREMENT_OPERATOR_UIDS`; review also requires
  `PROCUREMENT_REVIEW_ENABLED=1` and `PROCUREMENT_REVIEW_EPOCH`;
- migration 114 atomically claims the open card and optimistic opportunity
  version, so stale cards, old epochs, wrong threads, wrong users, and replays
  cannot overwrite a newer decision;
- reactions alone never change state, and no review state authorizes an email,
  registration, proposal commitment, submission, signature, attestation, or
  terms acceptance.

The named owner and backup are still unresolved, so no operator IDs or enabled
gate values are committed or live. The implementation remains dark. Migration
114 and matching artifacts are live, but no CaleProcure batch or Slack card has
been posted; the daily scanner, browser bridge, Bonfire path, 309 legacy rows,
and external systems remain unchanged.

Next activation gates:

1. preserve the combined migration 114 and `NC-20260730-003/004` release
   evidence;
2. name the primary and backup Slack operator IDs;
3. enable only CaleProcure intake for one sanitized fixture canary;
4. enable review for one synthetic opportunity/card and prove right-user,
   wrong-user, stale-version, wrong-thread, and replay behavior;
5. authorize any schedule cutover only after shadow comparison evidence.
