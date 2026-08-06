# NC-20260804-003 — Claude response R3

## 1. Verdict

**Verdict: CONVERGED**

Both post-R2 changes are correct and neither invalidates the R2 verdict. The
parser change closes the R4-scale residual I flagged and is a strict improvement
on every shape I tested; the `SECURITY.md` addition matches the implementation.
I found no newly introduced reachable regression. One optional one-clause wording
precision is in §3; it is not a blocker and I am not proposing it as one.

---

## 2. Change 1 — marker selection

`src/approved-send-handoff.ts:137-138, 183-188`. `buildApprovedHandoff` now
captures the first `CARD_MARKER` occurrence and derives `emailType` from that
captured marker alone:

```
const cardMarker = cardText.match(CARD_MARKER)?.[0];
if (!cardMarker) return null;
…
const emailType = /^\s*\[FOLLOW-UP\s+#\d+\]/.test(cardMarker) ? 'follow-up' : 'initial';
```

### 2.1 Correctness per card type

I executed the parser against all four markers plus the residual shapes:

| Card | Result |
| --- | --- |
| `[SALES REVIEW]` | `emailType=initial` ✓ |
| `[CLIENT SUPPORT REVIEW]` | `emailType=initial` ✓ |
| `[SUPPORT-DRAFT]` | `emailType=initial` ✓ |
| `[FOLLOW-UP #2]` with header `Thread-ID` | `emailType=follow-up`, `gmailThreadId=T99` ✓ |
| `[FOLLOW-UP #2]` without header `Thread-ID` | `null` ✓ still fails closed |
| `[SALES REVIEW]` + **raw** line-start `[FOLLOW-UP #2]` in the header narrative | `emailType=initial` ✓ **R2 residual closed** |
| `[SALES REVIEW]` + **Slack-quoted** `> [FOLLOW-UP #2]` in the header | `emailType=initial` ✓ |
| `[SALES REVIEW]` + `[FOLLOW-UP #2]` inside the fenced body | `emailType=initial` ✓ |
| `[CLIENT SUPPORT REVIEW]` + line-start `[FOLLOW-UP #9]` in the header | `emailType=initial` ✓ (not covered by the new regression; verified here) |
| `[SALES REVIEW]` preceded by two blank lines | `emailType=initial` ✓ |

Marker selection is correct for all four card types. The alternation cannot
mis-select between them: at a given line start only one alternative can match,
and the `[FOLLOW-UP #N]` test is applied to the captured marker rather than to
the card text, so no other occurrence anywhere in the message can influence the
classification.

Two implementation details I checked specifically:

- The `emailType` regex deliberately drops `/m`, and `cardMarker` carries its own
  leading `\s*` from the capture, so `^` anchors at the substring start. Correct.
- `CARD_MARKER` has no `/g` flag, so `.test()` in `isApprovalCard` and `.match()`
  here share no `lastIndex` state. There is no stateful-regex interaction between
  the gate and the parser.

### 2.2 Residual moved, not reintroduced

`String.prototype.match` with a non-global regex returns the **first** match, so
a line-start `[FOLLOW-UP #N]` appearing *before* the card's own marker would be
captured instead. I tested that shape: it returns `null` (fails closed) when
there is no header `Thread-ID`.

That shape is not reachable through the Slack path. `storeOutbound` persists
`outboundText`, not the display string (`src/channels/slack.ts:1084-1090`), and
the `[fromGroup]\n` prefix is skipped entirely when the text already starts with
`[` (`src/channels/slack.ts:1028-1029`). A stored approval card therefore begins
with its own marker on line 1.

This is strictly narrower than the R2 residual, which any line-start marker
anywhere in the header could trigger. Net: an improvement with no new exposure.

### 2.3 Consumers unaffected

`buildApprovedHandoff` no longer calls `isApprovalCard`, but both use the same
`CARD_MARKER` constant, so the gate and the parser cannot diverge. That matters
because `observeApprovalCard` computes `rejected = isApprovalCard(cardText) &&
!pending` (`src/send-watchdog.ts:222`) — a divergence would have produced either
a card that passes the gate and never parses, or a silently untracked approval.
Verified identical.

`parseMailmanHandoff` still derives `emailType` from the `Follow-Up: true`
handoff line (`src/approved-send-handoff.ts:117`), untouched by this change. The
four `isApprovalCard` call sites (`src/channels/slack.ts:1031, 1033`,
`src/ipc.ts:165`, `src/send-watchdog.ts:153, 222`) are unchanged in semantics.

The new regressions in `src/approved-send-handoff.test.ts` cover the quoted and
raw prior-message shapes and the line-start anchoring; both card-type coverage
gaps I probed above (support card with a header follow-up marker, marker before
the card marker) behave correctly even though no test asserts them.

