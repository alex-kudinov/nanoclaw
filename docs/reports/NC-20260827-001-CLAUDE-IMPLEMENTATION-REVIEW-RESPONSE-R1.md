# NC-20260827-001 bounded implementation review — response R1

## Verdict

**NO MATERIAL FINDINGS.**

## What was checked

Read in full: `scripts/nanoclaw-watchdog.sh`, `scripts/nanoclaw-watchdog.test.sh`,
the `NC-20260827-001` row and task-detail section of `docs/ACTIVE-WORK.md`, the
external-watchdog paragraph and `com.nanoclaw.watchdog` row of
`docs/ARCHITECTURE.md`, and the "External daemon watchdog" row of
`docs/PROJECT-MAP.md`. Verified the derived-timing formulas by hand for the
default interval (600000ms) and for the tested custom interval (1200000ms),
traced every call site of the three new timing helpers and
`should_grace_stale_heartbeat` through the full script body (all seven checks
and the decision gate), and confirmed the source-vs-execute guard's control
flow for both the sourced (test) and direct (launchd) invocation paths. No
Bash, network, database, or credential access was used; this is a static read
review only.

## Review question findings

**1. Can malformed/unavailable health data incorrectly receive grace?**
No. `daemon_uptime_sec` and `slack_connected` both come from `jq -r` reads
against `$health` with `// "null"` / `if (.uptime? | type) == "number" ... else "null"`
fallbacks, and the whole block is skipped (leaving both at their `"null"`
initial values, `scripts/nanoclaw-watchdog.sh:233-235`) whenever `$health` is
empty or `$needs_restart` is already true (`scripts/nanoclaw-watchdog.sh:249,
296`). `should_grace_stale_heartbeat` (`scripts/nanoclaw-watchdog.sh:29-37`)
requires `slack_connected == "true"` literally and `daemon_uptime_sec` to
match `^[0-9]+$`; `"null"`, missing, or non-numeric values fail both guards
closed. Confirmed by the test's `"missing uptime is never treated as startup"`
and `"disconnected Slack is never hidden by startup grace"` cases
(`scripts/nanoclaw-watchdog.test.sh:54-57`).

**2. Can the timing math suppress a real Slack failure beyond the bounded
window, or create a fresh restart loop?**
No defect found. For every interval value, `heartbeat_stale_after_sec` minus
`heartbeat_startup_grace_sec` is always ≥120s (`stale = max(900, interval+300)`,
`grace = interval+180`; when `interval ≥ 600`, the gap is fixed at exactly
120s; when `interval < 600`, the gap is `720-interval`, still positive).
Because daemon uptime since the current process start can never exceed the
elapsed time since the last stored heartbeat, a genuine post-window failure
(`hb_age > stale_after`) always coincides with `daemon_uptime_sec ≥
startup_grace_sec`, so grace cannot mask it. The exact incident numbers
(daemon uptime 520s, grace 780s) and the boundary (779 graced, 780 not) are
both asserted (`scripts/nanoclaw-watchdog.test.sh:47-53`), matching hand
verification.

**3. Does sourcing the script for tests alter ordinary executable behavior?**
No. The guard at `scripts/nanoclaw-watchdog.sh:40-42` only executes `return 0`
when `BASH_SOURCE[0] != $0`, which is true only when the file is sourced. When
launchd executes the file directly, `BASH_SOURCE[0] == $0` and control falls
through unchanged to `set -uo pipefail` and the rest of the operational body
starting at line 44. Nothing in the executable path is reordered or altered.

**4. Are the tests sufficient for the load-bearing incident and fail-loud
boundaries?**
Yes. The suite covers: interval conversion and its malformed-input fallback,
both derived formulas at the production interval and a second custom
interval, the exact 2026-08-26 incident timeline (`true 520 780` → graced),
the inclusive/exclusive grace boundary (`779` vs `780`), and all three
fail-loud paths named in the accepted facts — disconnected Slack, missing
uptime, and a genuinely stale heartbeat with plenty of uptime
(`scripts/nanoclaw-watchdog.test.sh:33-59`). The call site
(`scripts/nanoclaw-watchdog.sh:281`) passes arguments in the same order the
tests exercise (`slack_connected`, `daemon_uptime_sec`,
`HEARTBEAT_STARTUP_GRACE_SEC`), so the isolated predicate tests transfer
directly to the wired behavior.

**5. Is copying the file into the production path a sound activation method?**
Yes, given `com.nanoclaw.watchdog` is documented as a per-tick launchd job
("Every 120s", `docs/PROJECT-MAP.md:664` and `docs/ARCHITECTURE.md:594`), not
a persistent process — corroborated by the script's own atomic `mkdir`-based
lock (`scripts/nanoclaw-watchdog.sh:68-82`), which exists specifically to
prevent two independently spawned processes from overlapping. A fresh `bash`
process reads the current on-disk file every invocation, so replacing the
file is sufficient; no watchdog launchd restart is required. This is distinct
from `com.nanoclaw` itself, which the same tables mark "Always on" and would
require an explicit `kickstart` to pick up new code.

## Documentation consistency

`docs/ACTIVE-WORK.md:158-172`, `docs/ARCHITECTURE.md:604-610`, and
`docs/PROJECT-MAP.md:664` all describe the same bounded, Slack-connected,
live-uptime startup grace with no divergence from the code's formulas or
guard conditions.
