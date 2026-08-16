# Host action safety control

Status: the seven-system boundary is deployed and live-verified in release
`47019c937d38e9346813f6058484e12e3d577ef5` under `NC-20260816-009`.
All production controls were restored default-off after the drill and the
broader repository-wide controller remains partial.

## Purpose and authority

`src/action-safety.ts` is the common host decision point for consequential
external writes. It adds two things without granting a capability:

1. a versioned, content-free action envelope that binds an exact action,
   idempotency key, nonce, system, class, source, policy version, validity
   window, target/payload hashes, and optional named-operator approval; and
2. a dynamic global/per-system external-write brake with aggregate health.

Existing domain stores remain authoritative. Gmail's `pending_sends` claim and
receipt, Procurement action cards, CNPC holds, grader receipts, autonomy holds,
and healer proposals are not replaced by this envelope. A caller must prove the
domain claim separately; a model-created envelope or prompt never grants
authority.

## Configuration and precedence

The controller re-reads project/shared environment configuration at each host
boundary so a brake does not depend on a daemon restart:

- `ACTION_SAFETY_ENFORCEMENT_ENABLED=0` keeps legacy callers compatible. When
  enabled, a missing verified envelope fails closed.
- `EXTERNAL_WRITE_SAFE_MODE=0` is the global brake.
- `EXTERNAL_WRITE_DISABLED_SYSTEMS=` is a comma-separated subset of
  `gmail,slack,courses_smtp,plutio,stripe,hive_firestore,things`.

Precedence is deterministic:

1. malformed configuration denies all named writes;
2. global safe mode denies;
3. the matching per-system brake denies;
4. unknown systems/classes deny;
5. enforcement requires a valid, unmutated, unexpired, request-matched
   envelope, approval for C3-C5, and an unclaimed durable domain state;
6. otherwise the write may proceed to its existing domain-specific controls.

No destination, message text, recipient, action ID, approval ID, or payload is
reported through health. `/health.actionSafety` exposes resolved mode plus only
aggregate allow/deny counts, decision codes, system names, and last denial time.

## Covered runtime boundaries

| System | Guarded boundary | Safe-mode behavior |
| --- | --- | --- |
| Gmail | IPC preflight, both normal final `gmail.users.messages.send` calls, and the host transport canary | approved action is held before its one-time execution claim; direct host sends are also denied |
| Slack | normal, tracked, grader, file, split-remainder, digest, healer, and confirmation-reaction writes | denial is thrown/returned and is never placed on the reconnect/retry queue |
| Courses SMTP | container secret construction and additional-mount plan | new Courses containers receive neither `EMAIL_USER`/`EMAIL_PASS`/`EMAIL_TOOL` nor the raw `email` mount |
| Plutio | shared CLI and outbox-reaper tool invocation | mutation and unknown scripts deny before `execFile`; the two explicit proposal/people list operations remain available |
| Stripe | payment/refund processor invocation | denies before the deterministic child process can write Sheets/PostgreSQL |
| Hive/Firestore | composite classification sync plus assignment, status, and tag merge | denies before Firebase credential/SDK initialization; the inline row remains retryable and the reaper reports `held` without consuming an attempt or alerting |
| Things | host `/add-todo` HTTP bridge in `src/brief-promote.ts` | denies before fetch; the Slack-facing reaction caller receives false and therefore adds no success reaction |

Standalone/operator scripts outside these runtime entry points are not governed
by the daemon controller and remain an inventory item for capability manifests.
Other runtime integrations not yet routed through this controller include
Trafft writes, Chaos lifecycle HTTP delivery, Sertifier, and business tools
exposed directly inside other containers. Therefore P0.5 remains partial and
“global” means global across the seven named guarded systems,
not a claim of repository-wide revocation.

| Remaining perimeter | Current mutation path | Next control decision |
| --- | --- | --- |
| Chaos | toolbox event writer and durable lifecycle HTTP outbox | reconcile with the active Stripe/Chaos lineage before changing shared files |
| Booking/Trafft | host reads plus raw credential/tool exposure in the Booking container | separate read inventory from write capability, then retire writes behind typed host IPC |
| Certifier/Sertifier | Bash/shared-toolbox execution inside the Certifier container | move issuance behind a receipt-bound host action rather than trusting prompt policy |
| Contador/Sheets and standalone tools | container or operator scripts outside the daemon guard | inventory exact commands, then remove raw credentials or route each write through the host controller |

An already-running Courses container may retain its old raw SMTP mount and
credentials. `NC-20260816-004` adds a separate default-off capability
fingerprint that, when enabled, closes a stale warm/adopted container before its
next turn; it does not interrupt a turn already executing. A production
activation must therefore engage the brake before launch and drain/recycle
every Courses container before claiming that boundary effective. Retiring raw
Courses SMTP behind host IPC remains required.

## Action envelope and replay rule

