# Self-Healing Phase 4 — Orchestrated, Evidence-Grounded Diagnosis

**Status:** Plan / pre-implementation · **Date:** 2026-06-24
**Supersedes** the one-shot diagnosis brain in `src/healer/diagnose.ts` (Phase 1).

## 1. Why

Today's brain is a **single non-agentic `claude --print` call over an ~8 KB static snapshot** (raw_context + `git log -12` + a source-scoped log tail). It cannot open the failing file, grep the codebase, check `git blame`, or reproduce. So on thin/misleading context it pattern-matches to a plausible guess — hallucinated commit SHAs, wrong filenames, and **symptom-fixes presented as root-cause fixes** (the contador incident: it proposed "improve logging" because the real stderr — "SA file missing" — had been swallowed).

Two failures fall out of that:
- **Wrong fixes look right.** A 👍 applies a fix for the wrong thing; the operator can't tell from a diff.
- **No earned trust.** Nothing tells the operator *whether to believe* the diagnosis.

Every real diagnosis done by hand this session (`/dev/null` mount, the SA path) came from **investigating** — reading code, grepping, dry-running. The brain must do that.

## 2. Principle

> An **orchestrator** owns each incident's lifecycle as a deterministic state machine and deploys specialized **agentic investigators** at the leaves. It aggregates their evidence into a **confidence-rated, adversarially-tested verdict**, and **gates every autonomous or approval action on earned trust**. Quality over cost.

Deterministic control flow (loops, gates, retries, timeouts) + LLM intelligence only at the leaves. The orchestrator must be *more robust than the daemon it heals* (who-watches-the-watchman) — so it is plain TypeScript, never an interactive LLM that could hang.

## 3. The Orchestrator

`src/healer/orchestrator.ts` — a deterministic controller that drives one incident through stages, spawning agentic sub-runs (via `agentic.ts:runAgenticClaude`, already scaffolded) and aggregating results. Replaces the linear `runDiagnose`.

Per incident, the stage graph:

```
        ┌─ triage (cheap, fallback only) ─┐
new ───►│                                  ├─► investigate (agentic, read-only)
        └──────────────────────────────────┘            │
                                                         ▼
                                              adversarial refute (agentic) ── ALWAYS after investigate
                                                         │
                                                         ▼
                                              synthesize verdict (confidence + cause/symptom + evidence)
                                                  │                         │
                                          trustworthy?                 not trustworthy
                                                  │                         │
                              ┌───────────────────┼──────────┐             ▼
                          transient            config/data  code_bug   needs_human
                          auto-rerun           👍 → apply    👍 → impl  (post evidence
                          (Phase 2)            (Phase 2)     (Phase 3)   + dissent, NO 👍)
```

### Roles (the leaves)
| Agent | Mode | Tools | Output |
|---|---|---|---|
| **Triage** | one-shot (Print Bridge) | none | quick class + severity; **fallback** when agentic is unavailable |
| **Investigator** | agentic, read-only | Read, Grep, Glob (+ curated read-only Bash, optional) | root_cause, class, fix, `confidence`, `cause_or_symptom`, `evidence[]` |
| **Refuter** | agentic, read-only | Read, Grep, Glob | `refuted`, `reason`, `better_cause` — investigates independently, tries to disprove |
| **Synthesizer** | deterministic (v1) / agentic (later) | — | reconciles investigator + refuter → final verdict + trust flag |
| **Repro-test author** (future) | agentic | Read, Write(test only) | a failing test reproducing the bug → feeds Phase-3 green-gate |

## 4. Escalation & adversarial policy (per operator directive: spend for quality)

- **Low threshold:** `severity != info` → **investigate** (agentic). `info` → triage only. Cheap triage is otherwise just the fallback when no token / timeout.
- **Always adversarial after escalation:** any investigated diagnosis ALWAYS gets the refuter.
- **On disagreement:** downgrade to low confidence + `needs_human`, attach the dissent. (Optional v2: spawn a 3rd tie-breaker investigation — judge panel.)

