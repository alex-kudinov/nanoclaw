# NC-20260828-003 — independent implementation review response (R1)

Reviewer: Claude (Sonnet), read-only review of the allowed packet only. No files
edited.

## Verdict

Material findings below. Do not treat "toolbox canonical campaign suite:
PASS" as confirmed — two of my findings are direct contradictions of specific
assertions in `test-canonical-campaigns.sh` as currently written. Re-run the
suite and confirm the actual pass/fail status before relying on it.

---

## Finding 1 (material, primary) — Grammar accepts a two-recipient message as a single authorized record

`parse-send-command.sh` matches the recipient tail against two alternatives
(lines 60–64):

```
60  if [[ "$recipient_text" =~ ^([^[:space:]\<\>]+@[^[:space:]\<\>]+)$ ]]; then
61      email="${BASH_REMATCH[1]}"
62  elif [[ "$recipient_text" =~ ^(.+)[[:space:]]+\<([^[:space:]\<\>]+@[^[:space:]\<\>]+)\>$ ]]; then
63      supplied_name="${BASH_REMATCH[1]}"
64      email="${BASH_REMATCH[2]}"
```

The `(.+)` in the name-capture group is unconstrained — it may itself contain
a complete second `Name <email>` segment. Given
`recipient_text = "one <one@example.com> two <two@example.com>"`, the pattern
is anchored (`^...$`) and the string ends in `>`, so the only way the whole
pattern can match at all is: group 1 = `"one <one@example.com> two"`, group 2
(email) = `"two@example.com"`. This is not a greedy-vs-lazy ambiguity — it is
the single decomposition that satisfies the anchors, so it matches
deterministically.

Consequence: a two-recipient message of the shape `Name1 <email1> Name2
<email2>` is accepted as `matched:true`, and if the resolved alias maps to an
attribute-free preset, `immediate:true` — exactly the case Question 1 asks
about, and exactly the case the correction's own requirements say must stay
non-immediate ("multiple emails ... must remain non-immediate").

This is directly contradicted by the shipped test:

```
25  [[ "$(parse 'issue coaching tools to One <one@example.com> Two <two@example.com>' | jq -r '.data.reason')" == 'not_explicit_send' ]]
```

By the trace above, `parse-send-command.sh` will return
`reason:"authorized_explicit_send"` (or `attributes_required`, depending on
the preset), not `not_explicit_send`. This assertion should fail if the
suite is actually executed.

**Why this doesn't (currently) reach real issuance:** the second email's
identity is resolved via Heartbeat, and the garbled `suppliedName` (`"one
<one@example.com> two"`) is then compared to the real resolved name in
`prepare-send-command.sh`. In every realistic case that comparison fails
(`identity_name_mismatch`), so the multi-recipient message is saved from
immediate execution by the *identity* gate, not the *parser* gate. That is
the opposite of the design intent stated in the trigger: the parser is
supposed to be the layer that rejects multi-recipient text outright,
independent of who the second identity happens to resolve to. Relying on the
name-mismatch gate as an accidental backstop for a parser bug is fragile: if
a Heartbeat record's stored name were ever malformed/garbled in a way that
happens to reproduce the concatenated string, the message would authorize.

**Fix direction (not applied — review is read-only):** exclude `<`, `>`, and
`@` from the name-capture character class (e.g.
`^([^<>@]+)[[:space:]]+\<([^[:space:]\<\>]+@[^[:space:]\<\>]+)\>$`), or reject
`recipient_text` outright whenever it contains more than one `@`.

---

## Finding 2 (material) — Supplied name is silently lowercased; contradicts test expectation

`parse-send-command.sh` builds `alias_text` and `recipient_text` from
`BASH_REMATCH` after matching against `$lowered` (line 48), not `$normalized`:

```
47  normalized=$(printf '%s' "$text" | tr '\r\n\t' '   ' | awk '{$1=$1; print}')
48  lowered=$(printf '%s' "$normalized" | tr '[:upper:]' '[:lower:]')
49  if [[ ! "$lowered" =~ ^(send|issue)[[:space:]]+(.+)[[:space:]]+to[[:space:]]+(.+)$ ]]; then
...
54  verb="${BASH_REMATCH[1]}"
55  alias_text="${BASH_REMATCH[2]}"
56  recipient_text="${BASH_REMATCH[3]}"
```

