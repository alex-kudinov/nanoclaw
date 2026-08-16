# Agent capability manifests

Status: Campanero and Booking selective production canaries live-verified;
global enforcement off

Tasks: `NC-20260816-004` foundation; `NC-20260816-006` staged activation;
`NC-20260816-010` credential-family projection and Booking gate

## Purpose

Every tracked operative agent has one versioned JSON manifest under
`capabilities/`. The manifest records its owner, purpose, inputs, data domains,
Claude CLI tools, MCP tools, host IPC operations, mount targets and access,
credential families, network posture, action classes and approval policy,
runtime ceilings, and SLO.
`docs/generated/CAPABILITY-MATRIX.md` is a deterministic review surface derived
from those files. It contains no host paths or credentials.

The manifest is an additional host boundary. It never replaces the narrower
Gmail resource grants, approval checks, action-envelope policy, mount allowlist,
or domain-specific idempotency and receipt rules.

## Modes

`CAPABILITY_MANIFEST_ENFORCEMENT_ENABLED=0` is the default. In this compatibility
mode, launch behavior remains unchanged: the runner receives the legacy Claude
tool surface, the full shared MCP catalog remains registered, and configured
mounts still pass through the existing action-safety filter and mount allowlist.
Manifests are nevertheless parsed for the inventory and health aggregate.

`CAPABILITY_MANIFEST_ENFORCED_GROUPS=campanero,booking` is the current
staged-rollout mode. It
enforces only the named tracked and currently registered folders while the
global switch remains off. Other registered groups retain compatibility mode.
Unknown, malformed, duplicate, or unregistered selected groups fail closed.
The list is intentionally explicit rather than a percentage rollout because a
container capability is an identity boundary, not traffic shaping.

`CAPABILITY_MANIFEST_ENFORCEMENT_ENABLED=1` enables the fail-closed projection:

- a missing or invalid selected manifest stops the launch;
- the manifest must declare the host-defined base mount plan;
- configured mount targets and write access must be declared;
- model, wall-clock, spawn, idle, memory, and CPU settings must fit the declared
  ceilings;
- Claude receives exact `--allowedTools` values instead of the MCP wildcard;
- the in-container MCP server registers only the selected tools;
- the host rejects message, task, and job IPC outside the selected host
  operation set;
- the host sends only the declared business credential families over container
  stdin; undeclared and newly introduced secret names fail closed;
- the exact projection is fingerprinted into the runner input and adoption
  sidecar;
- a warm or adopted container without the current fingerprint is closed and
  cannot receive another turn.

An invalid boolean is treated as an attempted enablement and fails closed.
Dynamic registered folders without a tracked manifest cannot launch under
global enforcement. Main identity selects `capabilities/main.json`; otherwise
the registered group folder selects the file.

Campanero is the first selected canary. Its authoritative group instructions
permit only the `jobs` MCP tool, so its manifest exposes no general Claude
tools, no shared MCP wildcard, and exactly that MCP/host-operation family. Its
configured `knowledge` and `agent_docs` mounts remain read-only. Read-only job
inventory is the permitted live canary; run, pause, and resume are excluded from
the canary even though the role can request those host-validated operations.

`NC-20260816-010` extends the same projection to business credential families.
Claude runtime authentication remains an explicit platform exception; path-only
runner inputs are also separate from business credentials. In compatibility
mode the legacy secret payload is unchanged. In enforced mode, the final stdin
projection allows only the selected manifest's families. Every tracked
manifest now records the current family inventory so a future selected group
does not gain credentials by accident when host code learns a new secret name.

Booking is the second selected canary. Its normal `booked` webhook write and the
Trafft reconciliation sweep already run on the host. The enforced Booking
manifest therefore omits `trafft` and keeps only its least-privilege
`business_db` connection plus the explicitly retained `plutio` family. Plutio
cannot yet be removed safely: the previously ignored, now tracked
`groups/booking/EXECUTION-STEPS.md` still uses it for canceled/rescheduled
events. Retiring that family requires a host-owned replacement and a separate
business-path gate.

`NC-20260816-011` implements that replacement as an unwired dark host adapter.
It validates archived event identity, persists an opaque outbox reference,
derives Plutio values from the archive at dispatch, passes mutation through the
common safety controller, and uses a stable remote marker for replay. It does
not change Booking's manifest, prompt, mounts, or current Plutio projection.
Promotion still requires a shared rescheduled-event identity fix, a natural
business-path canary, and proof that Plutio preserves the marker remotely.
Exact release `63ed4aa` deploys this dark code without changing the selected
groups or projected inputs. Its installed injected verifier made no database,
child-process, or network call; production still contains zero Booking-specific
Plutio outbox rows. This proves code installation and non-interference, not
capability removal readiness.

`NC-20260816-012` locally repairs the shared flattened reschedule identity and
packages the separately confirmed real-Plutio marker canary. It deliberately
does not change Booking's manifest, prompt, procedure, mounts, selected groups,
or credential projection: those are cutover changes, not marker-test changes.
Until the installed canary proves exactly one persistent marker and an
immediate no-write replay, Booking must continue to receive its declared
Plutio family and the dark host adapter must remain unwired.

