# NC-20260826-003 — Trafft exact identity evidence

Date: 2026-08-26

Program item: `work:relationship-context-trafft-exact-identity`

## Boundary

Exact refs are limited to provably Trafft-created Parties after adapter
registration and later appointments whose ledger Party agrees with the exact
customer ref. Legacy email-selected Parties remain held. The one-shot read
canary is content-minimized and host-only.

## Natural input

- exact live start: `416384fc`, directly containing rollout `460a51c7`;
- six new eligible appointments since rollout, three customers, one newly seen
  and two returning, zero multi-Party customer-ID collisions;
- live shadow healthy/complete at 420 observations/holds, zero projections,
  queries, grants, or Trafft refs;
- strict source-created rule identifies two safe customers/four appointments.

## Implementation and verification

- safe-candidate and appointment-agreement reconciliation is transaction-atomic;
- exact refs set deterministic receipts and verification time;
- exact observations project current; held/ambiguous rows remain null-Party;
- identity join uses exact customer refs before legacy email fallback;
- one-shot exact-ref canary records a delivered minimized query receipt;
- focused 45/45 plus canary/context tests, root typecheck, and disposable
  PostgreSQL 2/2 pass, including multi-customer creation-window refusal.
- root format, build, documentation continuity/capability checks pass;
- independent runner build and 45/45 tests pass;
- full root: 3,298 pass / 27 skip, with the sole unrelated CNPC wrapper
  assertion reproduced at exact base `416384fc`.

## Independent review

- Claude Sonnet/high R1 found two material defects: a same-family Party merge
  could make ref reconciliation abort, and a not-ready canary could leave its
  receipt pending;
- same-family refs now re-canonicalize to the winner while different-family
  conflicts refuse; failed canaries terminally mark a bounded failure code;
- R2 verdict: `NO MATERIAL FINDINGS`;
- usage audit: R1 six model calls / 101,879 maximum context tokens; R2 ten
  model calls / 96,705.

## Immutable release and backup

- implementation/live commit: `adc0c5d8ac1b55f8273f9ff807c3083ad4dc6e57`;
- source tree: `b2847aad21b696d22ef4d7ea744dd839c7a78044`;
- 992-file artifact: `a00926c5cdad5e4a33f35c4c2f28b9624ca93bc517defcf51c767b975bafbbd9`;
- archive: `0de7334fca97eab70e47d1cd9c277a158500e9cc2ab26e6335913075e6c6ed99`,
  byte-identical and runtime-verified on the Mini;
- deployment waited for Sales and Mailman to drain to zero active/waiting work
  and zero in-flight email actions;
- mode-0700 backup:
  `~/.local/share/nanoclaw-deploy-backups/NC-20260826-003-20260826T202330Z`;
- the initial full database dump refused unrelated public Procurement RLS and
  no activation ran; readable recovery artifacts then captured the affected
  `business_v2` schema/data, SQLite, and installed plist.

## Live reconciliation and canary

- the exact three-path activator retained rollback
  `com.nanoclaw.plist.rollback-416384fc7131-2026-08-26T20-25-35-991Z`;
- exact health: release/tree/artifact/code-root verified, Node 22.23.2, sole
  listener/launchd PID 28275;
- startup scanned 422 natural rows: 4 new exact observations/projections, 418
  duplicates/holds, 2 verified customer refs, 4 verified appointment refs,
  and zero conflicts;
- durable readback: 426 Trafft observations total, 422 immutable null-Party
  held observations, 4 exact observations, 4/4 current appointment
  projections, and zero prohibited raw/email/phone/name/custom value keys;
- one host-only exact appointments query resolved `current`, returned two
  projections internally, and terminally delivered content-minimized receipt
  1; its output contained no Party identity or context values;
- direct replay: 422/422 duplicates, zero new observations/projection changes,
  418 current-row holds, and zero conflicts;
- scheduled/group query remains disabled, zero active grants; Gmail/Slack,
  checkout production sends, and Community lifecycle remain healthy, with
  lifecycle consumers and Circle still off.

## Residual

The 418 legacy/returning current-row holds remain intentionally unresolved.
They require a separately authoritative provider reference or reviewed owner
reconciliation; historical or current email consistency is not sufficient.
