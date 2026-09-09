# NC-20260908-001 bounded implementation review — response

## Scope

Reviewed exactly the files listed in the request (`src/index.ts`, `src/ipc.ts`,
`src/gmail-parser.ts`, `src/sensitive-url-redaction.ts`, `src/gmail-api.ts`,
`groups/sales/CLAUDE.md`, `groups/sales/WORKFLOWS.md`) plus the request
document. No customer message, approval, Gmail send, DB mutation, migration,
or credential read was performed. Two narrow, read-only greps outside the
listed files were done to confirm a single fact each — that `src/channels/gmail.ts`
(the inbound ingestion path) and `src/gmail-api.ts` both funnel body text
through the one `formatEmailForAgent` redaction chokepoint, and that
`group-queue.ts`'s `deliverSourceInput` return semantics match what `ipc.ts`
assumes — since both bear directly on the review's explicit questions. No
other files were read.

## Material finding: Sales has no compensating notice for a silently-empty run

`shouldSuppressFinalText` (`src/index.ts:356-370`) now hard-codes Sales into
unconditional suppression, independent of `threadTs` or any container-config
flag:

```
if (group?.folder === GRADER_GROUP_FOLDER || group?.folder === 'sales')
  return true;
```

This is correct per accepted behavior #5 and matches `groups/sales/CLAUDE.md`'s
"emit no final text" rule. But the grader path this mirrors also ships a
compensating producer for the case where a suppressed run publishes nothing at
all: `noticeGraderRunWithNoOutput` (`src/index.ts:487-511`), invoked only when
`group.folder === GRADER_GROUP_FOLDER && threadTs` (`src/index.ts:1145-1165`).
Sales has no equivalent call.

Trace the Sales case through `processGroupMessages`: if a run finishes with
`output !== 'error'` and `hadError === false` but the model never called
`send_message` (`outputSentToUser` stays `false` — e.g. it stalls in
`<internal>` reasoning, hits a tool-call parsing failure, or otherwise ends its
turn having produced nothing), execution falls straight to:

```
recordSuccess(group.folder);
processingAcknowledgments.delete(compositeKey);
return true;
```

