# NC-20260828-001 — Sertifier package evidence

Date: 2026-08-29T00:27:00Z  
Production host: `mini-claw.local`  
Catalog: `practitioner-series` revision 2  
Catalog SHA-256: `d84b3b06db50d74eb38d4a55b55acf0a9d5d654d66aaa791d3dc935fe117af00`

## Provider components

| Preset | Design | Detail | Email template | Approved hours |
| --- | --- | --- | --- | --- |
| `coaching-tools-mastery` | `08df053a-7e57-47c7-850e-e8b020b4ebf1` | `08df0562-a6d0-4207-82dc-305f2738104b` | `08df0562-c573-4946-8cf3-b3fed796a230` | 20 total; 13 CC; 7 RD |
| `ai-for-coaches` | `08ded7df-418f-47ea-8467-9592eac91460` | `08df0562-ab51-402b-81ca-7885b7b2b9f2` | `08df0562-e069-42b4-8d29-0275ebfeabf0` | 20 total; 6 CC; 14 RD; 3 ethics instruction inside CC, not separately ICF-designated |

The owner corrected the AI design's inconsistent total from 10 to 20 before
registration. Rendered DOM then showed 20 total, 6 CC, and 14 RD, with the old
10-hour line absent.

Both Details were created through the shared authenticated
`sertifier/create-detail` boundary and read back by ID with exact title,
description, 20-hour duration, skill, earning criteria, level/type, and no
expiry. Both email templates were duplicated from the branded MCS Foundation
delivery template, renamed, saved, reopened by ID, and checked in rendered DOM
for exact course copy, branding, QR/helper text, credential button, and absence
of MCS body text. The public getter independently returned the saved titles.

## Implementation and review

- Toolbox local-only clean commit: `f01d183` (`toolbox` has no configured Git
  remote). The operational shared checkout retains unrelated user changes.
- Practitioner authority receipt: `32fbb49`, pushed on
  `codex/sertifier-practitioner-presets-20260828`.
- Claude Sonnet/high R1: five model calls; 87,549 cache-create, 211,534
  cache-read, 17,639 output tokens; maximum context 87,551.
- Claude Sonnet/high R2: five model calls; 65,490 cache-create, 221,632
  cache-read, 8,164 output tokens; maximum context 74,056.
- Final review result: no unresolved material finding.

## Verification and deployment

- Focused component, credential-search, and issuance-receipt tests pass.
- Toolbox registry validates and the full framework suite passes 65/65.
- Pinned Node 22.23.2 NanoClaw documentation continuity and typecheck pass.
  The full root suite is 3,363 passing/31 skipped with only the unchanged CNPC
  wrapper assertion and date-stale Trafft fixture failures already recorded on
  the exact `2773def5` release baseline; this task edits neither surface.
- Both new entries appear in `--list-presets` with no required attributes.
- Local and production dry runs use `canary@example.invalid`, resolve the
  correct design/Detail/template/sender/subject, set `willSend:false`, and make
  no provider call.
- Studio and Mini hashes match for the Certifier prompt, preset registry,
  toolbox registry, issuance tool, create-Detail tool, and focused test.
- Production registry validation passes when the established Homebrew path is
  present. Focused production component tests pass.
- Production host release remains exact verified `2773def5` on Node 22.23.2;
  Gmail and Slack are connected, with zero active containers and no
  waiting/outgoing queue at deployment. No restart was needed because these
  are mounted prompt/tool/config files consumed by the next Certifier turn.

## External-action boundary

Created: two credential Details and two email templates. Corrected: one
owner-created design. Not created: campaign, recipient, issued credential,
certificate email, Slack canary, or Heartbeat record. Every future issuance
still requires the established exact recipient/email, prior-issuance search,
pending script, review card, and distinct send approval.
