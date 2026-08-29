# Certificate Manager — Execution Steps

Detailed procedures for New certificate, Missing info, Explicit campaign
send, Send, and Cancel. See `CLAUDE.md` for dispatch and collection.

All issuance goes through durable pending scripts. Each preset supplies its
versioned canonical campaign automatically. Pending scripts never contain
`--campaign-id`; campaign selection and provider readback belong to
`issue-certificate.sh`.

## Pending Script Lifecycle

### Phase 1a — Complete request → pending review

When preset, full name, confirmed email, and all required attributes exist:

1. `mkdir -p /workspace/group/pending`
2. Compute the next three-digit ID across `pending/*.sh` and
   `pending/drafts/*.sh`.
3. Write `/workspace/group/pending/{id}.sh` from the template below.
4. Read the script back from disk.
5. Post `[CERTIFICATE REVIEW]` from the script and wait for `send` or ✅/👍.

Use:

```bash
next_id=$(printf '%03d' $(( $(ls /workspace/group/pending/*.sh /workspace/group/pending/drafts/*.sh 2>/dev/null | grep -c '\.sh$') + 1 )))
```

### Phase 1b — Email missing → `AWAITING_EMAIL` draft

When preset and name are known but email is not confirmed:

1. Run the Heartbeat name lookup once.
2. Write `/workspace/group/pending/drafts/{id}.sh` with
   `--email "AWAITING_EMAIL"` and comment marker ` (awaiting email)`.
3. Present lookup results as suggestions; never store a suggestion as the
   confirmed email.
4. Ask for the email or a reaction accepting the one unambiguous suggestion.

Drafts are never sendable.

### Phase 1c — Email confirmation

1. Find the matching `AWAITING_EMAIL` draft; ask when ambiguous.
2. Resolve the explicit email typed by the user or the single accepted lookup
   suggestion.
3. Rewrite `--email`, remove the marker, and move the script into `pending/`.
4. Read it back, post `[CERTIFICATE REVIEW]`, and wait for a new `send`.

A reaction to the missing-email ask confirms only the email, not issuance.

### Phase 1d — Explicit campaign send

The exact owner command below can authorize same-turn issuance:

```text
send ai for coaches to person@example.com
```

Enter this phase only after
`/workspace/extra/sertifier/tools/sertifier/prepare-send-command.sh --text`
returns `authorized:true` plus exact `preset`, `name`, and `email` for the
complete message. This deterministic preparation
runs before generic bare-`send` handling. Grader handoffs, attachment/batch
messages, unknown aliases, multiple emails, and attribute-bearing presets do
not enter this phase.

1. Use only the preset, name, and email returned by the authorized preparation
   receipt; never re-parse or substitute values from memory.
2. The preparation tool has already enforced one nonblank, case-insensitive
   exact Heartbeat match.
3. If identity fails, write `pending/drafts/{id}.sh` with
   `--name "AWAITING_NAME"`, the confirmed email, and comment marker
   ` (awaiting name; explicit send not retained)`. Ask for the certificate
   name. A later name reply promotes the draft to normal review and waits for
   a new `send`.
4. If identity passes, write the normal pending script with the resolved
   name/email and comment marker ` (explicit campaign send authorized)`.
5. Read that exact script back and run it once with `--send` in the same turn.
6. Branch on the structured receipt:
   - `issued` AND `emailConfirmed:true`: archive to `completed/`; report
     recipient, preset, canonical campaign key/ID, credential URLs, and
     confirmed email.
   - `already_issued`: archive to `completed/`; report duplicate-safe no-op,
     no add, and no resend. Show the existing credential receipt.
   - `issued_pending_reconciliation`, `emailConfirmed:false`, malformed
     output, or ambiguous/API failure: move the script to
     `pending/uncertain/`, post `[CERTIFICATE HOLD]`, and never retry.
7. Log Plutio activity only for a newly `issued`, email-confirmed credential.

If the deterministic parser returns `attributes_required`, continue the
normal collection flow, ask for all missing attributes at once, and use the
standard review gate. Do not attempt an immediate send.

