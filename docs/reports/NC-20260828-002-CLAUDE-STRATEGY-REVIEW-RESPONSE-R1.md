# NC-20260828-002 — canonical Sertifier campaign strategy review (response)

## Verdict

**Not safe to implement as currently packaged.** The canonical-campaign contract
itself (Sections 2–3 of the strategy doc) is sound, but the packet contains two
blocking contradictions between the strategy and the current production prompt
files (`CLAUDE.md`, `EXECUTION-STEPS.md`), plus unresolved grammar and
failure-mode gaps in the one-command send path. Corrections below are ordered
by consequence.

## Required corrections

### 1. (Blocking) `CLAUDE.md` Critical Rule 2 defeats the entire canonical-campaign design

Rule 2 states: *"NEVER reuse an existing campaign ID from a different preset.
Each issuance creates its own campaign via `issue-certificate.sh`."* This is
the exact per-recipient-campaign behavior the strategy exists to eliminate. If
`presets.json` and `issue-certificate.sh` are changed to canonical campaigns
while this rule ships unchanged, Gru's own operating instructions still tell
it to create a new campaign every time — campaign sprawl continues regardless
of what the tool supports. Rule 2 (and the related "generates its own
campaign" framing in Critical Rule 5) must be rewritten to describe canonical
reuse before deployment.

Critical Rule 4 ("NEVER pass `--campaign-id` unless the user explicitly
provides one") also needs reconciling: under the new design the canonical ID
is loaded automatically from the preset, not supplied by the user or Gru, and
`--campaign-id` becomes an operator-only recovery override. The rule as
written still assumes the old semantics.

### 2. (Blocking) One-command grammar collides with the existing Step 1 dispatch table

`CLAUDE.md`'s classification table routes any message matching "send", "send
it", "go ahead" to the Send/Cancel bucket (execute an existing pending
script). The literal string `send ai for coaches to person@example.com`
begins with "send" and satisfies that existing trigger example verbatim, as
well as the new explicit-send grammar in Section 5 of the strategy doc. The
strategy doc does not add a precedence rule or amend the dispatch table, so
there is no specified way for Gru to tell these apart. Depending on match
order, the explicit one-command send could instead execute an unrelated
already-pending certificate (the exact "dangerous collision with a bare
`send`" question 3 asks about), or the new grammar could never fire because
the bare-send rule matches first. This must be resolved with an explicit
precedence rule (test the full explicit-send grammar before the bare-send
bucket) before deployment.

### 3. (High) Overlapping preset-phrase keywords make "exactly one recognized preset phrase" undefined

`CLAUDE.md`'s preset mapping table lists `"supervision"` and `"coaching
supervision"` for `supervision`, and separately lists `"CNPC"`, `"CNPC
supervision"`, `"reflective supervision"` for `cnpc-supervision`. Both
`"CNPC supervision"` and `"reflective supervision"` contain the substring
`"supervision"`, which is itself a listed phrase for a *different* preset. A
message such as `send CNPC supervision to x@y.com` matches phrase text for
two different presets under a plain substring interpretation. The strategy's
recognition rule ("exactly one recognized preset phrase") has no specified
disambiguation algorithm (e.g., longest-full-phrase-wins, abort-to-two-step on
any tie). Without one, this is either an availability bug (safe but
mis-fires to the review gate) or, if implemented naively as first-substring-
match, a genuine risk of the wrong preset being selected under single-command
authorization.

### 4. (High) One-command grammar is not restricted to attribute-less presets, and the failure path is unspecified

`pcc-with-actc`, `aatc-only`, `icf-level-1`, `cceus`, and `supervision` all
have non-empty `requiredAttributes` that cannot be supplied by the one-line
`send <preset> to <email>` grammar. As written, a matching one-line command
for any of these presets would: write the pending script, mark it authorized,
and run it with `--send` in the same turn — `issue-certificate.sh` would
immediately fail on `MISSING_ATTR` since the attribute flags were never
collected. The strategy doc does not say whether the shortcut is restricted
to presets with no required attributes, and does not define what happens to
the pending script after this immediate, self-inflicted failure (delete it,
leave it in `pending/`, or downgrade it to a draft awaiting attributes).

### 5. (Medium) Drift-check fields "privacy" and "allowed status" have no defined expected values

Section 4 step 3 requires verifying "privacy" and "allowed status" against
the preset, but the preset contract in Section 2 defines no `privacy` field
and no enumerated status set, and `presets.json` today carries neither. The
existing campaign-creation call in `issue-certificate.sh` hardcodes
`privateCampaign: false`, so that value is implied but not stated as the
required canonical value. "Allowed status" is only constrained narratively
("Scheduled campaigns are not valid for immediate Gru issuance") — the full
enumerated set of statuses that should pass vs. fail-closed (e.g., Draft,
Sent vs. Scheduled, Completed, Archived, Cancelled) is not given. A
fail-closed check cannot be implemented deterministically from this spec.

### 6. (Medium) One-command reporting language doesn't branch for the `already_issued` outcome

`issue-certificate.sh`'s existing duplicate preflight can short-circuit to
`already_issued` before any campaign-add or email send occurs — this
preflight fires on the same `--send` run the one-command flow triggers.
Section 5 item 7 has Gru unconditionally report "the recipient was added to
the named canonical campaign," which would misreport a duplicate no-op as a
new successful add. The report step needs a distinct branch for
`already_issued`.

### 7. (Medium) "Archive only after reconciled credential and email receipt" has no defined resolution path when reconciliation doesn't confirm

`issue-certificate.sh` already has a bounded retry loop (15 × 2s) that can end
in `issued_pending_reconciliation` without ever reaching the send-confirmed
receipt. Section 5 item 6 imposes a stricter invariant than the tool
currently guarantees, but does not say what happens to the pending script or
the user-facing report when that loop exhausts unconfirmed: left in
`pending/` indefinitely, retried on a timer, or escalated. This boundary
needs an explicit terminal state.

### 8. (Confirm before build) Heartbeat exact-email match casing is unverified

`issue-certificate.sh`'s own duplicate-credential search normalizes both
sides to lowercase before comparing emails. `find-user.sh --email` sends the
address to Heartbeat verbatim, with no case normalization on either side of
the eventual match. If Heartbeat's `/find/users?email=` match is
case-sensitive, a validly typed but differently-cased address could produce a
false zero-result (`AWAITING_NAME`) for a real Heartbeat member on the
one-command path. Confirm Heartbeat's match semantics (or normalize the query
and compare normalized) before relying on "zero result" as ground truth for
name resolution.

## Answers to the review questions

1. **No, not as packaged.** The canonical-campaign contract and historical-
   preservation model (Sections 2–3) are correct and sufficient on their own
   terms, but correction 1 means the currently-shipped operating prompt would
   continue creating a campaign per recipient regardless.
2. **Not sufficient as specified.** See correction 5 (undefined expected
   values for privacy/status) and the null-badge comparison noted in the test
   list below.
3. **No.** See corrections 2, 3, and 4 — each is a concrete, specified
   collision or undefined-behavior path, not a hypothetical.
4. **Yes, with one confirmation needed.** Zero-match, multiple-match, and
   blank-name behavior are all explicitly specified and correctly fail
   closed to `AWAITING_NAME` or the review gate. Only the casing question
   (correction 8) needs verification before relying on it.
5. **Partially.** Pending-script durability-before-provider-action and the
   idempotent duplicate preflight are correctly preserved (issuance boundary
   step 4 in Section 4 reuses the tool's existing exact-email/design check
   unchanged). The uncertain-acceptance/reconciliation terminal state
   (correction 7) and the already-issued reporting branch (correction 6) are
   not resolved.
6. **Required before campaign creation or deployment:**
   - Explicit-grammar vs. bare-`send` precedence test (correction 2) with
     both a true bare-send and a full one-command message in the same
     session.
   - Overlapping preset-phrase contract test using `"CNPC supervision"` and
     `"reflective supervision"` against the `supervision` phrase (correction
     3), asserting abort-to-review rather than silent single-preset
     selection.
   - One-command grammar against every preset that has non-empty
     `requiredAttributes` (`pcc-with-actc`, `aatc-only`, `icf-level-1`,
     `cceus`, `supervision`), asserting a defined, non-crashing outcome
     (correction 4).
   - Drift-check negative tests per verified field (design, Detail, badge,
     template, sender name, sender address, subject, privacy, status) with
     one intentionally mismatched field each, asserting fail-closed.
   - Drift-check test for a preset whose `badgeId` is `null`/absent
     (`supervision`, `cceus`, `mcs-foundation`, `coaching-tools-mastery`,
     `ai-for-coaches`) to confirm the null-vs-missing comparison does not
     falsely fail-closed.
   - Campaign-status test against a Scheduled campaign, asserting the
     issuance boundary refuses immediate issuance.
   - `already_issued` outcome test on the one-command path, asserting the
     report does not claim a new add (correction 6).
   - `issued_pending_reconciliation` outcome test, asserting the defined
     terminal state is reached rather than an unconditional archive
     (correction 7).
   - Heartbeat zero-result test with a differently-cased but real member
     email, asserting the expected match behavior (correction 8).
   - `--campaign-id` operator-override test, asserting it still passes
     through the full component/status validation rather than bypassing it.
