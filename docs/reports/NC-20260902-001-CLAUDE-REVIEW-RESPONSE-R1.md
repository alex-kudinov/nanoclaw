# NC-20260902-001 — bounded implementation review response R1

## Verdict

GO

## Material findings

None. Reviewed every allowed artifact against the accepted incident facts, the
intended design, and the seven review questions. No bug, unsafe authority
inversion, fail-open behavior, release/activation gap, or test-that-can-pass-
while-the-defect-remains was found.

## Evidence against each review question

1. **Can Sales or another ordinary minion still resolve the packaged stale KB
   instead of its configured operational knowledge mount?** No.
   `RELEASE_OWNED_KNOWLEDGE_GROUPS` (`src/container-runner.ts:193`) contains
   only `'procurement'`. `planReleaseOwnedInstructionMounts` only substitutes a
   release-owned mount when the group folder is in that set
   (`src/container-runner.ts:268`); every other group's configured mount
   passes through untouched. `scripts/build-release.mjs`'s tracked-file list
   packages `knowledge/agents/procurement` only, not `knowledge/agents/*`
   generally (`scripts/build-release.mjs:122`), and
   `src/program-facts-release-source.test.ts` pins both the inclusion and the
   absence of a bare `'knowledge',` packaging line. Sales's own container
   still gets its configured operational mount.

2. **Can Procurement's mutable configured alias shadow the release
   procedure?** No. `isKnowledgeMountTarget` normalizes the container path
   (leading slash, trailing slash, `./` prefix, empty string all fold to
   `/knowledge` or `/workspace/extra/knowledge`) and
   `planReleaseOwnedInstructionMounts` filters every matching configured mount
   out of `additionalMounts` before they reach `validateAdditionalMounts`
   (`src/container-runner.ts:295`). `src/container-runner.test.ts:313-354`
   exercises exactly the alias shapes (`''`, `'knowledge/'`, `'./knowledge'`)
   the design doc calls out.

3. **Can catalog, pack, checkout expectations, or stale claims drift while
   sync, detector, build, or activation still passes?** No observed gap.
   `tools/sync-program-facts.py`'s `validate_aacs` and
   `src/program-facts-drift.ts`'s `detectCoachingSupervisionCatalogDrift` are
   structurally identical: `catalog_id`, integer `catalog_revision`,
   `program.status === 'live_enrolling'`, exact AACS `program_level` string,
   the two exact `checkout_expectations` tuples, `stale_claims.length >= 4`,
   and a raw-byte SHA-256 over the catalog file matched against the pack's
   `revision=/sha256=` marker. Both are checked in `check()`/`detectDrift`
   paths that run in `tools/validate-knowledge.sh`, `scripts/build-release.mjs`,
   and `release-activation-exec.ts`'s `verifyOperationalKnowledge`. A price,
   status, or stale-claim edit without a matching hash-marker update fails
   closed in all three gates.

4. **Can the activation preflight mutate operational knowledge, use the wrong
   release's sync code, or pass against a non-effective target?**
   `verifyOperationalKnowledge` (`src/release-activation-exec.ts:110-136`)
   invokes only `check`, never `sync`/`inject`, so it is read-only. It runs
   `<releaseDir>/tools/sync-program-facts.py` — the *target* release's own
   script — whose `ROOT` resolves to that same `releaseDir`
   (`tools/sync-program-facts.py:14`), so catalogs are read from the target
   release, not the currently-active one. `--target-root` is the installed
   plist's `WorkingDirectory`, i.e., the actual operational checkout Sales
   mounts, not the release directory. `activateRelease` runs this check before
   any `launchctl`/plist mutation and before the apply-only host-confirmation
   gate, and `src/release-activation-exec.test.ts:190-207` proves a failing
   check throws before any `launchctl` call and leaves the installed plist
   byte-identical.

