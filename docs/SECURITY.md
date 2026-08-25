# NanoClaw security model

Status: implementation-verified model with disclosed live-state gaps
Last source review: 2026-07-29 (`NC-20260729-004`)
Authority boundary: source and tracked configuration describe mechanics; live
services, credentials, networks, and installed launchd units require separate
verification

## Release integrity boundary

Production startup is fail-closed on a provenance manifest before it initializes
any external system. The host verifies the complete compiled file set, exact
Node `22.23.2` runtime, build/runtime version agreement, and the operator-pinned
full commit. Production also requires the resolved container code root to match
that verified release. The verified non-secret identity, resolved code root,
and match state are returned by `/health`.

This is integrity and provenance, not publisher authenticity: the release
archive checksum must be recorded and compared through an independent
deployment channel. Container skills and agent-runner source come from the
verified release through `NANOCLAW_CODE_ROOT`. Writable group workspaces remain
an explicitly documented residual until instructions and operational output are
separated; reviewed prompt files must be compared during deployment. See
`docs/RELEASE-INTEGRITY.md`.

Release activation treats the installed launchd plist as machine-local state.
The host-owned activator changes exactly the executable target, code root, and
expected commit; any fourth diff fails before mutation. It verifies both the
rollback and candidate releases, requires an exact hostname confirmation for
apply, performs one bounded switch, and restores the captured plist once on
failure. Apply uses an atomic `shlock` PID claim that refuses every extant lock,
reports whether a numeric holder is live or stale, and performs owner-checked
cleanup. A stale lock requires an operator to prove no activation is running
before removing the exact reported lock path and repeating dry-run; the
activator does not race an automatic unlink against a concurrent owner.
Rollback is health-checked without masking the triggering error. Incident
recovery from a stopped/unhealthy daemon
requires a separate explicit flag but retains bundle, interpreter, hostname,
listener, target-health, and rollback checks. A tracked plist is never used to
overwrite unrelated installed settings during activation.

Sales thread inheritance is also host-bounded. Container identity is accepted
only while the matching queue work unit is active; inherited context is limited
to the same Slack channel, and timestamps are stripped from cross-channel
handoffs. Explicit historical Sales roots must be persisted channel roots for
the same lead. Model-supplied timestamps remain proposals, not authority.

## Trust model

| Entity/input                                                 | Treatment                                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Main/Chief operator conversations                            | trusted human control channel, but displayed/model-generated action data is not authorization |
| Slack messages and attachments                               | untrusted input                                                                               |
| Gmail bodies, headers, attachments, and links                | untrusted input                                                                               |
| Webhooks, browser pages, documents, transcripts, submissions | untrusted input                                                                               |
| Agent/model output and handoffs                              | untrusted proposals; never authority for identity, capability, recipient, approval, or policy |
| Container agent process                                      | isolated but potentially prompt-injected                                                      |
| Host process and host-owned policy data                      | trusted enforcement boundary                                                                  |
| PostgreSQL/SQLite records                                    | authoritative only for the domain/schema that owns them; inspect schema and provenance        |
| Launchd files and local runtime databases                    | evidence of intended/local state, not proof of production state                               |

## Primary boundaries

### Apple Container isolation

Agents run as a non-root user in Apple Container Linux VMs. The host chooses
mounts, environment, network, resource limits, and the IPC directories. The main
project mount is read-only; writable group, session, and IPC paths are separate.
Mount allowlist configuration lives outside the repository and is not mounted
into agents.

Container isolation is necessary but not sufficient:

- agent egress is currently unrestricted;
- production currently invokes Claude with broad in-container tool permission;
- role-specific integrations may add raw credentials, databases, scripts, and
  host bridges;
- production currently exposes the shared `mcp__nanoclaw__*` tool namespace.

The host must therefore enforce every consequential IPC operation even when the
tool is visible in the container.

