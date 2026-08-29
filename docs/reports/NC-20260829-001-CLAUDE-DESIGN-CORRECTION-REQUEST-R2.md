# NC-20260829-001 checkout design correction review R2

Review only the two load-bearing corrections made in response to R1.

## Prior findings

1. Corrected n8n reactivation preceded quarantine of 42 still-retryable
   historical WordPress facts.
2. The 30-minute incident had no fixed anchor or atomic find-or-create boundary.

## Corrections

- `docs/CHECKOUT-FAILURE-RECOVERY.md` now requires a protected queue backup,
  exact option move/clear, deletion and zero readback of every retry cron event,
  and a new source epoch **before** any corrected n8n webhook is activated.
  Tandemweb source deploy precedes n8n patching; new events may queue safely
  during the remaining maintenance window, while held events cannot drain.
- Migration 140 now includes a dedicated incident table and append-only
  incident-case relation. The first case `started_at` is a non-rolling
  30-minute anchor. Find-or-create takes a PostgreSQL advisory lock over the
  minimized grouping tuple, re-reads under lock, and uses unique incident/case
  constraints plus `ON CONFLICT` replay safety.
- Notification waits for five quiet minutes, capped at the fixed episode end.
  One stable Slack thread key produces one root; any genuinely later material
  update is a reply, not another root.

## Review boundary

Read only:

- `docs/CHECKOUT-FAILURE-RECOVERY.md`
- `docs/reports/NC-20260829-001-CLAUDE-DESIGN-REVIEW-RESPONSE-R1.md`
- this request

Do not inspect environment files, credentials, databases, runtime logs, raw
customer/provider evidence, or unrelated source.

## Response

Write only
`docs/reports/NC-20260829-001-CLAUDE-DESIGN-CORRECTION-RESPONSE-R2.md`.
Report whether each prior material finding is closed. Add a new material
finding only if the correction itself creates a load-bearing defect.
