# NC-20260803-003 Claude response R4 — forwarded-recipient binding

Reviewer: Claude (Opus 5), independent read of the post-R3 forwarded-recipient
repair on `codex/nc-20260803-003-forwarded-email-recovery` (base `0b6ccf1`).
Date: 2026-08-04T00:20Z (local 2026-08-03 19:20 CDT).

## Verdict

`CHANGES REQUIRED` — one blocking finding on check 1. Checks 2–6 hold. The
blocking gap is narrow and one header check closes it; nothing else in the R4
surface needs rework.

## Blocking finding

### 1. The "authenticated Tandem-owned envelope" precondition is not
authenticated — it is a forgeable `From:` header

`resolveForwardedIdentity` gates the identity override on
`isOwnAddress(bareAddress(headers.from))` (`src/gmail-parser.ts:63-64`, with
`isOwnAddress` at `:28-33` and the domain list at `:8-12`). `headers.from` is
the RFC 5322 `From:` header returned by the Gmail API
(`src/gmail-parser.ts:parseEmailHeaders`) — it is not an envelope, and nothing
in the change verifies SPF/DKIM/DMARC. `grep -rin "authentication-results|dkim|
dmarc" src` returns **no matches** anywhere in the codebase, so no
authentication signal is consulted at any layer of this path.