## Change procedure

1. Edit the applicable manifest and any changed group procedure together.
2. Run `npm run capabilities:generate`.
3. Review the manifest diff and generated permissions-matrix diff. A newly
   exposed credential family, tool, mount, host operation, action class, or
   runtime ceiling is a security-relevant permission change.
4. Run `npm run capabilities:check`, focused negative tests, root typecheck and
   tests, the independent agent-runner build/tests, and
   `npm run docs:continuity-check` under `.nvmrc` Node.
5. Build and deploy only through the release process. Enabling enforcement is a
   separate production change requiring group-by-group launch, negative, warm
   revocation, and business-path canaries.

For a staged production change, use the bundled helper against the operational
environment file. It is dry-run by default, refuses global enforcement,
requires an exact hostname for apply, rejects duplicate keys, preserves all
other bytes, makes an exclusive same-mode backup, and atomically changes only
`CAPABILITY_MANIFEST_ENFORCED_GROUPS`:

```bash
node <release>/scripts/set-capability-groups.mjs \
  --env-file <absolute-operational-.env> \
  --groups campanero,booking

node <release>/scripts/set-capability-groups.mjs \
  --env-file <absolute-operational-.env> \
  --groups campanero,booking \
  --apply --confirm-host <exact-hostname>
```

After apply, require `/health.capabilityManifests.config` to report a valid
configuration with global enforcement false and only the intended groups.
Re-check active/waiting containers and relevant action queues before the first
turn. Do not infer an allowed/denied runtime result from the config response.

For the Booking gate, run the installed
`scripts/verify-booking-secret-projection.mjs` from the operational project
root after health confirms selection. It reads the real host configuration,
performs no network or database call, never prints secret values, and fails
unless all three configured Trafft source credentials are absent from the
projected Booking stdin payload while the declared DB and Plutio inputs remain.

## First production checkpoint

`NC-20260816-006` deployed combined immutable release `2987070` and selected
only `campanero`; `/health` reports a valid 17/17 catalog, global enforcement
false, and `enforcedGroups: ["campanero"]`. The exact live registration projects
no Claude tools, MCP `jobs` only, host operation `jobs_mutate` only, and
read-only `knowledge`/`agent_docs` mounts. A disposable instance of the deployed
production image mounted Campanero IPC read-only, exposed only
`mcp__nanoclaw__jobs`, omitted Bash, and returned the exact 22-job live snapshot
without requesting run, pause, resume, or any other mutation.

Post-canary checks found zero active/waiting NanoClaw containers, zero outgoing
Slack queue depth, zero actionable email sends, 22 jobs with the same 17
enabled, and the sole Campanero scheduled task still inactive with its unchanged
last run. The environment backup, prior-release plist, and all 18 prior runner
snapshots remain available for rollback. At that checkpoint this proved one
deliberately narrow agent; the second group required the separate gate below.

## Second production checkpoint

`NC-20260816-010` deployed immutable release `ba5fe74` and changed only the
selective group key from `campanero` to `booking,campanero`. `/health` reports
the exact release under Node 22.23.2, a valid 17/17 catalog, global enforcement
false, zero active/waiting containers, and zero outgoing Slack queue depth. The
environment and prior-release plist backups are retained.

The installed side-effect-free verifier read the real layered host
configuration and found all three Trafft source credential names configured
but none projected into Booking. It also found all five required DB/Plutio
names in Booking's eight-name projected payload. The verifier emitted only
names/counts and made no network or database call. Email actions remained 61
confirmed/6 blocked, send events remained 334, Campanero retained one completed
scheduled task, and Booking had no scheduled-task rows. This proves the
credential-name projection and non-interference boundary; it does not prove a
natural canceled/rescheduled Booking run or authorize removal of Plutio.

Rollback is configuration-only while the source remains installed: use the
same helper with an empty `--groups` value (or restore its exact backup), verify
the health aggregate returns to compatibility mode, and recycle affected
containers. Global rollback restores
`CAPABILITY_MANIFEST_ENFORCEMENT_ENABLED=0`. Do not claim rollback or activation
from source tests alone.

## Current limitations

- The tracked manifests truthfully record `unrestricted_current` network mode;
  they do not enforce destination-scoped egress.
- Several agents still receive `Bash` and raw mounted tools or credentials.
  Booking still receives Plutio: its narrow host adapter exists only as an
  unwired dark path and has not passed the separate natural-path/remote-marker
  promotion gate. All other raw-credential removal remains open.
- Manifest action classes describe the permitted role envelope; the host's
  action-safety controller and domain policies remain the actual external-write
  authority.
- Host-defined base mounts are validated as a named plan, but their paths remain
  host-owned and intentionally absent from the tracked matrix.
- This milestone closes stale reuse at the next turn/adoption boundary. It does
  not kill an already executing model turn immediately.
- Global enablement, destination-scoped egress, per-action
  amount/rate ceilings, raw-credential retirement, broader live negative
  canaries, and automatic autonomy demotion remain separate gates.
