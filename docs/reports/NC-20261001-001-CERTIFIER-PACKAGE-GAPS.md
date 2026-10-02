# NC-20261001-001 — Practitioner Certifier package gaps

Checked: 2026-10-02T01:05:02Z (October 1 in America/Chicago).
State: owner-approved implementation prepared; blocked on browser sign-in.

## Verified current result

The production Mini's Certifier prompt and mounted preset file match local
SHA-256 hashes (prompt prefix `f9bc730e`, preset prefix `d01ec738`). Both expose
only `coaching-tools-mastery` and `ai-for-coaches` for the Practitioner Series.
Shared course knowledge already includes the live portfolio. This is missing
issuance-package registration, not missing general course knowledge.

Authority: `/Users/xbohdpukc/dev/practitioner-series/program-facts/catalog.json`,
revision 2; SHA-256 `d84b3b06db50d74eb38d4a55b55acf0a9d5d654d66aaa791d3dc935fe117af00`.
Provider receipts/accepted decisions retain precedence over the catalog.

| Live course | Total / Core / Resource hours | Existing provider components | Required setup |
| --- | --- | --- | --- |
| Career & Transition Coaching | 20 / 14 / 6 | Certificate design only, under shorter title | Validate/reuse design; create remaining components |
| ADHD Coaching | 20 / 13 / 7 | Certificate design only | Validate/reuse design; create remaining components |
| Running a Coaching Business | 40 / 9 / 31 | Certificate design only | Validate/reuse design; create remaining components |
| Systemic Coaching for Executive Teams | 30 / 22 / 8 | Certificate design only, under shorter title | Validate/reuse design; create remaining components |
| Setting Up Your Coaching Practice | Non-CCE | Certificate design only, under alternate title | Validate completion design; create remaining components without CCE claims |

Somatic Coaching is planned/not submitted and must not be made an approved
CCE preset. Executive pathway totals are not another standalone course approval.

## Provider evidence and limits

Existing certificate designs:

- `TPS: Setting Up a Coaching Practice ` (trailing space): `08df06c7-6da9-4460-8bfc-561b07be7b91`.
- `TPS: Career Coaching`: `08df06b5-f0a5-4dec-855e-a17c8b31aff6`.
- `TPS: ADHD Coaching`: `08df06c8-703a-428b-83d6-97a207742906`.
- `TPS: Running a Coaching Business`: `08df06c7-e92b-4daa-84ea-9281b66e0e51`.
- `TPS: Systemic Coaching`: `08df06c8-c983-40a0-8083-d37c94619ff2`.

Current provider component searches used full and alternate course-title terms, limit 25, and
reported result totals. No matching Details, templates, or campaigns were found
for any of the five missing courses. Alternate-title searches corrected the
initial apparent absence of three designs; all five designs exist. These
searches establish matching-title inventory, not the absence
of unrelated or differently named records.

All five design getters verified ID, title, certificate type, and one page; they do
not expose certificate body text or hours. Visually verify the five designs
before registering them. No recipients or issued credentials were searched.

## Bounded setup plan

1. Obtain authority for missing live Sertifier components, empty versioned
   canonical campaigns, and deployment of the associated Certifier presets.
   This does not authorize recipient issuance, emails, DMs, or announcements.
2. Revalidate catalog and live component inventory; inspect all relevant
   rendered designs. Reuse the five existing designs after verifying their
   current copy and hours; correct only evidenced inconsistencies. Foundation wording
   is course completion only, with no accreditation hours.
3. Create/read back per-course Details and branded delivery templates; preserve
   exact catalog identity/hours and the established sender. Ethics instruction
   remains within Core hours and is never called a separate ICF designation.
4. Register exact linked IDs and aliases in the mounted Sertifier presets,
   create/verify each preset-owned canonical campaign using the existing
   guarded operator procedure, and update `groups/certifier/CLAUDE.md`.
   Continue the existing wrapper, pending-script, identity, duplicate, and
   uncertainty gates. Do not add another issuance entry point.
5. Use one execution writer, reconcile live lineage, run focused validation,
   apply the relevant independent-review/necessity gates before substantial
   implementation, deploy exact reviewed files, compare hashes, and verify
   each preset using safe dry runs. Record component and campaign readbacks
   separately from rendered verification and live issuance outcomes.

Rollback: disable only the new preset/mapping records. Keep unused provider
components for audit; do not alter existing campaigns or credentials.

## Approved implementation checkpoint

Owner approved completing and activating all five live packages in this chat
on October 1, recorded 2026-10-02T01:13:04Z. Approval excludes student issuance,
emails, DMs, announcements, and unrelated provider changes.