`NC-20260816-004` adds a dark, default-off per-agent capability projection.
When separately enabled, exact tracked manifests generate Claude and MCP tool
exposure, validate mounts and runtime ceilings, constrain recognized host IPC,
and make pre-manifest or stale-fingerprint warm/adopted containers ineligible
for another turn. The deterministic matrix is
`docs/generated/CAPABILITY-MATRIX.md`; mechanics and residual gaps are in
`docs/CAPABILITY-MANIFESTS.md`. The global default remains compatibility mode;
the control does not restrict egress or remove raw mounted credentials.
`NC-20260816-006` adds a strict staged-group selector so one tracked,
registered agent can be enforced without changing any other agent. A malformed,
unknown, duplicate, or unregistered selection fails closed; the global switch
continues to mean all registered groups and is not suitable for the first live
canary while legacy dynamic folders remain unmanifested. Combined release
`2987070` now live-enforces only Campanero: the production projection contains
no Claude tools, only MCP `jobs`, only the related host operation, and its two
declared additional mounts read-only. A read-only production-image canary
returned the exact 22-job inventory while proving Bash and undeclared MCP tools
absent; no job, task, email, Slack-queue, or database mutation was introduced.

### Mount and session isolation

Blocked mount names include common secret stores and key material. Paths are
resolved before validation, container targets reject traversal, and non-main
external mounts may be forced read-only. Each group has a separate
`data/sessions/<group>/.claude` directory.

Session separation reduces cross-group disclosure but does not authorize host
actions. Mounted knowledge and broad external data can still contain hostile
instructions.

Inbound Slack raster files use a separate host-owned per-group tree. The host
validates PNG/JPEG/GIF/WebP signatures, size-bounds and atomically stages the
bytes, then overlays only that group's tree read-only at
`/workspace/ipc/inbound`. A minion may inspect the evidence with `Read` but
cannot replace it through the normal writable IPC mount. Visible image text is
still prompt-injectable input and confers no action authority. Local staged
copies expire after 30 days; the Slack attachment remains the source record.

Gmail attachments use a stricter no-copy host boundary. Containers may request
only an exact message already authorized for that group; they never receive a
Gmail attachment ID, raw bytes, reusable URL, credential, or model-selected
path. The host bounds MIME traversal, decoded item/message bytes, archive
shape/expansion, OCR pages, and extracted output; verifies type/magic and
SHA-256; refuses executables and generic archives; holds encrypted, malformed,
unsupported, or failed content; and removes every temporary file after the
attempt. SQLite receipts contain identities, hashes, lengths, methods, states,
and result codes but no raw or extracted customer/vendor content. Extracted
text remains untrusted evidence and cannot authorize an action or satisfy a
workflow whose required receipt is still held. The exact contract is
`docs/GMAIL-ATTACHMENT-CLOSED-LOOP.md`.

### IPC identity

The host derives the caller from the group-owned IPC directory; it does not
trust a `groupFolder` field supplied in JSON. Message/task authorization limits
non-main groups to their own target unless a recognized handoff routes to a
registered group. Classification and lesson families have explicit source
gates.

Denied security-sensitive requests are preserved under
`data/ipc/quarantine/<source-group>/` for forensic review. Runtime IPC,
quarantine, and error files are local operational state and must not be
committed.

The container runner stamps a host-verifiable `source_container` on every Gmail
MCP request. Gmail read results and denials return through the exact active
queue work unit for that container, where delivery is targeted and acknowledged.
They are excluded from chat-cursor dead-letter rollback because they are not
stored chat messages and cannot be reproduced by a database re-query. They are
never offered to another same-group container. If the originating container has
exited, the host logs and posts a mechanical hold instead of exposing the result
to a sibling session. For relay traffic, the host grants Gmail scope to the
header-derived `Reply-To` address as well as the envelope sender; body text can
never create that grant.

### Grader file capability

`NC-20260802-001` adds one narrow file action rather than expanding generic
message IPC:

- the caller is the directory-derived registered main group or exact `chief`;
- the target is fixed to the registered `grader` group and cannot be supplied
  as another channel;
- staged input must be a regular non-symlink below the caller's IPC attachment
  root, no larger than 25 MB, with host-verified size and SHA-256;
- the host snapshots the verified bytes before readable conversion and Slack
  upload, so a writable container cannot swap content after validation;
- a request-bound idempotency receipt is `pending` before the first Slack side
  effect and `complete` only after the upload and NanoClaw persistence succeed;
  a pending/uncertain receipt suppresses automatic retry;
- upload failure triggers best-effort deletion of the file-less Slack root and
  never wakes the grader.