5. **Can weekly KB regeneration remove the AACS block after deployment?** No.
   `tools/validate-knowledge.sh --update` copies `knowledge/shared/KNOWLEDGE.md`
   to every agent folder and then unconditionally re-runs
   `sync-program-facts.py inject` (`tools/validate-knowledge.sh:174-175`),
   which is idempotent and hash-bound
   (`tools/tests/test_sync_program_facts.py:19-52` proves idempotence for both
   the Practitioner and AACS injectors). The same reapply-after-propagate
   pattern is documented in `docs/MINION-FRAMEWORK.md:351-364`.

6. **Does removing broad `knowledge/` packaging omit another required
   immutable runtime input?** No gap found. `facts/` (the whole directory,
   covering `facts/programs.yaml` and `facts/catalogs/*`) is still packaged
   whole (`scripts/build-release.mjs:118`), and every catalog/pack path
   resolver (`resolvePractitionerCatalogPath`, `resolveMcsLocalesCatalogPath`,
   `resolveCoachingSupervisionCatalogPath`, `resolveFactsPath`) reads via
   `resolveTrackedPath`, which honors `NANOCLAW_CODE_ROOT` and so resolves to
   the release, not the operational checkout. Only `resolveKbPath` explicitly
   ignores `NANOCLAW_CODE_ROOT` and always uses `process.cwd()`
   (`src/program-facts-drift.ts:92-97`), which is exactly the operational
   consumer per design point 3. `facts/programs.yaml:49` documents the
   AACS/Supervision program is intentionally tracked only through the
   versioned catalog, not a duplicate `programs.yaml` entry — no silent second
   source of truth was left behind.

7. **Is rollback behavior and the operational synchronization sequence
   truthful?** Yes, as documented. `docs/RELEASE-INTEGRITY.md:39-44` and
   `docs/ENGINEERING-CHANGELOG.md:57-59` both state that a rollback to
   `8df61d98` restores the known-stale mount and must be treated as incident
   recovery, not a fact-safe steady state — matching what the code actually
   does (rollback only restores the prior plist/commit; it does not re-run
   any fact sync). `docs/ACTIVE-WORK.md`'s `NC-20260902-001` entry states
   "State: validating" and lists full-root/deployment/live-replay as pending,
   consistent with the `docs/reports/...REQUEST-R1.md` verification-already-
   performed section (no overclaim of deployment or live verification).

## Supporting spot checks

- All 13 tracked `KNOWLEDGE.md` files (`knowledge/shared` + 12
  `knowledge/agents/*`) contain the exact canonical AACS block and none
  contain the superseded `## Coaching Supervisor Specialization (CSS) & …`
  heading or the literal string `PRE-LAUNCH / in development` — confirmed by
  direct grep across `knowledge/`, not only the allowed Sales file.
- `facts/catalogs/coaching-supervision-mastery.json` matches every accepted
  incident fact: `live_enrolling`, AACS program-level string, inaugural
  cohort 2026-10-07 → 2027-02-10, `$3,996`/`$4,796` (399600/479600 cents),
  `supervision-regular` correctly marked `active: false` (not yet on public
  sale), and a 4-entry `stale_claims` array containing the exact defect
  language ("PRE-LAUNCH / in development", "no public student price", etc.).
- The `evals/sales/request-first-cases.json` `aacs-live-pathway-orientation`
  case and its assertions in `src/sales-prompt-contract.test.ts:283-303` are a
  static prompt-contract/content replay (string containment against the
  checked-in KB and catalog), not a live agent run — it exercises the fix
  without approving, sending, or touching any customer-facing or provider
  system, matching the stated non-objectives.
- A pre-existing, unrelated "### Coaching Supervision (standalone)" section
  (individual/group supervision *sessions*, `/coaching-supervision/`,
  $89–$189) remains in `knowledge/agents/sales/KNOWLEDGE.md` alongside the new
  canonical "Coaching Supervision Mastery" certification-program block. This
  is a distinct, pre-existing product line (not touched by this diff, not the
  legacy CSS section the injector removes) — noted for awareness, not a
  material finding.
