# NC-20260809-004 — Claude final review R3

**VERDICT: ACCEPT.**

No material in-bound defect remains. All seven R2 findings are corrected, each
verified against the file rather than against the claim. The slice is
review-ready for the owner's commit decision.

Reviewed only the corrections listed in
`docs/reports/NC-20260809-004-CODEX-CORRECTIONS-R3.md` and the files they name.
No source was edited. Focused tests were executed read-only.

---

## Verification of each correction

### H1 — fixture tracking · **CLOSED**

`git check-ignore -v evals/sales/request-first-cases.json` prints nothing and
exits 1 — the fixture is no longer ignored. `git status --porcelain` shows
`?? evals/`, so Git sees it and `git add` will take it.
`groups/sales/evals/` is gone, so the fixture is out of the read-write container
mount (`src/container-runner.ts:167-178`) and can no longer be read or modified
by the agent it evaluates. `src/sales-prompt-contract.test.ts:31-32` resolves the
new path. The CI break I identified (`.github/workflows/ci.yml:28` running
`npx vitest run` against a clone missing the fixture) is resolved.

The new top-level surface is documented at `docs/PROJECT-MAP.md:485`, which is
the right place for it.

### H2 — returning-lead inference · **CLOSED**

The old edge case is gone from every Sales authority file; the replacement reads:

> **Possible prior contact:** Do not infer relationship from a pipeline entry;
> intake creates one for the current inquiry. Use only the pre-inbound evidence
> gate in `WORKFLOWS.md`. If it does not establish prior contact, choose
> `unknown`; if it conflicts with the person's message, choose `HUMAN`.

That names the exact mechanism (`groups/inbox/CLAUDE.md:59-70` creates the row
before Sales runs) rather than restating the rule abstractly, and it routes the
conflict case consistently with `WORKFLOWS.md:19`. The guard is now contract-wide:
`expect(contract).not.toContain('Returning lead — previously inquired on')` and
`expect(contract).not.toContain('v_party_contact_card')`.

### M1 — marker/classifier agreement · **CLOSED**

`src/autonomy-policy.ts` adds `FOLLOW_UP_DRAFT_MARKER_RE` with the same
emphasis-tolerant, case-insensitive, `REVISED`-alias grammar as
`DRAFT_MARKER_RE`, and `heuristicCategory` uses it. I re-ran the full matrix
against the pre-diff implementation:

| Text | draft | follow-up | old `.includes` follow-up |
|---|:--:|:--:|:--:|
| `DRAFT FOLLOW-UP:` | ✓ | ✓ | ✓ |
| `**DRAFT FOLLOW-UP:**` | ✓ | ✓ | ✓ |
| `REVISED DRAFT FOLLOW-UP:` | ✓ | ✓ | ✓ |
| `**REVISED DRAFT FOLLOW-UP:**` | ✓ | ✓ | ✓ |
| `DRAFT RESPONSE TO LEAD:` (+ `REVISED`, + `\r`) | ✓ | ✗ | ✗ |
| `> DRAFT RESPONSE TO LEAD:` · `post the DRAFT FOLLOW-UP: later` | ✗ | ✗ | — |

**Remaining draft-vs-follow-up gaps: 0.** The follow-up predicate is a strict
subset of the draft predicate across every case tested. The two
`REVISED DRAFT FOLLOW-UP:` cards that motivated the alias now classify as
`followup` again, so `scripts/autonomy-report.ts` history does not drift.
`draft follow-up:` (lowercase) newly classifies as `followup` where the old
substring check returned false — a widening in the correct direction and
consistent with the case-insensitive recognizer.

### M2 — ORIENT leaks · **CLOSED on all three legs**

1. `groups/sales/CLAUDE.md:102-114` — the Price column is removed; the table is
   now Signal → Match only. Guarded by `expect(contract).not.toContain('| Price')`.
2. `EMAIL-RESPONSE-GUIDELINES.md:9` — "Point to a program page only when the
   person explicitly asks for the link or a valid `TRANSACT` Route-Basis requires
   an enrollment destination. `ORIENT` may name a supported program but must not
   include a sign-up link."
3. `EMAIL-RESPONSE-GUIDELINES.md:15` and `:74` — the free Coaching Foundations
   module now requires an explicit ask or a valid `TRANSACT` Route-Basis;
   "`ORIENT` must not use it as a sales CTA."

This stays consistent with the `ORIENT` budget at `WORKFLOWS.md:38-41`: naming a
supported program is a recommendation, not price, cohort, booking, or enrollment
material. The `explicit-path-orientation` fixture encodes the constraint
directly — `mustNotInclude: ["unrelated programs", "path-tracking reference",
"price", "cohort", "sign-up link", "free module"]`.

