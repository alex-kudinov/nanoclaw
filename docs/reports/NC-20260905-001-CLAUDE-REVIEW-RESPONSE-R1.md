# NC-20260905-001 bounded entitlement-catalog review — response

Reviewer: Claude (bounded to the packet listed in the review request; no Bash,
web, MCP, credentials, or unrelated repository content used).

## P0-1 — The schema file is loaded but never enforced; the hand-written validator omits enum checks on most typed fields

**Where:** `scripts/validate-student-entitlements.mjs:164-168`
(`loadAndValidateStudentEntitlementCatalog`) against
`facts/catalogs/student-entitlements-v1.schema.json`.

```js
export function loadAndValidateStudentEntitlementCatalog(catalogPath = defaultCatalogPath) {
  JSON.parse(fs.readFileSync(defaultSchemaPath, 'utf8'));   // parsed, never applied
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  return validateStudentEntitlementCatalog(catalog);
}
```

The schema is `JSON.parse`d only to prove it is syntactically valid JSON. No
JSON Schema validator is ever run against `catalog` — `package.json` (root)
has no `ajv` or any other schema-validation dependency, and
`validateStudentEntitlementCatalog` is a hand-written set of checks that
covers a subset of the schema's constraints.

Concretely, the following fields are declared as closed enums in the schema
but are **never validated** by the hand-written checks:

- `component.component_type` (schema lines 113-130) — no check anywhere in
  the `.mjs` file.
- `component.delivery_mode` (131-141) — read for marker logic but never
  checked against the enum.
- `component.scheduling_model` (142-152) — same: read for marker/membership
  logic, never checked against the enum.
- `component.consumption_model` (153-164) — never referenced at all.
- `offer.status` (schema line 243) and `offer.enrollment_scope` (244) — never
  checked.
- `known_conflicts[].severity`, `.summary`, `.disposition` (schema 273-288) —
  the validator only extracts `conflict_id` for a uniqueness check (lines
  50/54/59); `severity`, `summary`, and `disposition` are never required or
  enum-checked, so a conflict entry could ship with a missing `summary` or an
  invalid `disposition` (e.g. anything other than `resolved`/`held`/
  `requires_owner_decision`) and still validate.
- `bundleComponent.inclusion` — only checked *conditionally* (requires a
  `condition` string when the value is `conditional` or
  `earned_on_completion`); any other string value (e.g. a typo) is silently
  accepted.

**Why material:** the audit and PR record report "Catalog validator passes:
42 components ... ; Focused Vitest 7/7 passes" as evidence the catalog is
structurally sound. That claim is only as strong as the validator, and the
validator does not actually enforce the schema it ships beside. A future
revision (adding components, correcting conflicts, resolving open questions)
can introduce a typo'd `component_type`, an out-of-enum `scheduling_model`,
or a conflict with a bogus `disposition`, and both `npm run
student-entitlements:validate` and the Vitest suite will report success. This
is precisely the class of risk the review is bounded to catch: the tooling
that is supposed to gate a structurally unsafe catalog cannot actually do so
for most of the typed vocabulary the schema defines.

**Smallest correction:** either (a) add a JSON Schema validator (e.g. `ajv`)
call in `loadAndValidateStudentEntitlementCatalog` that validates `catalog`
against the parsed schema before/alongside the hand-written checks, or (b) if
a dependency-free approach is preferred, add explicit enum membership checks
in `validateStudentEntitlementCatalog` for `component_type`, `delivery_mode`,
`scheduling_model`, `consumption_model`, `offer.status`,
`offer.enrollment_scope`, `bundleComponent.inclusion`, and
`known_conflicts[].severity`/`.disposition`, plus a `requireCondition` that
`summary` is a non-empty string. Either way, add a Vitest case (mirroring the
existing "rejects a bundle that names an unknown component" pattern) that
asserts an invalid enum value is rejected, so the gap cannot silently
reopen.

## P0-2 — `mcs.mentoring-on-mentoring` carries a cohort marker despite being an individual-mentoring component, and nothing catches it

**Where:** `facts/catalogs/student-entitlements-v1.json`, component
`mcs.mentoring-on-mentoring` (`component_type: "individual_mentoring"`,
`delivery_mode: "blended"`, `scheduling_model: "program_cohort_series"`,
`marker_policy: "program_cohort"`).

`docs/STUDENT-ENTITLEMENT-CATALOG.md:109-110` states the marker invariant in
component-type terms:

> individual mentoring/supervision, self-paced courses, assessments, resource
> access, and certificate outcomes do not receive cohort markers

But the JSON's own policy text, `heartbeat_projection_policy.marker_groups
.rules[2]` (line 50), states the same invariant in delivery-mode terms:

> Individual appointments, self-paced courses, assessments, resource access,
> and certificate outcomes do not receive cohort markers.

The validator (`scripts/validate-student-entitlements.mjs:86-89`) implements
the delivery-mode version only — it forbids markers when `delivery_mode` is
`individual_appointment`, `self_paced`, `provider_access`, or
`earned_on_completion`. `mcs.mentoring-on-mentoring` has `component_type:
"individual_mentoring"` (the exact type the markdown doc names) but
`delivery_mode: "blended"` (not `individual_appointment`), so it passes every
existing check while directly contradicting the markdown doc's invariant.

This is not hypothetical: it is the state of the shipped revision-1 catalog.
Compare with the sibling component `supervision.as-client`
(`component_type: "individual_supervision"`, `delivery_mode: "blended"`,
`scheduling_model: "program_cohort_series"`), which correctly sets
`marker_policy: "none"` — proving the exclusion is understood and applied
elsewhere, and that this one component was missed rather than being an
intentional exception. Also note `acc.individual-mentoring` and
`systems.individual-mentoring` both use `delivery_mode: "individual_appointment"`
and correctly land on `marker_policy: "none"` — they are protected only
because their delivery mode happens to match the validator's list, not
because their component type does.

**Why material:** decision #3 in the review request explicitly walls off
future enrollment/class markers as a zero-content, admin-controlled layer,
and the catalog's own stated invariant is that individual mentoring never
gets a cohort marker. A live discrepancy between the two governing documents,
already realized as an actual incorrect value in the machine-readable
catalog, is exactly the kind of thing that "grants unsafe Heartbeat
authority" once a later revision acts on `marker_policy` to create or assign
markers — it would create a cohort marker for hours that this program's own
rule says must remain an individual, marker-free allowance.

**Smallest correction:** set `mcs.mentoring-on-mentoring.marker_policy` to
`"none"` to match `docs/STUDENT-ENTITLEMENT-CATALOG.md`'s stated invariant
(the smaller, safer fix — individual mentoring hours should not depend on a
cohort marker for scheduling authority even when delivered inside a cohort
window). Separately, reconcile the two conflicting rule statements (JSON line
50 vs. doc lines 109-110) so they name the same exclusion basis, and extend
the validator's marker check to also forbid markers when
`component_type` is `individual_mentoring` or `individual_supervision`,
independent of `delivery_mode`, with a regression test for this exact case.

## P1 — none beyond the above; component/bundle count, evidence-status,
and open-question totals were independently recomputed and match the
audit's claimed 42/6/7/6/5/20.

## P2 — none material within the reviewed packet.
