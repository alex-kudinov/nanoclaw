# NC-20260904-003 — MCS Practicum Sertifier package evidence

Date: 2026-09-05T02:30:00Z  
Provider: Sertifier  
Production target: `mini-claw.local`

## Full MCS Practicum graduation package

| Component | Title | ID |
| --- | --- | --- |
| Certificate | `MCS Practicum` | `08df06dd-6b9b-471f-844f-157cf5d7021e` |
| Detail | `Mentor Coaching Specialization – Practicum` | `08df0ae3-d74d-4e26-81fa-1b1f734a758c` |
| Badge | `MCS Practicum Graduate` | `08df0ae3-9d01-4b10-8c35-4d671abeeb33` |
| Email | `MCS Practicum Graduation` | `08df0ae4-4da4-4626-8ea0-6a1c2b06c9f4` |
| Campaign | `Canonical | mcs-practicum | v1` | `08df0ae5-fc15-454e-81a5-ac6db9e34959` |

The Detail records 71 total program hours, including 41 participant contact
hours and 30 asynchronous hours, all AAMC program requirements, and ACC BARS
plus PCC Markers evaluation-tool training. MCC BARS is excluded. The badge is
Tandem-only and carries no ICF/AAMC logo. The canonical campaign is public,
Draft status, uses `Tandem Coaching Academy <info@tandemcoach.co>`, and has zero
recipients.

## Partial-completion companion

| Component | Title | ID |
| --- | --- | --- |
| Certificate | `MCS Practicum Partial Completion` | `08df0ae9-8410-4185-8845-94d97b9e3f37` |
| Detail | `Mentor Coaching Specialization – Practicum: Partial Completion Record` | `08df0ae9-b72c-468b-86da-7acdd9198c4e` |
| Email | `MCS Practicum Partial Completion` | `08df0aea-22f7-432d-8b1a-99adaec7cc11` |
| Campaign | `Canonical | mcs-practicum-partial | v1` | `08df0ae0-ce12-45f0-8048-545cc146d18e` |

The partial certificate has no AAMC logo and no badge. Its Detail uses the
neutral `Mentor Coaching` skill because Sertifier requires a skill before a
Detail becomes selectable. The campaign is private, Draft status, uses the
same verified Tandem sender, and has zero recipients. Its required fields are:

- `Module or Class Completed` — `08df0ae7-98ad-4212-8e28-062d178dc9a5`;
- `Participant Contact Hours Completed` —
  `08df0ae7-d35c-4777-834a-24f508500fbd`;
- `Date Hours Completed` — `08df0ae8-00b4-4369-8d33-556f86956daf`.

## Implementation and safety

The isolated toolbox source registers `mcs-practicum` and
`mcs-practicum-partial`, exact component fingerprints, unique aliases, privacy,
required attributes, three named issuance flags, and number/date validation.
The full package is attribute-free; the partial package remains in normal
collection/review because it requires attributes. Bare `MCS` and bare `Mentor
Coaching Specialization` are not fast-path aliases and the Gru prompt requires
Foundation/Practicum/partial clarification.

Two bounded Sonnet/high reviews were completed. R1 found that the two new
presets were missing from the ordinary-flow mapping. R2 found that the old
Foundation aliases still accepted the two bare ambiguous terms. Both findings
were corrected; the final alias deletion was independently regression-tested.
R1 used five model calls (82,848 cache-create, 190,603 cache-read, 15,323
output; max context 82,850). R2 used five model calls (88,718 cache-create,
207,758 cache-read, 7,369 output; max context 88,720).

## Verification

- Provider component getters and campaign getters returned the IDs and fields
  above.
- `search-credentials --campaign-id` returned total `0` for both campaigns.
- `verify-campaigns` returned verified `true` for both canonical keys.
- Full and partial `.invalid` dry runs resolved the exact campaigns and
  component IDs with `willSend:false`; the partial run carried all three exact
  attribute IDs and values.
- Toolbox component/canonical suites pass, registry validation passes, and the
  full framework suite is 65/65.
- NanoClaw focused prompt contract 5/5, typecheck, and documentation continuity
  pass on Node 22.23.2. The full suite is 3,368 passing/31 skipped with the two
  unchanged CNPC wrapper and stale Trafft failures outside the changed paths.

## Artifact archive and external boundary

Certificate masters remain in the established Google Drive Graduation and
Partial Completion MCS folders. Each has a `Sertifier Package` subfolder with
the provider upload asset and a component manifest; the graduation folder also
contains the 3000px transparent badge master.

Created or updated: two Details, two email templates, one badge, one partial
certificate design, and two empty canonical campaigns. Not created: recipient,
issued credential, certificate email, Heartbeat mutation, historical credential
mutation, or individual MCS designation. A real issue still requires verified
completion, exact identity, prior-credential preflight, durable pending state,
review, and separate send approval.
