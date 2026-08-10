# NC-20260809-004 — Sales request-first implementation, Claude response R1

**VERDICT: ACCEPT WITH CHANGES.**

The four-part slice is the right first move and its subsystem boundary
(no Mailman, no `pending_sends`, no Gmail receipts, no approval rejection) is
sound. Five changes are required before Codex edits source. Three of them are
blocking because, as proposed, the slice either changes production behavior
without a deploy step, leaves the strongest sales-first construction in place,
or creates a new failure mode against runtime it deliberately does not touch.

Responds to `docs/reports/NC-20260809-004-CODEX-REQUEST-R1.md`. Review only.
Nothing outside this file was created or modified.

Notation: **[F]** verified against source, **[R]** recommendation,
**[D]** owner decision.

---

## 1. Blocking findings

### B1 — `groups/` is a live runtime mount; "local, no deployment" is false for parts 1–3

**[F]** `src/config.ts:35` defines `GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups')`,
and `src/container-runner.ts:167-178` mounts `groupDir` at `/workspace/group`
read-write on every spawn. There is no build, bundle, or restart step between
editing `groups/sales/CLAUDE.md` and the sales agent reading it.

Parts 1–3 of the slice are entirely edits to `groups/sales/*.md`. If this
checkout is the `PROJECT_ROOT` of the running service, every one of those edits
is a live behavior change to the production Sales agent at the next spawn, with
no staging and no rollback other than re-editing. The C2 "reversible internal
write" class is defensible only because the file can be restored — not because
the change is inert.

**[R]** Before the first edit, confirm whether the running service's
`PROJECT_ROOT` is this checkout (launchd/systemd unit working directory). If it
is, either (a) stop the service for the duration of the slice, or (b) treat the
slice as a live prompt change and record it as such in `docs/ACTIVE-WORK.md`,
with the pre-edit file bytes captured so a revert is exact. Do not describe this
slice as deployment-free without that check. I could not complete the check
myself; launchd inspection is outside this session's permitted paths.

### B2 — both target files already carry uncommitted work from the excluded overlap

**[F]** `groups/sales/CLAUDE.md` (+82/−24 uncommitted) and
`groups/sales/WORKFLOWS.md` (+36 uncommitted) are dirty right now, and the dirty
hunks are precisely the delivery-path work this slice excludes: the
`Action-ID:` handoff field, "this is an ACTION, not output", the
`[BLOCKED] Mailman handoff failed` instruction, the Thread-ID omission rule, and
the entire `[approval_card REJECTED]` paragraph at `WORKFLOWS.md:105-112`.

Editing the same two files with no commit boundary makes the request-first
change and the delivery-path change inseparable. A revert of one reverts the
other, and a later regression cannot be attributed.

**[R]** Do not interleave. Capture the exact pre-edit sha256 of both files, and
confine request-first edits to line ranges that do not touch the dirty
delivery-path hunks — specifically leave `WORKFLOWS.md:105-112` and the
`## Handling Approval` block (`:123-188`) byte-identical. List the touched
ranges in the handoff. If the owner will authorize one commit, committing the
delivery-path hunks first is strictly safer than the range discipline.

### B3 — the slice leaves the strongest sales-first construction intact