### Phase 2 — Corrections

1. Identify the exact pending script; ask when multiple are ambiguous.
2. Rewrite only the corrected values.
3. Read it back from disk.
4. Re-post `[CERTIFICATE REVIEW]`.

The script ID remains unchanged.

### Phase 3 — Send an existing review

Triggered by a bare `send`/`send it`/`go ahead`, or ✅/👍 on a
`[CERTIFICATE REVIEW]`.

1. Count only `/workspace/group/pending/*.sh`. Draft and uncertain scripts are
   not sendable.
2. One script: continue. Zero: handle a matching identity draft or report
   nothing pending. More than one: list and ask which ID.
3. Run the selected script exactly once with `--send`.
4. Branch on the receipt:
   - `issued` AND `emailConfirmed:true`: archive, report campaign/credential
     receipt, and log Plutio.
   - `already_issued`: archive, report no-op/no resend, do not log issuance.
   - pending reconciliation, false email confirmation, malformed output, or
     ambiguous/API failure: move to `pending/uncertain/`, post
     `[CERTIFICATE HOLD]`, and never retry automatically.
5. Campaign ID, API acceptance, or `emailRequested:true` alone is not
   issuance/delivery completion.

### Phase 4 — Cancellation

1. Look in `pending/*.sh` and `pending/drafts/*.sh`, never `uncertain/`.
2. If exactly one matching request exists, remove it.
3. If multiple are possible, ask which ID.
4. Post `Certificate request #{id} cancelled.`

An uncertain script is evidence of possible provider acceptance and must not
be deleted through ordinary cancel; it requires read-only reconciliation.

## Pending Script Template

```bash
#!/usr/bin/env bash
# {Name} — {Preset Description} ({key attributes summary})
set -euo pipefail
export PATH="/workspace/extra/sertifier/tools/sertifier:$PATH"
MODE="${1:---dry-run}"
TOOLBOX_LIB=/workspace/extra/toolbox-lib \
TOOLBOX_PROJECT_ROOT=/workspace/extra/sertifier \
  bash /workspace/extra/sertifier/tools/sertifier/issue-certificate.sh \
  --name "{name}" \
  --email "{email}" \
  --preset {preset} \
  {--attribute-flag value} \
  {--issue-date YYYY-MM-DD} \
  {--expire-date YYYY-MM-DD} \
  "$MODE"
```

Rules:

- Bare execution stays dry-run; Gru uses `--send` only through Phase 1d or 3.
- Always use `set -euo pipefail` and quote name/email values.
- Include only applicable, nonempty attribute/date flags.
- Never include `--campaign-id`; it is an operator-only recovery override.
- `AWAITING_EMAIL` and `AWAITING_NAME` scripts live only under `drafts/` and
  are rejected by the issuance tool.
- The comment is the durable human-readable summary and authorization marker.

## Multiple Pending Certificates

List each sendable `pending/*.sh` by ID and its first comment line. Drafts may
be shown only when marked awaiting identity; uncertain scripts are held and
never presented as send choices.

```text
Multiple certificates pending:
#001 — Jane Doe — ICF Level 1 (68 hours)
#002 — John Smith — PCC with ACTC (80 ACTC, 140 L2)
Which one? (reply with the number)
```

## Confirmation Summary

Generate this only by reading the pending script:

```text
[CERTIFICATE REVIEW]

Pending #001
Recipient: {full name}
Email: {email}
Certificate: {preset description} ({preset code})
Issue Date: {date or "today"}
{Expiration: {date} — only if present}

Attributes:
- {attribute title}: {value}

Reply "send" or react ✅ to issue, or reply with corrections.
```

## Activity Logging (Plutio)

Only after a newly `issued`, reconciled, email-confirmed credential, look up or
create the Plutio person by email and log:

```text
[CERTIFICATE] {preset code} issued
```

Do not log `already_issued`, held, failed, or pending-reconciliation attempts.
Plutio failure is non-blocking and never changes the Sertifier receipt.
