# NC-20260905-001 load-bearing correction review — response R2

Reviewer: Claude (bounded to the four files listed in the R2 correction
request; no Bash, web, MCP, credentials, or unrelated repository content
used).

## P0-1 — schema-declared enums now enforced

`scripts/validate-student-entitlements.mjs` now checks every field R1 named
as unenforced: `component.component_type` (line 162), `delivery_mode` (163),
`scheduling_model` (164), `consumption_model` (165), `offer.status` (231),
`offer.enrollment_scope` (232), `bundleComponent.inclusion` — now checked
unconditionally for every entry, not only when `conditional`/
`earned_on_completion` (220) — and `known_conflicts[].severity` (251),
`.disposition` (252), and non-empty `.summary` (253). It also goes beyond
R1's list to enum-check `quantity.status`, `heartbeat.attachment_status`,
and `offer.provider_content_status`, closing adjacent gaps in the same
class.

`src/student-entitlements.test.ts` (`rejects invalid typed vocabulary
instead of treating the schema as decorative`, lines 82–102) mutates
`component_type`, `consumption_model`, `offer.status`, bundle `inclusion`,
and conflict `disposition`/`summary` in one fixture and asserts all six
resulting findings are present via `arrayContaining`. Confirmed against the
validator's exact message strings — all six match. Verified against the
current 9-test suite (matches the reported 9/9).

No material defect remains in this correction.

## P0-2 — `mcs.mentoring-on-mentoring` marker-free by component type

The catalog (`facts/catalogs/student-entitlements-v1.json:544-560`) now sets
`mcs.mentoring-on-mentoring.marker_policy` to `"none"`. The
`marker_groups.rules` text (JSON line 50) now reads "Individual mentoring or
supervision, individual appointments, self-paced courses, assessments,
resource access, and certificate outcomes do not receive cohort markers" —
naming the component-type exclusion first, consistent with the basis
`docs/STUDENT-ENTITLEMENT-CATALOG.md:109-110` states (quoted in R1; not
re-read here per the bounded packet).

The validator (`scripts/validate-student-entitlements.mjs:196-200`) adds an
`INDIVIDUAL_COMPONENT_TYPES` check (`individual_mentoring`,
`individual_supervision`) that forbids a marker independent of
`delivery_mode`, closing the exact gap R1 identified (a `blended`-delivery
individual-mentoring component previously passed unchecked).

Confirmed every `individual_mentoring`/`individual_supervision` component in
the catalog carries `marker_policy: "none"`:
`acc.individual-mentoring`, `systems.individual-mentoring`,
`mcs.mentoring-on-mentoring`, `supervision.as-client`. No other component of
either type exists in the file.

`src/student-entitlements.test.ts` (`keeps mentoring-on-mentoring
marker-free and rejects individual types even when delivery is blended`,
lines 64–80) asserts the fixture's current state (`individual_mentoring`,
`blended`, `marker_policy: "none"`), then mutates `marker_policy` to
`program_cohort` and asserts the exact rejection message
`component mcs.mentoring-on-mentoring: individual mentoring or supervision
must not have a marker` — which matches the validator's message string
exactly. This is the regression test R1 asked for.

No material defect remains in this correction.

## Result

NO MATERIAL FINDINGS.
