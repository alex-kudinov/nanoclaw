# NC-20260825-002 — Relationship Context adapter-extensibility evidence

Date: 2026-08-25
Program item: `work:relationship-context-adapter-extensibility-design`
Change class: C1 internal design amendment

## Owner requirement

Future LMS, coaching-client-management, CRM, assessment, and other tools that
enrich a person should be addable without rearchitecting Relationship Context.

## Design result

`docs/RELATIONSHIP-CONTEXT-CONTROL-PLANE.md` now makes that requirement a core
architectural invariant and defines:

- the bounded change surface for an ordinary new enrichment source;
- a tracked, versioned, credential-free adapter manifest;
- the provider-neutral `PersonEnrichmentAdapterV1` interface;
- external-reference and identity-candidate output, with no Party-selection or
  merge authority;
- versioned fact-catalog registration and deterministic projection mapping;
- independent adapter, manifest, fact-schema, and projection-rule versions;
- compatibility, shadow migration, cursor ownership, deprecation, and rollback;
- per-adapter failure/circuit/freshness/quarantine isolation;
- a shared fixture-based conformance suite;
- a fixture-only reference adapter gate before any real new source;
- a concrete future-LMS onboarding example and a coaching-client-management
  variant.

The initial extension model remains inside NanoClaw's controlled modular
monolith. New adapters are tracked and code-reviewed. The design does not allow
runtime download or execution of arbitrary third-party plugin code.

## Program continuity

- Company OS revision 94 added the follow-on work item rather than changing the
  terminal history of `work:relationship-context-control-plane-design`.
- Revision 95 claimed it for `NC-20260825-002`.
- Revision 96 attached four distinct open commitments covering the owner
  requirement, registration/versioning/conformance, a concrete example, and the
  no-mutation boundary.
- Completion and final validation revision are recorded in the engineering
  changelog.

## Verification

- the design contains the manifest, adapter interface, fact-catalog,
  versioning, compatibility/deprecation, failure-isolation, conformance,
  reference-adapter, LMS example, implementation-slice, verification, rollout,
  and owner-decision requirements;
- the expected-change and forbidden-core-change surfaces are explicit;
- targeted likely-secret scan and task-scoped `git diff --check` pass;
- final `programctl validate`, `status`, and `render` results and the unchanged
  unrelated continuity baseline are recorded in the engineering changelog.

## Boundary

No adapter or plugin was implemented. No source, schema, provider, customer
record, credential, runtime, deployment, production state, communication, or
business outcome changed. Real adapter SDK/registry work, provider access,
schema/runtime changes, deployment, and live proof remain separately governed.
