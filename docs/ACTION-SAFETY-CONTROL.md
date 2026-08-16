# Host action safety control

Status: implemented and committed locally under `NC-20260816-002`; dark, not
pushed, deployed, or activated

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
  `gmail,slack,courses_smtp,plutio,stripe`.

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

Standalone/operator scripts outside these runtime entry points are not governed
by the daemon controller and remain an inventory item for capability manifests.
Other runtime integrations not yet routed through this controller include
Trafft writes, Hive/Firebase synchronization, Chaos lifecycle HTTP delivery,
the Things bridge, Sertifier, and business tools exposed directly inside other
containers. Therefore P0.5 remains partial and “global” means global across the
five named first-drill systems, not a claim of repository-wide revocation.
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
the named Gmail/Slack/Courses/Plutio/Stripe refusal drill, proof that inbound and
evidence reads continue, `/health.actionSafety` evidence, and restoration to
the prior default-off state. Enabling envelope enforcement is later still: no
current legacy caller is authorized to bypass its missing-envelope denial.
