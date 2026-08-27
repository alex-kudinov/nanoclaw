# NC-20260826-008 bounded operator-answer fast-path review — RESPONSE R2

Scope: re-review of the corrections to R1 findings 1 and 2 in
`groups/sales/CLAUDE.md` and `src/sales-prompt-contract.test.ts` only.

## Finding 1 (placement/triggering ambiguity) — RESOLVED

`groups/sales/CLAUDE.md` line 58–65 now keeps `### 2. Operator reply in a
pending-draft thread` scoped to its original draft-revision content only. The
`**Operator-answer fast path:**` paragraph has been moved out of that section
into its own standalone heading, `### 3. Operator answer to support
escalation or pending draft` (line 67), and now opens with an explicit
independence statement (lines 69–71): "this rule is independent of whether
the thread currently holds a pending `[CLIENT SUPPORT REVIEW]` draft or a
prior `[SALES ESCALATION]` card with no draft." This removes the textual
dependency on §2's "a draft awaiting approval" precondition and directly
names the escalation-origin case (no draft present) as in scope.

The one internal cross-reference to the old numbering was updated correctly:
line 65's "(see #3)" is now "(see #4)", matching Approval's new position as
§4. `grep` for other `(see #` / numbered-section references in
`groups/sales/` found no other pointer into this numbering that would still
be stale.

## Finding 2 (missing SERVICE gate in the loaded copy) — RESOLVED

The same paragraph now reads "...supplies the fact or decision that makes
every material ask answerable, **and the response stays within route
`SERVICE`**, produce one `[CLIENT SUPPORT REVIEW]`..." (line 73–75),
matching the gate already present in `WORKFLOWS.md` line 140 and
`CLAUDE-MAIN.md` line 81.

## Test coverage — now pins both corrections

`src/sales-prompt-contract.test.ts`, test `'turns a complete Alex or Cherie
answer into a same-turn zero-tool support draft'` (lines 90–125), adds three
assertions since R1:

- `expect(role).toContain('### 3. Operator answer to support escalation or pending draft')` — pins the paragraph's promotion to a standalone, independently numbered heading (finding 1).
- `expect(normalizedContract).toContain('a prior \`[SALES ESCALATION]\` card with no draft')` — pins the explicit escalation-origin, no-draft trigger language (finding 1).
- `expect(normalizedContract).toContain('the response stays within route \`SERVICE\`')` — pins the SERVICE gate in the loaded copy (finding 2).

Ran `./scripts/with-pinned-node.sh npx vitest run src/sales-prompt-contract.test.ts` under pinned Node 22.23.2: **11/11 passed**, confirming these three new assertions match the actual `CLAUDE.md` text verbatim (post whitespace-normalization) rather than a stale expectation.

## Verdict

`NO MATERIAL FINDINGS REMAIN.` Both R1 findings are fully resolved in
`groups/sales/CLAUDE.md`, and `src/sales-prompt-contract.test.ts` now pins
both the standalone escalation-origin trigger and the SERVICE gate, verified
green (11/11) under pinned Node 22.23.2.
