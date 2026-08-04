# NC-20260803-003 Codex request R4 — forwarded-recipient binding

## Objective

Review only the post-R3 forwarded-recipient repair and return `CONVERGED` or
`CHANGES REQUIRED`. R3 converged on classification, parsing, persistence,
routing, and Gmail authority but correctly flagged that a forwarded inquiry
could still key the lead and future draft to the internal teammate.

## Safety boundaries

- No email, Slack, production data, deploy, commit, or service restart.
- No secrets, auth/session files, database dumps, or live customer content.
- Write only the response file named below.

## Changed surfaces to inspect

- `src/gmail-parser.ts` and test: `resolveForwardedIdentity` requires an
  authenticated Tandem-owned envelope, a Fw/Fwd subject, and an explicit
  Gmail/Apple/Outlook marker; resolves an external forwarded Reply-To/From.
- `src/channels/gmail.ts` and test: rule/hard-filter checks retain the envelope;
  classification/routing/persistence use the trusted external identity; the
  bounded Gmail grant includes both envelope and effective identities.
- `src/classify-ipc-handlers.ts` and test: preserves trusted `Forwarded-By`.
- `src/host-router.ts` and test: `[SOURCE: forwarded-email]` carries the external
  lead, marks `[FORWARDED-INQUIRY: send-new-email]`, and emits the internal
  conversation only as `Source-Thread-ID`, never `Thread-ID`.
- `groups/mailman/CLAUDE.md`, `groups/inbox/CLAUDE.md`,
  `groups/sales/CLAUDE.md`, `groups/chief/CLAUDE.md`: the external identity is
  used and the approved response is a new email; `Source-Thread-ID` cannot be
  recovered or copied as a reply thread.
- related architecture/project-map/active-work/changelog diffs.

Exact Node 22.23.2 focused validation now passes 5 files / 134 tests; typecheck
will be rerun again after this review.

## Required checks

1. External mail cannot spoof this identity override; the trust preconditions
   are sufficient and the resolved address cannot be Tandem-owned.
2. The original external identity survives both the direct rule route and the
   normal Mailman classification route.
3. Inbox/Sales/Chief cannot mistake the internal forwarding thread for the
   external customer's reply thread.
4. The approved response remains approval-bound and uses a normal new
   `gmail_send` to the external Party; this change itself sends nothing.
5. No regression to ordinary replies, relay Reply-To, hard filters, rule
   matching, proposal-reply detection, exact Message-ID recovery, or lead
   thread anchoring.
6. Any blocking missing test or documentation drift.

## Required response

Write only `docs/reports/NC-20260803-003-CLAUDE-RESPONSE-R4.md` with verdict,
blocking findings first, checks 1-6 with file/line evidence, and any non-blocking
notes.