The envelope contains SHA-256 target and payload digests, never their raw
values. Its fingerprint covers every field except the fingerprint itself. Any
post-creation mutation, wrong system/class/source, invalid validity window,
not-yet-valid or expired envelope, mismatched current target/payload/policy or
operator approval, absent C3-C5 approval, missing/mismatched exact durable
action claim, or previously claimed/confirmed/failed state is rejected before
invocation.

The first integration deliberately supplies no envelopes and leaves enforcement
off. This proves the contract and the emergency brake without silently moving
execution authority. Integrating a domain must adapt its existing durable claim
record to the envelope and pass its own mutation/replay suite before that domain
can enter enforcement mode.

## Activation gate

Production activation is a separate C5 task. It requires an immutable release,
config backup/rollback, zero active Courses containers followed by recycle,
the named Gmail/Slack/Courses/Plutio/Stripe/Hive/Things refusal drill, proof that
inbound and evidence reads continue, `/health.actionSafety` evidence, and
restoration to the prior default-off state. Enabling envelope enforcement is
later still: no
current legacy caller is authorized to bypass its missing-envelope denial.

## Bundled drill transaction

`NC-20260816-007` adds two release-owned operator surfaces. Both are dry-run by
default and reject unknown or duplicate arguments:

- `scripts/set-action-safety-mode.mjs` strictly parses the three controller
  keys, rejects duplicate keys/systems and envelope-enabled configuration,
  creates an exclusive same-directory backup, changes only the two brake keys
  through an atomic replacement, verifies the write, and requires the exact
  hostname for apply or restore.
- `scripts/run-action-safety-drill.mjs` requires a full expected release
  commit, verified release/code-root health, connected Gmail/Slack, zero active
  containers, an empty execution and Slack outbound queue, valid default-off
  action safety, and unchanged valid capability-manifest health. It arms global
  safe mode, prints the exact rollback path immediately, observes the running
  daemon report the brake, executes the installed refusal drill, restores the
  exact prior environment in `finally`, and observes default-off health again.

The installed refusal drill changes into a disposable directory containing
synthetic credentials before importing the real boundary modules. Gmail,
Plutio, Stripe, Hive, and Things receive injected tripwires that throw if their
guards permit client/child/outbox/Firestore/fetch execution; both Gmail new-send and
reply-send are exercised, with the reply's prerequisite read supplied by a
synthetic client. Slack is instantiated from the installed `sendMessage`
prototype without constructing the network-owning SDK, is never connected,
and must retain an empty local outbound queue. Courses must project neither
SMTP credentials nor the raw email-tool mount. All eight guarded operations
across the seven systems return `global_safe_mode`; the drill itself performs no
database or external-system write.

Example from inside an extracted release (dry-run first):

```bash
node scripts/run-action-safety-drill.mjs \
  --env-file /absolute/path/to/NanoClaw/.env \
  --expected-release <full-40-character-commit>
```

Apply additionally requires `--apply --confirm-host <exact-hostname>`. If the
process is terminated after arming, safe mode deliberately remains on rather
than guessing that restoration occurred. Use the already printed backup path:

```bash
node scripts/set-action-safety-mode.mjs \
  --env-file /absolute/path/to/NanoClaw/.env \
  --restore /absolute/path/to/NanoClaw/.env.rollback-action-safety-<timestamp> \
  --confirm-host <exact-hostname>
```

This transaction now proves operator control across the seven named runtime
systems only. It does not enable action-envelope enforcement, interrupt a
write already in flight, cover the residual standalone/integration surfaces,
or satisfy the later ceilings and automatic-demotion work.

## Live evidence — NC-20260816-007

The first production attempt on release `c2c2158` denied all six calls and
restored the exact environment, but constructing the Slack SDK for the
synthetic canary also initiated an asynchronous fake-token `auth.test`. It made
no authenticated account call, post, or queue entry. The attempt was not
accepted as completion; the canary was changed to exercise the installed
method without constructing the SDK, then rebuilt and redeployed.

The superseding immutable release is
`ab2ace1a658111131a2519e1cd7257fe8a207ffb`, source tree
`72dd932b92e79497e89d8170a547e027d64e42e4`, artifact hash
`cfbf6d3846a9a7c7748011ecd5d3fac109fee842b5e101e7b1056307d1e343b8`
across 652 files, and archive SHA-256
`a7b8ab3aaa4d82bcc4b0bcc745af3c495473ee33a47e260d586708fb975f3f31`.
It was independently verified locally and on `mini-claw.local`, then activated
with rollback plist
`com.nanoclaw.plist.rollback-c2c21585e086-2026-08-16T18-15-27-825Z`.

The clean apply drill retained environment backup
`.env.rollback-action-safety-2026-08-16T18-18-24-265Z`, observed the running
daemon in global safe mode, and returned `global_safe_mode` from Gmail new-send,
Gmail reply-send, Slack, Courses SMTP, Plutio, and Stripe. Every client, child,
and durable-outbox tripwire remained false; Slack queue depth stayed zero; and
Courses projected no SMTP secret or email mount. The drill emitted no Slack
authentication error. It restored the environment byte-for-byte: the live file
and backup both hashed to
`0c95d71db6cc751e57f8be40c88727d6bae675c05679fb0a6d1afcad1d16be73`.