The external toolbox adapter accepts only regular files below `/private/tmp`,
the current macOS temporary root, or the operator's Downloads directory. It
uses the existing authenticated SSH route to stage into the production Mac
Mini's IPC, fails closed until the compiled host advertises support, and waits
for the host receipt; it does not receive Slack credentials or write SQLite
message rows. File contents still leave the host for the
operator-authorized `#gru-grader` workflow, so deployment and a sanitized live
canary remain separate C5 review gates.

## Community student-lifecycle ingress boundary

`NC-20260824-004` adds local, default-off Community-only mechanics. Circle is
not a configured workspace and every non-`community` payload fails before
archive.

The public provider cannot sign Heartbeat callbacks, so n8n remains the public
perimeter. The private n8n-to-host hop uses an exact raw-body HMAC plus UTC
timestamp and five-minute skew window. Its live capability path and secret are
host/runtime configuration values; neither belongs in source or n8n exports.
Identity fingerprints use a separate host-only secret that is never configured
in n8n and must remain stable across relay-secret rotation.
The host reads at most 64 KiB before signature verification and closes an
oversize connection with 413.

The host validates and minimizes before `webhook_inbox` archive. Durable rows
may contain only official opaque Heartbeat identifiers, a keyed email
fingerprint, payload/evidence hashes, bounded enumerated facts, and timestamps.
They never contain name, raw email, DM/thread content, callback paths,
credentials, payment detail, grading/feedback text, or certificate URLs.
Identity resolution happens after archive and never creates/merges a Party.
Missing or ambiguous identity/catalog data creates an admin-only durable
exception rather than an inference.

Initial and replay processing are mechanical. `student-lifecycle` branches
before webhooks.json, group, prompt, channel, and `runAgent` lookup. Migration
134 grants only `nanoclaw_admin`, has no action outbox or recipient fields, and
refuses rollback after any history exists. The inactive n8n template has no
credential literal and retains no success/error execution payload. Source
presence grants no migration, deployment, provider, action, message,
certificate, or minion authority.

`NC-20260824-007` limits the shadow provider expansion to four Community
actions through an inactive-first relay. Tracked manifests contain callback
hostnames and URL hashes but never callback paths. n8n receives only the relay
secret; the distinct identity secret remains host-only. An exact 18-row
registration baseline protects all legacy receivers. Circle, legacy cutover,
the other seven Heartbeat actions, and every lifecycle consumer remain off.

## Gmail capability and resource policy

`NC-20260729-004` introduced the deployed baseline below. The Procurement row
was added by `NC-20260730-003` and its migration 114 plus matching
host/container source were deployed gates-off under `NC-20260730-004`.

| Group          | Allowed Gmail IPC                                 |
| -------------- | ------------------------------------------------- |
| `mailman`      | send, reply, search, read message, read thread    |
| `sales`        | assigned-address search and assigned-thread read  |
| `contador`     | exact assigned invoice-message read               |
| `archivarista` | exact assigned meeting-assets-message read        |
| `chief`        | exact assigned classifier-correction-message read |
| `procurement`  | exact assigned RFP-message read                   |
| all others     | none                                              |

Resource rules:

- Gmail itself or other trusted host code grants thread IDs, message IDs, and
  external addresses.
- A model-authored handoff can propagate only a resource already held by the
  source group. Only structured handoff headers are considered; addresses in
  message bodies cannot propagate. Text alone cannot mint authority.
- `gmail_reply`, threaded `gmail_send`, `gmail_get_thread`, and `gmail_read`
  require the corresponding host grant when a container supplies the resource.
  A host-verified recipient may recover a missing `Re:` thread after IPC
  authorization as a threading safety net.
- `gmail_search` accepts only an exact
  `from:<assigned-address> OR to:<assigned-address>` form.
- Initial grants are process-local with a 24-hour inactivity extension.
- Scheduled Sales work has one durable fallback: after restart, an exact
  address or thread is re-authorized only when PostgreSQL proves that it belongs
  to a Party with a non-terminal pipeline entry. Database errors fail closed.
- An asynchronous Gmail result is delivered only to the simultaneously active
  container whose exact host-known name and directory-owned group match the
  requesting source. This exact path may reach a scheduled-task container;
  ordinary chat piping still cannot. Late results and any container/group
  mismatch are held rather than rerouted to a sibling session. These results
  are ephemeral (`chat_cursor_recoverable=false`) because no Slack database row
  can reproduce them.
