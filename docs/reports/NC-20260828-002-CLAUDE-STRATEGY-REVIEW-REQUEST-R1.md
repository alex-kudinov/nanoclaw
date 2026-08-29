# NC-20260828-002 — canonical Sertifier campaign strategy review

## Objective

Review the proposed canonical campaign and one-command Gru issuance strategy
before any live campaign is created. Report material defects only, ordered by
consequence, and write the response to:

`/Users/xbohdpukc/dev/NanoClaw-sertifier-campaigns-20260828/docs/reports/NC-20260828-002-CLAUDE-STRATEGY-REVIEW-RESPONSE-R1.md`

## Owner requirement

Implement reusable campaigns and allow the owner to say:

```text
send ai for coaches to person@example.com
```

The command should add the exact Heartbeat-identified recipient to the preset's
campaign and send the credential without requiring a second command. Existing
non-explicit requests, grader handoffs, and ambiguous identities retain the
review gate.

## Accepted facts

- Live read-only audit: 74 Mentor Coaching credentials occupy 74 unique
  campaigns, one credential each. Seventy-three use the current MCS component
  package and one is legacy. All are sent with provider-confirmed email.
- Whole account: 546 credentials across 168 campaigns; 36 campaigns are
  multi-recipient and one has 58 recipients.
- Sertifier's fixed-course guidance is one stored campaign ID per course plus
  `Campaign/AddCredentials` for each graduate.
- Sertifier UI `Send to New Recipients` duplicates a campaign. Same-campaign
  manual addition is `Edit Recipients` -> `Add Recipients`.
- The current operational `issue-certificate.sh` creates a recipient-named
  campaign whenever `--campaign-id` is absent, then adds one credential.
- It already has an exact-email/design duplicate preflight and reconciled
  public/registrar/email receipt behavior. Those must be preserved.
- Exact Heartbeat email lookup is supported by `find-user.sh --email` and
  returns a shaped array of `{id,name,email,role,groups}`.
- No live campaign, recipient, credential, email, Slack message, Heartbeat
  record, historical campaign, or production file may be changed by this
  review.

## Primary design

Read:

- `/Users/xbohdpukc/dev/NanoClaw-sertifier-campaigns-20260828/docs/SERTIFIER-CAMPAIGN-STRATEGY.md`

## Allowed supporting sources

- `/Users/xbohdpukc/dev/toolbox/shared/sertifier/tools/sertifier/issue-certificate.sh`
- `/Users/xbohdpukc/dev/toolbox/shared/sertifier/lib/presets.json`
- `/Users/xbohdpukc/dev/NanoClaw/groups/certifier/CLAUDE.md`
- `/Users/xbohdpukc/dev/NanoClaw/groups/certifier/EXECUTION-STEPS.md`
- `/Users/xbohdpukc/dev/toolbox/shared/heartbeat/tools/heartbeat/find-user.sh`

Do not read `.env`, credentials, browser/session state, recipient data,
pending/completed certificate scripts, conversations, Slack, databases,
provider systems, or unrelated files. Write only the named response artifact.

## Review questions

1. Does one versioned canonical campaign per preset correctly preserve
   historical credentials while stopping per-recipient campaign sprawl?
2. Are the campaign component/status/drift checks sufficient and fail-closed?
3. Does the explicit command constitute unambiguous send authorization without
   creating dangerous collisions with a bare `send`, missing-info replies,
   reactions, grader handoffs, or batch flows?
4. Is exact Heartbeat email-to-name resolution safe enough for the one-command
   path, including zero/multiple/mismatched/blank-name behavior?
5. Are durable pending-script, duplicate, uncertain-acceptance, reconciliation,
   email-delivery, and notification boundaries preserved?
6. Which negative and contract tests are required before campaign creation or
   deployment?

State explicitly whether the strategy is safe to implement and list every
required correction. Do not suggest a broader redesign or optional backlog.
