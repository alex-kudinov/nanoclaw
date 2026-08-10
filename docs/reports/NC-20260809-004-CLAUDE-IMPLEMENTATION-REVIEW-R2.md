# NC-20260809-004 — Claude implementation review R2

**VERDICT: ACCEPT WITH CHANGES.**

The implementation is faithful to the R1 contract and materially better than
what it replaces. Four defects must be corrected before commit; three are nits.
Every correction is inside the stated boundary — none requires touching Mailman,
`src/approved-send-handoff.ts`, `src/send-watchdog.ts`, `src/gmail-ipc-policy.ts`,
IPC, database, Slack delivery, or deployment.

Reviewed the listed files and their diffs only. No source was edited. Focused
tests were executed read-only: `src/autonomy-policy.test.ts` and
`src/sales-prompt-contract.test.ts` → **17 passed** in the current working tree.

---

## Findings

### H1 — the eval fixture is git-ignored, so committing the test breaks CI *(high)*

**Where.** `groups/sales/evals/request-first-cases.json`;
`src/sales-prompt-contract.test.ts:26-37`; `.gitignore:25-35`;
`.github/workflows/ci.yml:28`.

**Evidence.** `.gitignore` ignores `groups/*/*` and re-admits exactly six
filenames (`CLAUDE.md`, `CLAUDE-MAIN.md`, `WORKFLOWS.md`, `VOICE-AND-TONE.md`,
`EMAIL-RESPONSE-GUIDELINES.md`, `SCHEMA.md`). `git check-ignore -v` confirms the
fixture is matched by `.gitignore:28` and no negation covers it.
`src/sales-prompt-contract.test.ts` is in `src/` and will be committed; it calls
`readFileSync` on that fixture at **module scope**, and CI runs `npx vitest run`.

**Consequence.** On any fresh clone or CI run the fixture is absent, the import
throws, and **all seven tests in the file error** — not just the matrix test.
The prompt contract that this slice depends on becomes unenforceable at exactly
the moment it starts being enforced. The changelog's rollback plan
(`docs/ENGINEERING-CHANGELOG.md:45-48`) is also wrong for this file: an ignored
file cannot be reverted with the others.

**Secondary problem.** `groups/sales/` is mounted **read-write** into the agent
container at `/workspace/group` (`src/container-runner.ts:167-178`). Eval
expectations — `expectedRoute`, `mustNotInclude` — currently sit inside the
evaluated agent's own writable workspace. That contaminates any future
behavioural eval and is avoidable.

**Smallest safe correction.** Move the fixture to a tracked path outside the
mount — `evals/sales/request-first-cases.json` (root `evals/` is not ignored;
already the path proposed in R3 §15.3) — and update the single `resolve()` call.
Do **not** solve this by adding `.gitignore` negations under `groups/*/`; that
keeps the fixture inside the container mount.

### H2 — `CLAUDE.md:155` re-opens the relationship hazard the slice just closed *(high)*

**Where.** `groups/sales/CLAUDE.md:155`, Edge Cases:

> **Returning lead:** Check DB for prior pipeline entries. If found, note:
> "Returning lead — previously inquired on {date}."

