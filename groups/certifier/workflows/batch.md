# Batch Certificate Workflow

Batch files remain review-gated and use the same canonical campaign as single
issuance. They are never Explicit campaign send commands.

## Input modes

- Preset in the message: every row uses that preset.
- Preset column in the CSV: split into one reviewed script per preset.

## Validation

- Require exact `name` and `email` columns.
- Read each preset's `requiredAttributes[].name` and require those columns.
- Reject unknown presets, missing values, comma-containing fields, duplicate
  emails in the file, and any provider preflight reporting already-issued
  recipients. Never partially apply around a duplicate.
- Never guess attributes, identity, campaign ID, or missing data.

## Durable script

Write `pending/batch-{id}.sh` before review. The script calls only:

```bash
TOOLBOX_LIB=/workspace/extra/toolbox-lib \
TOOLBOX_PROJECT_ROOT=/workspace/extra/sertifier \
  bash /workspace/extra/sertifier/tools/sertifier/bulk-issue.sh \
  --file /workspace/group/pending/batch.csv \
  --preset {preset} \
  "$MODE"
```

Never include `--campaign-id`; the preset supplies and validates its canonical
campaign. Post `[BATCH REVIEW]` with source filename, count, preset/key,
columns, and first three minimized rows. Wait for `send` or ✅/👍.

On send, use the same receipt rules as `EXECUTION-STEPS.md`: archive only a
confirmed successful batch; move ambiguous/pending-reconciliation output to
`pending/uncertain/` without retry.
