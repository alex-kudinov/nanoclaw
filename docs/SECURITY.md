# NanoClaw security model

Status: implementation-verified model with disclosed live-state gaps
Last source review: 2026-07-29 (`NC-20260729-004`)
Authority boundary: source and tracked configuration describe mechanics; live
services, credentials, networks, and installed launchd units require separate
verification

## Trust model

| Entity/input                                                 | Treatment                                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Main/Chief operator conversations                            | trusted human control channel, but displayed/model-generated action data is not authorization |
| Non-main Slack messages                                      | untrusted input                                                                               |
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
- the agent runner invokes Claude with broad in-container tool permission;
- role-specific integrations may add raw credentials, databases, scripts, and
  host bridges;
- every group currently sees the shared `mcp__nanoclaw__*` tool namespace.

The host must therefore enforce every consequential IPC operation even when the
tool is visible in the container.

### Mount and session isolation

Blocked mount names include common secret stores and key material. Paths are
resolved before validation, container targets reject traversal, and non-main
external mounts may be forced read-only. Each group has a separate
`data/sessions/<group>/.claude` directory.

Session separation reduces cross-group disclosure but does not authorize host
actions. Mounted knowledge and broad external data can still contain hostile
instructions.

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

## Gmail capability and resource policy

`NC-20260729-004` introduces the interim host policy below. It remains
uncommitted/unreleased until the shared change record reaches those states.

| Group          | Allowed Gmail IPC                                 |
| -------------- | ------------------------------------------------- |
| `mailman`      | send, reply, search, read message, read thread    |
| `sales`        | assigned-address search and assigned-thread read  |
| `contador`     | exact assigned invoice-message read               |
| `archivarista` | exact assigned meeting-assets-message read        |
| `chief`        | exact assigned classifier-correction-message read |
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
- Human-approved Sales and Chief reply cards durably bind their Gmail Thread-ID
  and intended recipient in `pending_sends`. That record reissues Mailman's
  exact reply grant after restart, and the Gmail-derived recipient must match
  the approved recipient before send.
- Other restart-stale context must be reissued by a host source. General durable
  work-item grants belong in the later ledger/capability-manifest slice.

### Final recipient boundary

Gmail IPC outbound email is C3. At that final host boundary:

- the intended To address is normalized;
- the host resolves the Party by email/thread;
- a caller-supplied `leadId` is only a candidate and must agree with host data;
- the To address must be one of the Party's known addresses;
- every CC must pass the same Party allowlist;
- a `GMAIL_TEST_RECIPIENT` delivery does not clear the intended customer's
  approved-send expectation because the customer did not receive it;
- missing Party context or a database lookup failure blocks the send;
- reserved/placeholder domains and malformed addresses always block;
- reply targets are derived from Gmail thread headers and validated before raw
  message construction;
- test routing redirects both sends and replies and removes CC.

Content validation remains a separate required boundary. Recipient success does
not authorize content, and content success does not authorize a recipient.
`digest-delivery.ts` calls the Gmail API directly, and the Courses SMTP path
bypasses Gmail entirely; both require separate consolidation behind the same
host boundary.

## Approval and autonomy

Prompt text, Slack cards, reactions, and a model's risk/category label are not by
themselves binding authorization. Current approval remains incompletely bound to
the action ultimately executed. The next slice must store a host-owned action
record containing normalized recipient, work/thread identity, body hash, nonce,
approver identity, expiry, policy result, and execution result.

Working policy:

- only named operators may authorize C3+ execution;
- C4/C5 remain human-authorized;
- autonomy class/risk must be host-derived;
- a global external-write safe mode must be checked at every final boundary;
- approval mutation, replay, wrong-user, wrong-thread, and expiry fail closed.

The current autonomy environment knobs are not assumed effective until the
running daemon reports their resolved values; some call sites read
`process.env` while repository `.env` loading deliberately does not populate it.

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
