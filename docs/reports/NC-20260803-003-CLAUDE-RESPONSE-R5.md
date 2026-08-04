# NC-20260803-003 Claude response R5 — authenticated recipient binding

Reviewer: Claude (Opus 5), independent read of the R4-blocker repair on
`codex/nc-20260803-003-forwarded-email-recovery` (base `0b6ccf1`).
Date: 2026-08-04T00:30Z (local 2026-08-03 19:30 CDT).

## Verdict

`CONVERGED` — R4's blocking finding is closed. No blocking findings remain.
Checks 1–6 hold; check 1 was verified empirically, not only by reading. Three
pre-deploy items and seven non-blocking notes are recorded below.

## Blocking findings

None.

## Check 1 — authentication parser fails closed

Holds, and I verified it by executing the shipped function rather than reading
it. `authenticatedOwnFrom` (`src/gmail-parser.ts:52-83`) takes the **first**
`Authentication-Results` header (`:63-66`), requires Google's authserv-id
(`:69`, `^mx\.google\.com\s*;`), and then requires either
`dmarc=pass … header.from=<own From domain>` (`:71-75`) or
`dkim=pass … header.i=@<own From domain>` (`:77-83`). Missing, failing,
non-Google, or misaligned results return `null`, and `resolveForwardedIdentity`
short-circuits on it (`:120`).

I ran the real `resolveForwardedIdentity` against a synthetic matrix via
`npx tsx` (no production data; synthetic addresses only):

| Input | Result |
| --- | --- |
| Production-shaped Google A-R (CRLF-folded, `spf=pass (google.com: domain of …)` parentheticals, `dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=tandemcoach.co`) | resolves external author ✅ |
| `dkim=fail … dmarc=fail` from `mx.google.com` | `null` ✅ |
| `dmarc=pass header.from=evil.example` (misaligned) with own-domain `From:` | `null` ✅ |
| `dkim=pass header.i=@tandemcoach.co` only, no dmarc | resolves ✅ (intended fallback) |
| Third-party `dkim=pass header.i=@sendgrid.net` listed first, ours second, `dmarc=fail` | `null` ✅ (fails closed on the first dkim result) |
| No `Authentication-Results` header at all | `null` ✅ |
| Genuine Google A-R first (`dmarc=fail`) + sender-injected second claiming `mx.google.com; dmarc=pass` | `null` ✅ — the first-field rule works |
| Display-name spoof `"Cherie Silas <cherie@tandemcoach.co>" <attacker@evil.example>` with attacker's own passing A-R | `null` ✅ — `bareAddress` picks the own-domain string from the display name, and Google's `header.from=evil.example` then fails alignment |

The one residual is stated plainly: if **no** Google-authored
`Authentication-Results` exists, a sender-supplied field claiming
`mx.google.com` is accepted (verified: resolves). Gmail prepends its own field
on inbound SMTP, so this is not reachable by an external sender through normal
delivery — but the control's soundness rests on that prepend-and-first-position
assumption plus `payload.headers` preserving message order. See non-blocking
notes 1 and 2.

Test coverage of this check exists at `src/gmail-parser.test.ts:327-333`
(passing A-R fixture), `:367-382` (missing A-R and non-Google authserv-id), but
does not include `dmarc=fail` or misaligned-pass negatives — behaviors I
confirmed empirically above. See note 4.

## Check 2 — first-forwarded-block resolution

Holds. `forwardedHeaderBlocks` (`src/gmail-parser.ts:85-109`) collects the
contiguous header-shaped run following each marker, stops at the next marker,
at a blank line once started, and at the first non-header line once started; the
resolver walks blocks in order and returns the first identity found, preferring
`Reply-To` **within that block only** (`:127-143`). Verified empirically: a body
with a second forwarded block whose `Reply-To: redirect@evil.example` follows
the first block still resolved to `first@example.com`. Regression at
`src/gmail-parser.test.ts:384-393`. Own-domain candidates remain excluded
(`:135`), so the resolved address can never be Tandem-owned.

## Check 3 — external identity is host truth on both routes

Holds, and this is the structural upgrade R4 asked for as note 1.

- Direct rule route: `resolveForwardedIdentity` runs on Gmail-authoritative
  input (`src/channels/gmail.ts:456-460`, raw headers now passed), and the
  effective identity flows into the classification payload (`:574`), the durable
  pre-route row (`:618`), and the route params (`:628-643`). Asserted end-to-end
  at `src/channels/gmail.test.ts:250-309`.
