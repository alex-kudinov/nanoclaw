# NC-20260905-001 bounded entitlement-catalog review

## Objective

Review the completed read-only full-program entitlement audit and revision-1
machine-readable catalog. Report only material findings that could make bundle
contents incomplete or misleading, conflate commercial enrollment with course
access/class assignment/consumption/payment, grant unsafe Heartbeat authority,
overstate source/provider evidence, make future materialization ambiguous, or
allow the validator to accept a structurally unsafe catalog.

Write the response to:

`/Users/xbohdpukc/dev/NanoClaw-student-entitlements-20260905/docs/reports/NC-20260905-001-CLAUDE-REVIEW-RESPONSE-R1.md`

Do not edit any other file. Do not use Bash, web, MCP, credentials, `.env`,
auth/session stores, provider APIs, student/member data, or unrelated repository
content.

## Accepted owner decisions

1. A full program includes heterogeneous benefits beyond Modules 1-4. The
   complete included list must be modeled before Heartbeat cohort-marker
   classification or creation.
2. Permanent paid/Course Access Groups are constant access projections.
3. Future enrollment/class markers are a separate hidden, admin-controlled,
   zero-content layer and are not purchase/payment/progress authority.
4. Full-program and module-only students attending the same delivery block
   share the same class marker.
5. This slice is source/design only. It must create no group, membership,
   provider record, flow, message, spreadsheet mutation, student change,
   schema, runtime, or deployment.

Do not reopen these decisions. Challenge whether the artifacts implement them
faithfully.

## Authority hierarchy

1. Current owner decisions above and the Company OS charter.
2. Current provider-native facts for their own scope.
3. Accepted current program/course catalogs and checkout sources.
4. Current public offer promises.
5. Historical Plutio templates/framework as evidence only.
6. Inference is prohibited; unknowns must remain explicit.

## Review paths

Primary:

1. `facts/catalogs/student-entitlements-v1.json`
2. `scripts/validate-student-entitlements.mjs`
3. `src/student-entitlements.test.ts`
4. `docs/STUDENT-ENTITLEMENT-CATALOG.md`
5. `docs/programs/company-os/evidence/NC-20260905-001-student-entitlement-audit.md`

Authority correction in the isolated courses worktree:

6. `/Users/xbohdpukc/dev/courses-student-entitlements-20260905/community/icf/CLAUDE.md`
7. `/Users/xbohdpukc/dev/courses-student-entitlements-20260905/community/icf/STUDENT-TRACKING-FRAMEWORK.md`

Support only if a finding depends on them:

8. `facts/catalogs/student-entitlements-v1.schema.json`
9. `docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md`

The manifest is larger than the usual packet because completeness across 42
typed components is the review subject. Do not perform broader repository
archaeology.

## Evidence already collected

- Exact live NanoClaw release `886e25873072`, healthy under Node 22.23.2.
- Read-only current checkout/public sources in Tandemweb release `05dc12f759bb`.
- Read-only Stripe product inventory for the seven offer variants.
- Read-only Heartbeat group/course identities, content-minimized before use.
- Read-only Student Roster Product Map; no student/member rows.
- Catalog validator passes: 42 components, 6 bundles, 7 offers, 6 conflicts,
  5 provisional components, 20 open questions.
- Focused Vitest 7/7 passes; TypeScript typecheck and documentation continuity
  pass.

## Known held conflicts

- Supported Heartbeat tooling does not expose full-group-to-content attachment
  graphs.
- Several ACC/PCC/ACTC service quantities/consumption rules are missing.
- The inactive PCC individual-exam checkout points at ACC Practice Test while
  Heartbeat exposes a separate PCC/MCC Practice Test.
- Student Roster collapses complete bundles into `Full Program`.
- Existing Heartbeat contains three `September 2026` groups plus one
  `MCS Practicum - September 2026` group.

These may remain held. Flag only if their current representation allows an
unsafe or false conclusion.

## Response contract

Write one of:

- `NO MATERIAL FINDINGS`, with a concise boundary statement; or
- findings ordered P0-P2, each naming the exact file/key or line, why it is
  material, and the smallest correction.

Do not restate the catalog, propose unrelated implementation work, or treat a
provider-observation gap as authority to infer the missing fact.
