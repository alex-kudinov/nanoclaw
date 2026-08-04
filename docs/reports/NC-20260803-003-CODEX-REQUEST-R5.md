# NC-20260803-003 Codex request R5 — authenticated recipient binding

## Objective

Review the bounded repair for R4's one blocking finding and the adjacent
structural hardening. Return `CONVERGED` or `CHANGES REQUIRED`.

## Safety boundaries

- No email, Slack, production data, deploy, commit, or service restart.
- No secrets, auth/session files, database dumps, or live customer content.
- Write only the response file named below.

## R4 blocker and repair

R4 correctly found that the own-domain RFC `From:` was forgeable. The repair:

- `src/gmail-parser.ts`: `resolveForwardedIdentity` now requires the first
  `Authentication-Results` field to be Gmail-authored (`mx.google.com`) and to
  contain an aligned `dmarc=pass header.from=` or
  `dkim=pass header.i=` for the exact Tandem From domain. Missing, failing, or
  non-Google authentication returns `null`.
- Forwarded identity scanning is restricted to explicit forwarded header
  blocks; a later body `Reply-To:` cannot outrank the first block's `From:`.
- Synthesized agent headers strip CR/LF.
- `src/channels/gmail.ts`: raw headers are passed to the resolver. A resolved
  forward does not grant Mailman the teammate's internal forwarding thread.
- `src/classify-ipc-handlers.ts`: the normal Mailman route re-resolves the
  external sender from the host-stored top `From:` when the host-stored
  `Forwarded-Inquiry: yes` marker is present, overriding a disagreeing model
  `sender_email`.
- `src/host-router.ts`: contador, archivarista, and procurement now use the
  same forwarded `Source-Thread-ID` audit-only shape rather than a replyable
  `Thread-ID`.
- Tests use synthetic identities only and cover missing/forged authentication,
  header-block scoping, host-truth override, and withheld thread grant.
- ACTIVE-WORK, architecture, project map, and changelog now state the actual
  authentication and thread-grant controls.

Pinned Node 22.23.2 validation after the repair: typecheck clean; five focused
files pass 136/136 tests.

## Required checks

1. The authentication-result parser fails closed against a forged Tandem
   `From:` and a sender-injected `Authentication-Results` field while accepting
   realistic aligned Gmail DMARC/DKIM results.
2. The first-forwarded-header-block resolution cannot be redirected by later
   quoted body headers.
3. The external identity is host truth on both direct and Mailman routes.
4. No component can reply on the internal teammate thread for a resolved
   forward; it remains audit/recovery metadata only.
5. Ordinary replies, relay Reply-To, hard filters, rules, proposal replies,
   Message-ID recovery, and approval-bound sending remain unchanged.
6. Tests and authoritative docs accurately cover the implemented controls.

## Required response

Write only `docs/reports/NC-20260803-003-CLAUDE-RESPONSE-R5.md` with verdict,
blocking findings first, checks 1-6 with file/line evidence, and any
non-blocking notes.
