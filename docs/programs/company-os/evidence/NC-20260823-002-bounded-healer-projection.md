# NC-20260823-002 bounded healer projection evidence

Date: 2026-08-23
Program item: `work:self-healing-bounded-natural-projection`
State: complete; deployed and one natural source live-verified

## Result

- Live catalog baseline: 146 current incidents, 137 pending decisions, nine
  verified recoveries. Unbounded activation was rejected.
- Release `d39bc0733e2d6840f69a43361c654b7734973170` requires exactly one valid
  source and `MAX_ITEMS=1`; disabled mode reads no catalog.
- Main and fast-healer services run that exact immutable release under Node
  22.23.2. Fast-healer launchd run count is three and last exit is zero.
- One naturally existing critical `needs_human` source produced exactly one
  `accepted/blocked` item, one minimized observation, and two events.
- Exact replay preserved 1 item / 1 observation / 2 events.
- Report readback shows one attention item with no contradictory state, event
  gap, missing receipt, or source gap.

## Non-interference

- Non-healer Company Work remains 25 items / 164 events with hashes
  `f33bc212ff651de5ca4008492d4333ff` and
  `5dcba1f05ba82584b6ed4e3f314b6e20`; receipts remain 76.
- Gmail and Slack are connected; active/waiting/outgoing queues are empty.
- Main and fast-healer error logs remain 273 and 24 lines.
- No second source, manufactured incident, Slack post/presentation,
  remediation/action, schedule, or credential change occurred.

## Recovery

- Main rollback points to exact predecessor `0ddb8794`.
- Fast-healer rollback plist:
  `com.nanoclaw.healer.fast.plist.rollback-index-2026-08-23T15-17-25-731Z`.
- Environment backup:
  `.env.rollback-company-healer-work-2026-08-23T15-17-48-670Z`.
- Expansion beyond this one source requires a new accepted owner decision.

## Review correction and final deployment

- Updated Claude token rotation completed the required independent bounded
  Sonnet/high review. The initial review found one high-severity edge case: a
  stale rejection actor could survive a later non-no-action classification and
  violate the ledger invariant for the sole configured source.
- Release `883f375f5ceb8ab9c357ce16499cc2ddf9f7511f` gates the actor hash on
  `decided_no_action` and adds a regression for a rejected incident re-entering
  transient monitoring. Focused tests pass 31/31, the healer suite passes
  241/241 with two skips, typecheck and continuity pass, and the full suite is
  3,020 passed / 12 skipped / the unchanged unrelated CNPC wrapper-literal
  failure.
- The targeted Claude correction review returned `NO MATERIAL FINDINGS`.
- The 880-file immutable archive has source tree
  `dc44be31bbbe412c0f00f2ae8780aba99ae86ac1`, artifact SHA-256
  `98592441bd9ae04174604433d3221c3f93391afaf421b2a5b30248262090c100`,
  and archive SHA-256
  `e4c64391d16169f3342f38811adabf17526ea3e3848be3a2deb66d55ab4e1a80`.
  It verified locally and after fresh extraction on `mini-claw.local` under
  Node 22.23.2.
- Fast-healer activation retained rollback
  `com.nanoclaw.healer.fast.plist.rollback-index-2026-08-23T20-06-41-634Z`.
  Its first and latest natural cycles each selected one source and returned one
  duplicate with zero transitions, observations, or errors.
- Main activation waited for a natural zero-container drain and retained
  rollback
  `com.nanoclaw.plist.rollback-d39bc0733e2d-2026-08-23T20-17-04-146Z`.
  PID 20493 serves the exact verified release with matching code root, connected
  Gmail/Slack, and empty active/waiting/outgoing queues.
- Live readback remains exactly one `accepted/blocked/1` healer item, one
  observation, two events, and one `attempted/1/posted` Chief dispatch with
  `posted,picked_up,attempt_succeeded`. No item, event, or healer observation
  was recorded after the main activation boundary.
