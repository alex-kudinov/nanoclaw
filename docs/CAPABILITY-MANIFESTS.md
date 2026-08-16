# Agent capability manifests

Status: implemented locally, enforcement default off, not deployed

Task: `NC-20260816-004`

## Purpose

Every tracked operative agent has one versioned JSON manifest under
`capabilities/`. The manifest records its owner, purpose, inputs, data domains,
Claude CLI tools, MCP tools, host IPC operations, mount targets and access,
network posture, action classes and approval policy, runtime ceilings, and SLO.
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
- the exact projection is fingerprinted into the runner input and adoption
  sidecar;
- a warm or adopted container without the current fingerprint is closed and
  cannot receive another turn.

An invalid boolean is treated as an attempted enablement and fails closed.
Dynamic registered folders without a tracked manifest cannot launch under
enforcement. Main identity selects `capabilities/main.json`; otherwise the
registered group folder selects the file.

## Change procedure

1. Edit the applicable manifest and any changed group procedure together.
2. Run `npm run capabilities:generate`.
3. Review the manifest diff and generated permissions-matrix diff. A newly
   exposed tool, mount, host operation, action class, or runtime ceiling is a
   security-relevant permission change.
4. Run `npm run capabilities:check`, focused negative tests, root typecheck and
   tests, the independent agent-runner build/tests, and
   `npm run docs:continuity-check` under `.nvmrc` Node.
5. Build and deploy only through the release process. Enabling enforcement is a
   separate production change requiring group-by-group launch, negative, warm
   revocation, and business-path canaries.

Rollback is configuration-only while the source remains installed: restore
`CAPABILITY_MANIFEST_ENFORCEMENT_ENABLED=0` and recycle affected containers.
Do not claim rollback or activation from source tests alone.

## Current limitations

- The tracked manifests truthfully record `unrestricted_current` network mode;
  they do not enforce destination-scoped egress.
- Several agents still receive `Bash` and raw mounted tools or credentials.
  P0.2 removal behind narrow host adapters remains open.
- Manifest action classes describe the permitted role envelope; the host's
  action-safety controller and domain policies remain the actual external-write
  authority.
- Host-defined base mounts are validated as a named plan, but their paths remain
  host-owned and intentionally absent from the tracked matrix.
- This milestone closes stale reuse at the next turn/adoption boundary. It does
  not kill an already executing model turn immediately.
- Production enablement, egress enforcement, per-action amount/rate ceilings,
  live negative canaries, and automatic autonomy demotion remain separate gates.
