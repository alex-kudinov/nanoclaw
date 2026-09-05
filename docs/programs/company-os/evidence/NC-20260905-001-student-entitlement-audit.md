# NC-20260905-001 student entitlement audit

Date: 2026-09-05

Task: `NC-20260905-001`

Program item: `work:student-lifecycle-entitlement-catalog`

Boundary: read-only provider and source inventory; no student/member rows, group
creation, membership/access change, sheet mutation, message, flow, runtime, or
deployment.

## Runtime and source identity

- Production Mac Mini health was read at 2026-09-05T16:14Z.
- NanoClaw release: exact verified commit `886e258730729a2cade1baee70466e62e2bff59e`.
- Node: `22.23.2`; one listener; Gmail and Slack connected; no active containers.
- Student lifecycle: Community-only shadow enabled, action consumers disabled,
  Circle disabled, 284 events, zero active enrollment projections, 139 open
  identity/catalog exceptions.
- Source worktree:
  `/Users/xbohdpukc/dev/NanoClaw-student-entitlements-20260905`, branch
  `codex/student-entitlement-catalog-20260905`, based on the exact live commit.
- Current Tandemweb enrollment source and live release evidence:
  `/Users/xbohdpukc/dev/tandemweb-program-enrollment`, commit `05dc12f759bb`.

## Active complete-program offers

The checkout catalog and read-only Stripe inventory agree on these active or
future-active complete-program offers. Stripe identities are included because
they are provider keys, not student data.

| Offer | Bundle | Price | Stripe product | Heartbeat full group |
| --- | --- | ---: | --- | --- |
| `acc-full` | ACC Level 1 complete | $3,999 | `prod_UH6JxVERhLtwb4` | `1892f2a6…` — Level 1: Full Course |
| `pcc-full` | PCC + ACTC Level 2 complete | $3,999 | `prod_UHB9DrYIrstLJT` | `a8e3d6fd…` — PCC Bridge (with ACTC) |
| `actc-full` | ACTC complete | $2,499 | `prod_UH8vmY0DzypACl` | `5ff8be1e…` — ACTC: Full Course |
| `acc-pcc-full` | Professional Coach ACC + PCC + ACTC | $7,499 | `prod_UHBORCHyWDea4N` | Level 1 Full plus `8eb5731a…` — 2026 Full Level 1 AND 2 with ACTC |
| `mcs-full` | MCS Standard Path | $2,997 | `prod_UWzqD2zowB8apy` and installment `prod_Uk2OvW03ZwxmAj` | `917a7a35…` — MCS - Standard path |
| `supervision-inaugural` | Coaching Supervision Mastery | $3,996 | installment `prod_UvqkpUONPWr8Bo` | `fa5f5f09…` — Coaching Supervision Mastery |
| `supervision-regular` | Same Coaching Supervision Mastery bundle | $4,796 | installment `prod_UvqkMSjRqR4zho` | same `fa5f5f09…` group |

Two commercial offers may point to one entitlement bundle. Inaugural and
regular Coaching Supervision Mastery differ by price/cohort eligibility, not by
promised curriculum.

## Bundle evidence

### ACC Level 1

The current public source promises all four core modules, group supervision,
group mentoring, individual mentoring, performance evaluation preparation,
ACC exam preparation, and Coaching Tools Plus access. Heartbeat exposes named
groups and courses for the four modules, group mentoring, individual mentoring
and assessments, group supervision, and ACC Practice Test. The older ICF
tracking framework's Plutio template describes 4 group-mentoring sessions / 8
hours, 3 individual-mentoring sessions / 4.5 hours, and 3 supervision sessions /
6 hours, but those quantities are historical evidence pending current owner or
provider confirmation.

### PCC + ACTC Level 2

The current public source promises all four shared systems/team-coaching
modules, group and individual mentor coaching, supervision, performance
evaluation preparation, individual and team exam preparation, and Coaching
Tools Plus. Heartbeat confirms the four shared module groups/courses, Level 2
group and individual mentoring, shared Group Supervision, PCC/MCC Practice
Test, and ACTC Practice Test identities. Exact service quantities are not
available from the accepted sources.

### ACTC-only

The current public source promises all four shared systems/team-coaching
modules, group supervision, one recording-review product, team-coaching exam
preparation, and Coaching Tools Plus. The named groups and courses exist. The
full group's exact attachment graph and recording-review resubmission policy
are not exposed by the supported read surface.

### Professional Coach Program

The current public source promises both phases: ACC modules/support plus the
Level 2 systems/team-coaching curriculum, mentoring, supervision, performance
evaluation preparation, and exam preparation. Its checkout grants two full
Heartbeat groups and records only the selected starting ACC Module 1 class
block. Later component entitlements and class assignments are not materialized
in the Student Roster.

### MCS Standard Path

