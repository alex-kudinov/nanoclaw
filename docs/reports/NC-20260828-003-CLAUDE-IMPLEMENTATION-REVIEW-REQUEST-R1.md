# NC-20260828-003 — independent implementation review request

Review the bounded correction below using Sonnet with high effort. Do not edit
files. Return material findings only, with exact file/line evidence and a final
`NO MATERIAL FINDINGS` when none remain.

## Trigger and required outcome

Gru's canonical-campaign fast path accepted only
`send <preset alias> to <email>`. The owner naturally typed a multiline
`issue coaching tools to` followed by `Name <email>`, so the message fell into
ordinary review even though it contained one explicit recipient and an
attribute-free preset.

The correction must accept both `send` and `issue`, with either a bare email or
one optional human-readable name plus one angle-bracketed email. It must remain
anchored to the complete message, resolve aliases exactly, authorize only
attribute-free presets, resolve the authoritative identity from one exact
Heartbeat email match, and reject a typed name that does not match that
identity. Batch/attachment messages, multiple emails, unknown aliases,
ambiguous/blank/mismatched identity, and required-attribute presets must remain
non-immediate.

When an authorized explicit command exactly matches one existing pending
name/email/preset script, Gru must reuse and execute that durable script once
instead of creating a duplicate. More than one match must hold. The pending
script calls the current issue tool and therefore already uses the canonical
campaign; Gru must not invent an alternate path or pass a campaign ID.

## Allowed review files

Toolbox:

- `/Users/xbohdpukc/dev/toolbox-sertifier-campaigns-20260828/shared/sertifier/tools/sertifier/parse-send-command.sh`
- `/Users/xbohdpukc/dev/toolbox-sertifier-campaigns-20260828/shared/sertifier/tools/sertifier/prepare-send-command.sh`
- `/Users/xbohdpukc/dev/toolbox-sertifier-campaigns-20260828/shared/sertifier/tests/test-canonical-campaigns.sh`
- `/Users/xbohdpukc/dev/toolbox-sertifier-campaigns-20260828/shared/sertifier/registry.json`

NanoClaw:

- `/Users/xbohdpukc/dev/NanoClaw-sertifier-campaigns-20260828/groups/certifier/CLAUDE.md`
- `/Users/xbohdpukc/dev/NanoClaw-sertifier-campaigns-20260828/groups/certifier/EXECUTION-STEPS.md`
- `/Users/xbohdpukc/dev/NanoClaw-sertifier-campaigns-20260828/src/certifier-prompt-contract.test.ts`

Do not inspect `.env`, credentials, provider/customer records, Slack history,
pending/completed scripts, or unrelated repository files.

## Verification already run

- toolbox canonical campaign suite: PASS
- NanoClaw Certifier prompt contract: 4/4
- NanoClaw documentation continuity/capability check: PASS
- diff checks: PASS

## Questions

1. Can any accepted grammar produce more than one recipient/email or admit an
   attachment/batch tail?
2. Can a supplied name bypass the exact Heartbeat name check or can the typed
   name leak into issuance instead of the resolved identity?
3. Did the new `issue` form weaken alias uniqueness, attribute gates, ordinary
   review, duplicate prevention, pending durability, or uncertain-result holds?
4. Is the exact-existing-pending reuse contract sufficiently unambiguous and
   safe against multiple matches?
5. Are the tests materially adequate for the new behavior and preserved
   negative cases?
