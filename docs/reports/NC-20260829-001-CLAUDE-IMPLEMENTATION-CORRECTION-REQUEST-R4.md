# NC-20260829-001 implementation correction review R4

Review only the two corrections to implementation-review findings R3.

## Prior findings and corrections

1. Closed incident reopening:
   - a case already bound to a closed incident now returns that incident without
     changing version, failure time, or notify time;
   - the due query admits a closed incident only for its one purchase closure
     version, when `version=notified_version+1` and no failure occurred after
     the prior notification;
   - focused source coverage asserts both guards.
2. Silent n8n rollback failure:
   - every patch/readback/active-state failure now captures the exact
     `restore_current` result and reports `rollback_succeeded=true|false`;
   - the exit result is no longer swallowed; focused toolbox coverage asserts
     the signal exists.

## Review files

Read only:

- `docs/reports/NC-20260829-001-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R3.md`
- `src/checkout-recovery-store.ts`
- `/private/tmp/toolbox-n8n-patch.ccYdsX/shared/n8n/tools/n8n/patch-workflow-nodes.sh`
- this request

Do not inspect credentials, environment, databases, logs, customer evidence,
or unrelated files.

## Response

Write only
`docs/reports/NC-20260829-001-CLAUDE-IMPLEMENTATION-CORRECTION-RESPONSE-R4.md`.
State whether both material findings are closed. Add a new finding only if a
correction creates a load-bearing defect.