Deleting `WORKFLOWS.md:51-56` (the "LEAD with a confident program
recommendation" authorization) is correct and is the single most defensible
deletion available. It is not sufficient. **[F]** These remain, all unconditional
imperatives in `groups/sales/EMAIL-RESPONSE-GUIDELINES.md`:

| Line | Text | Effect |
|---|---|---|
| `:13` | "Mention both pricing options: full program price and pay-as-you-go module pricing." | price in every reply, including a login question |
| `:14` | "When mentioning the next cohort, include: start date, format…" | cohort block, unrequested |
| `:15` | "Encourage early registration — they can start the free Coaching Foundations module immediately" | enrollment nudge, unrequested |
| `:16` | "If the cohort time does not suit them and SCHEDULE.md shows an alternative, mention it." | second cohort block |
| `:39` | "Provide your best-guess answer. Lead with an assumption and answer as if it's correct" | licenses a full pitch from a vague message |
| `:46` | "If they say 'I want to get certified,' assume ACC (most common entry point)." | names the program the customer did not |

`:39` plus `:46` is the construction that turns a three-word inquiry into an ACC
pitch with price and cohort. It is independent of Pass 0 and survives the
proposed slice untouched. `:3` also scopes the whole file to "the DRAFT RESPONSE
TO LEAD section", so a client-support card using a different heading falls
outside the stated scope of its own guidelines.

**[R]** Part 1 must make `:13-16` route-conditional and rewrite `:37-47` so the
best-guess answer is permitted only on the `ORIENT` route and may not name a
program, a price, or a cohort. Without this, the decision contract is a header
over unchanged content rules.

---

## 2. Non-blocking findings that change the implementation

### F1 — the prompt documents a card-rejection loop that does not exist on this branch

**[F]** No occurrence of `approval_card` exists in `src/` or
`container/agent-runner/src/`; the only `REJECTED` string in `src/` is
`src/mount-security.ts:379`. `97ca2cc` supplies the return-to-author half and is
absent from this branch. The only deterministic content guard,
`src/email-content-guard.ts`, is imported solely by `src/gmail-ipc-handlers.ts`
— the Gmail **send** boundary, not the card-post boundary. The dirty
`WORKFLOWS.md:105-112` therefore asserts host behavior this branch does not have.

Consequence for this slice: adding required card fields (`Route`, `Confidence`,
`RELATIONSHIP`, `ASK`, `ANSWERABLE`) increases the number of ways a card can be
malformed while no validator rejects it and no feedback returns to the author.
Malformation is silent here. This does not block the slice, but it means the new
fields must be *self-checkable by the agent* and must not be relied on by any
host path. R3 D-6 (implement or delete the documented validation) stays open.

### F2 — LOW confidence with no customer-facing draft collides with the send watchdog

**[F]** `src/send-watchdog.ts:97` `CARD_RE = /\[(?:SALES REVIEW|CLIENT SUPPORT
REVIEW|SUPPORT-DRAFT)\]/` and `:123` `isTrackableCard()` match on the card header
alone, with no requirement that a draft heading or fenced body exist. An operator
approving a LOW-confidence, draftless `[SALES REVIEW]` card — a plausible way to
say "yes, escalate" — registers a pending send that no mailman handoff will ever
satisfy, producing a spurious `[SEND NOT OBSERVED]`.

**[R]** LOW-confidence output must not use the `[SALES REVIEW]` header. Give it a
distinct, non-trackable header — `[SALES ESCALATION]` — so no runtime change is
needed to keep the watchdog correct. This keeps part 2 inside the slice boundary
instead of pushing it into excluded delivery code.

### F3 — the draft-heading vocabulary is wider than the slice assumes, and no matcher covers it

**[F]** Distinct heading forms observed in `groups/sales/conversations/`:
`DRAFT RESPONSE TO LEAD:`, `DRAFT FOLLOW-UP:`, `DRAFT:`, `DRAFT EMAIL:`,
`DRAFT RESPONSE TO CLIENT:`, `DRAFT RESPONSE:`, and a `DRAFT — …` em-dash form.
Three independent matchers disagree about them (verified by direct execution):

| Heading | ledger `isDraftMessage` (`autonomy-policy.ts:61-66`) | send `DRAFT_HEADING` (`approved-send-handoff.ts:35`) | header-scan stop (`send-watchdog.ts:110`, `gmail-ipc-policy.ts:112`) |
|---|:--:|:--:|:--:|
| `DRAFT RESPONSE TO LEAD:` | ✓ | ✓ | ✗ |
| `DRAFT FOLLOW-UP:` | ✓ | ✗ | ✗ |
| `DRAFT RESPONSE:` | ✗ | ✓ | ✓ |
| `DRAFT RESPONSE TO CLIENT:` | ✗ | ✗ | ✗ |
| `DRAFT:` | ✗ | ✗ | ✗ |
| `DRAFT EMAIL:` | ✗ | ✗ | ✗ |

No form is recognized by all three. Two consequences follow directly. The
canonical **sales** heading is the one form where the header-scan stop fails, so
`extractApprovedGmailThreadId` reads past the draft heading into the fenced body,
contradicting its own docstring guarantee. The canonical **follow-up** heading is
invisible to the send parser, which is the mechanism behind R4's finding of 12
follow-up approvals and **0** Gmail-confirmed follow-up sends.

Adding `DRAFT RESPONSE:` to `isDraftMessage()` — the proposed part 4 — recognizes
chief's `[SUPPORT-DRAFT]` form (`groups/chief/SUPPORT-REPLY.md:37`), which is
authored by the `chief` group and therefore skipped anyway by
`autonomy-ledger.ts:109`. It does nothing for the four sales-authored forms that
are actually invisible. See §5 for the replacement.

### F4 — pulling client-support drafts into the sales ladder would corrupt category trust

**[F]** The sales agent posts `[CLIENT SUPPORT REVIEW]` cards in `#gru-sales`
with a bare `DRAFT:` heading and no `Category:` line. `autonomy-ledger.ts:111-112`
falls back to `heuristicCategory()` whenever the line is absent, and
`heuristicCategory()` always returns one of the eight sales slugs. Widening the
recognizer to cover those cards would therefore build approval streaks in
`account-access`, `enrollment`, and `program-content` from support traffic that
never earned them. Near-term risk is bounded — `PROMOTE_STREAK = 15` against a
longest observed clean run of 3 — but the accounting would be wrong from the
first ingested card.

---

## 3. Deterministic precedence and routes (Q1, Q2)

**[R]** Adopt R3 §11 / R5 §6.1 verbatim as the ordered contract, with level 5
having no edge into the draft:

```
1  RELATIONSHIP   host-resolved where available, else `unknown`   (binding)
2  CURRENT MESSAGE  explicit asks, with provenance                (binding)
3  ANSWERABILITY  approved knowledge + systems of record          (binding)
4  ROUTE + BUDGET relationship x ask x answerability              (binding)
5  PATH SIGNAL    recorded context only                           (NON-BINDING)
```

Routes and their content ceilings are R3 §12.2 unchanged. The five personas the
brief names map as follows, and each mapping is what B3 must enforce:

| Persona | Route | Must contain | Must not contain |
|---|---|---|---|
| paid client | `SERVICE` | the fix, or the named owner and when | price, cohort, program, upsell, enrollment step, booking link, deal estimate |
| organization buyer | `SERVICE` / `TRANSACT` | invoicing, PO, registration mechanics | invented discounts, upsell, program re-explanation |
| returning contact | `ANSWER` | the answer; at most one new fact | new programs, new dates, re-pitch |
| vague stranger | `ORIENT` | ≤3 sentences plus exactly one clarifier | full program list, price, cohort dates, booking link |
| narrow factual question | `ANSWER` | the answer | price and cohort unless the current message asks for them |

**[R]** Response budget: zero additions by default. Every element outside the
route's required content is listed on the card under `ADDED BEYOND THE ASK:`
naming the rule that justifies it. Draft audit is R3 §12.3 plus one new check —
*does any element trace only to the path signal? Then delete it.*

**On the ordering question (deterministic H1–H7 before prompt work).** R5 ranked
host work first because it is deterministic and needs no model change. That
ranking stands, and this slice does not contradict it: H1, H2, H6 and H7 all sit
inside the excluded delivery/runtime overlap on this branch, so they are not
available here. Doing the prompt slice now is the correct use of the available
surface — provided B1 is resolved, since the prompt slice is the one that
reaches production without a deploy while the host work would not.

---

## 4. Relationship evidence rule (Q3) — exact contract

The hazard is real and it is created by the Sales prompt itself, not by inbox.
**[F]** `groups/inbox/CLAUDE.md:40-57` (Step 1.5) runs the party lookup *before*
Step 2 (`:59-70`) creates the party, prospect role, and pipeline entry, so a
first-time contact-form lead correctly arrives with no `Known-To-Us` line. But
`groups/sales/CLAUDE.md:86` then instructs Sales: "If `Known-To-Us` is absent,
also run a quick lookup yourself: `… v_party_contact_card WHERE
LOWER(primary_email) = …`". That lookup runs *after* inbox's write, so it always
returns the row inbox just created for this very inquiry. The agent cannot
distinguish "known before this message" from "created by this message."
`EMAIL-RESPONSE-GUIDELINES.md:24-29` has no row for that state, so the case falls
into an undefined cell of the posture table.

**[R]** Exact prompt rule, to replace the self-lookup sentence at
`groups/sales/CLAUDE.md:86` and to head the posture table:

```text
RELATIONSHIP is evidence-gated and fail-closed.

Permitted values: paid_client | organization_buyer | prior_contact | stranger | unknown

A record counts as prior relationship ONLY IF its own evidence PREDATES the
current inbound message. Specifically, at least one of:
  - a completed payment, enrollment, or active engagement; or
  - an interaction (inbound or outbound, any channel) whose occurred_at is
    strictly earlier than this message's arrival; or
  - a party role whose started_at is strictly earlier than this message's
    arrival.

The mere existence of a party, prospect role, pipeline entry, visitor record,
or contact-card row is NOT evidence. Those are created by the current inquiry.

If no qualifying evidence predates this message: RELATIONSHIP = unknown.
If RELATIONSHIP = unknown, use the stranger posture. Never write "following up
on your earlier interest", "welcome back", "as a returning", or any phrase
asserting prior contact.
If the record and the message disagree about prior contact, do not pick a side:
Route: HUMAN.
```

**[R]** Delete the self-lookup instruction rather than date-qualifying it. Sales
has no reliable way to compare the row's timestamps to its own message arrival
inside a prompt, and a wrong "returning" posture is worse than a missing one.
The inbox `Known-To-Us` line stays the only relationship input until host-resolved
`RELATIONSHIP` (H2) lands. **[D]** Owner decision: accept losing the
`chief→sales` double-check that `:86` was added to provide.

---

## 5. Commercial-field predicate (Q4) — exact predicate

**[R]** Condition on **route**, not on relationship or readiness:

```text
PROGRAM MATCH and ESTIMATED DEAL appear on the card IF AND ONLY IF
Route == TRANSACT.

Route: TRANSACT additionally requires a Route-Basis line quoting a span of at
most 15 words, verbatim, from the customer's CURRENT message, in which the
customer names a program or asks to enroll, pay, or be invoiced.

  Route-Basis: "<verbatim span from the current message>"

No Route-Basis, no TRANSACT. No TRANSACT, no PROGRAM MATCH, no ESTIMATED DEAL,
and no price, cohort date, booking link or enrollment step in the draft body —
unless the same verbatim test is met for that specific element.
```

Why route and not the alternatives. Readiness is the field R3 §14.2 explicitly
withheld for lack of two-annotator agreement; conditioning commercial content on
an unvalidated field is the circularity R3 corrected. Relationship is not
host-resolved in this slice (§4), so conditioning on it conditions on a guess.
Route is a single declared enum on one line — regex-checkable by a test, visible
to the operator, and derivable from the other three. The `Route-Basis` quote
closes the obvious hole, which is the agent declaring `TRANSACT` to unlock the
fields: the quoted span must appear in the inbound at the thread root, so the
claim is falsifiable by the reviewer and by an eval.

**[F]** This removes forced deal framing from the 66 of 289 cases (22.8%) that
R4 coded `paid_client` or `organization_buyer`, and from the 46 cases with zero
explicit asks.

---

## 6. Draft markers and the autonomy boundary (Q5) — recommended implementation

**[R] Do not add `DRAFT RESPONSE:` to `isDraftMessage()`.** It buys nothing for
the sales ladder (§F3), and if the client-support cards it is aimed at were ever
routed through the sales group it would corrupt category trust (§F4).

**[R] Constrain producers; do not chase producers with the recognizer.** One
heading vocabulary for all sales-authored customer-facing drafts:

- `DRAFT RESPONSE TO LEAD:` — every customer-facing draft, including cards
  headed `[CLIENT SUPPORT REVIEW]`;
- `DRAFT FOLLOW-UP:` — scheduled follow-ups only;
- every card carrying either heading also carries a valid `Category:` line;
- `DRAFT:`, `DRAFT EMAIL:`, `DRAFT RESPONSE TO CLIENT:` and the `DRAFT — …` form
  are retired from the Sales authority files.

**[R] In `src/autonomy-policy.ts`, make one behavior-preserving change plus one
narrow fix**, and nothing else:

```ts
// Anchored so status prose ("I'll post the DRAFT RESPONSE TO LEAD: shortly")
// is not a draft, and case-insensitive so an emphasis or case slip is not a
// silent ledger hole. Optional markdown emphasis is tolerated because the
// corpus contains `**DRAFT RESPONSE TO LEAD:**`; a quote prefix ("> ") is
// deliberately NOT tolerated, because a quoted heading is an echo, not a draft.
const DRAFT_HEADING_RE =
  /^[ \t]*\**[ \t]*(?:DRAFT RESPONSE TO LEAD|DRAFT FOLLOW-UP)[ \t]*:\**[ \t]*$/im;

export function isDraftMessage(text: string): boolean {
  return DRAFT_HEADING_RE.test(text);
}
```

and in `heuristicCategory()` (`:106`) match the follow-up marker
case-insensitively so it agrees with the recognizer above.

**[F] This is a narrowing change and must be measured before it lands.** Today's
`.includes()` counts a marker anywhere on a line; the anchored form does not.
Two non-bare forms exist in the transcripts — `**DRAFT RESPONSE TO LEAD:**`
(a real draft, still matched) and `> DRAFT RESPONSE TO LEAD:` (a quoted echo,
now correctly excluded). **[R]** Required gate: replay both predicates over the
stored `messages` rows for the sales chat and record the old-vs-new difference
set. Ship only if every difference is a quoted echo. This is a read of
operational state, so Codex should run it, not this review.

**Autonomy boundary, explicitly:** no change to `AUTONOMY_LEVELS`,
`GUARDED_CATEGORIES`, `PROMOTE_STREAK`, `VETO_WINDOW_MINUTES`,
`computeVetoExpiry`, or `shouldPromote`. Historical backfill is not re-run:
`ingestNewDrafts` is watermark-scoped (`autonomy-ledger.ts:106`) and
`hasAutonomyDraftEvent` (`:110`) blocks re-ingestion, so existing rows are
untouched. `scripts/autonomy-report.ts` re-derives history through
`classifyOutcome` and **will** report different numbers after this change; say so
in the changelog rather than letting the report appear to drift.

---

## 7. File-by-file change surface

### Prompts and authority (parts 1–3)

| File | Change |
|---|---|
| `groups/sales/CLAUDE.md:3` | role line: from "match them to programs" to answering the current message, with program matching downstream and conditional |
| `groups/sales/CLAUDE.md:86` | delete the self-lookup sentence; insert the §4 fail-closed RELATIONSHIP rule |
| `groups/sales/CLAUDE.md` Processing Protocol steps 3–5 | replace with the §3 ordered contract, the abstention route, and the `ABSTAINED:` block |
| `groups/sales/CLAUDE.md` Program Matching table | make it reachable only from `TRANSACT`/`ANSWER`; delete "When multiple fit, list all" |
| `groups/sales/CLAUDE.md` Tools Available (Chaos bullet) | replace "the journey shapes what you recommend" with the R5 §6.2 non-authority contract |
| `groups/sales/WORKFLOWS.md:7-56` | replace Pass 0 wholesale with the R5 §6.2 recorded-context contract; **`:51-56` deleted outright** |
| `groups/sales/WORKFLOWS.md:74-103` | card format: add `Route`, `Confidence`, `RELATIONSHIP`, `ASK (source:)`, `ANSWERABLE`, conditional `ABSTAINED:` / `ADDED BEYOND THE ASK:`; `PROGRAM MATCH` and `ESTIMATED DEAL` gated per §5; `RECOMMENDED NEXT STEP` replaced by `Route` |
| `groups/sales/WORKFLOWS.md:61-72` | Pass 2 becomes the six-check draft audit |
| `groups/sales/EMAIL-RESPONSE-GUIDELINES.md:13-16` | make route-conditional (B3) |
| `groups/sales/EMAIL-RESPONSE-GUIDELINES.md:18-31` | rewrite around the §4 evidence gate; add the "created by this inquiry" row |
| `groups/sales/EMAIL-RESPONSE-GUIDELINES.md:37-47` | best-guess answer permitted on `ORIENT` only; delete "assume ACC" at `:46` |
| `groups/sales/EMAIL-RESPONSE-GUIDELINES.md:3` | scope the file to every customer-facing draft, not only the `DRAFT RESPONSE TO LEAD` section |

Off-limits inside these files: `WORKFLOWS.md:105-112` and `:123-188`
(dirty delivery-path hunks, B2). `VOICE-AND-TONE.md`: no change.

### Source (part 4)

| File | Change |
|---|---|
| `src/autonomy-policy.ts:61-66` | anchored, case-insensitive, emphasis-tolerant `DRAFT_HEADING_RE`; `isDraftMessage` delegates to it |
| `src/autonomy-policy.ts:106` | case-insensitive follow-up check |
| `src/autonomy-policy.test.ts` | the assertions in §8 |
| new `src/sales-prompt-contract.test.ts` | the text-contract assertions in §8 |

No other source file is touched. `src/approved-send-handoff.ts`,
`src/send-watchdog.ts`, `src/gmail-ipc-policy.ts` and
`container/agent-runner/src/ipc-mcp-stdio.ts` stay untouched even though §F3
shows two of them are wrong, because they are inside the excluded overlap.

### Documentation (Q7)

Per `docs/CHANGE-PROTOCOL.md:184` (agent/group behavior) and `:183`
(host/runtime mechanics), this slice requires: `groups/sales/CLAUDE.md` and its
support workflow/guideline files (above); focused tests (§8);
`docs/ACTIVE-WORK.md` `NC-20260809-004` moved `implementing → validating →
ready_for_review` with the B1 determination and the B2 pre-edit hashes recorded;
`docs/ENGINEERING-CHANGELOG.md` with the marker-narrowing measurement and the
`autonomy-report` drift note; `docs/PROJECT-MAP.md` where it describes Sales
response authority and Pass 0; and a line in `NC-20260805-001` noting that R5's
P1/P3/P4 are now implemented and H1–H7 remain open. Eval cases are named as
deferred with a reason rather than silently omitted (`:196-197`).

---

## 8. Verification matrix (Q6)

Three tiers, deliberately separated. **Text presence proves only that the
authority file says something. It proves nothing about response quality.**

**Tier A — prompt text-contract tests** (`src/sales-prompt-contract.test.ts`,
offline, reads the three Sales authority files). Twelve assertions:

1. `WORKFLOWS.md` contains no "LEAD with a confident program recommendation".
2. `WORKFLOWS.md` contains no "better-informed" / "instead of asking them to clarify" Pass 0 framing.
3. `EMAIL-RESPONSE-GUIDELINES.md` contains no unconditional "Mention both pricing options".
4. …no unconditional "Encourage early registration".
5. …no "assume ACC".
6. `CLAUDE.md` contains no `v_party_contact_card` self-lookup instruction.
7. Card template contains `Route:`, `Confidence:`, `RELATIONSHIP:`, `ASK`, `ANSWERABLE`.
8. Card template gates `PROGRAM MATCH` and `ESTIMATED DEAL` on `TRANSACT` and requires `Route-Basis`.
9. Card template contains no `RECOMMENDED NEXT STEP`.
10. The only draft headings appearing in any Sales authority file are the two canonical ones.
11. Every route in the matrix has both a "must contain" and a "must not contain" cell.
12. The fail-closed RELATIONSHIP paragraph is present verbatim, including "unknown".

**Tier B — pure-function unit tests** (`src/autonomy-policy.test.ts`). Eight
assertions: the two canonical headings match; `**DRAFT RESPONSE TO LEAD:**`
matches; lowercase matches; `> DRAFT RESPONSE TO LEAD:` does **not**;
`"I'll post the DRAFT RESPONSE TO LEAD: shortly"` does **not**; `DRAFT:` /
`DRAFT EMAIL:` / `DRAFT RESPONSE:` do **not**; `heuristicCategory` returns
`followup` for a lowercase follow-up heading; `shouldPromote` and the guarded
set are unchanged.

**Tier C — behavioral evaluation (deferred, and named as deferred).** No
`evals/` directory exists in the repository. Nothing in Tiers A or B licenses a
claim that responses improved. The minimum before any such claim: the R3 §14
corpus of ~120 fixtures over six strata — paid_client/service, stranger with a
vague ask, prior_contact exploring, ready-to-buy, org_buyer, operator-corrected
— scored on the eight-check rubric by two annotators with per-field κ, measured
against the R4 baselines (first-draft acceptance 56/122 = 45.9%;
unrequested content 8/10 follow-ups and 6/71 direct).

**Pre-merge measurement gate:** the old-vs-new `isDraftMessage` difference set
over stored sales messages (§6), with every difference shown to be a quoted echo.

**Pinned-Node run:** `nvm use` resolving to `.nvmrc` exactly, then
`npm run build` and the focused vitest files.

---

## 9. Explicitly deferred

Not in this slice, and not implied by it: H1 `approved_pending_send` with
Gmail-receipt completion; H2 host-resolved `RELATIONSHIP` injection; H4 the
broadened typed-drop parser; H5 the non-approving acknowledge reaction; H6 card
validation and the `[approval_card REJECTED]` return path (`97ca2cc`, absent from
this branch — its absence is drift, not permission to reimplement); H7 host-side
recap suppression; the `DRAFT FOLLOW-UP:` gap in
`src/approved-send-handoff.ts:35`; the header-scan stop defect in
`src/send-watchdog.ts:110` and `src/gmail-ipc-policy.ts:112`; the four Pass 0
signal divergences and the blinded path-on/path-off evaluation; lesson-tier
migration and the three divergent lesson files; and the `evals/` corpus.

The state model is preserved untouched:
`drafted → approved_pending_send → gmail_confirmed`, with approval suppressing
re-drafting and never completing or retiring.

---

## 10. Owner decisions

- **D-A (blocking).** Is this checkout the running service's `PROJECT_ROOT`? If
  yes, is a live prompt change acceptable, or should the service be stopped for
  the slice? (B1)
- **D-B (blocking).** May the dirty delivery-path hunks in the two Sales files be
  committed first? If not, the range-discipline mitigation in B2 applies and the
  two changes stay entangled in one dirty tree. (B2)
- **D-C.** Accept losing the `chief→sales` relationship double-check by deleting
  the self-lookup at `groups/sales/CLAUDE.md:86`. (§4)
- **D-D.** Accept `Route == TRANSACT` plus a verbatim `Route-Basis` quote as the
  commercial-field predicate, in place of R3's relationship × readiness gate. (§5)
- **D-E.** Accept `[SALES ESCALATION]` as the LOW-confidence header so the send
  watchdog stays correct without touching excluded runtime. (F2)
- **D-F.** Accept that `scripts/autonomy-report.ts` will report different
  historical numbers after the marker change, and that this is a correction
  rather than a regression. (§6)
- **D-G.** Confirm that behavioral quality will not be claimed from Tier A/B
  tests, and set the eval budget that Tier C requires. (§8, R5 D-10)