Post-drill health showed the exact release under Node 22.23.2, one listener,
connected Gmail/Slack, zero active or waiting work, action-safety enforcement
false, global safe mode false, no disabled systems, and Campanero still the
only selectively enforced capability group. Aggregate evidence was unchanged:
61 confirmed and 6 blocked email actions, 334 send events, one completed
Campanero task, jobs hash
`b3fc5040565df2ff2f2bcdc962320a7ff27a69df9b56176b19de365da6ab164c`,
Plutio outbox 1,257 processed/15 dead, and Chaos outbox 5 sent. No real outbound
action or production business-row mutation was performed by the drill.

## Live evidence — NC-20260816-008

Immutable release `d32fda08e818bb803463f7006484abd19291b9e6` has source tree
`cff19fb332bac875d37e3a2ffa0e64bf86174005`, 652-file artifact hash
`d2b872659baaff5a51aba1f49401cfddd1340cb963452d5476561a47f41530a6`,
and archive SHA-256
`4c02b02b7f2664e7d2c3de34c86af225effb7e9738e860d2ee8bbfc36a09db1f`.
It was independently verified locally and on `mini-claw.local`, then activated
from `ab2ace1a658111131a2519e1cd7257fe8a207ffb`; rollback plist is
`com.nanoclaw.plist.rollback-ab2ace1a6581-2026-08-16T19-11-54-990Z`.

The clean apply drill retained environment backup
`.env.rollback-action-safety-2026-08-16T19-12-32-233Z`, observed the live
daemon in global safe mode, and returned `global_safe_mode` from Gmail
new-send, Gmail reply-send, Slack, Courses SMTP, Plutio, Stripe, and
Hive/Firestore. Every client, child, outbox, and Firestore tripwire remained
false; Slack queue depth stayed zero; and Courses projected no SMTP secret or
email mount. The live environment and backup both hash to
`0c95d71db6cc751e57f8be40c88727d6bae675c05679fb0a6d1afcad1d16be73`.

Final health showed exact release `d32fda08` under Node 22.23.2, one listener,
connected Gmail/Slack, zero active/waiting/outgoing work, action-safety
enforcement false, global safe mode false, no disabled systems, and Campanero
still the only selectively enforced capability group. Pre/post evidence matched
exactly: 61 confirmed/6 blocked email actions, 334 send events, one completed
Campanero task, jobs hash `b3fc5040565d`; Hive 110 eligible/0 unsynced/0 retry
attempts/0 dead letters; Plutio 1,258 processed/15 dead; and Chaos 5 sent. No
real outbound action or production business-row mutation was performed.

## Live evidence — NC-20260816-009

Immutable release `47019c937d38e9346813f6058484e12e3d577ef5` has source tree
`fa2e10c998aadfc8e00320b459c8b82902849c38`, 652-file artifact hash
`f4dec12cb563929536f4f9dc883c7dd27ead215535ed0e13a8bda13daf75bb1c`,
and archive SHA-256
`c4fd47a61e9cdc898a3c39ed53b411c87c6281ed25518e53f4437d1cb187cae4`.
It was independently verified locally and on `mini-claw.local`, then activated
from `d32fda08e818bb803463f7006484abd19291b9e6`; rollback plist is
`com.nanoclaw.plist.rollback-d32fda08e818-2026-08-16T19-39-11-903Z`.

The clean apply drill retained environment backup
`.env.rollback-action-safety-2026-08-16T19-40-01-708Z`, observed the live
daemon in global safe mode, and returned `global_safe_mode` from Gmail
new-send, Gmail reply-send, Slack, Courses SMTP, Plutio, Stripe,
Hive/Firestore, and Things. Every client, child, outbox, Firestore, and Things
fetch tripwire remained false; Slack queue depth stayed zero; and Courses
projected no SMTP secret or email mount. The live environment and backup both
hash to `0c95d71db6cc751e57f8be40c88727d6bae675c05679fb0a6d1afcad1d16be73`.

Final health showed exact release `47019c9` under Node 22.23.2, one matching
listener, connected Gmail/Slack, zero active/waiting/outgoing work,
action-safety enforcement false, global safe mode false, no disabled systems,
and Campanero still the only selectively enforced capability group. Pre/post
evidence matched exactly: 61 confirmed/6 blocked email actions, 334 send
events, one completed Campanero task, jobs hash `b3fc5040565d`; Hive 110
eligible/0 unsynced/0 retry attempts/0 dead letters; Plutio 1,259 processed/15
dead; and Chaos 5 sent. No real Things task, Slack reaction, outbound action,
or production business-row mutation was performed.
