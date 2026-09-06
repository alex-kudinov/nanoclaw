# NC-20260906-001 — graduate announcement correction review R2

## Objective

Verify only the two load-bearing corrections made in response to R1. Report
material defects in those corrections only; do not reopen already-cleared
design questions.

## R1 findings and corrections

1. The duplicate guard previously searched for the registrar URL as an
   unbounded substring. It now requires the exact HTML anchor attribute
   `href="<registrar URL>"`, so certificate-number prefixes cannot collide.
   The regression suite now includes an existing thread for `CERT-1234` while
   evaluating `CERT-123` and requires the result to remain `dry_run`.
2. The certificate number now has a conservative URL-safe character-class
   gate, and the constructed registrar URL is HTML-escaped before interpolation
   into the public thread message.

## Required invariants

- An exact prior post returns `already_announced` without a PUT.
- A prefix-collision post does not return `already_announced` and performs no
  PUT during dry-run.
- Provider-derived certificate-number content cannot break the link attribute.
- Dry-run and live-confirmation behavior remain unchanged.

## Review paths

Read only this request and these two artifacts:

1. `/private/tmp/toolbox-graduate-announcements/shared/sertifier/tools/sertifier/announce-graduate.sh`
2. `/private/tmp/toolbox-graduate-announcements/shared/sertifier/tests/test-announce-graduate.sh`

Do not inspect credentials, provider records, unrelated files, or external
systems. Do not edit implementation files.

## Verification already run

- Updated announcement regression suite: pass.
- Existing Sertifier component suite: pass.
- Existing canonical-campaign suite: pass.
- Both affected registries parse as valid JSON.

## Response

Write only to:
`/private/tmp/nanoclaw-graduate-announcements/docs/reports/NC-20260906-001-CLAUDE-REVIEW-RESPONSE-R2.md`

If no material defects remain, say `NO MATERIAL FINDINGS` and name the exact
contracts checked.