- Human-approved Sales and Chief reply cards durably bind their Gmail Thread-ID,
  intended To recipient, and ordered visible CC recipients in `pending_sends`.
  Parseable approvals also bind a random host action ID and the exact approved
  subject/body hash. That record reissues Mailman's exact reply grant after
  restart, and the Gmail-derived recipient plus immutable content and recipient
  headers must match before send.
- Other restart-stale context must be reissued by a host source. General durable
  work-item grants belong in the later ledger/capability-manifest slice.
- Procurement receives no mailbox search, thread read, reply, or send
  capability. Its host-created email observation stores routing metadata rather
  than the body; `gmail_read` is authorized only for the exact message ID in
  the active handoff.

### Final recipient boundary

Gmail IPC outbound email is C3. At that final host boundary:

- the intended To address is normalized;
- the host resolves the Party by email/thread;
- the legacy caller-supplied `leadId` field is only a canonical Party-ID hint;
  a host-resolved Party from the recipient/thread is authoritative, and a
  pipeline Entry ID accidentally supplied there cannot override or block it;
- the To address must be one of the Party's known addresses;
- every CC must pass the same Party allowlist, except that an action-bound CC
  may target an exact configured host mailbox only when the same ordered
  address appears in the stored operator-approved card;
- global `GMAIL_TEST_RECIPIENT` routing is refused before an action-bound
  customer send is claimed; use the dedicated host-only internal transport
  canary instead;
- missing Party context or a database lookup failure blocks the send;
- reserved/placeholder domains and malformed addresses always block;
- reply targets are derived from Gmail thread headers and validated before raw
  message construction;
- test routing redirects both sends and replies and removes CC.
- an approved action is conditionally claimed once before Gmail execution;
  confirmed replay returns the stored Gmail receipt, while an executing or
  uncertain replay is held for reconciliation rather than automatically sent;
- approving a newer card in the same Slack work thread durably blocks every
  older pre-Gmail action in that work thread as superseded; actions that may
  already have reached Gmail are never superseded;
- if more than one live approval shares a Gmail thread, the host holds the
  request unless the raw request body identifies exactly one durable candidate;
  request bytes may corroborate action selection but never become execution
  authority;
- after one exact action is resolved, the model's Gmail call is execution
  intent only. The host reloads To, ordered visible CC, subject, body, Gmail
  thread, Action-ID, Party hint, email type, and rendering mode from the stored
  approved Slack card, verifies that card against the durable hash and stored
  recipient headers, and discards model-added CC or raw-HTML flags before
  authorization and claim;
- scheduled Sales follow-up cards must expose the exact recipient, Gmail
  thread, subject, and body being approved; proposal follow-ups use the exact
  host-owned PostgreSQL draft and the same one-time action/receipt transitions;
- exact asynchronous host results are drained before a runner close sentinel;
  a queued approval-card rejection or Gmail result cannot be discarded merely
  because the model turn that was active when it arrived exceeded the bounded
  continuation window;
- host-persisted approval cards return an exact-container `ACCEPTED` result;
  rejected cards return `REJECTED`, and neither acknowledgement authorizes an
  email send;
- a parseable Slack approval card must pass the same deterministic content
  guard before it is posted and again before the Action-ID is minted. Canonical
  company/transactional domains include Tandem properties and short links,
  Stripe booking links, and regional Zoom hosts; hostname suffix lookalikes
  remain blocked;
- the numeric-discount guard accepts a value only when a non-bot human stated
  that same canonical value in the exact Sales chat and work thread. Questions
  do not authorize, later explicit negation revokes, and bot/customer handoffs,
  sibling threads, self-asserted card text, and mismatched values do not satisfy
  the guard. The same durable thread evidence is re-resolved at card posting,
  Action-ID creation, and final Gmail dispatch; all other content predicates
  remain independent and blocking;
- an approved Gmail reply may use a newly observed sender alias that is not yet
  in `party_emails` only when Gmail resolves that exact address as the
  participant of the durably approved thread, the approval card names the same
  address, the thread resolves to the Party, and a host Action-ID is present.
  This reply-scoped proof does not create a CRM alias and cannot authorize a
  standalone send, model-supplied recipient, reserved domain, or other thread;