- Mailman route: `routeAfterClassify` now re-derives the sender from the
  **host-written** `From:` line whenever the host-written
  `Forwarded-Inquiry: yes` marker is present, overriding a disagreeing model
  value (`src/classify-ipc-handlers.ts:223-234`, `:259`). The regression feeds
  `sender_email: 'wrong-model-address@example.net'` and expects the external
  address to win (`src/classify-ipc-handlers.test.ts:295-335`). The header
  region it parses is entirely host-authored and every interpolated value is
  CR/LF-stripped (`src/gmail-parser.ts:306-329`), so body content cannot forge
  `Forwarded-Inquiry:`/`Forwarded-By:` lines into it.

## Check 4 — the internal teammate thread is audit/recovery only

Holds at every layer I could reach.

- Mailman's grant omits the thread for a resolved forward
  (`src/channels/gmail.ts:479-487`, `...(forwardedIdentity ? {} : { threadId })`),
  asserted at `src/channels/gmail.test.ts:305-308` — the grant is exactly
  `{ messageId, emailAddresses }`. Mailman is the only group holding
  `gmail_reply`/`gmail_send`, and both are thread-gated against that grant
  (`src/gmail-ipc-policy.ts:262-278`), so the reply is refused at the host even
  if a model supplied the ID.
- Handoffs emit `Source-Thread-ID`, never `Thread-ID`
  (`src/host-router.ts:57-72`), now uniformly including contador
  (`:175`), archivarista (`:188`), and procurement (`:201`) — R4 note 4 closed.
- `propagateGmailResources`' `THREAD_ID_RE` (`^\s*Thread-ID:`) does not match
  `Source-Thread-ID:`, so no downstream group can acquire the thread from
  handoff text; Chief still receives a `messageId`-only grant
  (`src/host-router.ts:296-303`).

Bound on the claim: grants are cumulative per group with a 24 h TTL
(`src/gmail-ipc-policy.ts:41`, `writableGrant`). If the same Gmail thread
already delivered an earlier message to the mailbox within the TTL, Mailman may
still hold that thread from the earlier grant. Withholding is per-message, not
retroactive. See note 5.

## Check 5 — no regression to the adjacent paths

Holds.

- Envelope identity is used everywhere it must be: hard filters and the drop
  log (`src/channels/gmail.ts:508`, `:527`), proposal-reply detection (`:550`),
  and rule matching (`:563`). A forwarded body therefore cannot steer filters or
  rule selection.
- Relay `Reply-To` is unchanged for ordinary mail (`:632`) and deliberately
  dropped for a resolved forward so `leadEmail()` cannot fall back to the relay.
- Ordinary replies keep the pre-existing `Thread-ID`/`Message-ID` shape
  (`src/host-router.ts:68-71`); the customer-thread anchoring logic in
  `fmtLeadSales` is untouched for non-forwards (`:96-117`).
- Exact Message-ID recovery survives on every forwarded shape (`:67-70`), with
  Chief's read-once guidance unchanged.
- Sending stays approval-bound: this diff writes IPC handoffs only
  (`safeWrite`, `src/host-router.ts:249-260`); no send path is added or altered.
- One deliberate format change: `formatEmailForAgent` no longer double-wraps the
  address when `headers.from` already contains angle brackets
  (`src/gmail-parser.ts:308-311`). Only `extractSenderEmail`-style consumers read
  that line, and both accept the new form.

Validation in this session: `npx tsc --noEmit` clean. `npx vitest run` over the
five focused files: **133/136 passed, 3 failed** — all three are
`better-sqlite3` ABI errors (`NODE_MODULE_VERSION 127` vs required `147`) at
`src/db.ts:425`, because this sandbox exposes Node v26.5.1 and refuses every
route to `.nvmrc`'s 22.23.2. The three include the new host-truth override
regression, so that specific test is unverified here; Codex's 136/136 on exact
22.23.2 is consistent with the environmental diagnosis.

## Check 6 — tests and documentation

Documentation is now accurate about the implemented control:
`docs/ARCHITECTURE.md` gotcha 11, the `docs/PROJECT-MAP.md` paragraph,
`docs/ACTIVE-WORK.md` task details, and the changelog entry all say
"Gmail-added, aligned DMARC or DKIM pass" and "withheld from Mailman's reply
grant" rather than R4's unimplemented "authenticated envelope". R4's blocking
documentation drift is closed.

