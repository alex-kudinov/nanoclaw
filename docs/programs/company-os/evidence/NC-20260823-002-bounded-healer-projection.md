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