The current source names 71 program hours, Mentor Coaching Foundations, ACC
BARS and PCC Markers evaluation training, twelve two-hour live classes, five
observed mentor-coaching sessions with written feedback, three ACC and three
PCC peer mentoring sessions, five hours of mentoring-on-mentoring, a two-part
capstone, one completion certificate, and a conditional five-hour MCC BARS
bonus for active MCC coaches. Heartbeat confirms the full group, Foundations
course, practicum course, and existing September 2026 cohort objects.

### Coaching Supervision Mastery

The current catalog/course/public sources converge on eight asynchronous
competency modules; sixteen two-hour live classes; fourteen hours of fieldwork;
five observed supervision sessions; written feedback on at least three; two
hours receiving supervision; four delivered hours of
supervision-on-supervision against a three-hour requirement; twenty-eight
learning-journal assignments; one capstone; the techniques book/resources; and
the earned 72-hour completion certificate. The exact full group, course, and
course cohort are visible through the supported read surface.

## Student Roster finding

The Product Map contains 152 mapping rows. Complete-program payments route to a
single `Full Program` column on ACC/PCC/ACTC, and the Professional Coach Program
routes to the `Full Program` column on all three tabs. Separate product aliases
exist for modules, mentoring, supervision, exam prep, recording review, MCS,
and Coaching Supervision Mastery, but a full purchase does not materialize its
component entitlements, allowances, class assignments, or consumption state.

This confirms the spreadsheet can remain a projection but cannot be the bundle
or entitlement authority.

## Heartbeat projection findings

1. Paid and Course Access Groups are constant access projections. Their names
   or membership do not prove the commercial offer, scheduled class, payment,
   or attendance.
2. Supported tools expose group/course/cohort identities but not the complete
   full-group-to-content attachment graph. This is a provider-observation gap,
   not permission to infer from names or use browser/private endpoints.
3. Heartbeat currently contains three groups named `September 2026`, one group
   named `MCS Practicum - September 2026`, and the MCS course cohort named
   `September 2026`. Their purpose and membership authority must be reconciled
   before any generic cohort taxonomy is introduced.
4. Marker groups must be a parallel, hidden, admin-controlled, zero-content
   projection. Catalog revision 1 grants no authority to create them.
5. Full-program and module-only students attending one class block share one
   class marker. Purchase scope never enters class-marker identity.

## Conflicts and disposition

| Conflict | Disposition |
| --- | --- |
| April ICF framework names Plutio as student source of truth | Resolved by the current owner-directed Company OS authority: Plutio becomes an operator projection; its component/compliance evidence is retained. |
| Full Heartbeat group attachment graph unavailable through supported API/tooling | Held; full bundle components remain provisional where attachment readback is unavailable. |
| Inactive PCC individual-exam checkout points at ACC Practice Test while a distinct PCC/MCC Practice Test exists | Held for a separate checkout/provider correction; no activation or mutation here. |
| Roster collapses full bundles into one `Full Program` cell | Held for the later entitlement projection implementation. |
| Ambiguous existing September 2026 groups | Held for exact purpose/membership-authority reconciliation. |
| Several ACC/PCC/ACTC service quantities and consumption policies are absent from current authoritative sources | Owner decision required before operational entitlement issuance. |

## Artifacts and checks

- `facts/catalogs/student-entitlements-v1.json`
- `facts/catalogs/student-entitlements-v1.schema.json`
- `scripts/validate-student-entitlements.mjs`
- `src/student-entitlements.test.ts`
- `docs/STUDENT-ENTITLEMENT-CATALOG.md`
- `npm run student-entitlements:validate`: 42 components, 6 bundles, 7
  offers, 6 conflicts, 5 provisional components, 20 open questions.
- Focused Vitest: 9/9 pass after the review corrections.
- TypeScript typecheck: pass after adding the explicit `.mjs` declaration.
- Independent Sonnet/high R1 found two material defects: incomplete closed-enum
  validation and an invalid MCS individual-mentoring marker policy. Both were
  corrected; narrow R2 returned `NO MATERIAL FINDINGS`.
- Full root regression: 3,449 passed / 32 skipped / 2 failed. Both failures are
  exact unchanged base-lineage failures: the CNPC wrapper prompt assertion and
  the date-sensitive Relationship Context Trafft shadow fixture. Neither file
  is changed by this task. Build, format, documentation continuity, capability
  matrix, JSON parse, and both repository diff checks pass.
- Courses authority correction: pushed commit `419981a1` on
  `codex/student-entitlement-catalog-20260905`.

## External-state receipt

Read-only: NanoClaw `/health`, Stripe product inventory, Heartbeat group/course
inventory, and Student Roster Product Map. No student/member data was requested
or retained. No provider, spreadsheet, runtime, or customer state changed.
