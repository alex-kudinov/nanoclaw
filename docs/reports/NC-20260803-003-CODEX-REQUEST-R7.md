# NC-20260803-003 Codex request R7 — final route-retry convergence

## Objective

Review the bounded repair for R6's one blocking duplicate-route finding and
return `CONVERGED` or `CHANGES REQUIRED`.

## Safety boundaries

- No email, Slack, production data, deploy, commit, or service restart.
- No secrets, auth/session files, database dumps, or live customer content.
- Do not edit implementation, tests, prompts, or authoritative docs.
- Write only the response file named below.

## R6 blocker and adjacent repairs

R6 correctly found that the same-version retry branch could route
`rules-runner-v1` even though Gmail already performs that direct route. The
repair replaces the retry `SELECT` with one conditional `UPDATE ... RETURNING`:

- `$2 <> 'rules-runner-v1'` makes the direct rules-runner path ineligible;
- `routed_at IS NULL` keeps completed work idempotent;
- the 30-second age predicate suppresses the first-handler race;
- `SET classified_at = NOW()` atomically claims one retry window, preventing
  concurrent old replays and recording the attempt;
- `RETURNING label` makes the persisted label authoritative when the replay
  payload disagrees, avoiding route/ledger divergence.

The retry remains route-only. Auto-archive convergence is intentionally left
to its existing behavior because this incident repair is for actionable host
handoffs and does not widen the retry into Gmail-label or Hive side effects.

Pinned Node 22.23.2 validation: 25/25 focused tests pass; typecheck clean.

## Required checks

1. The R6 rules-runner duplicate path is closed.
2. The conditional update is an atomic retry claim and cannot claim completed,
   recent, or rules-runner work.
3. The stored label, not an inconsistent replay payload label, drives taxonomy
   and routing.
4. A different classifier version resets stale `routed_at` and routes normally.
5. No new loss/duplicate path or authority widening blocks deployment.
6. The 25-test matrix adequately covers these contracts.

## Required response

Write only `docs/reports/NC-20260803-003-CLAUDE-RESPONSE-R7.md` with verdict,
blocking findings first, checks 1–6 with file/line evidence, non-blocking notes,
elapsed time, and unresolved owner decisions.