(`src/index.ts:1189-1192`). There is no `outputSentToUser` check on the
success branch. The cursor was already advanced before the agent ran
(`src/index.ts:958-961`) and is never rolled back on a clean-but-empty success,
so the work item is durably marked processed with zero trace: no Slack
message, no error log tied to the group, no retry, and the `[PROCESSING]`
receipt (if one was posted) is the only visible artifact and reads as
resolved. This is the exact failure mode the grader notice's own docstring
describes ("for a submission thread silence is the worst outcome: the
operator has no verdict, no block notice, and no reason to look") — Sales
carries the identical risk profile (dropped leads/support threads) and the
same incident history cited throughout `groups/sales/CLAUDE.md` (Travis Rose,
Bernard Suman, Carol Del Priore), but the fix applied to grader here was not
extended to Sales.

Note this is not a regression introduced by this diff's runtime behavior:
`withRequiredSalesConfig` already forced `suppressFinalText` and
`suppressFinalTextInThreads` to `true` for every registered Sales group before
this change, so a correctly-configured Sales group was already fully
suppressing final text in practice. The diff's contribution is making that
suppression a hard, DB-drift-proof invariant — closing one hole (a stale
config row leaking raw model text) while leaving the pre-existing "silent
empty success" hole exactly as open as before, on code this task otherwise
touched directly. Given item 5 of the accepted behavior is specifically about
this suppression path, this gap is on-point for this task's scope even though
it predates it.

**Recommendation:** add a Sales-scoped equivalent of the grader "no output"
notice — e.g. after the agent run, if `!hadError && !outputSentToUser`, post
one fixed host-authored notice into the work thread (or to an operator/chief
channel) so a silent turn is at least visible instead of indistinguishable
from a handled one.

## Confirmed correct

- **Retry receipt identity/lifetime** (accepted behavior #3): the dispatch-time
  ack (`src/index.ts:1553-1560`) and the spawn-path fallback ack
  (`src/index.ts:993-1003`, gated by `dispatchAcked` computed at
  `src/index.ts:840-842`) both key `processingAcknowledgments` by
  `compositeKey → inputTimestamp`. A failed run leaves the entry in place so a
  same-input retry is silently deduped; a successful run deletes it
  (`src/index.ts:1190`) so a later, newer input gets a fresh receipt. The
  documented reset-on-daemon-restart (the map is intentionally not persisted,
  per the comment at `src/index.ts:560-566`) is a stated design choice, not a
  bug.
- **Private approval-card rejection routing** (accepted behavior #4): all five
  Sales rejection call sites in `ipc.ts` (semantic issue ~line 619, malformed
  ~line 659, overlong ~line 696, content guard ~line 758, fact-consistency
  ~line 809) share the same pattern —
  `writeRejectedApprovalCardInput` returns `true` only when a
  `source_container` is present *and* `deliverSourceInput` reports a write to
  a `state.active`, container-matched target (`src/group-queue.ts:454-477`);
  the public Slack fallback fires whenever `sourceGroup !== 'sales' ||
  !rejectionReturned`. A missing `source_container` or an inactive/unmatched
  target correctly falls through to the public message, so the deterministic
  failure modes are not silent. The residual risk is the narrow, inherent race
  between the in-memory `state.active` check and the target container's next
  poll of its own input directory before it exits — this is shared by every
  piped-message path in the system (ordinary follow-up piping included), not
  new to this change, and is the accepted cost of the "private repair, public
  only when the session is gone" design this task asked for.
- **Redaction coverage** (accepted behavior #6): both Gmail body-ingestion call
  sites that matter — `src/gmail-api.ts` (`getThread`/`getEmailSummary`) and
  the inbound classification path in `src/channels/gmail.ts` — construct their
  agent-facing text exclusively through `formatEmailForAgent`
  (`src/gmail-parser.ts:472-525`), which applies
  `redactSensitiveUrlQueryParameters` to the body before returning
  (`src/gmail-parser.ts:520-524`). There is one chokepoint, not two divergent
  implementations.
- **Redaction correctness on ordinary URLs**: the parameter-name alternation in
  `src/sensitive-url-redaction.ts:1-2` is anchored immediately after the
  `[?&]`/`&amp;` delimiter and must be immediately followed by `=`, so a
  differently-named parameter (`session_token=`, `access_token_extra=`, plain
  `q=`, etc.) never matches — non-sensitive URLs pass through unchanged.
- **`Re:` case-insensitivity** (accepted behavior #7): both the reply-subject
  check (`src/gmail-api.ts:459`) and `baseSubject` (`src/gmail-api.ts:648`)
  use the `/i` flag; no case-sensitive prefix check remains in this file.

## Minor, non-blocking observations

- `sensitive-url-redaction.ts`'s value character class (`[^&#\s<>"')\]]+`)
  does not exclude `.` or `,`. A token value immediately followed by sentence
  punctuation with no other delimiter (e.g. `...token=abc123. Thanks`) has the
  trailing period absorbed into the redacted span, dropping it from the
  output. This only affects text adjacent to an already-redacted secret value
  — no leak, no effect on ordinary URLs — but is a small, avoidable output
  corruption if worth tightening.
- `groups/sales/CLAUDE.md:64-69` and `WORKFLOWS.md`'s operator-answer fast path
  both send an access-report-with-no-operator-answer case to "the ordinary
  HUMAN support path," which in the Draft Format section maps to
  `[SALES ESCALATION] Lead #{id}`. That header nominally expects a resolved
  Lead/Entry ID, but the Client Support Review path this scenario originates
  from explicitly forbids resolving or inventing one. `ipc.ts` does not parse
  or gate `[SALES ESCALATION]` specially (it lacks the `DRAFT RESPONSE`
  marker `isApprovalCard` keys on), so this is cosmetic rather than a routing
  or approval defect — but the two documents don't say what to put in
  `Lead #{id}` for a no-pipeline-entry support escalation, which invites an
  agent to either fabricate an ID or query for one against the explicit "never
  resolve an Entry ID for Client Support Review" rule. Worth a one-line
  clarification.
