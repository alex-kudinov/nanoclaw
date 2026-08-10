# NC-20260809-003 — CDP disconnect repair review, Codex R16

- Date: 2026-08-10
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`
- Live integration commit: `f3c423c52f62850c4c52b2b76353d94b55247189`
- Claude session: preserve exact session `58fde579-483e-42ca-a516-434971d3ad07`
- Response file: `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R16.md`

## Authorization and boundaries

The owner authorized non-secret NanoClaw source/documentation exchange and asks
Codex and Claude to work together. Read only repository source, tests, R14-R16,
and Playwright's installed non-secret package source. Do not read secrets,
sessions, browser profiles, logs, databases, task payloads, or production row
content. Do not browse. Write only the named R16 response file. Do not edit
implementation, commit, deploy, or perform external actions.

## Empirical shadow result

Production safely advanced to the integrated immutable release `f3c423c52f62`
without losing the intervening Grader release. All Procurement gates were `0`.
The first no-write shadow started with two Chrome tabs. It failed truthfully on
the `coaching` search and emitted:

`CaleProcure collector failed: CaleProcure search failed for "coaching"`

Both owned tabs closed and the browser returned to two tabs; launchd Chrome
remained healthy. The Node process did not exit, proving R14 H-4. Codex
interrupted only that hung process. There was no source receipt or database
write.

## Candidate repair

`PlaywrightCaleProcureBrowserPort.close()` still closes both owned pages with
`Promise.allSettled`, then now awaits `this.browser.close()`. Installed
Playwright 1.62.1 source shows that a `connectOverCDP` browser is backed by a
`browserProcess.close` callback that calls `chromeTransport.closeAndWait()`;
the external launchd Chrome process is not owned or terminated. The browser
client close therefore disconnects the WebSocket that kept Node alive.

A unit test constructs the port with fake pages/browser and proves both page
closes and the client close occur exactly once. Exact Node 22.23.2 passes the
three focused files / 14 tests, typecheck, and formatting.

## Required review

Return `GO`, `CHANGES REQUIRED`, or `NO-GO` for commit, immutable redeployment,
and repeat shadow gate 1. Verify the Playwright close semantics from installed
source, cleanup/error behavior, test sufficiency, and whether any smaller or
safer supported disconnect exists. Restate the next empirical gate: process
must exit, Chrome must remain alive, tabs must return to baseline, then three
consecutive complete 9/9 shadows must pass. Record commands, limitations,
elapsed time, exact CLI cost if exposed, and confirm exactly one response file.