Both the code comment (`src/gmail-parser.ts:54-58`, "authenticated envelope"),
the grant comment (`src/channels/gmail.ts:474-478`, "host-derived only from an
authenticated internal envelope"), and the tracked record
(`docs/ACTIVE-WORK.md`, "an authenticated Tandem-owned forwarding envelope";
`docs/ENGINEERING-CHANGELOG.md`, "an explicit forward from a Tandem-owned
envelope") assert a control that the diff does not implement. The regression
that is supposed to cover this — "does not trust forwarded-looking headers from
an external envelope" (`src/gmail-parser.test.ts:328-337`) — only proves that a
*visibly external* `From:` is rejected. It does not test the case that matters:
an external sender who writes `From: Cherie Silas <cherie@tandemcoach.co>`.

Failure scenario: an external attacker sends to `info@` with
`From: "Cherie Silas" <cherie@tandemcoach.co>`,
`Subject: Fwd: Level 1 registration`, and a body containing
`---------- Forwarded message ---------` / `From: Victim <attacker@evil.tld>`.
The host then (a) binds the work item's lead identity to `attacker@evil.tld`
(`src/channels/gmail.ts:455-465`, `:563`, `:617`), (b) adds that
attacker-chosen address to Mailman's bounded Gmail grant
(`src/channels/gmail.ts:480-492`), which is exactly the set that scopes
`gmail_search` (`src/gmail-ipc-policy.ts:233-240`), and (c) hands Sales a
`[SOURCE: forwarded-email]` / `[FORWARDED-INQUIRY: send-new-email]` work item
whose prompts instruct the agent to treat the address as the *host-resolved*
external lead and to compose a new outbound email to it
(`groups/sales/CLAUDE.md:86`, `groups/inbox/CLAUDE.md:130-136`). The send
itself stays approval-bound, so this is not a silent-exfiltration hole — but the
operator's approval decision is being made against an identity the system
presents as host-verified, and a CRM party is created from it. This is the one
place in the diff where a trust label is applied to attacker-controllable data.

Mitigating context, stated fairly: Google's inbound spoofing protection will
usually spam-folder external mail forging an internal `From:`, and SPAM/TRASH
are dropped before this code runs (`src/channels/gmail.ts:430-438`) — in push
mode only. That is an external control the repository neither owns nor asserts,
and it depends on the current DMARC policy for all three domains in
`OWN_DOMAIN_SUFFIXES`.

Minimal fix: `headerMap` (all raw headers, lower-cased) is already built in
`fetchAndProcess` (`src/channels/gmail.ts:487-490`). Pass it to
`resolveForwardedIdentity` and require the Gmail-added `Authentication-Results`
to show `dmarc=pass` (or `dkim=pass header.i=` on the own domain) for the
own-domain `header.from`; return `null` otherwise. Add the missing regression —
spoofed own-domain `From:` with no passing authentication → `null` — and align
the two code comments plus the ACTIVE-WORK/changelog wording with whatever is
actually enforced.

## Check 2 — external identity survives both routes

Holds on the direct rule route; holds on the Mailman route with a model
dependency worth noting.

- Direct route: `effectiveSenderEmail`/`effectiveSenderName`/
  `effectiveSenderHeader` (`src/channels/gmail.ts:455-465`) flow into the
  classification payload (`:563`), the durable pre-route row (`:607`), the route
  params (`:617-632`), and the ordinary `onMessage` row (`:672`). The envelope
  Reply-To is deliberately dropped for a forward (`:621-623`) so
  `leadEmail()` (`src/host-router.ts:49-51`) cannot fall back to the relay
  address. End-to-end assertion at `src/channels/gmail.test.ts:250-310`.
- Mailman route: the agent-facing content carries the external author on the
  top-level `From:` plus `Forwarded-Inquiry: yes` and
  `Forwarded-By: <internal>` (`src/gmail-parser.ts:244-268`, asserted at
  `src/gmail-parser.test.ts:303-323`), and `routeAfterClassify` re-reads the
  host-written header region to recover the trusted `Forwarded-By`
  (`src/classify-ipc-handlers.ts:222-231`, `:254-255`; regression at
  `src/classify-ipc-handlers.test.ts:305-320`). The `Forwarded-By` value is
  host-authored, so it is trustworthy. `senderEmail`, however, is still
  `data.sender_email` — model-supplied — and the external binding on this route
  depends on Mailman obeying `groups/mailman/CLAUDE.md:130-134`. See
  non-blocking note 1.

## Check 3 — internal forwarding thread cannot be mistaken for the customer's

Holds at the handoff layer. `sourceThreadLines` (`src/host-router.ts:57-72`)
emits `[FORWARDED-INQUIRY: send-new-email]`, `Forwarded-By`,
`Source-Thread-ID` and `Message-ID` — never `Thread-ID` — and is used by
`fmtLeadSales` (`:96`), `fmtInbox` (`:125`), `fmtClientResponse` (`:140`) and
`fmtChiefEscalation` (`:159`). Asserted with an anchored negative
(`not.toMatch(/^Thread-ID:/m)`) at `src/host-router.test.ts:110-129` and
`:155-174`, the latter also confirming the lead thread key stays
`lead:alice@corp.com`.

Two structural reinforcements I verified independently:

- `propagateGmailResources` matches `^\s*Thread-ID:` (`src/gmail-ipc-policy.ts`
  `THREAD_ID_RE`), which does **not** match `Source-Thread-ID:`. A forwarded
  handoff therefore propagates no thread grant to Inbox/Sales/Chief, so the
  internal thread is not merely un-named — it is unreachable for them.
- Chief holds `gmail_read` only and Sales holds `gmail_search`/
  `gmail_get_thread` with no thread grant (`src/gmail-ipc-policy.ts:28-39`), so
  neither can pull the teammate's thread even if it leaked into prose.

Prompt coverage matches: `groups/inbox/CLAUDE.md:130-136`,
`groups/sales/CLAUDE.md:86` and `:143-146`, `groups/chief/CLAUDE.md:54-64`.

## Check 4 — approval-bound new email; this change sends nothing

Holds. `routeClassifiedEmail` writes IPC handoffs only
(`src/host-router.ts:223-234` `safeWrite`); no send path is added or altered in
this diff. Send capability remains Mailman-only
(`src/gmail-ipc-policy.ts:28-39`), and the approval + Gmail-receipt guard is
untouched. The forwarded work item reaches Sales without a reply thread, so the
approved response is necessarily a new `gmail_send` to the host-resolved
external address, which is what all four group prompts now state.

## Check 5 — no regression to the adjacent paths

Holds; I traced each named path.

- **Ordinary replies:** `resolveForwardedIdentity` returns `null` unless all
  three preconditions hold (`src/gmail-parser.ts:63-75`), so every non-forward
  keeps `headers.from`/`fromName` verbatim, and `sourceThreadLines` falls to the
  pre-existing `Thread-ID`/`Message-ID` shape (`src/host-router.ts:68-71`).
- **Relay Reply-To:** unchanged for non-forwards (`src/channels/gmail.ts:621`);
  the Encharge-style relay never satisfies the own-domain precondition. The
  host-stored Reply-To recovery regressions still pass unchanged
  (`src/classify-ipc-handlers.test.ts`).
- **Hard filters and drop logging** now explicitly use the envelope address
  (`src/channels/gmail.ts:497`, `:516`) — correct: a filter must judge who
  actually sent the mail, not who is quoted inside it.
- **Rule matching** uses the envelope (`src/channels/gmail.ts:552`), so a
  forwarded body cannot steer rule selection; the `Fwd:` subject guard
  independently suppresses sender rules (`src/classify-rules-runner.ts:175`).
- **Proposal-reply detection** uses the envelope (`src/channels/gmail.ts:539`)
  — correct, since the person who replied is the envelope sender.
- **Exact Message-ID recovery** is retained on every forwarded shape
  (`src/host-router.ts:67-70`) and Chief's read-once guidance is unchanged.
- **Lead thread anchoring** for ordinary email-reply leads is untouched
  (`src/host-router.ts:96-117`); the forwarded branch returns before that logic.

Validation in this session: `npx tsc --noEmit` clean.
`npx vitest run` over the five focused files: **131/134 passed, 3 failed** —
all three failures are `better-sqlite3` native ABI errors at `src/db.ts:425`
(`_initTestDatabase`) because this sandbox exposes Node v26.5.1 and refused
every route to `.nvmrc`'s 22.23.2 (`nvm use`, `PATH=`-prefixed and
absolute-binary invocations were all denied). The failing three include
`preserves the trusted internal forward marker and suppresses the source thread
for Sales`, so that specific regression is unverified here; Codex's reported
134/134 on exact 22.23.2 is consistent with the environmental diagnosis.

## Check 6 — missing tests / documentation drift

- **Blocking:** the spoofed own-domain `From:` regression is missing (see
  blocking finding), and `docs/ACTIVE-WORK.md` + `docs/ENGINEERING-CHANGELOG.md`
  claim an authenticated envelope that is not implemented. Both must be fixed
  together — under CHANGE-PROTOCOL the tracked record is what the next session
  will trust about this control's strength.
- The R3 changelog discrepancy is resolved: the entry no longer cites a stale
  test count for the focused set.
- `docs/ARCHITECTURE.md` gotcha 11 and the PROJECT-MAP paragraph accurately
  describe the `Source-Thread-ID` / new-email behavior.

## Non-blocking notes

1. **Host-truth for `sender_email` on the Mailman route.** The host already
   parses its own `Forwarded-Inquiry: yes` header region
   (`src/classify-ipc-handlers.ts:222-231`); in that same branch it could take
   the external identity from the host-written `From:` line instead of trusting
   `data.sender_email`. That is the principle NC-20260803-002 established —
   host-resolved identity outranks the model hint — and it would make check 2
   structural on both routes rather than prompt-dependent on one.
2. **Mailman keeps a thread grant for the forwarding thread.**
   `src/channels/gmail.ts:480-492` grants `threadId` unconditionally, and
   Mailman holds `gmail_reply` gated on exactly that grant
   (`src/gmail-ipc-policy.ts:262-270`). Nothing host-side prevents a reply onto
   the teammate's thread if a later handoff supplies that ID; only prompts do.
   Consider withholding the thread grant (or denying `gmail_reply` on it) when
   `forwardedIdentity` is resolved.
3. **Reply-To preference spans the whole post-marker region.**
   `src/gmail-parser.ts:79-93` takes the first `Reply-To:` found anywhere after
   the first marker in preference to the first `From:`. In a forwarded
   multi-hop thread, a `Reply-To:` belonging to a *later* quoted block can
   outrank the `From:` of the block that was actually forwarded, binding the
   lead to the wrong external address. Scoping the preference to the header
   block immediately following the first marker would remove the ambiguity.
4. **`fmtContador` / `fmtArchivarista` / `fmtProcurementEmail` still emit a bare
   `Thread-ID:`** (`src/host-router.ts:174`, `:187`, `:200`) for forwarded
   inquiries. Harmless today — none of those groups can reply or read a thread
   (`src/gmail-ipc-policy.ts:28-39`) — but it is the one place the
   forwarded/non-forwarded distinction is not applied uniformly, and it will
   propagate a thread grant to those groups via `THREAD_ID_RE`.
5. **Header-value newline hygiene.** `formatEmailForAgent`
   (`src/gmail-parser.ts:244-268`) interpolates raw header values into a
   synthesized header region that `routeAfterClassify` later parses for
   `Forwarded-Inquiry:`/`Forwarded-By:`. Gmail normally unfolds header values,
   and the achievable impact is negligible (the attacker would only mark their
   own message as forwarded-by), but stripping CR/LF from header values before
   interpolation costs one line and removes the question.

## Files and commands inspected

Files: `docs/reports/NC-20260803-003-CODEX-REQUEST-R4.md`,
`src/gmail-parser.ts` + test, `src/channels/gmail.ts` + test,
`src/classify-ipc-handlers.ts` + test, `src/host-router.ts` + test,
`src/classify-rules-runner.ts` + test, `src/gmail-ipc-policy.ts`,
`groups/mailman/CLAUDE.md`, `groups/inbox/CLAUDE.md`, `groups/sales/CLAUDE.md`,
`groups/chief/CLAUDE.md`, `docs/ACTIVE-WORK.md`, `docs/ARCHITECTURE.md`,
`docs/ENGINEERING-CHANGELOG.md`, `docs/PROJECT-MAP.md`.

Commands: `git status --short`, `git diff --stat`, `git diff` per path,
targeted `grep -n` over the files above,
`grep -rin "authentication-results|dkim|dmarc" src` (no matches), `node -v`
(v26.5.1), `npx tsc --noEmit` (clean), `npx vitest run` over the five focused
files (131/134; 3 `better-sqlite3` ABI failures). No email, Slack, deploy,
commit, service restart, production data access, or secret inspection occurred.
