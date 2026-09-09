# NC-20260908-001 final excerpt review R3 — response

R2's false-flagging defect (generic missing-output notice catching legitimate
no-action turns) is closed by the exact-token regex and the raw-before-strip
check shown here.

One remaining load-bearing defect in this excerpt: **`salesNoActionObserved`
has no visible reset tied to `salesRunStartedAt`.**

The gate is:

```
group.folder === 'sales' && threadTs && salesRunStartedAt &&
output !== 'error' && !hadError && !salesNoActionObserved
```

`salesNoActionObserved` is set `true` by a side effect when the raw result
matches the exact `<internal>NO_ACTION</internal>` token, but nothing in this
excerpt clears it back to `false` at the start of the next sales run. If the
flag is scoped to the thread/session rather than to the single run bounded by
`salesRunStartedAt`, the first legitimate resolved-support close latches the
flag permanently: every subsequent turn on that thread — including a real
missing-output failure — will have the drain suppressed by
`!salesNoActionObserved` regardless of what happens later.

That reproduces the exact failure mode this fix exists to prevent (a missing
Sales response going undetected), just deferred to occur after one correct
`NO_ACTION` close instead of never. Nothing in the excerpt demonstrates the
reset exists; per scope, no other file was read to check.

Recommend confirming (in the file that owns `salesRunStartedAt`) that
`salesNoActionObserved` is reinitialized to `false` at the same point
`salesRunStartedAt` is (re)established for each new sales run, before closing
NC-20260908-001.
