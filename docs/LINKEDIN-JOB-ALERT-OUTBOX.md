# LinkedIn job-alert outbox

Status: walking skeleton for `NC-20260915-002`  
Owner: NanoClaw host intake; Executive Search owns matching and disposition

## Boundary

LinkedIn native job-alert email is discovery input, not customer or business
correspondence. A message is captured before Mailman, Chief, proposal-reply,
classification, or Gmail-resource grants only when all of these hold:

- the envelope sender is exactly `jobalerts-noreply@linkedin.com`;
- Gmail's first `Authentication-Results` header is from `mx.google.com` and
  reports aligned LinkedIn DMARC or DKIM pass;
- at least one bounded LinkedIn `/jobs/view/<numeric-id>` pointer is present.

Failure to parse a trusted alert holds Gmail cursor advancement for retry. An
untrusted lookalike is not captured and receives no Executive Search authority.
Captured alerts receive the durable inbound disposition
`linkedin_job_alert_outbox_persisted` and do not wake an agent.

## Stored envelope

The private operational directory is:

```text
data/linkedin-job-alert-outbox/
```

Directory mode is `0700`; immutable envelope files are `0600` and named by a
SHA-256 envelope ID. They contain only Gmail message/thread IDs, observed time,
bounded subject, source hashes, canonical LinkedIn job IDs/URLs, bounded anchor
titles, and bounded adjacent context. Raw email bodies, HTML, tracking query
parameters, recipient addresses, credentials, attachments, and mailbox tokens
are never stored in the outbox.

Exact message replay returns the existing envelope. A changed payload under the
same Gmail message ID fails closed instead of replacing evidence.

## Studio import and recovery

Executive Search remains loopback-only. Its explicit operator action pulls a
bounded batch over the existing authenticated Tailnet SSH path, never by adding
an inbound application port or copying Gmail credentials. Source envelopes are
not deleted after transfer. The Studio keeps separate private `received`,
`pending`, `resolved`, and `invalid` receipts, so SSH failure or process restart
can replay safely.

Only an exact existing employer/public-ATS title and company match may resolve
a lead to a current job. Email snippets never become assessed job postings.
Missing or ambiguous matches remain visible as pending leads.

## Operations

- Import is user-triggered; no timer or host job is enabled in this release.
- A natural exact-sender alert is still required to validate LinkedIn's current
  email layout before recurring polling is considered.
- On capture failure, inspect only minimized error codes and a separately
  authorized exact message. Do not route the alert through Sales or Chief.
- Rollback removes the capture call and disposition reason. Preserve outbox and
  Studio receipts for evidence; they contain no action authority.
- This path never refreshes a briefing, starts an application, contacts an
  employer, or changes LinkedIn account state.
