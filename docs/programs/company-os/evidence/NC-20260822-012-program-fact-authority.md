# NC-20260822-012 program-fact authority evidence

Date: 2026-08-23T00:48:42Z

Program: `program:company-os`

Work item: `work:program-facts-source-closure`
Evidence class: cross-repository local source, generated snapshots, mirrors,
tests, and documentation; no provider/public/runtime mutation

## Root cause

Practitioner Series accreditation facts had no enforced authority path. The
governance registry called itself the source of truth but mixed current awards,
submitted targets, stale prices, and long production diaries. Course
`course.json` files omitted approvals or retained targets. Tandemweb pages,
`llms-*`, NanoClaw `facts/programs.yaml`, minion knowledge, YouTube metadata,
brochure sources, certificates, and presentations were repaired independently.

The 2026-08-22 Growth/SEO cleanup corrected English frontend sources, but that
could not prove the other representations current. Read-only inventory found:

- NanoClaw's hand-curated drift file still expected ADHD 15/5 and Systemic
  16/4 after the approved splits became 13/7 and 22/8;
- minion knowledge had correct tables plus a contradictory sentence saying
  only three courses were approved and others remained in review;
- root course manifests were missing a present-tense approval record or carried
  early/submitted CCE targets;
- ADHD and Systemic current YouTube metadata sources repeated superseded claims
  throughout their per-video descriptions;
- the brochure source described provider-documented ethics instruction as
  ICF-designated "mandatory ethics hours" and made an unsupported all-six
  approval-end-date claim.

## Architecture implemented

The clean `~/dev/practitioner-series` governance repository now owns
`program-facts/catalog.json`, schema, validator, evidence audit, consumer audit,
tests, and deterministic web/minion exports.

Authority order:

1. provider approval letters and reviewed schedules;
2. accepted owner decisions for Tandem-controlled policy/evidence gaps;
3. the versioned domain catalog;
4. course-repository mirrors;
5. websites, minion knowledge, certificates, presentations, brochures, SEO,
   generated LLM text, and historical messages.

The catalog deliberately excludes price, active-sale state, learner visibility,
and issued-certificate state; those remain owned by checkout/Stripe, Heartbeat,
and Sertifier. It distinguishes approved CC/RD totals from provider-documented
ethics instruction and states that the approval records do not separately show
ICF designating those hours as ethics.

## Consumers closed locally

- Seven live root `course.json` mirrors and the active Spanish ADHD manifest are
  pinned to catalog revision 1 and SHA-256
  `cbb4ce6cf13466d087f94bce9bb8d05b2796bf0f7e20073ad4b070596a27ee24`.
- Tandemweb's isolated `codex/program-facts-authority-20260823` worktree contains
  the pinned web snapshot, validator, tests, authority SOP, corrected ethics
  wording, and a `page-deploy.sh` preflight that blocks every Practitioner page
  deployment on catalog/page drift.
- NanoClaw pins both exports under `facts/catalogs/`, injects the exact
  revision/hash-bearing block into all 14 minion knowledge files, repairs the
  known contradictory current prose, re-injects after knowledge regeneration,
  and verifies the exact pack in `program-facts-drift` instead of duplicating
  Practitioner strings in `facts/programs.yaml`.
- Current ADHD and Systemic YouTube metadata source files were mechanically
  updated: 161 claim lines per repository now carry 20/13/7 and 30/22/8.
- The Practitioner brochure source is catalog-pinned, corrected, and guarded by
  dependency-free `render.py --check-facts`; the renderer refuses stale totals,
  hashes, ethics overstatement, and blanket unsupported end dates.

## Evidence quality and known gaps

- ADHD, Career, and Systemic provider letters are tracked and hash-verified.
- The July Tools, Business, and AI provider letters are not in their current
  tracked repositories. Their approved values use accepted internal approval
  record commit `d9ccb06`; recovering and hashing the provider letters remains
  an evidence-strength follow-up, not a reason to invent dates.
- Submitted targets remain in clearly labeled history/packet fields. Current
  mirrors and generated packs use only approved/not-applicable values.

## Verification

- Canonical catalog: validation/export/evidence/consumer audits pass; 6/6 unit
  tests pass.
- Tandemweb: snapshot/page audit passes; 3/3 unit tests pass; `page-deploy.sh`
  syntax passes.
- NanoClaw: 14/14 knowledge files contain one exact canonical block; sync tests
  2/2; drift tests 10/10; typecheck passes; read-only drift run checks three
  domains with zero findings.
- NanoClaw full suite: 2,129/2,130 pass. The sole failure is the pre-existing,
  unrelated Sales website-path wording contract.
- Marketing brochure fact gate passes; Python compile passes. Full HTML/PDF
  rendering was not run because the local documented render environment lacks
  the `markdown` package.
- All eight edited course/localization JSON manifests parse. Cross-repository
  `git diff --check` passes.

## State boundary

All changes are local and uncommitted across the clean governance repository,
an isolated Tandemweb worktree, narrow NanoClaw files, seven course repositories,
the Spanish ADHD manifest, and the marketing brochure source. No WordPress or
YouTube metadata was published; no brochure PDF/Heyzine asset was regenerated;
no Sertifier certificate was changed; no minion service was restarted; no
provider, customer, learner, schedule, or external message state changed.

The next release boundary is to review and commit each repository's scoped
change, regenerate the brochure PDF/preview in its approved runtime, publish the
Tandemweb sources, refresh live YouTube descriptions from the corrected source,
update certificate templates from the catalog, and verify each destination
reports the same catalog revision/hash or provider receipt.