- deterministic guard failures and uncertain delivery errors remain durable
  and are posted to the originating approval thread. Pre-approval malformed or
  content-invalid cards are also returned through the directory-derived source
  container so another concurrent Sales session cannot consume the correction;
  the asynchronous tool result is submission for validation, not proof that
  Slack accepted the card;
- an overdue `executing` action transitions to non-executable `uncertain`; the
  operator is told it may have sent and must reconcile Gmail before any new
  approval.

Content validation remains a separate required boundary. Recipient success does
not authorize content, and content success does not authorize a recipient.
`digest-delivery.ts` calls the Gmail API directly, and the Courses SMTP path
bypasses Gmail entirely; both require separate consolidation behind the same
host boundary.

## Approval and autonomy

Prompt text, Slack cards, reactions, and a model's risk/category label are not by
themselves binding authorization. Approved email now has a host-owned execution
record containing its action ID, normalized recipient, approval thread,
subject/body hash, stage history, failure state, and Gmail receipt. The model
cannot mint a valid record, change the host-stamped identity, or supply the
executed customer-facing bytes; the final boundary reconstructs and revalidates
content and recipient before a one-time claim.
For email records, the host recognizes only a check-mark or an exact
whole-message `Approved` inside the draft thread; incidental approval words in
feedback do not cross the host boundary. The typed form is currently offered
to every registered Slack approval listener, including incident and proposal
follow-up listeners; NC-20260802-010 must either narrow that scope or make the
broader contract explicit and fully tested. The remaining
named-operator/nonce/expiry work below is still required for full authorization
binding.

This is delivery binding, not complete approval authorization. The current
email reaction path still needs named-operator identity, expiry, and a nonce
bound to the displayed card. Other C3+ actions do not inherit the email ledger
and remain subject to their own final-boundary controls.

Working policy:

- only named operators may authorize C3+ execution;
- C4/C5 remain human-authorized;
- autonomy class/risk must be host-derived;
- a global external-write safe mode must be checked at every final boundary;
- approval mutation, replay, wrong-user, wrong-thread, and expiry fail closed.

The current autonomy environment knobs are not assumed effective until the
running daemon reports their resolved values; some call sites read
`process.env` while repository `.env` loading deliberately does not populate it.

### Procurement named-human review boundary

`NC-20260730-004` deployed a default-off C5 boundary on 2026-07-30:

- `PROCUREMENT_CALEPROCURE_INGEST_ENABLED=1` is required before the Procurement
  container can persist a bounded public result batch;
- review actions additionally require `PROCUREMENT_REVIEW_ENABLED=1`, a
  non-empty `PROCUREMENT_REVIEW_EPOCH`, and one or more exact Slack IDs in
  `PROCUREMENT_OPERATOR_UIDS`;
- the host, not the model, constructs the card from current database truth and
  binds its Slack channel/message, opportunity, review version, and epoch;
- a decision requires an exact, reason-bearing `DECIDE` command in that card's
  thread. Slack supplies the actor UID; container arguments and display names
  never supply authority;
- reactions alone, unnamed users, root-channel commands, stale versions,
  unrecorded cards, old epochs, duplicate commands, and database errors do not
  transition state;
- `process`, `drop`, and `needs_info` are internal workflow decisions, not C3/C4
  execution authority.
- migration 114 enables RLS on the shared opportunity table. The Procurement
  role can directly read/insert/update only source-keyless Bonfire legacy rows;
  source-keyed CaleProcure/email rows are visible through the bounded queue and
  writable only through host-admin functions.

No operator IDs or enablement values are committed or live. Migration and the
gates-off host/runner/prompt deployment are live; a gates-on fixture, named
human decision, schedule change, browser action, and business outcome remain
separate authorization and verification gates.

## Credentials and integrations

Claude authentication is necessarily present for the in-container CLI and is
discoverable to an agent with its allowed in-container tools. It is a documented
temporary exception, not a general credential-handling pattern.