---

## 3. Change 2 — `docs/SECURITY.md`

Two bullets added at `docs/SECURITY.md:212-219`.

**Supersession bullet** — "approving a newer card in the same Slack work thread
durably blocks every older pre-Gmail action in that work thread as superseded;
actions that may already have reached Gmail are never superseded."

Matches `src/db.ts:1266-1312` exactly: scoped to
`(group_folder, chat_jid, thread_ts)`; the superseded set is
`approved | handoff_routed | mailman_started | attention_required`, which is
precisely the pre-Gmail set; `executing`, `uncertain` and `confirmed` are
excluded; the transition writes both the row state and an append-only ledger
event, which is what "durably" claims. Accurate.

**Ambiguity bullet** — "if more than one live approval shares a Gmail thread, the
host holds the request unless the raw request body identifies exactly one durable
candidate; request bytes may corroborate action selection but never become
execution authority."

The second clause is exactly right and is the important one: bytes filter
candidates at `src/ipc.ts:865-875` and `:916`, while the executed payload always
comes from `buildHostApprovedEmailExecution`. The hold behaviour matches
`src/ipc.ts:878-899` (reply path) and `src/ipc.ts:943-955` → `:980-1001`
(send path).

One precision nit, **optional**: the hold applies when the request carries no
Action-ID. With an explicit Action-ID the host uses the named action and does not
hold — correct behaviour, and covered by the preceding supersession bullet, but a
reader could infer otherwise from "shares a Gmail thread" alone. Adding "when the
request carries no Action-ID" would remove the ambiguity. Not a blocker; the
documented security property is not overstated in the direction that matters.

The three surrounding bullets (execution intent, follow-up card fields,
pre-approval content guard) are unchanged from the tree I reviewed at R2.

---

## 4. Newly introduced reachable regressions

**None.**

Checked and cleared: first-match marker capture (§2.2), stateless regex use,
`^` anchoring on the captured substring without `/m`, gate/parser constant
identity (§2.3), `parseMailmanHandoff` independence, leading-blank-line cards,
and all four `isApprovalCard` consumers. The R2 clearances for supersession,
Gmail-thread ambiguity, terminal-state precedence, authorization, test routing,
and link parsing are untouched by a parser-and-docs-only change.

---

## 5. Mechanical checks

Runtime: macOS, `/private/tmp/nanoclaw-sales-ack`. Local `node -v` = `v26.5.1`;
`.nvmrc` pins `22.23.2`. Nothing was sent, written to a database, activated, or
committed.

| Check | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | **Pass**, no diagnostics |
| `git diff --check` | **Pass** |
| `npx vitest run` over all 7 parser-consuming files, `--pool=forks --no-file-parallelism --maxWorkers=1` | **Pass** — 7 files, **190 tests**, identical to R2 |
| `src/approved-send-handoff.test.ts` alone | **Pass** — 23/23, matching Codex's local figure |
| `npm run test:email-critical` | **Environment limitation, unchanged** — 401 pass / 95 fail / 1 skipped of **497**; 14/18 files pass |
| Executed parser probe over 10 card shapes | Table in §2.1 |

The gate result is byte-identical to R2: the same 4 files
(`db`, `classify-ipc-handlers`, `email-delivery-path`, `routing`) fail on the
same single error —

```
better_sqlite3.node was compiled against a different Node.js version using
NODE_MODULE_VERSION 127. This version of Node.js requires NODE_MODULE_VERSION 147.
```

— because `node_modules` symlinks to the primary checkout, which is built for
Node 22. I did not run `npm rebuild`. This is a native ABI mismatch and says
nothing about the change. Since no file in that failing set is touched by this
parser-only diff, and the 497 total matches the last pinned-Node gate exactly, I
expect Codex's rerun to reproduce 18 files / 497 tests. That expectation is not a
substitute for running it.

---

## 6. Files written, elapsed time, cost

**Files written**

```
docs/reports/NC-20260804-003-CLAUDE-RESPONSE-R3.md
```

Exactly one file, and the only file I wrote this round. No source, test, other
documentation, runtime data, service, Gmail, Slack, or database was modified. No
message or email was sent. `git status` is otherwise identical to the state I
received.

**Elapsed:** ~3 minutes wall clock (2026-08-06T00:59:14Z → 2026-08-06T01:01:54Z),
single Claude session, no subagents and no parallel workflows.

**Cost:** not available — this session exposes no token or cost telemetry to me,
and I will not estimate one. Scope for reference: 1 typecheck, 1 whitespace
check, 3 test invocations, 1 executed parser probe over 10 card shapes, and
roughly 6 file reads/greps.
