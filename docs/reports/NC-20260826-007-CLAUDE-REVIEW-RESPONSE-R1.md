# NC-20260826-007 bounded implementation review response R1

Reviewed only the eight files named in the request packet. No implementation,
test, prompt, or documentation file was edited.

## Material finding 1 — `Party ID:` line left unconditioned on the Client
Support Review approval handoff (Medium)

`groups/sales/WORKFLOWS.md:301-309` (Handling Approval, mailman handoff
template) is shared by both card types and reads:

```
Entry ID: {pipeline_entry_id — SALES REVIEW only; omit the entire line for CLIENT SUPPORT REVIEW}
Party ID: {party_id}
```

`Entry ID` got an explicit carve-out for the new pipeline-free path. `Party ID`
did not. For a genuine `[SALES REVIEW]`, `party_id` is always known by
approval time because `Resolving Missing Entry ID` step 1
(`WORKFLOWS.md:561-570`) resolves it via `best_party_by_email` as a mandatory
prerequisite to resolving `Entry ID`. `[CLIENT SUPPORT REVIEW]` bypasses that
entire procedure by design (`WORKFLOWS.md:551-553`, `CLAUDE.md:103`: "no Entry
ID or pipeline mutation is required") and the CSR card itself
(`WORKFLOWS.md:145-173`) carries no party/lead identifier at all. So this
correction creates the first case where Sales reaches this template with no
established way to populate `Party ID`, but the instruction text still shows
it unconditionally, unlike the line directly above it.

`groups/mailman/OUTBOUND-EMAIL.md:61-62` already tells the host to degrade
gracefully ("If the handoff has no Party ID, omit `lead_id`; the host resolves
the Party from the exact recipient/thread"), and the same file forbids
placeholder values ("Placeholder values such as `(none)` and `N/A` are
invalid; omit an unavailable optional line entirely," line 59). But nothing in
`WORKFLOWS.md` or `CLAUDE.md` tells the *model* that omission is correct here
— the only Party-ID edge case documented (`CLAUDE.md:174`, "Missing Party ID
only (Entry ID present)") assumes the opposite situation (Sales Review with an
Entry ID, no Party ID) and doesn't cover a Client Support Review with neither.
An untested prompt gap plus an all-caps host safety net is exactly the pattern
this task's own template already guards against for Entry ID; Party ID has no
matching guard.

**Correction:** annotate `WORKFLOWS.md:307` the same way as the Entry ID line,
e.g. `Party ID: {party_id if resolved by inbox — otherwise omit the entire
line for a Client Support Review}`, and add one clause to `CLAUDE.md`'s Edge
Cases section (near line 174) covering "Client Support Review with no
resolved Party ID."

## Material finding 2 — post-approval no-mutation instruction is untested (Low)

Review question 5 asks whether tests pin this prompt-only correction's
load-bearing behavior. `src/sales-prompt-contract.test.ts`'s
`'keeps client support pipeline-free...'` test (lines 56-80) only asserts the
*pre-route* language ("no Entry ID or pipeline mutation is required," the
`Client Support Review` heading, the granted-helper strings, and the absence
of direct DML). It does not assert the two *post-approval* instructions that
actually stop a stage write once a card is approved:

- `WORKFLOWS.md:291`: "If it is a `[CLIENT SUPPORT REVIEW]`, do not query or
  mutate pipeline state."
- `CLAUDE.md:108`: "For a Client Support Review, skip this step entirely"
  (Processing Protocol step 6, the `fn_advance_pipeline_stage` step).

Both lines currently exist and are correct. But because they sit right next
to the exact `fn_advance_pipeline_stage` call that must *not* run for a CSR
card, and nothing in the test suite pins that exact conditional, a future
edit to either paragraph could silently regress the objective's core
guarantee ("no pipeline mutation") without failing `npm test`.

**Correction:** add two assertions to the existing test — `expect(workflows).
toContain('do not query or mutate pipeline state')` and `expect(role).
toContain('For a Client Support Review, skip this step entirely')`.

## Invariants checked and confirmed intact

- `CARD_MARKER` and `DRAFT_HEADING` in `src/approved-send-handoff.ts` parse
  `[CLIENT SUPPORT REVIEW]` / `DRAFT RESPONSE:` and correctly omit the
  `Entry ID:` line when no `Lead #` or resolved `entryId` exists (confirmed by
  `approved-send-handoff.test.ts`'s support-card cases).
- No instruction anywhere in the reviewed packet performs or requests direct
  `SELECT`/`INSERT`/`UPDATE`/`DELETE` against `business_v2.pipeline_entries`;
  all pipeline reads/writes route through `v_active_pipeline`,
  `fn_create_pipeline_entry`, and `fn_advance_pipeline_stage`, restricted to
  genuine Sales Review work.
- Relationship Context is not referenced as a pipeline-creation fallback
  anywhere in the reviewed files; the one mention (`WORKFLOWS.md:601`, outside
  the excerpt above but read in full) explicitly forbids that use.
- Approval gating, Action-ID binding, and one-time Gmail execution
  (`OUTBOUND-EMAIL.md`) are unchanged by this correction and apply identically
  to both card types.
- `groups/sales/CLAUDE-MAIN.md` does not contradict `CLAUDE.md`/`WORKFLOWS.md`
  on the new SERVICE/CSR exception; `docs/PROJECT-MAP.md`'s
  `Sales request-first behavior` section accurately describes both files'
  current roles (`CLAUDE-MAIN.md` not host-loaded) and the NC-20260826-007
  change itself.
