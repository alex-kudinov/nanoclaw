# NC-20260908-001 final excerpt review R3

Owner approved this third and final review. Review only this packet; use no
other reads.

R2 found that a generic missing-output notice could falsely flag legitimate
no-action Sales turns. The correction now recognizes only this exact result:

```ts
export function isSalesNoActionResult(raw: string): boolean {
  return /^\s*<internal>NO_ACTION<\/internal>\s*$/.test(raw);
}
```

The raw result is checked before internal blocks are stripped:

```ts
if (group.folder === 'sales' && isSalesNoActionResult(raw)) {
  salesNoActionObserved = true;
}
```

The fixed missing-output drain launches only when:

```ts
group.folder === 'sales' && threadTs && salesRunStartedAt &&
output !== 'error' && !hadError && !salesNoActionObserved
```

The Sales authority says the token is legal only for mechanical noise, an
explicit hold, an already-handled item with no missing receipt, or this exact
resolved-support case:

> If the newest customer message says the issue is now resolved or access is
> working, contains only thanks/context about the resolved problem, and asks no
> new question or action, close the turn with exactly
> `<internal>NO_ACTION</internal>`. Do not draft a courtesy reply, approval card,
> investigation promise, or recap. A past inconvenience is not a new ask. If
> any material request or unresolved problem remains, this shortcut does not
> apply.

The prompt also says never to use `NO_ACTION` because the model is unsure or
failed to call a required tool. Unit tests prove exact-token recognition and
reject bare `NO_ACTION` or other internal text. Prompt contract tests prove the
resolved/working/no-new-ask boundary. Corrected focused checks pass 59/59;
typecheck passes. No external action occurred.

Write only
`docs/reports/NC-20260908-001-CLAUDE-FINAL-REVIEW-RESPONSE-R3.md`.
State `NO MATERIAL FINDINGS` if R2 is closed; otherwise identify only one
remaining load-bearing defect in this excerpt.