Other credential exposure is role-specific and broader than the historical
Anthropic-only model. Examples include scoped PostgreSQL roles, Plutio/Trafft,
Stripe/Sheets, Obsidian, browser/session, and course-email paths. Inspect
`src/container-runner.ts` and the group configuration before claiming a secret
is absent.

Known priority exception: `courses` receives a raw SMTP tool/credential path
that bypasses Gmail recipient/content/test-routing/interaction controls. The
working decision is to retire it behind a host-owned capability. Until cutover,
it must be included in safe-mode and secret inventories.

### Common external-write safety control (`NC-20260816-002`, `-007`, `-008`, `-009`)

`src/action-safety.ts` now defines the dark, default-off common controller and
content-free action-envelope contract documented in
`docs/ACTION-SAFETY-CONTROL.md`. Gmail, Slack, Courses SMTP container launch,
Plutio runtime tools, the Stripe payment/refund host processor, and
Hive/Firestore conversation synchronization consult it at their mutation
boundaries. `NC-20260816-009` adds the Things `/add-todo` HTTP boundary before
fetch and preserves the Slack reaction caller's false/no-success behavior on
denial. Misconfiguration, the global brake, and matching per-system brakes fail
closed; reads and aggregate evidence remain available. A denied Hive
inline sync remains retryable, while its reaper reports the work held without
incrementing/dead-lettering or alerting.

`NC-20260816-007` live-verified the first five systems in an exact-release,
auto-restored no-write production drill. `NC-20260816-008` deploys and
live-verifies the Hive extension with an injected Firestore tripwire and
unchanged retry/business aggregates. The Things extension is implemented and
release `47019c9` live-verifies an eighth denial with an injected fetch
tripwire and unchanged business aggregates. The controls are default-off in
production and do not replace any domain-specific approval, claim, receipt,
hold, or policy. Envelope enforcement also remains off: current legacy callers
supply no envelope and would be denied if it were enabled. The default-off
manifest layer now fingerprints new containers and, when enabled, refuses
stale warm/adopted reuse at the next turn; activation still requires a
separately authorized drain/recycle and canary. Raw SMTP retirement,
standalone-script/remaining-integration coverage, and immediate interruption of
already-running writes remain open.

### Contador fulfillment receipt boundary (`NC-20260823-006`)

The host resolves an exact perimeter-labelled Stripe event read-only, then runs
the existing external-write safety check before any database, Payment Log,
roster, or `public.payments` write. A denial leaves the already-archived webhook
retryable and creates no fulfillment case. When allowed, the host admits the
case before invoking the processor, so a later processor failure leaves a
durable owned exception without weakening the global/system brake.

Migration 133 stores only opaque Stripe provider IDs, case/version/attempt
state, bounded result codes, SHA-256 evidence, owner, deadlines, and timestamps.
It deliberately excludes names, email addresses, product descriptions,
amount/card data, raw webhook JSON, Slack content, and accounting facts. Its
alias and receipt tables are append-only and all three tables are admin-only.
The host rejects alias reuse across cases, stale case versions, processor/host
identity mismatch, incomplete stage sets, and any `complete` result lacking
verified Payment Log, PostgreSQL payment, and mapped-roster readback. Refunds
cannot complete until a separately authorized refund-fulfillment slice exists.
A persisted five-minute UUID lease prevents overlapping direct/reaper or
Checkout/PaymentIntent deliveries from running concurrent children; an expired
lease creates a new version and invalidates the old token before takeover.

`webhook_inbox.handled` is not fulfillment authority by itself. It becomes
credible for this source only when `related_entity` binds the exact durable
case/version after a complete or explicit exception transaction.

Never print, commit, transmit for review, or summarize secret values. Token
selection for external model review must occur inside the invoking shell and
only sanitized source/diff content may leave the machine.

## Network and browser boundary

Agent network egress is unrestricted at the validated baseline. The
Procurement browser uses a dedicated non-syncing Chrome profile, which protects
unrelated browser state better than a general operator profile. However, the
unauthenticated CDP bridge is bound to the shared Apple Container gateway; every
agent VM can reach that gateway if the bridge is live.

Required treatment: isolate the Procurement network/binding, gate the bridge,
run the browser inside its own container, or retire the path. A dedicated
profile is not network authorization.

## Healer/self-modification boundary

