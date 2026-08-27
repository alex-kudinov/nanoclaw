# NC-20260826-008 bounded operator-answer fast-path review — RESPONSE R1

## Material finding 1: the fast path is nested inside a trigger category that its own primary use case does not satisfy

**Evidence.** `groups/sales/CLAUDE.md` — the only file of the three prompt files
that `docs/PROJECT-MAP.md` (`### Sales request-first behavior`) names as the
"runtime Sales behavior authority" actually loaded by the host/container.

- Line 58: `### 2. Operator reply in a pending-draft thread`
- Line 60: "Any operator message that lands in a thread where you have **a
  draft awaiting approval** is DIRECTION ON THAT DRAFT — never a status update
  to file away and go quiet on."
- Lines 67–77: the `**Operator-answer fast path:**` paragraph is placed inside
  this same section, with no independent heading of its own.

Compare `groups/sales/WORKFLOWS.md` line 264–271: `HUMAN`/`LOW`-confidence
work is posted as `[SALES ESCALATION]` with `NO CUSTOMER DRAFT — HUMAN INPUT
REQUIRED:` and explicitly omits `DRAFT RESPONSE TO LEAD:` — i.e. that thread
by the doc's own vocabulary does not contain "a draft awaiting approval."

The scenario the fast path exists to solve (per the review objective: "Alex
or Cherie supplies the missing fact/decision") is precisely the case where the
first pass on `[SOURCE: email-active-client]` work could not answer every
material ask and abstained — under this contract that is a `[SALES
ESCALATION]` with no draft, not a "pending-draft thread." `CLAUDE.md` has no
other trigger category (§1 New Handoff, §2 Operator reply in pending-draft
thread, §3 Approval) that covers "operator reply in a thread holding an
escalation card, no draft present" — `grep` for `SALES ESCALATION` / `NO
CUSTOMER DRAFT` in `CLAUDE.md` returns zero matches. So in the authoritative,
loaded file, the fast path's own qualifying language ("makes every material
ask answerable") textually lives under a section whose defining sentence
requires a precondition (an existing draft) that the fast path's primary
target case does not meet.

`groups/sales/WORKFLOWS.md` line 131 (`## Operator-answer fast path (zero
tool detours)`) and `groups/sales/CLAUDE-MAIN.md` line 78 (`### Operator-answer
fast path` under `## Request-First Processing`) both already treat this as a
**standalone** rule, not scoped to "pending-draft thread." Only the loaded
`CLAUDE.md` copy nests it under the narrower heading.

**Risk.** A run that reads `CLAUDE.md`'s "How You Get Triggered" enumeration
to classify an inbound Alex/Cherie message may find no matching category for
"reply to a prior `[SALES ESCALATION]`, no draft exists," and fail to invoke
the fast path in exactly the case it was built for — leaving the qualifying
answer stuck on the slow HUMAN/re-escalation path the fast path was meant to
shortcut. This is under-triggering, not over-triggering, but it is a direct
answer to material question 1 (qualification narrowness/ambiguity) and
question 4 (does the static contract pin the load-bearing invariant): the
invariant that "an exact Alex/Cherie answer to an outstanding
`[SOURCE: email-active-client]` ask always produces a same-turn card" is not
pinned for the escalation-origin case in the file that actually runs.

**Correction.** In `CLAUDE.md`, give the `**Operator-answer fast path:**`
paragraph its own numbered subsection (or move it out of §2 entirely,
mirroring `WORKFLOWS.md`'s standalone `##` heading), and state explicitly that
it applies whether the current thread holds a pending `[CLIENT SUPPORT
REVIEW]` draft **or** a prior `[SALES ESCALATION]` card with no draft. This
also removes the residual gap that `CLAUDE.md`'s "How You Get Triggered" list
has no category at all for an operator reply to an escalation card outside
the fast-path case.

## Material finding 2 (minor): route-SERVICE gate stated in two of three copies, not the loaded one

**Evidence.** `groups/sales/WORKFLOWS.md` line 140 (condition 4): "the
response can stay within route `SERVICE` without adding an unsupported fact,
policy, promise, or action." `groups/sales/CLAUDE-MAIN.md` line 81 restates
this via "the response can stay within route `SERVICE`." `groups/sales/
CLAUDE.md` lines 67–77 (the loaded copy) never states this SERVICE-only gate
in its own fast-path paragraph.

**Risk.** Structurally low: the `[CLIENT SUPPORT REVIEW]` card format
(`WORKFLOWS.md` lines 179–209) hardcodes `Route: SERVICE` and omits `PROGRAM
MATCH`/`ESTIMATED DEAL`/`Entry ID`, so a `TRANSACT`-shaped answer cannot
actually be emitted through this card regardless of prose. Flagging only
because material question 1 asks about qualification precision, and the
loaded file is the one place this explicit gate is missing; recommend adding
the same "stays within route SERVICE" clause to `CLAUDE.md`'s paragraph for
consistency with `WORKFLOWS.md`/`CLAUDE-MAIN.md`, not because a bypass is
currently reachable.

## Checked and no finding

- **No pre-draft read/lookup/pipeline leak for the qualifying case.**
  `CLAUDE.md` Processing Protocol step 2 ("If the Operator-answer fast path
  applies, skip all reads/lookups... Otherwise read KNOWLEDGE.md") correctly
  overrides the unconditional `## Knowledge` read instruction; step 6 ("For a
  Client Support Review, skip this step entirely") correctly overrides the DB
  update step; Activity Logging (Plutio) only fires post-approval, which the
  fast path does not touch.
- **Approval/send boundary.** All three copies independently and consistently
  state the shortcut ends at a draft (`CLAUDE.md` line 75, `CLAUDE-MAIN.md`
  line 86, `WORKFLOWS.md` line 158) — approval, Action-ID binding, and Gmail
  execution are untouched by this change.
- **HUMAN/abstention fallback wording.** All three copies state that an
  incomplete operator fact keeps the request on the ordinary
  answerability/HUMAN path and forbids inferring the missing fact
  (`CLAUDE.md` line 76–77, `CLAUDE-MAIN.md` line 87, `WORKFLOWS.md` line
  158–160).
- **Test coverage matches file content.** Every string asserted in
  `src/sales-prompt-contract.test.ts`'s `'turns a complete Alex or Cherie
  answer into a same-turn zero-tool support draft'` case (lines 90–116) is
  present verbatim (after whitespace normalization) in the reviewed files;
  the test does not, however, assert anything about section placement, so it
  would not have caught finding 1.
- **`docs/PROJECT-MAP.md` summary accuracy.** Lines 1007–1015 accurately
  describe the qualifying conditions and the no-tool-call boundary as written
  in `WORKFLOWS.md`/`CLAUDE-MAIN.md`; no drift found there.
