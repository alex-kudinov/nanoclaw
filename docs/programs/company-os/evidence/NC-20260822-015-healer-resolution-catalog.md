# NC-20260822-015 — Healer resolution catalog source evidence

Status: local read-only source candidate; committed and undeployed

Program: `program:company-os`

Work item: `work:self-healing-visible-resolution-loop`
Base: exact live release `1f474f90848452969e1e49db8c976f3f3b3d74e3`

## Contribution

Make the healer's existing diagnosis and proposed solution visible as one
stable resolution record instead of requiring the operator to remember a Slack
thread or inspect JSONB. This slice creates no runtime work and grants no action
authority.

## Source map and failure

The existing `business_v2.incidents` table is the durable incident authority:

- collector upserts deduplicate an open incident by `fingerprint`;
- diagnosis stores root cause, class, proposed fix, trust fields, and evidence;
- proposal/approval/implementation paths update the same incident row;
- verified remediation uses `resolved` plus `verified_fixed`;
- Slack threads and the daily digest are presentation surfaces.

The missing layer was a deterministic resolution view. The digest shows mostly
source, severity, occurrences, and raw error detail. The useful diagnosis and
solution live in the Slack thread or JSONB row. `needs_human` has no canonical
owner/decision/closure contract. `wont_fix` is excluded from the digest even
when it came from automatic external-outage routing rather than a named owner.
A process interruption can also leave a stored `diagnosed`, `investigating`,
`adversarial_review`, `triaging`, `remediating`, or `verifying` row unadvanced.

## Implemented read-only contract

`src/healer/resolution-catalog.ts`:

- selects one current open incarnation, otherwise the latest terminal row, per
  stable incident fingerprint;
- emits stable `healer:<fingerprint>` identity and a SHA-256 resolution
  fingerprint that changes only when resolution evidence/state changes;
- classifies `monitoring`, `verified_fixed`, named `decided_no_action`, and
  explicit pending-decision reason codes;
- treats automatically assigned `wont_fix`, unverified terminal, unknown,
  recurring, low-trust/manual, approval, unrouted diagnosis, and stale
  lifecycle states as visible pending decisions;
- bounds and redacts diagnosis/proposed-resolution text;
- represents evidence only by count and SHA-256;
- does not query or emit raw context, commands, diffs, proposal/thread
  identity, or investigation-log paths.

`src/healer/resolution-catalog-cli.ts` exposes the catalog as bounded text or
JSON. It has only `--limit` and `--json`; there is no write, apply, post, repair,
or decision-consumption mode. Source-contract tests keep it absent from the
daemon, scheduler, collector, approval, remediation, and implementation paths.

## State classification

| Existing incident state | Catalog disposition |
| --- | --- |
| `resolved` + `verified_fixed` | verified recovery |
| `wont_fix` + `proposal_rejected` | named no-action decision |
| `awaiting_approval` | pending exact approval decision |
| `needs_human` | pending evidence/manual-resolution decision |
| `recurring` | pending next-action decision |
| `wont_fix` without named rejection | pending external/no-fix confirmation |
| `resolved` without verified outcome | pending terminal-state review |
| non-transient `diagnosed` | pending unrouted-diagnosis review |
| intermediate state older than 30 minutes | pending stale-lifecycle review |
| supported fresh intermediate/transient diagnosis | monitoring |
| unknown state | pending source-integrity review |

## Verification

- focused catalog and CLI: 12/12 passed;
- complete healer suite: 22 files / 209 tests passed;
- pinned Node 22.23.2 typecheck passed;
- production build compilation passed;
- documentation continuity and diff checks passed;
- broad repository suite: 2,984 passed / 10 skipped; the sole failure is the
  unchanged base CNPC wrapper-literal assertion in
  `src/cnpc-prompt-contract.test.ts`.

No production database or provider was read. No migration, Company Work item,
Slack post, action, configuration, deployment, or restart occurred.

## Next milestone

Review/commit this source, then project only the minimized catalog fields into
Company Work with stable source identity, deduplicated observations, explicit
owner/decision receipts, and verified closure. Company Work—not Slack and not
`.program/state.json`—must be the runtime pending-decision authority.