Healer diagnosis and implementation consume evidence that may ultimately derive
from untrusted inputs. Agentic implementation runs a host Claude process with
broad permissions against a checkout that may contain live operational work.

Tracked policy is implementation off by default:

```text
HEALER_ACTIONS_ENABLED=0
HEALER_RESTART_ENABLED=1
HEALER_IMPLEMENT_ENABLED=0
```

The global action gate additionally requires a named operator allowlist and
action epoch. Executable proposals are host-bound to an expiring one-time nonce,
atomically claimed, and rechecked for trust, class, fix kind, adversarial review,
and operator identity at the final boundary. The fixed, capped
`launchctl kickstart` daemon recovery takes no model input and therefore uses
the separate default-on `HEALER_RESTART_ENABLED` control. `HEALER_QUIET=1`
disables every execution path; it is not itself an authorization mechanism.

Read-only diagnosis is outside `HEALER_ACTIONS_ENABLED`. The existing
`HEALER_INVESTIGATE_BASH=1` escape hatch grants Bash under
`bypassPermissions`; it must remain off until a host-enforced command sandbox
exists. `HEALER_QUIET=1` is currently its only global emergency stop.

No raw model-authored shell command is eligible for production enablement.
Re-enablement first requires a typed host-owned action registry with validated
arguments, idempotency, caps, verification, audit redaction, and denial tests.

Code implementation additionally requires:

- a disposable worktree, not the operational checkout;
- sanitized diagnosis/task input;
- named-operator approval bound to the proposed patch;
- bounded tools/credentials and no production mutation;
- tests and independent review before merge/deploy;
- live verification of the installed launchd environment.

Changing the tracked plist does not change an installed service.

## Relationship Context boundary (`NC-20260825-003`)

Relationship Context is a read capability over identity-linked business facts,
so a wrong answer can leak another person's context even without an external
write. The local dark foundation enforces:

- `RELATIONSHIP_CONTEXT_ENABLED=0` by default;
- no non-admin database grant in migration 137;
- a tracked adapter manifest/fact catalog and fixture-only reference adapter;
- no adapter credential value, network call, direct table write, Party merge,
  projection mutation, provider call, or action authority;
- exact one-shot grants bound to directory-derived group, host-minted run ID,
  source container, host-resolved work ID, subject, purpose, sections, max age,
  and expiry;
- no model-writable work ID in `party_context_get`;
- ambiguity becomes a content-minimized exception, never first-row email
  selection;
- every persisted JSON value is bounded to 8,192 bytes and every returned pack
  to 32 KiB;
- query receipts contain hashes, versions, status, and timing, not context
  values, email, messages, provider payloads, or credentials; query resolution
  and source-container delivery are separately recorded through one terminal
  pending-to-delivered/failed transition;
- Plutio planning has only a pure `dry_run` path and no provider tool/outbox.

The runner may expose the tool definition, but source presence plus an absent
feature flag/grant always denies before repository access. No group is granted
or configured in this task. Production migration, adapter/provider access,
minion activation, and deployment are separate security decisions and canaries.

## Build, supply-chain, and runtime controls

- Use the exact Node major selected by `.nvmrc` and rebuild native modules after
  changing majors.
- CI/launchd/production drift is a security and integrity risk, not merely a
  developer inconvenience.
- Skill-PR workflows intentionally execute PR-controlled code. Contain that
  execution on an ephemeral runner with read-only repository permission, no
  secrets, and no expression interpolation inside shell `run:` blocks.
- Pin third-party actions, minimize workflow permissions, scan secrets and
  dependencies, and require reviewed, green changes for release.
- Sync-conflict, backup, dump, session, credential, database, and generated
  runtime files are never source authority.

## Verification requirements

Security changes must test denial as well as success:

- unauthorized group/capability combinations;
- invented and stale resource IDs;
- broad/injected mailbox searches;
- unknown/mismatched To and CC recipients;
- reply recipient derivation and test routing;
- approval replay/mutation/wrong-user cases;
- safe-mode refusal at every external-write boundary;
- prompt injection through every external-input class.

A build is not deployment evidence. A deployment is not live verification.
Record uncommitted, committed, deployed, live-verified, and outcome-validated
states separately in `docs/ACTIVE-WORK.md` and
`docs/ENGINEERING-CHANGELOG.md`.