Observed path: mounted Certifier alias prompt and shared Sertifier presets feed
existing durable pending scripts and `issue-and-followthrough.sh`; the wrapper
validates preset-owned canonical campaigns before issuance. The observed gap is
five incomplete linked packages, not a missing worker, schema, or delivery path.
Required present evidence is provider ID/content readback, rendered design and
email correctness, exact catalog binding, local/live file identity, and safe
no-send dry runs. These are setup evidence, not a student-issuance outcome.

Operational obligation delta: five provider Details, branded templates, and
empty versioned canonical campaigns, with five preset/alias mappings. Existing
Sertifier, toolbox mounts, and Certifier remain the only systems on the path.
Without each design/Detail/template/campaign link, fingerprint validation cannot
establish the correct course credential/delivery configuration; without
preset/alias mapping, Certifier cannot resolve the course. Moving campaign
selection outside the preset risks per-recipient campaign creation or bypass.
No new DDL, worker, schedule, runtime, dependency, auth boundary, or issuance
entry point is proposed.

Next falsifiable integration proof: one complete Career package, rendered and
provider readbacks, then a preset dry run resolving exact linked IDs with
`willSend:false`. Bound before that proof: validate its existing design;
create/reuse only its Detail/template/canonical campaign; prepare only its
preset/alias and use established verification. After proof, replicate four
courses and reconcile actual topology with this obligation delta before release.
Replan before horizontal expansion if the first proof fails.

Fresh-context necessity review (explicit GPT-5.6 Sol/high): `KEEP`. The reviewer
identified horizontal creation before proof as the largest avoidable burden and
accepted the Career walking skeleton. No owner decision remains for the
approved package scope. This adds provider objects within the established state
and ownership model; it does not add an independently managed subsystem.

## Current boundary

2026-10-02T01:26:16Z root continuation: the child sign-in tab cannot be displayed
by the browser backend. Root opened a visible official
`https://app.sertifier.com/en/login` tab, marked it handoff, and asked the owner
to sign in directly there. Root browser ID `5`, short tab ID `1`, provider tab
`browser-use:ef86d4b6-cbaf-4053-93d6-cfc1e5f0dd43`. Rebind the root tab on resume;
do not use the inaccessible child tab or require another package approval.
No OTP or credential belongs in repository artifacts or chat. After sign-in,
check whether the execution worker's session can use the authenticated state;
if not, assign an explicit browser/source ownership boundary before continuing.

Only this report and continuity records changed. No production/provider write,
deployment, certificate issuance, message, restart, or schedule change occurred.
Claude was not used for the read-only audit. Follow-up implementation must use
the repository's current routing/review/release rules and preserve dirty work.

Continuity verification ran on exact Node 22.23.2; schema sanitizer passed and
the new task has no checker findings. The full continuity check remains failing
on pre-existing unrelated missing task-detail/changelog records and untracked
`groups/capacity/CLAUDE.md`. Scoped `git diff --check` passes. No implementation
tests were required for evidence-only additions.

## Execution continuation checkpoint — Career walking skeleton

Checked 2026-10-02T01:22Z. The owner-approved implementation remains active,
but the first provider mutation is held at the required rendered-design gate.

- Catalog revision 2 and its recorded SHA-256 were revalidated. The five design
  getters again returned the exact IDs, expected titles, certificate type, and
  one page. Searches for `Career`, `ADHD`, `Business`, `Systemic`, and `Practice`
  each returned zero matching Details, email templates, and campaigns.
- The source-bound Career Detail, delivery copy, preset shape, aliases, campaign
  fingerprint, and proof checklist are prepared in
  `docs/reports/NC-20261001-001-CAREER-PACKAGE-PAYLOAD.json` (SHA-256
  `36c59a37f60e8cf2fe3b138627d37963eb6b21ed2a42f322f057ffc5138f5921`
  after final receipts were recorded).
  Provider-assigned IDs remain deliberately null.
- The production Mini checkout is `main` at
  `a6e4b13a64a4f0c744da83f74852d52aae764e2f`; the running immutable release is
  verified `17b2deb4162cb33e2d6fc46810892eddc2fe28ea` under Node 22.23.2. Gmail and
  Slack are connected, the Certifier circuit is closed, and current live prompt
  and preset hashes remain `f9bc730e...` and `d01ec738...`.
- The child-owned Sertifier browser reached the official email verification
  screen. The in-app browser session is isolated from the parent task, and this
  environment cannot expose subagent browser visibility. No credential or auth
  store was inspected and no second code was requested.
- No Sertifier Detail, template, campaign, recipient, credential, or email was
  created. No prompt/preset deployment, message, restart, or schedule change
  occurred.

Continuation: sign in through the handed-off official Sertifier tab, visibly
verify the Career design has the full course title and exact `20 / 14 / 6`
hours, then create/read back only the Career Detail and cloned branded template,
create its empty canonical `v1` campaign, add only the Career preset/aliases,
and complete the independent campaign fingerprint plus `willSend:false` proof.
Do not start the other four packages until that walking skeleton passes.