`BASH_REMATCH` captures substrings of whatever string was matched — here,
`$lowered`. Nothing later in the file (lines 75–76 only re-trim/re-lower)
restores original casing. So `supplied_name` for input `Test Person
<TEST@EXAMPLE.COM>` will be `"test person"`, not `"Test Person"`.

This contradicts:

```
17  [[ "$(parse $'issue coaching tools to\nTest Person <TEST@EXAMPLE.COM>' | jq -r '.data | [.matched,.immediate,.verb,.preset,.suppliedName,.email] | @tsv')" == $'true\ttrue\tissue\tcoaching-tools-mastery\tTest Person\ttest@example.com' ]]
```

which is the primary happy-path test for the new `issue` grammar, not an edge
case.

**Security impact:** none. `prepare-send-command.sh` lowercases and trims
both `suppliedName` and the resolved Heartbeat name before comparing (lines
52–53), so the identity gate is unaffected either way — both sides are
normalized identically regardless of this bug.

**Non-security impact:** the `suppliedName` value surfaced in the
`identity_name_mismatch` receipt (`prepare-send-command.sh` line 55) and in
any prompt-level display of it will always show the owner's typed name
lowercased, not as typed. Combined with Finding 1, this is a second
assertion in `test-canonical-campaigns.sh` that should fail if the suite is
actually run.

---

## Answers to the review questions

1. **Can any accepted grammar produce more than one recipient/email or admit
   an attachment/batch tail?** Yes for the two-recipient bracket case — see
   Finding 1. No for attachment/batch tails: the `<attached_file>...</attached_file>`
   marker contains no `@`, so it can never satisfy the trailing
   `<...@...>` requirement, and the tested batch cases (lines 26–27) correctly
   resolve to `not_explicit_send`.

2. **Can a supplied name bypass the exact Heartbeat name check, or leak into
   issuance instead of the resolved identity?** No. `prepare-send-command.sh`
   always emits `name:$identity.name` (line 60) — the resolved Heartbeat
   name — never `suppliedName`. The comparison itself (lines 52–57) is
   symmetric and fails closed on any non-exact match. Finding 2's casing bug
   doesn't change this because both sides are normalized before comparison.

3. **Did the `issue` form weaken alias uniqueness, attribute gates, ordinary
   review, duplicate prevention, pending durability, or uncertain-result
   holds?** No. `verb` is captured but not otherwise used to branch parsing
   logic — alias-uniqueness checking (lines 40–45), attribute-count gating
   (lines 91–96), and everything downstream in `EXECUTION-STEPS.md` (Phase
   1d dedup/hold, Phase 1d.6 receipt branching) apply identically regardless
   of verb.

4. **Is the exact-existing-pending reuse contract unambiguous and safe
   against multiple matches?** The multi-match branch is explicit ("If more
   than one exact match exists, hold and ask which ID," `EXECUTION-STEPS.md`
   line 82) and is prompt-enforced rather than code-enforced, consistent
   with the rest of the pending-script system (e.g. Phase 3's own
   multiple-pending handling). One latent ambiguity: the contract doesn't
   state whether the stored pending script's `--email` value must be
   byte-exact or case-insensitive-exact against the resolved (always
   lowercased) identity email. Worst case from this ambiguity is a
   duplicate pending script rather than a double-send, since
   `issue-certificate.sh`'s own idempotency (`already_issued`) is the actual
   backstop against double issuance regardless of which pending script runs.
   Not blocking, but worth tightening in the prose.

5. **Are the tests materially adequate for the new behavior and preserved
   negative cases?** Mostly, but two assertions are wrong as written (lines
   17 and 25 — Findings 1 and 2), which means the suite's actual pass/fail
   status needs re-verification, not the "PASS" already claimed. Separately,
   the new "reuse exact pending match" / "hold on multiple matches" contract
   from `EXECUTION-STEPS.md` has no automated coverage anywhere in the
   allowed packet (it's inherently untestable by the bash harness, and
   `certifier-prompt-contract.test.ts` checks for the "do not create a
   duplicate" and "no alternate campaign bypass" strings but not for the
   "more than one exact match exists, hold and ask which ID" string).