**Incidental improvement worth recording.** Deleting the Price column also
removed the cell reading "Pre-launch — capture interest, NO price quote" for
Coaching Supervision Mastery. I checked whether that dropped a live guard: it did
not. `knowledge/agents/sales/KNOWLEDGE.md:743` states the CSS track is
"enrolling now — October 7, 2026 cohort, $3,996 inaugural / $4,796 regular.
Quote it." The prompt cell was stale and contradicted the authoritative
knowledge source; removing it resolved a contradiction rather than creating a
gap. Program prices now come solely from `KNOWLEDGE.md`, which is the correct
single source.

### L1 — test brittleness and negative scope · **CLOSED**

`normalizeWhitespace` is applied to the two previously wrap-sensitive positive
assertions (`normalizedContract`, `normalizedGuidelines`), so a reflow no longer
breaks the build. Every risk-bearing negative now runs against the concatenated
`contract`: `v_party_contact_card`, `Returning lead — previously inquired on`,
`| Price`, `Mention both pricing options`, `Encourage early registration`, and
`LEAD with a confident program recommendation`.

### L2 — `CLAUDE-MAIN.md` status · **CLOSED**

`docs/PROJECT-MAP.md:456-459` now states it is "a compact compatibility/staging
companion and is not loaded by the current host or container runtime; contract
tests include it only to prevent contradictory guidance from surviving in the
repository." That is exactly the right framing: the file is held to the contract
without being claimed as enforced behavior.

### L3 — measured verification · **CLOSED**

`docs/ENGINEERING-CHANGELOG.md` now carries measured counts (5 files / 34 focused;
2 / 17 final pair; root 1,963 plus 43 permission-blocked re-run 43/43; 150 files
/ 2,006 accounted for), the replay figures (2,322 rows, old 568 / final 568 /
zero differences), the honest eval limit ("tests validate fixture/contract
structure only; no response quality claim is made"), the local-runtime
determination, and current file hashes.

The pre-edit-hash gap is recorded accurately rather than papered over: "Claude
attested that the excluded dirty approval-rejection and Handling Approval blocks
remained text-identical, but no pre-edit hash exists." That is a correct
representation of what R2 said and of its evidential weight.

---

## Independent checks

- **Focused tests re-run:** `src/autonomy-policy.test.ts` (10) and
  `src/sales-prompt-contract.test.ts` (7) → **17 passed**, matching the claim.
- **Fixture structure:** 9 cases, all seven routes present, unique IDs, `HUMAN`
  has `draftExpected: false`, the `TRANSACT` `Route-Basis` is 5 words and appears
  verbatim in its `currentMessage`, and **no non-`TRANSACT` case carries a
  `Route-Basis`**.
- **Residual scan** across all four Sales authority files for
  `v_party_contact_card`, `Returning lead — previously`, `| Price`,
  `Encourage early registration`, `Mention both pricing options`, `assume ACC`,
  `chaos_intent()`, `RECOMMENDED NEXT STEP`, and
  `LEAD with a confident` → **no matches**.

---

## Carried forward, correctly out of scope

Neither blocks acceptance; both belong to the excluded delivery/runtime work.

1. **Documented host behavior that does not exist on this branch.**
   `WORKFLOWS.md:163-170` still asserts card-time parsing, an outbound content
   guard applied "before it posts a review card", quarantine, and
   `[approval_card REJECTED]`; `:384-387` asserts visible rejection of legacy
   follow-up cards. On this branch there is no `approval_card` string in `src/`
   or `container/agent-runner/src/`, and `checkContent` is imported only by
   `src/gmail-ipc-handlers.ts` — the Gmail send boundary. This is R3 D-6 and
   commit `97ca2cc`, both deliberately outside this slice.
2. **No pre-edit hash for the two dirty Sales files.** Now recorded in the
   changelog with current hashes captured, which is the right remedy going
   forward. Capture hashes before the first edit in the next slice.

**One optional nit, not a defect.** `expect(contract).not.toContain('| Price')`
is a broad literal; a legitimate future pricing-reference table in any of the
four files would fail it. Intentional as a guard — worth a comment in the test
so the next author understands the failure when it fires.

---

## Scope attestation

Every correction landed inside the stated boundary. Mailman,
`src/approved-send-handoff.ts`, `src/send-watchdog.ts`,
`src/gmail-ipc-policy.ts`, `pending_sends`, Gmail receipts, IPC, database, Slack
delivery, and deployment are untouched. The safe state model
`drafted → approved_pending_send → gmail_confirmed` is unchanged, and
`[SALES ESCALATION]` remains outside `send-watchdog.ts:97` and
`approved-send-handoff.ts:28`, so a draftless escalation card still creates no
pending send.

This review authorizes nothing beyond the owner's commit decision — no build,
deployment, push, Slack post, email, or production query.