The owner completed login in the parent task's authenticated in-app browser.
Browser sessions are isolated by task, so the execution worker cannot bind or
show that authenticated tab. The parent owns only rendered certificate checks,
evidenced design corrections, and branded email-template clone/edit/readback in
that authenticated UI. The execution worker owns Detail and canonical-campaign
API operations, preset/prompt source, tests, deployment, and live verification.
This split prevents overlapping component edits and adds no worker, service,
credential transfer, or second issuance path.

### Career walking skeleton passed

Career & Transition Coaching passed the bounded integration proof before any
horizontal package work began:

- Rendered design `08df06b5-f0a5-4dec-855e-a17c8b31aff6` visibly shows the
  full course title and `20` total / `14` Core Competency / `6` Resource
  Development hours. No design correction was needed.
- Detail `08df2025-7d97-482d-8098-c0177e5e7ec8` was created and read back with
  exact title, body, 20-hour duration, skill, earning criteria, and zero
  attendees.
- Branded template `08df2026-10fb-45ab-8910-f5d751929786` was cloned from the
  established MCS template, edited only on the clone, saved, reopened, and
  rendered. Exact Career copy, brand controls, QR/helper content, organization
  logo/social controls, `#09705b` button, `View My Credential`, and the
  Practitioner Series footer were verified; no MCS or 10-hour copy remains.
- Empty Draft campaign `08df2026-d59c-45a8-8cfb-ae4082b5ef08` was created and
  read back with the exact design/Detail/template/sender fingerprint. Exact
  campaign search returned one record; credential search returned zero.
- Focused component and canonical-campaign tests passed. Local and production
  `verify-campaigns` passed, and both `.invalid` dry runs resolved the exact
  package with `willSend:false`.
- Only the prompt and preset mounts were hot-synced to the Mini. Local/live
  hashes match: prompt `7851820a6ccba67eee0c4bae2d8105ee2cfa2e2d92b1384d738146ebc6529e97`,
  presets `36d1e093611d538506379ec492e6266420a45e2daf9f19fc4f5ba4c8f4a52b30`.
  Rollback files are in
  `/Users/xbohdpukc/.local/share/nanoclaw-deploy-backups/NC-20261001-001-career-20261002T0148Z`.
  No restart was required. Production release `17b2deb4162cb33e2d6fc46810892eddc2fe28ea`
  remained verified on Node 22.23.2 with Gmail/Slack connected, zero active or
  waiting work, and the Certifier circuit closed.

No recipient, credential, certificate email, Heartbeat message, announcement,
or other customer side effect was created. This proof permits mechanical
replication to the other four approved packages.

## Final package receipts

All five approved packages are now complete and active in the mounted Certifier
configuration. Provider IDs are immutable receipts:

| Preset | Design | Detail | Delivery template | Canonical campaign |
| --- | --- | --- | --- | --- |
| `career-transition-coaching` | `08df06b5-f0a5-4dec-855e-a17c8b31aff6` | `08df2025-7d97-482d-8098-c0177e5e7ec8` | `08df2026-10fb-45ab-8910-f5d751929786` | `08df2026-d59c-45a8-8cfb-ae4082b5ef08` |
| `adhd-coaching` | `08df06c8-703a-428b-83d6-97a207742906` | `08df2027-bf67-4c56-890e-7e5c0aa55db3` | `08df2028-b07e-41b8-8a76-586e8172b485` | `08df2028-f8db-4835-8003-61817f369e84` |
| `running-coaching-business` | `08df06c7-e92b-4daa-84ea-9281b66e0e51` | `08df2027-c044-4c8c-8a8a-83b16c918a70` | `08df2029-1268-4299-849d-02e296497d9d` | `08df2029-41bf-4e75-8c83-81df43851b60` |
| `systemic-coaching-executive-teams` | `08df06c8-c983-40a0-8083-d37c94619ff2` | `08df2028-38aa-4dc1-877a-6286e417859d` | `08df2029-4c0a-46f2-81e2-ad571b3e9a9e` | `08df2029-6b09-48e1-8d08-9cbc6f3b0e68` |
| `setting-up-coaching-practice` | `08df06c7-6da9-4460-8bfc-561b07be7b91` | `08df2028-7f6d-4a2c-83a4-0f9266b024c5` | `08df2029-5b33-4bb7-8c58-b075d6129155` | `08df2029-8b8b-49c9-8ce3-f219c448aaba` |

Provider readback verified every Detail body and earning criterion. All five
campaigns are public Draft containers with the exact design, Detail, template,
sender, subject, and address fingerprints. Exact per-campaign credential
searches returned zero. The seven Practitioner Series delivery templates now
comprise the two existing courses plus these five additions.
The final remaining-four payload/receipt file SHA-256 is
`51a94043a8b20e312f6aa7af6875c089331d0c948d1232bbcf022188e8ace248`.

