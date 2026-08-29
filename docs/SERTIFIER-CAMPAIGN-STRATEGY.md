# Sertifier canonical campaign strategy

Status: implementation authority for `NC-20260828-002`
Owner decision: one reusable, versioned campaign per certificate preset
Provider guidance: [Sertifier API quickstart](https://help.sertifier.com/sertifier-api-quickstart), [campaign recipient behavior](https://help.sertifier.com/how-do-i-add-recipients)

## 1. Problem and evidence

Gru currently treats a campaign as a per-recipient transport wrapper. Unless
the caller supplies `--campaign-id`, `issue-certificate.sh` creates a campaign
whose title includes the recipient name and then adds exactly one credential.

A content-minimized live audit on 2026-08-29 found:

- 74 Mentor Coaching campaign matches and 74 issued credentials;
- 74 unique campaigns, each with exactly one credential;
- 73 use the current MCS design/Detail/template and one is legacy;
- all 74 campaigns are sent and all 74 credential emails are provider-confirmed;
- across the account, 546 credentials occupy 168 campaigns; 36 campaigns
  already contain multiple recipients, with a maximum of 58.

Sertifier's fixed-course guidance is the opposite model: create the campaign
once, store its `campaignId`, and call `Campaign/AddCredentials` for every new
graduate. The UI label `Send to New Recipients` is not same-campaign reuse: it
duplicates the campaign. Manual same-campaign reuse is `Edit Recipients` ->
`Add Recipients`.

## 2. Canonical campaign contract

Each preset owns exactly one current canonical campaign version. The preset
record carries:

```json
{
  "campaign": {
    "strategy": "canonical_versioned",
    "id": "provider campaign ID",
    "version": 1,
    "key": "preset-code@v1",
    "private": false,
    "allowedStatuses": [1, 3]
  },
  "sendAliases": ["exact normalized command phrase"]
}
```

The existing preset fields remain the expected component fingerprint:

- `designId`;
- `detailId`;
- `badgeId`;
- `emailTemplateId`;
- `emailFromName`;
- `emailSubject`;
- `emailFromAddress`.

Campaign titles contain no recipient identity. Use:

```text
Canonical | <preset code> | v<version>
```

The campaign may be Draft (`1`) before its first recipient or Sent (`3`)
afterward. Those are the only allowed statuses. Scheduled (`2`) and every
unknown status fail closed. `privateCampaign` must equal the preset's explicit
`campaign.private` value; canonical campaigns are public (`false`) unless a
future reviewed preset version says otherwise.

## 3. Versioning and historical behavior

Create a new campaign version when any bound component or delivery identity
changes materially: design, Detail, badge, email template, sender, subject,
approved hours/facts, privacy, or expiry policy. Update the preset only after
the new campaign is read back and verified. Never edit a prior campaign to
make it represent a new program revision.

Historical campaigns and credentials remain untouched. The 74 existing MCS
campaigns stay as issuance history; future MCS graduates enter the new
canonical campaign. No migration, merge, delete, or resend is required.

## 4. Issuance boundary

Before adding a credential, `issue-certificate.sh` must:

1. load the preset's canonical campaign ID;
2. fail closed if the campaign configuration is absent or malformed;
3. GET the campaign and verify design, Detail, badge, template, sender name,
   sender address, subject, privacy, and allowed status against the preset;
4. search for an existing active credential for the exact normalized email
   and preset design; return `already_issued` without resending when found;
5. build the recipient payload, including required attributes and dates;
6. call `Campaign/AddCredentials` on the canonical campaign;
7. reconcile the exact campaign/email credential and provider email tracking;
8. return the canonical campaign key/ID, credential/public/registrar URLs, and
   confirmed delivery state.

Gru never creates campaigns during recipient issuance. The canonical ID is
loaded from the preset automatically; it is not supplied by the user or Gru.
`--campaign-id` is a recovery/operator override only and is forbidden in
Gru-authored scripts. Any override still has to pass the exact component,
privacy, and status validation.

Dry-run performs local configuration validation and reports the canonical
campaign key/ID without calling Sertifier. Provider campaign readback belongs
to live send preflight and a separate read-only verification command/test.

## 5. Gru command semantics

### Explicit one-command send

The exact form below is both the certificate request and the owner's send
authorization:

```text
send ai for coaches to person@example.com
```

Explicit-send parsing runs before the generic bare-`send` dispatch bucket. It
is recognized only when one message contains:

- a leading `send` action;
- an exact normalized alias from that preset's `sendAliases` list;
- `to` followed by exactly one syntactically valid email address;
- no ambiguous second recipient or certificate type.

The entire normalized grammar is `send <alias> to <email>`; it is not a
substring search. This makes `send CNPC supervision to x@y.com` resolve the
exact `cnpc supervision` alias rather than the generic `supervision` alias.
Aliases must be unique across presets; duplicate aliases fail validation.
Only presets whose `requiredAttributes` array is empty qualify for immediate
one-command execution. Attribute-bearing presets fall back to the normal
collection/review flow so required values can be supplied before authorization.

Gru then:

1. lowercases the lookup key and resolves it through Heartbeat
   `find-user --email`;
2. requires exactly one result with a nonblank full name and a case-insensitive
   exact email match;
3. writes the normal durable pending script before any provider action;
4. marks the script as authorized by the explicit campaign-send command;
5. runs that exact script with `--send` in the same turn;
6. archives it only after a reconciled credential and email receipt;
7. branches on the tool receipt:
   - `issued` with `emailConfirmed:true`: report the canonical campaign add and
     credential URLs, then archive the script;
   - `already_issued`: report a duplicate-safe no-op and do not claim a new add
     or resend; archive the request as completed-no-op;
   - `issued_pending_reconciliation` or any ambiguous/failed receipt: move the
     script to `pending/uncertain/`, post `[CERTIFICATE HOLD]`, and never retry
     automatically or treat a later bare `send` as authority to resend.

If Heartbeat has no exact named match, Gru writes a non-sendable
`AWAITING_NAME` draft and asks for the certificate name. Ambiguous/mismatched
identity, missing campaign configuration, provider drift, duplicate state, or
uncertain acceptance always stops the send. A later name reply does not inherit
send authorization silently: Gru posts the normal review and waits for `send`.

An explicit command for an attribute-bearing preset writes/continues the
normal draft, asks for all missing attributes at once, and later uses the
standard review gate. It does not run a doomed `--send` call.

### Existing two-step flow

Requests that do not match the exact explicit-send grammar retain the current
behavior:

```text
AI for Coaches for Jane Doe, person@example.com
```

Gru writes the pending script, posts `[CERTIFICATE REVIEW]`, and waits for a
separate `send` or approval reaction. A bare `send` continues to execute one
unambiguous existing pending script.

### Foundation and grader handoffs

Grader handoffs remain two-step and eligibility-gated. They are never treated
as explicit campaign-send commands merely because their prose contains the
word `send`. Heartbeat remains authoritative for Foundation completion and
prerequisites.

## 6. Prompt reconciliation requirements

The Certifier operating prompt and execution steps must change with the tool:

- replace the old rule that every issuance creates a campaign with the
  canonical reuse contract;
- test explicit-send grammar before bare `send`/reaction handling;
- state that preset campaign IDs are automatic and Gru must never pass an
  operator override;
- keep pending-script durability before every provider write;
- add `AWAITING_NAME`, `already_issued`, and uncertain-reconciliation branches;
- preserve batch dispatch and grader handoffs outside one-command semantics.

## 7. Required tests

- preset schema: unique aliases, canonical IDs/keys/versions, explicit privacy,
  allowed statuses exactly `[1,3]`, and component IDs;
- exact grammar vs. bare `send`, reaction, grader handoff, batch, multiple
  emails, unknown alias, overlapping phrase, and attribute-bearing preset;
- exact Heartbeat email comparison: lowercase normalization, zero result,
  multiple results, blank name, and mismatched returned email;
- campaign drift: one negative test per design, Detail, badge (including
  null/missing normalization), template, sender name/address, subject, privacy,
  and status; operator override must pass the same checks;
- missing/malformed campaign config refuses issuance and never creates a
  recipient-named campaign;
- duplicate returns `already_issued` without `AddCredentials` or resend;
- successful canonical add reconciles the same campaign and email;
- uncertain reconciliation moves the script to a non-sendable hold and never
  archives or retries automatically.

## 8. Rollout and rollback

1. Create one empty canonical campaign per configured preset through the
   established `sertifier/create-campaign` tool.
2. Read back every campaign and verify the full component fingerprint.
3. Add campaign bindings to `presets.json`; run configuration and dry-run tests.
4. Deploy prompt/tool/config files byte-for-byte to the production Mini.
5. Verify production registry, campaign readbacks, command-contract tests, and
   `.invalid` dry runs. Do not manufacture a recipient or certificate canary.
6. The first natural explicitly authorized send is the end-to-end outcome
   proof; until then, report implementation/live preflight separately from
   natural credential delivery.

Rollback is config-only: restore the prior preset/tool/prompt files. This
disables canonical issuance and explicit one-command send without altering any
campaign or credential. Empty canonical campaigns may remain for audit. Do not
fall back to automatic recipient-named campaign creation.
