# NC-20260908-001 correction review R2B

Review only the following load-bearing correction. Do not inspect any other
file or knowledge source.

R1 found that unconditional Sales final-text suppression could make a clean,
tool-less run silent. The correction adds this function (the production source
uses the existing `Channel`, `getLatestGroupResponse`, `IPC_POLL_INTERVAL`, and
logger):

```ts
export const SALES_MISSING_OUTPUT_NOTICE =
  '[BLOCKED] Sales produced no review card or operator response. Nothing was approved or sent. Please retry this thread.';

export async function noticeSalesRunWithNoOutput(
  chatJid: string,
  threadTs: string,
  runStartedAt: string,
  channel: Channel,
  deps = {},
): Promise<boolean> {
  const latestResponse = deps.latestResponse ?? getLatestGroupResponse;
  const wait = deps.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const polls = deps.polls ?? 5;
  for (let poll = 0; poll < polls; poll++) {
    const latest = latestResponse(chatJid, 'sales', threadTs);
    if (latest && latest >= runStartedAt) return false;
    await wait(IPC_POLL_INTERVAL);
  }
  const latest = latestResponse(chatJid, 'sales', threadTs);
  if (latest && latest >= runStartedAt) return false;
  await channel.sendMessage(chatJid, SALES_MISSING_OUTPUT_NOTICE, {
    fromGroup: 'sales', threadTs,
  });
  return true;
}
```

`salesRunStartedAt` is captured immediately before `runAgent`. After
`runAgent`, the function is launched only when all are true:

```ts
group.folder === 'sales' && threadTs && salesRunStartedAt &&
output !== 'error' && !hadError
```

It is not launched for error runs, so cursor rollback/retry remains unchanged.
`getLatestGroupResponse` is scoped to chat, `from_group='sales'`, exact
`thread_ts`, excludes `[PROCESSING]%`, and returns the maximum ISO timestamp.
The normal Slack persistence path writes Sales tool posts with that group and
thread. Tests prove: (1) no response after two injected drain polls posts the
fixed notice once; (2) a real timestamp newer than the run start appearing on
the second poll posts nothing. Focused corrected checks pass 172/172 and
typecheck passes.

Also corrected, non-load-bearing: token-value redaction now stops before period
or comma punctuation, with an exact test; pipeline-free HUMAN support uses
`[SALES ESCALATION] Support — {short issue}` with no Lead/Entry ID.

Write only `docs/reports/NC-20260908-001-CLAUDE-CORRECTION-RESPONSE-R2.md`.
State `NO MATERIAL FINDINGS` if this closes R1; otherwise identify only a
remaining material defect in the excerpted correction.