Rendered design evidence is stored under
`docs/reports/NC-20261001-001-assets/`: `career-design.jpg`, `adhd-design.jpg`,
`business-design.jpg`, `systemic-design-corrected.jpg`, and
`practice-design.jpg`. `coaching-tools-existing-badge.jpg` independently shows
the exact existing Coaching Tools badge linked by the live campaign. Systemic
was corrected from `20` to `22` Core
Competency hours while retaining `30` total and `8` Resource Development;
Foundation was normalized to the exact title and completion-only wording with
no ICF badge or CCE/hour claim. The other three designs were already correct.

Rendered email evidence is `career-email.jpg`, `adhd-email.jpg`,
`running-coaching-business-email.jpg`,
`systemic-coaching-executive-teams-email.jpg`, and
`setting-up-coaching-practice-email.jpg`. Every clone preserves the verified
brand controls, QR/helper content, organization logo/social controls,
`#09705b` button, one `View My Credential` action, and the footer
`Tandem Coaching Academy · The Practitioner Series`; no source-course copy
remains. `practitioner-templates.jpg` shows the exact seven Practitioner
templates together.

## Final verification and activation

- Toolbox focused component/canonical tests pass; the five-test Sertifier suite
  passes; the full toolbox suite passes `65/65`.
- Each new preset independently passes live and production-mounted
  `verify-campaigns`. Each production `.invalid` dry run resolves its exact
  campaign and component IDs with `willSend:false`.
- A broad all-existing-preset verification surfaced provider/source drift on
  `coaching-tools-mastery`: source expected `badgeId:null`, while its existing
  campaign had linked matching badge `08df063c-574e-4be3-8adc-aa9472401d3f`
  on 2026-08-30. Readback and rendered proof established that the badge is the
  exact `TPS: Coaching Tools Mastery` design. Source was reconciled to that
  existing component; no provider object, campaign, credential, or delivery was
  changed. All seven Practitioner campaign fingerprints and no-send dry runs
  then passed.
- Final local/live hashes match: prompt
  `8859d9030f68d65cb330562416fd02d71a94e0399e18865fe1a5e3343e232c82`,
  presets `07e454fc3224bcad906808cc95f8d013895fe47acee7fa0f33fd5956eff583ac`.
  Final rollback files are in
  `/Users/xbohdpukc/.local/share/nanoclaw-deploy-backups/NC-20261001-001-all5-20261002T0206Z`.
  The original Coaching Tools `badgeId:null` source is retained there and in
  toolbox commit `93a02b2`; the immediate badge-reconciliation rollback is
  `/Users/xbohdpukc/.local/share/nanoclaw-deploy-backups/NC-20261001-001-badge-reconcile-20261002T0220Z`.
- The Mini remains healthy on verified immutable release
  `17b2deb4162cb33e2d6fc46810892eddc2fe28ea`, Node 22.23.2, with Gmail and
  Slack connected, no waiting groups, and the Certifier circuit closed. No
  daemon release or restart was required because the prompt and preset are
  mounted operational files consumed on the next Certifier turn.
- Independent owner-side acceptance verified exact catalog bindings, unique
  IDs, canonical keys/status rules, sender identity, aliases, the absence of an
  ambiguous bare `foundation`, and the completion-only Foundation boundary.
  The actual topology matches the accepted obligation delta: five Details,
  five templates, five campaigns, and five mappings, with only the two declared
  existing-design corrections. No DDL, worker, schedule, runtime dependency,
  auth path, or issuance entry point was added.

Risk-gate result: Claude was not used. Although future issuance is consequential,
material uncertainty was not present after the bounded Career proof, exact
provider readbacks, deterministic tests, zero-recipient searches, mount hashes,
and production dry runs. This is established package configuration, not a novel
authorization or issuance architecture.

Source/evidence commits: NanoClaw `dbb6aa75` on
`codex/continuity-reconciliation`; toolbox
`93a02b2d2b2f6763cdba88223dd8538c3110c37f` on the local-only branch
`codex/sertifier-package-coverage-20261001` (the toolbox repository has no
remote). The toolbox commit captures the complete current Sertifier subsystem
because the already-live canonical-campaign and follow-through implementation
was untracked or uncommitted on the starting toolbox branch; a preset-only
commit would not have been independently runnable.
Source-only Aug-30 badge drift was reconciled by follow-up toolbox commit
`4e098ab09678fe0bb5544d43118d852fae8b6d74` on the same branch.

No student certificate was issued and no certificate email, direct message,
graduate announcement, customer message, schedule, or service restart occurred.
