# NC-20260829-001 final load-bearing correction review R5

Review only the two R4 findings and their final corrections.

## Corrections

1. Purchase closure catch-up:
   - migration 140 and the incident row now carry `closed_at`;
   - purchase sets `closed_at` once and bumps the incident version;
   - a closed incident is due only when its closure occurred after the last
     notification (`closed_at > last_notified_at`), so an unnotified reopen plus
     purchase still gets one closure reply regardless of version gap;
   - post-close sibling failures return before any incident mutation, so they
     cannot create another due version.
2. Rollback result scope:
   - `rollback_status()` is now defined in the outer Bash script immediately
     after `restore_current()`'s heredoc/function closes;
   - all four local failure paths call the outer function and report
     `rollback_succeeded=true|false` through the standard structured failure.

## Review files

Read only:

- `docs/reports/NC-20260829-001-CLAUDE-IMPLEMENTATION-CORRECTION-RESPONSE-R4.md`
- `src/checkout-recovery-store.ts`
- `data/business/migrations/nanoclaw-v2/140_checkout_failure_incidents.sql`
- `/private/tmp/toolbox-n8n-patch.ccYdsX/shared/n8n/tools/n8n/patch-workflow-nodes.sh`
- this request

Do not inspect credentials, environment, databases, logs, customer evidence,
or unrelated files.

## Response

Write only
`docs/reports/NC-20260829-001-CLAUDE-IMPLEMENTATION-CORRECTION-RESPONSE-R5.md`.
State whether the R4 residual and rollback-scope finding are closed. Add a new
finding only if the corrections create a load-bearing defect.
