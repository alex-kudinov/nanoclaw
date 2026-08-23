# NC-20260822-016 — Healer Company Work projection plan

Status: local default-dry-run source candidate; uncommitted and undeployed

Program: `program:company-os`

Work item: `work:self-healing-visible-resolution-loop`

Base checkpoint: `6703de6e`

## Compatibility finding

The live Company Work schema supports only `sales_email`, `host_job_run`, and
`program_facts_drift`, each with a fixed identity and completion definition.
Using one of those workflow types for healer incidents would make reports,
closure receipts, and lifecycle validation false. The current core item also
has no general owner field. This slice therefore does not call a ledger writer
or fabricate compatibility.

## Dry-run contract

`src/healer/company-work-projection.ts` declares the future contract:

- workflow: `healer_resolution`;
- completion: `healer_resolution_receipt`;
- observations: `business_v2.company_healer_resolution_observations`;
- source system: `healer_resolution_catalog`;
- source key: stable catalog `healer:<fingerprint>`;
- evidence: catalog `resolutionFingerprint` only;
- block code: normalized `healer:<decision-code>`;
- owner: explicit `unassigned` until a real owner source exists.

The pure reconciler plans:

| Catalog/existing state | Planned operation |
| --- | --- |
| new pending decision | `ensure_blocked` |
| exact blocked replay | `no_op` |
| changed blocked evidence | `update_blocked` |
| pending decision after terminal state | `reopen_blocked` |
| verified recovery with existing open work | `close_verified` |
| named rejection with existing open work | `close_decided_no_action` |
| monitoring while decision work exists | `hold_for_verification` |
| monitoring/terminal state without work | `no_op` |

`healer:company-work-plan` reads the minimized resolution catalog and emits
only the plan. It accepts `--json` and `--limit`; `--apply` is rejected. No
Company Work reader or writer is imported because the required workflow does
not yet exist.

## Verification

- projection/CLI focused tests: 9/9 passed;
- complete healer suite: 24 files / 218 tests passed;
- pinned Node 22.23.2 typecheck and production build passed;
- documentation continuity and diff checks passed;
- broad repository suite: 2,993 passed / 10 skipped; the sole failure is the
  unchanged base CNPC wrapper-literal assertion;
- schema incompatibility is explicit rather than bypassed;
- source-contract tests keep the plan absent from daemon, scheduler, healer
  execution paths, and `company-work-ledger.ts`.

No migration, production read/write, Company Work row, trigger, observation,
receipt, Slack message, healer action, configuration, deployment, or restart
occurred.

## Next milestone

Add a separately reviewed migration and host-only adapter for the declared
workflow, content-minimized observations, explicit owner/decision receipts,
Company Work report support, and default-off apply. Rehearse it in disposable
PostgreSQL before any deployment or live projection.