## 5. Trust model — gates the 👍 (answers "how do I know if it's right?")

Every diagnosis carries:
- `confidence`: high | medium | low
- `cause_or_symptom`: root_cause | symptom | unknown
- `evidence[]`: concrete findings (`file:line`, command output) the conclusion rests on

**👍 is only OFFERED when trustworthy** = `confidence >= medium` AND `cause_or_symptom == root_cause` AND survived adversarial review. Otherwise the proposal is posted as **"⚠️ needs a human look"** — with the evidence and any dissent shown — and has **no apply/implement path**. The operator judges the *claim and its evidence*, never raw code. Tests (Phase 3 green-gate) + the verify loop (recurrence) are the machine-checked backstops.

## 6. State machine & persistence

`new → triaging → investigating → adversarial_review → (proposed | needs_human) → awaiting_approval → remediating → verifying → (resolved | recurring | wont_fix)`

Persistence (migration 102 to `business_v2.incidents`): `confidence text`, `cause_or_symptom text`, `evidence jsonb`, `review jsonb` (refuter verdict), `investigation_log text` (transcript path for audit). The incidents table remains the full audit trail (design §6).

## 7. Throughput (cost is not the limit — latency/concurrency is)

Agentic investigation = 30 s–3 min each; the 5-min fast loop can't run many synchronously. Model:
- **Detached + polled orchestration:** the orchestrator dispatches investigate/refute as detached runs (like Phase 3), polls completion markers across fast-loop ticks, then synthesizes. An incident's lifecycle spans several ticks.
- **Concurrency cap** (e.g. ≤4 simultaneous `claude` processes) so we never fork-bomb the box.
- Consider a dedicated `healer diagnose` cadence separate from the 5-min collect loop.

## 8. Safety

- Investigation/refutation are **READ-ONLY** (Read/Grep/Glob; no Write/Edit; Bash only if a curated read-only allowlist is enabled) — cannot mutate the repo.
- Kill switches: `HEALER_DIAGNOSE_ENABLED`, per-stage flags; `HEALER_QUIET` already halts all autonomy.
- Redaction before any context reaches a model (already in place). Loop-prevention tags (already in place).

## 9. Build sequence

- **4a — Trust layer.** `confidence` / `cause_or_symptom` / `evidence` on the diagnosis + the 👍 gate + proposal display. (Small, immediate value — makes today's brain honest about its own uncertainty.)
- **4b — Agentic investigator + orchestrator skeleton.** `agentic.ts` (done) → `investigate()` (read-only) → orchestrator replaces the one-shot; store evidence.
- **4c — Adversarial refuter + synthesizer.** Always-after-escalation; disagreement → needs_human.
- **4d — Detached orchestration + state machine + concurrency.** Throughput at scale.
- **4e (future) — Repro-test author** feeding the Phase-3 tests-green gate.

## 10. Acceptance test (dogfood)

Re-run the brain on incident **561558** (the SA-path failure). It must: READ `backfill-names.cjs`, find the hardcoded `/workspace/extra/...` path used on the host, classify `code_bug` **high confidence, cause=root_cause, evidence=[file:line]** — and the refuter must confirm. Versus today's low-evidence "improve logging" symptom. That delta is the whole point.

## 11. Open decisions (need operator input)

1. **Execution model:** detached + polled (scales, more code) vs synchronous-bounded (simpler, ~1-2 incidents/run). Lean detached given "spend for quality."
2. **Reproduction in investigation:** read-only tools only (safe, can't dry-run) vs curated read-only Bash (richer evidence, small risk). Lean curated read-only Bash.
3. **Persistence:** new columns + migration (queryable audit) vs fold into `proposed_fix` jsonb (no migration). Lean columns.
4. **Synthesizer:** deterministic rules (v1) vs agentic judge.
5. **Tie-breaker:** spawn a 3rd opinion when investigator/refuter disagree, or just flag `needs_human`.