Two accuracy items remain (both pre-deploy, neither blocking):

1. `docs/ENGINEERING-CHANGELOG.md` states the focused files "pass 134 tests";
   the current count is 136. This is the third round in which the recorded test
   count trailed the tree (120 → 134). Consider recording the count only at
   handoff, or omitting it in favour of the command.
2. Two pre-existing regressions became vacuous when `rawHeaders` gained a
   default of `[]` (`src/gmail-parser.ts:119`): "does not trust
   forwarded-looking headers from an external envelope"
   (`src/gmail-parser.test.ts:394-404`) and "requires both a forward subject and
   an explicit marker" (`:405-419`) both omit the third argument, so they now
   return `null` at the authentication gate and would still pass if the envelope,
   subject, and marker checks were deleted. Pass `authenticatedHeaders` to both.

## Pre-deploy items

1. Rerun typecheck and the focused + full suites on exact Node 22.23.2 against
   the final tree (not reproducible in this sandbox).
2. Fix the changelog test count and the two vacuous tests above.
3. **Confirm the control actually fires for intra-tenant mail.** The whole
   recovery path depends on Gmail stamping `Authentication-Results:
   mx.google.com` on a forward sent from one Tandem mailbox to `info@`. If it
   does not for same-tenant delivery, `resolveForwardedIdentity` returns `null`
   and the original incident reproduces silently — safely (fail-closed), but
   unfixed. Verify on the headers of one known internal forward before treating
   the replay as a validation of this control.

## Non-blocking notes

1. **Sole sender-supplied A-R is accepted** (verified). Consider rejecting when
   more than one field claims `mx.google.com`, or cross-checking a
   `Received: … by mx.google.com` hop, so the control does not rest solely on
   "Google always prepends".
2. **Header ordering is an unstated dependency.** The first-field rule assumes
   `payload.headers` preserves message order. Worth one comment line at
   `src/gmail-parser.ts:63-66` so a future reader does not "optimize" it into a
   filter-and-merge.
3. **Relaxed DMARC alignment is rejected.** A `From:` at
   `cherie@mail.tandemcoach.co` with Google's `header.from=tandemcoach.co`
   resolves to `null` (verified). Fail-closed and probably irrelevant today, but
   it will look like a mystery if a subdomain sender is ever added.
4. **Missing negatives:** `dmarc=fail` and misaligned-pass have no test, though
   both behave correctly. Cheap to add alongside item 2 of check 6.
5. **Thread-grant withholding is per-message** (see check 4). If a forward lands
   on a thread the mailbox already handled inside the 24 h TTL, Mailman may still
   hold that thread.
6. **Block start can float.** `forwardedHeaderBlocks` skips non-header lines
   before a block starts (`src/gmail-parser.ts:96-101`), so prose between the
   marker and any later `From:` line still yields a block (verified:
   `late@example.com` resolved through two lines of chatter). Inside an
   authenticated internal forward this is a misresolution risk, not a spoofing
   one, but anchoring the block to the lines immediately after the marker would
   tighten it.
7. **Mailman loses `gmail_get_thread` on forwarded work.** Withholding the
   thread also withholds legitimate thread reads for that message. Acceptable —
   the body is inline and the exact `Message-ID` remains granted — but it is a
   real narrowing worth knowing about if Mailman ever needs upstream context.

## Files and commands inspected

Files: `docs/reports/NC-20260803-003-CODEX-REQUEST-R5.md`,
`src/gmail-parser.ts` + test, `src/channels/gmail.ts` + test,
`src/classify-ipc-handlers.ts` + test, `src/host-router.ts` + test,
`src/gmail-ipc-policy.ts`, `docs/ACTIVE-WORK.md`, `docs/ARCHITECTURE.md`,
`docs/ENGINEERING-CHANGELOG.md`, `docs/PROJECT-MAP.md`.

Commands: `git diff --stat`, `git diff` per path, targeted `grep -n`,
`npx tsx /tmp/ar-probe.ts` (synthetic authentication-result matrix against the
shipped `resolveForwardedIdentity`; no production data), `npx tsc --noEmit`
(clean), `npx vitest run` over the five focused files (133/136; 3
`better-sqlite3` ABI failures under Node v26.5.1). No email, Slack, deploy,
commit, service restart, production data access, or secret inspection occurred.
