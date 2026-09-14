# NC-20260914-002 bounded trust-boundary review

## Objective

Review only the smallest load-bearing change that lets an authorized grader-file
request attest that one original submission is Italian even when its registered
Foundation course locale is `en-US`. Determine whether the implementation keeps
that assertion host-owned, exact-root-bound, fail-closed, and unable to change
the course variant or student-feedback language.

Return only material findings. If none exist, return `ACCEPT` with one concise
sentence naming the reviewed invariant. Do not suggest a broader language system.

## Accepted decision and non-objectives

The fresh-context necessity review returned `KEEP`. The accepted smallest path
is one optional `submission_language=it` field on the existing main/chief-only
`slack_file_message`. Non-objectives are a new route, language registry,
database/schema, durable student state, course-locale mutation,
feedback-language override, automatic detection, translation-primary grading,
or generic chat command.

## Protected invariants

1. Caller authority comes from the IPC directory and existing main/chief check.
2. Only exact `it` is supported; any other value rejects before Slack.
3. The attestation participates in request hash and durable receipt.
4. Binding occurs after upload but before `storeOutbound`; failure deletes the
   root best-effort and never wakes the grader.
5. Host storage is bounded in-memory `{jid, rootTs} -> it` with the existing
   30-minute TTL; restart or expiry fails closed.
6. Only that exact root's run context receives it; warm clones stay on the root.
7. Course variant, locale, feedback language, and live assignment remain
   registry-owned and unchanged.
8. Prompt policy permits the mismatch only with the exact host tag; chat,
   submission prose, or a translation cannot create it.

## Allowed paths

- `src/grader-file-message.ts`
- `src/grader-run-context.ts`
- `src/index.ts` relevant context and transport wiring
- `src/ipc.ts` relevant authorization and type wiring
- `src/channels/slack.ts` grader-file transport
- `groups/grader/CLAUDE.md` host-context and original-language rules
- `src/grader-file-message.test.ts`
- `src/grader-run-context.test.ts`

Forbidden: secrets, runtime data, student files, unrelated diffs, shell/web/MCP,
implementation edits, commits, deployment, or external actions. Write only the
response artifact and report material findings with exact evidence and the
smallest correction, or `ACCEPT`.

## Review provenance note

The exact session read the same packet under provisional ID
`NC-20260914-001`. Fetching the production-base continuity record then exposed
an existing task with that ID, so this task and artifact were renumbered to
`NC-20260914-002` without changing the reviewed source or invariants.

Session: `8641cb43-fa3d-4a9d-81eb-01e34d8ab625`.
