# NC-20260827-001 bounded implementation review

## Objective

Review the minimal external-watchdog repair that prevents a healthy deployment
restart from becoming a self-sustaining stale-Slack-heartbeat restart loop.
Report only material correctness, safety, regression, test, or deployment
findings. Do not broaden into unrelated NanoClaw behavior or reimplement the
change.

## Authority and accepted facts

1. `scripts/nanoclaw-watchdog.sh` is the production external watchdog and runs
   every 120 seconds from launchd.
2. NanoClaw emits its Slack diagnostic heartbeat every configured
   `HEARTBEAT_INTERVAL_MS`; production is `600000`.
3. The 2026-08-26 incident is established from live read-only evidence:
   - last stored heartbeat: 23:08:54 local;
   - ordinary deployment restart: 23:17:58;
   - watchdog stale warning: 23:24:38 at heartbeat age 944 seconds;
   - forced restart: 23:26:38 at heartbeat age 1064 seconds and daemon uptime
     about 520 seconds, before the 600-second first scheduled heartbeat;
   - subsequent forced restarts repeated about every eight minutes;
   - throughout inspection, `/health` responded, Slack and Gmail were
     connected, and the queue was empty.
4. "Consecutive failures: 4" is a score: the stale-heartbeat check adds two
   points on each 120-second pass. It is not evidence of four process crashes.
5. Preserve the existing recovery behavior for disconnected Slack, missing or
   malformed health/uptime, unreachable health, frozen process heartbeat,
   container runtime failure, and a genuinely stale Slack heartbeat after the
   bounded startup window.
6. This task deploys only the reviewed external watchdog artifact. It does not
   build or activate a NanoClaw daemon release and must not mutate business,
   provider, customer, database, message, approval, schedule, or credential
   state.

## Implementation under review

Allowed read paths:

- `scripts/nanoclaw-watchdog.sh`
- `scripts/nanoclaw-watchdog.test.sh`
- `docs/ACTIVE-WORK.md` (only `NC-20260827-001`)
- `docs/ARCHITECTURE.md` (external-watchdog paragraph)
- `docs/PROJECT-MAP.md` (external-daemon-watchdog row)
- this request

The implementation:

- validates/converts the configured heartbeat interval;
- derives a stale threshold as `max(900, interval + 300)` seconds;
- derives a first-heartbeat startup window as `interval + 180` seconds;
- reads live daemon uptime from `/health` and floors it for Bash arithmetic;
- suppresses only the stale-heartbeat score while Slack is explicitly
  connected and live daemon uptime is inside that bounded window;
- leaves every other check and restart path unchanged;
- exposes pure timing predicates when sourced so the focused Bash regression
  test can exercise the production incident and fail-loud boundaries.

## Verification already run

- `bash -n scripts/nanoclaw-watchdog.sh scripts/nanoclaw-watchdog.test.sh`
- `bash scripts/nanoclaw-watchdog.test.sh` -> PASS
- `git diff --check` -> PASS
- pre-change production script SHA-256 exactly matched commit `f52f708f`.
- ShellCheck is not installed locally; do not treat that absence alone as a
  material defect.

## Review questions

1. Can any malformed/unavailable health data incorrectly receive grace?
2. Can the new timing math suppress a real Slack failure beyond the stated
   bounded window or create a fresh restart loop?
3. Does sourcing the script for tests alter ordinary executable behavior?
4. Are the tests sufficient for the load-bearing incident and fail-loud
   boundaries?
5. Is copying the reviewed watchdog file into its existing production path,
   without restarting the daemon or watchdog launchd job, a sound activation
   method given launchd executes the path anew every 120 seconds?

## Required response

Write only
`docs/reports/NC-20260827-001-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R1.md`.
Order material findings by consequence with exact file/line evidence. If there
are no material findings, say `NO MATERIAL FINDINGS` and briefly state what was
checked. Do not edit any other file and do not use Bash, web, MCP, credentials,
`.env`, logs, databases, or unrelated repository content.