**Evidence.** `groups/inbox/CLAUDE.md:59-70` (Step 2) creates the party, the
`prospect` role, and the `pipeline_entries` row **for the current inquiry**,
before Sales is invoked. So "check DB for prior pipeline entries" will find a
row created by this message. This is the identical failure mode that
`CLAUDE.md:86` and `WORKFLOWS.md:8-19` were rewritten to prevent, and the
instruction even prescribes the asserting phrase ("Returning lead — previously
inquired on…") that `WORKFLOWS.md:17-18` prohibits.

**Why the tests miss it.** `src/sales-prompt-contract.test.ts:67` asserts only
`expect(role).not.toContain('v_party_contact_card')`. The hazard moved to a
different table name in the same file and passes.

**Consequence.** A first-time contact-form lead can still be greeted as a
returning contact — with the evidence gate intact three sections above it.

**Smallest safe correction.** Rewrite the edge case to defer to the gate:

```markdown
- **Returning lead:** Only a payment, enrollment, engagement, interaction, or
  role whose own timestamp strictly predates this inbound establishes prior
  contact. A `pipeline_entries` row is not evidence — intake creates one for
  this inquiry. With no qualifying evidence, relationship is `unknown` and the
  draft must not assert prior contact.
```

Add a contract assertion against the concatenated text, not one file:
`expect(contract).not.toContain('Returning lead — previously inquired on')`.

### M1 — `heuristicCategory` no longer agrees with `isDraftMessage` *(medium)*

**Where.** `src/autonomy-policy.ts:61-62` versus `:113`.

**Evidence.** Executed both predicates against the old implementation:

| Text | `isDraftMessage` old → new | `heuristicCategory` → `followup` old → new |
|---|---|---|
| `DRAFT FOLLOW-UP:` | true → true | true → true |
| `**DRAFT FOLLOW-UP:**` | true → true | **true → false** |
| `REVISED DRAFT FOLLOW-UP:` | true → true | **true → false** |
| `**REVISED DRAFT FOLLOW-UP:**` | true → true | **true → false** |

The new marker regex tolerates emphasis and the `REVISED` alias; the new
follow-up check `/^[ \t]*DRAFT FOLLOW-UP:[ \t]*$/im` tolerates neither. The old
`text.includes('DRAFT FOLLOW-UP:')` caught all four. This is a regression versus
pre-diff behaviour, and it silently mis-categorises **the two
`REVISED DRAFT FOLLOW-UP:` cards the alias was added to preserve**: they now
enter the ledger and then fall through to the keyword ladder, which will return
`pricing`, `enrollment`, or `program-content` from follow-up body text.

**Why the replay did not catch it.** R2 item 8 compared `isDraftMessage` old vs
new (568/568). It did not compare `heuristicCategory` output, so the regression
is outside the measurement that was performed.

**Scope, honestly.** Live follow-up cards now carry `Category: followup`
(`WORKFLOWS.md:349`), and `parseDraftCategory` wins over the heuristic
(`src/autonomy-ledger.ts:111-112`), so current trust accounting is unaffected.
The damage is confined to untagged historical drafts and therefore to
`scripts/autonomy-report.ts` — which is precisely what `heuristicCategory`
exists for ("backfill only", `:107-109`).

**Smallest safe correction.** One shared shape:

```ts
const FOLLOWUP_MARKER_RE =
  /^[ \t]*\**[ \t]*(?:REVISED[ \t]+)?DRAFT FOLLOW-UP[ \t]*:\**[ \t]*$/im;
...
if (FOLLOWUP_MARKER_RE.test(text)) return 'followup';
```

Add two assertions to `src/autonomy-policy.test.ts`:
`heuristicCategory('REVISED DRAFT FOLLOW-UP:\n…')` and
`heuristicCategory('**DRAFT FOLLOW-UP:**\n…')` both `'followup'`.

### M2 — `ORIENT` is under-constrained across three authorities *(medium)*

`WORKFLOWS.md:38-41` defines the ORIENT budget: three sentences plus one
clarifier, and "do not add price, cohort, booking, or enrollment material."
Three other places contradict it:

1. `groups/sales/CLAUDE.md:96-100` authorises the Program Matching table for
   `ORIENT` and `TRANSACT`. That table carries a **Price** column
   (`:102-113`), so ORIENT is handed $3,999 / $2,499 / $299 figures.
2. `EMAIL-RESPONSE-GUIDELINES.md` General Principles: "Point to a program page
   only when the person asks for that program/path or the selected
   `ORIENT`/`TRANSACT` route requires it." The program page doubles as the
   sign-up page (the phrase deleted from the old `:9`), so this is a booking
   link under ORIENT.
3. `EMAIL-RESPONSE-GUIDELINES.md`, ACC rules: "When a way to start now is
   requested **or explicitly justified by `ORIENT`** … 'You can start the free
   Coaching Foundations module right now'." That is an enrollment CTA under
   ORIENT.

**Consequence.** ORIENT is the route for the vague stranger — the exact
population where R4 measured the damage. As written, a three-word inquiry can
still receive a price, a sign-up link, and an enrolment CTA while every card
field validates.

**Smallest safe correction.** In `CLAUDE.md:98-100`, restrict the table to
program *names* under ORIENT and to the Price column only under TRANSACT. In the
two guideline bullets, replace `ORIENT`/`TRANSACT` with `TRANSACT` — or state
explicitly that under ORIENT a program page may be named without price and
without a start-now CTA. Then assert it:
`expect(workflows + guidelines).not.toMatch(/ORIENT[^\n]{0,80}(price|enroll|start now)/i)`.

### L1 — contract-test brittleness and inconsistent negative scope *(low)*

`src/sales-prompt-contract.test.ts:58-63, 91-93` hard-code exact line wrapping
and continuation indents (`'...predates the\n   current inbound'`,
`'...path signal\n  change the response'`). A prettier pass or a one-word
reflow breaks the build with no behavioural change.

Negative assertions are scoped to single files while the risk is repo-wide:
`:83-86` checks only `guidelines` for "Mention both pricing options" and
"Encourage early registration"; `:67` checks only `role` for
`v_party_contact_card`. The same text reappearing in another authority file
would pass. **Correction:** normalise whitespace before positive matching, and
run every *negative* against the concatenated `contract`.

### L2 — `groups/sales/CLAUDE-MAIN.md` is not loaded by anything *(low)*

`grep` across `src/`, `container/`, and `docs/ARCHITECTURE.md` finds **no**
reference to `CLAUDE-MAIN.md` other than the new test. 151 lines were changed in
a file no runtime path reads, while `docs/PROJECT-MAP.md:454-456` now presents it
as part of the Sales behaviour authority.

I verified this does not make the suite falsely green: every `contract`-scoped
assertion still passes when `CLAUDE-MAIN.md` is excluded from the concatenation.
The risk is divergence — two authority files stating the same rules in different
words, one of them unenforced. **Correction:** either state in `PROJECT-MAP.md`
that it is a staged artifact for the modular-prompt work and not yet loaded, or
wire it up in a later slice. Do not silently carry it as authority.

### L3 — stale verification figure in the changelog *(low)*

`docs/ENGINEERING-CHANGELOG.md:39-40` records "2 files / 16 tests"; the R2
request says 5 files / 34 tests; I measured **17** in those two files. Small, but
D-13 made reporting integrity part of this protocol — update the line at handoff
and state the file/test counts actually run.

### K1 — pre-existing inaccurate host claims, correctly left alone

Recorded so they are not mistaken for new defects, and **not** to be fixed here.
`WORKFLOWS.md:163-170` still asserts that the host parses the card, applies "the
outbound content guard before it posts a review card", quarantines it, and
returns `[approval_card REJECTED]`. On this branch none of that exists: no
`approval_card` string in `src/` or `container/agent-runner/src/`, and
`checkContent` (`src/email-content-guard.ts`) is imported only by
`src/gmail-ipc-handlers.ts` — the Gmail **send** boundary. `WORKFLOWS.md:384-387`
likewise asserts visible rejection of legacy follow-up cards. Both sit in the
excluded delivery hunks and belong to R3 D-6 and commit `97ca2cc`.

---

## Answers to the review questions

**1. Faithful to R1?** Yes, with H2 and M2 as the exceptions. Precedence
(`WORKFLOWS.md:3-53`), the fail-closed evidence gate (`:8-19`), the seven route
budgets (`:30-47`), the TRANSACT predicate with a verbatim ≤15-word
`Route-Basis` (`:118, :136-140`), abstention (`:55-57, :142-152`), the six-part
scope audit including "removing all path information leaves the draft identical"
(`:82-91`), and path non-authority (`:48-53`, `CLAUDE.md:184-189`) all match the
R1 contract. The removal of the post-intake `v_party_contact_card` self-lookup is
done. The unconditional price/cohort/registration bullets and the
best-guess/assume-ACC rules are gone from `EMAIL-RESPONSE-GUIDELINES.md`.

**2. Is `[SALES ESCALATION]` sufficient?** Yes, and it stays inside the boundary.
`src/send-watchdog.ts:97` matches only `SALES REVIEW|CLIENT SUPPORT REVIEW|SUPPORT-DRAFT`,
so `isTrackableCard` is false and `recordApproval` creates no pending row;
`src/approved-send-handoff.ts:28` likewise does not match, so no host-side send
is attempted on a draftless card. No runtime edit is needed. Keep
`WORKFLOWS.md:150-152` ("Do not ask the operator to approve an escalation card")
— it is what prevents the operator from turning an escalation into an approval.

**3. Is the `REVISED DRAFT FOLLOW-UP:` alias acceptable?** Yes. It is
recognition-only, documented as illegal for producers in `WORKFLOWS.md:159-161`
and `CLAUDE-MAIN.md:73-75`, and the adjusted replay (568 → 568, zero differences
over 2,322 rows) is the right evidence and the right way to have found it. Two
notes: the implemented alias also admits `REVISED DRAFT RESPONSE TO LEAD:`,
which is broader than the two observed cards but is the *safe* direction because
the old `.includes()` matched it too; and the real gap is M1, not the alias.

**4. Remaining prompt conflicts?** Yes — H2 and M2. Everything else I probed is
clean: no residual `v_party_contact_card`, `chaos_intent()`, `RECOMMENDED NEXT
STEP`, "assume ACC", "Encourage early registration", "Mention both pricing
options", or "LEAD with a confident program recommendation" in any of the four
Sales authority files.

**5. Are tests and fixtures honest?** Substantially yes. The matrix is described
as a seed rather than quality evidence in the request, the changelog, and
`PROJECT-MAP.md`, and the test only checks the fixture's *structure* (unique
IDs, all seven routes, HUMAN implies no draft, TRANSACT implies a ≤15-word
`Route-Basis` that appears verbatim in the message) — it never claims response
quality. That separation is correct. Fix L3, and add the two assertions named in
H2 and M1 so the contract test covers the holes it currently has.

**6. Does any finding require crossing the excluded boundary?** No. H1 is a file
path plus one `resolve()`; H2 and M2 are prompt text; M1 is one regex in
`src/autonomy-policy.ts`; L1–L3 are the test file and two documents.

---

## On the missing pre-edit hash (R1 B2)

Codex is right to flag it, and it does not block acceptance — but it does have a
cost, so state it plainly rather than treat it as closed. Because no pre-edit
hash exists and the diff is taken against `HEAD`, Codex's edits and the
pre-existing uncommitted delivery-path work in these two files are
indistinguishable in `git diff`. I therefore **cannot** verify by hash that the
delivery hunks are untouched.

What I can attest: the `[approval_card REJECTED]` paragraph
(`WORKFLOWS.md:163-170`) and the `## Handling Approval` block (`:181-223`) are
text-identical to what I read at `:105-112` and `:123-188` during the R1 review
in this same session. That is inspection evidence, not cryptographic evidence.
Capture the hashes now, before any further edit, so the next round has a baseline.

---

## Required before commit

1. **H1** — move `request-first-cases.json` to `evals/sales/`, update the
   `resolve()` call, confirm it is tracked (`git check-ignore` returns nothing),
   and re-run the suite from a clean checkout or with the file staged.
2. **H2** — rewrite `CLAUDE.md:155` and add the `contract`-scoped negative.
3. **M1** — align the follow-up regex with the marker regex; add the two tests.
4. **M2** — close the three ORIENT leaks and add the guarding assertion.

Then: **L1** whitespace-normalise and re-scope the negatives, **L2** state
`CLAUDE-MAIN.md`'s status in `PROJECT-MAP.md`, **L3** correct the changelog
figure. Re-run `npm run typecheck`, the focused files, and the full suite under
pinned Node 22.23.2, and record file/test counts as measured rather than as
estimated.

Nothing here authorizes a build, deployment, commit, push, Slack post, email, or
production query, and the safe state model
`drafted → approved_pending_send → gmail_confirmed` remains untouched.
