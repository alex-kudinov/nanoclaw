# CNPC Intake and Coach-Matching Automation

Owner: CNPC operations
Implementation task: `NC-20260810-002`
Status: public capture ingress deployed and live-verified; private NanoClaw
delivery remains unmigrated, unregistered, and undeployed

## Outcome

The target is a mostly autonomous CNPC intake coordinator with a narrow human decision boundary. It receives a normalized Gravity Forms application through n8n, stores it exactly once, derives eligibility and price deterministically, filters the current active/capacity-bearing coach roster, ranks up to two coaches plus a backup, and posts a review. External email, Plutio, capacity commitment, and ready-to-begin actions require named approval and host receipts.

The 2026-08-10 read-only audit found four non-equivalent coach sources: the Word bench, the public team page, Plutio onboarding responses, and Plutio availability responses. None is authoritative alone. `business_v2.cnpc_coaches` plus capacity snapshots is the canonical operational ledger; source imports must reconcile into it and surface drift rather than silently deleting coaches.

## Intake endpoints

Gravity Forms sends the unmodified entry to the public production webhook:

```text
POST https://webhooks.tandemcoach.co/webhook/cnpc-coaching-intake
Content-Type: application/json
X-CNPC-Webhook-Secret: value stored in CNPC_GF_WEBHOOK_SECRET
```

This public ingress secret authenticates WordPress to n8n only. It must be
different from the private NanoClaw webhook secret and from every Plutio
credential. n8n validates it before inspecting or transforming the body.

After validation and normalization, n8n sends the allowlisted contract to the
private NanoClaw endpoint on the Tailscale network:

```text
POST http://mini-claw:8088/hook/cnpc-coaching-intake
Content-Type: application/json
X-Webhook-Secret: value stored in CNPC_INTAKE_WEBHOOK_SECRET
```

NanoClaw returns:

- `202` with `request_id` and `webhook_inbox_id` for a newly accepted submission;
- `200` with `duplicate: true` for a replay of the same `submission_id`;
- `401` for a missing or wrong secret;
- `422` for a malformed n8n mapping;
- `500` when the durable envelope archive fails, so n8n retries.

## Gravity Forms webhook settings

For the first sanitized dummy only, configure the Gravity Forms Webhooks feed
as follows:

- Name: `CNPC Intake -> n8n`
- Request URL: `https://webhooks.tandemcoach.co/webhook/cnpc-coaching-intake`
- Request Method: `POST`
- Request Format: `JSON`
- Request Header: `X-CNPC-Webhook-Secret`, using a custom static value from the
  WordPress server configuration
- Request Body: `All Fields`
- Webhook Condition: disabled

The 2026-08-11 sanitized dummy established the real field map. The live n8n
workflow now authenticates and normalizes only the fields below. It still has
no downstream node, so normalized applications remain in n8n pending the
private NanoClaw deployment gates. Gravity Forms may remain `All Fields`
because the n8n-to-NanoClaw contract is an explicit allowlist.

## Gravity Forms form 1 field map

| Gravity key | Public form field | Normalized destination |
| --- | --- | --- |
| `1.3` | Your Name - First | `applicant.first_name` |
| `1.6` | Your Name - Last | `applicant.last_name` |
| `2` | Your Email Address | `applicant.email` |
| `16` | How Did You Learn About Us? | `applicant.lead_source` |
| `20` | Organization Name | `organization.legal_name` |
| `17` | Website | `organization.website` |
| `4.3` | Address - City | `organization.city` |
| `4.4` | Address - State | `organization.state` |
| `21` | What Kind of Organization Is This? | `organization.organization_type` via a closed enum map |
| `22` | Size | `organization.operating_expense_band` via a closed enum map |
| `24` | Type of Coaching | `request.coaching_type` via a closed enum map |
| `3` | Why Coaching? | `request.why_coaching` |
| `30` | First Choice Coach | `request.first_choice_coach` |
| `31` | Second Choice Coach | `request.second_choice_coach` |
| `28` | Anything Else? | `request.anything_else` |
| `29.1` | Consent checkbox | `consent`; must be true |
| `form_id`, `id`, `date_created` | Gravity entry metadata | stable source identity and submission time |

Section markers, unused address components, consent text/version fields,
honeypot data, IP address, user agent, payment metadata, and all other Gravity
entry metadata are excluded from the normalized contract.

## n8n payload contract

n8n must map Gravity Forms fields into this exact normalized JSON shape. It must preserve Gravity Forms form and entry IDs. The stable submission ID is `gf:<form_id>:<entry_id>`.

```json
{
  "submission_id": "gf:47:9001",
  "submitted_at": "2026-08-11T01:02:03.000Z",
  "applicant": {
    "first_name": "Jordan",
    "last_name": "Rivera",
    "email": "jordan@example.org",
    "lead_source": "Referral"
  },
  "organization": {
    "legal_name": "Community Example",
    "website": "https://example.org",
    "city": "Chicago",
    "state": "IL",
    "organization_type": "nonprofit_501c3",
    "operating_expense_band": "250k_to_499999"
  },
  "request": {
    "program_track": "cnpc",
    "coaching_type": "individual",
    "why_coaching": "Develop the leadership team through a transition.",
    "first_choice_coach": "",
    "second_choice_coach": "",
    "anything_else": ""
  },
  "consent": true,
  "source": {
    "form_id": "47",
    "entry_id": "9001"
  }
}
```

Allowed enum values:

- `organization_type`: `nonprofit_501c3`, `nonprofit_other_501c`, `government`, `for_profit`, `unsure`
- `operating_expense_band`: `under_250k`, `250k_to_499999`, `500k_plus`, `unknown`
- `program_track`: `cnpc`, `eit`, `unsure`
- `coaching_type`: `individual`, `team`, `both`, `unsure`

Do not forward Gravity Forms field labels, HTML, uploaded files, request headers, cookies, IP addresses, or arbitrary nested metadata. The normalized body is the complete agent-visible application.

## n8n delivery settings

Configure the HTTP Request node to:

1. send normalized JSON to the private NanoClaw endpoint above;
2. set `X-Webhook-Secret` from an n8n credential, never a workflow literal;
3. retry on failure five times with a five-second delay;
4. treat `200` and `202` as success;
5. route `401`, `422`, and exhausted `5xx` responses to the shared NanoClaw error workflow;
6. retain the n8n execution ID for reconciliation, but do not include it in `submission_id`.

## Host/minion boundary

```text
Gravity Forms -> n8n normalize/auth -> NanoClaw archive/dedup
  -> host validate + identity + eligibility + price + intake row
  -> host active-roster/capacity filter
  -> CNPC minion fit ranking
  -> host validates candidate IDs + roster version + persists match run
  -> Slack review
```

The model cannot:

- add a coach outside the host-provided pool;
- declare stale or missing capacity available;
- change eligibility or pricing;
- write directly to CNPC tables;
- access Gmail, Plutio, coach certificates, private client lists, or webhook secrets;
- send an email or create an external document.

## Capacity semantics

Availability is not a single boolean.

- `declared_available_slots`: latest accepted coach response for the quarter;
- `soft hold`: an invited or scheduled chemistry call, with an expiry;
- `hard commitment`: applied only after both contract signature and payment receipts exist;
- matchable capacity: declared slots minus unexpired soft holds.

This preserves the EA rule that a coach slot is not filled until signed and paid, while still balancing pending matches and chemistry calls.

## Separate CNPC Plutio workspace

CNPC must use a separate host-only credential namespace:

- `CNPC_PLUTIO_API_CLIENTID`
- `CNPC_PLUTIO_API_CLIENTSECRET`
- `CNPC_PLUTIO_SUBDOMAIN`

The credential previously pasted into chat must be rotated before production use. No credential value belongs in source, n8n payloads, minion prompts, Slack, test fixtures, or logs.

Before enabling external actions, discover and pin the CNPC person, proposal, contract, invoice, and payment templates. Every operation must carry an idempotency key, an exact approved payload hash, a named approver, and an external receipt. The existing single-workspace Plutio reaper must not be reused until it selects credentials by an explicit connection key.

## Delivery phases

### Implemented locally

- typed and length-bounded n8n contract;
- authenticated allowlist/normalization-only n8n workflow configuration at
  `setup/n8n/cnpc-coaching-intake-capture-workflow.json`; the tracked artifact
  contains only a one-way digest of the Gravity Forms ingress secret;
- perimeter idempotency from Gravity Forms entry identity;
- durable intake and workflow schema;
- deterministic eligibility and pricing;
- active-roster/capacity/soft-hold view;
- host-prepared match pool;
- CNPC minion prompt and knowledge;
- host validation and persistence of the minion's match result;
- registration script for `#gru-cnpc` and the runtime webhook definition;
- focused unit and HTTP receiver tests.

### Intake ingress readiness

- n8n 2.9.4 workflow `cnpc-coaching-intake` is imported, published, active, and
  normalizes only Gravity Forms form 1 at the public production URL;
- the workflow has no downstream node or connection;
- a 2026-08-11 live preflight verified `401` without the ingress secret and
  `202` with it;
- sanitized Gravity Forms entry 583 established the form map, and a post-update
  synthetic live canary verified `mapping_version: gf-form-1-v1` and stable
  `gf:1:<entry>` identity;
- the live receipt exposes no submitted values.

### Required before forwarding a captured submission to NanoClaw

- review and apply migration 116 on the target database;
- create `#gru-cnpc` and run the verified release's compiled
  `dist/cnpc-register.js` with its channel ID;
- set a fresh `CNPC_INTAKE_WEBHOOK_SECRET` in NanoClaw and n8n;
- build and deploy one exact NanoClaw artifact;
- verify `/health` release identity and the CNPC group/webhook registration;
- import or seed a sanitized active coach and current capacity snapshot, or expect the dummy to exercise the no-capacity alert path.

### Required before real-client automation

- reconcile onboarding, availability, Word bench, and public team records into canonical coach statuses;
- bind named Slack approver IDs and an action epoch;
- connect the correct CNPC mailbox/send-as through host Gmail controls;
- rotate and install CNPC Plutio credentials, then discover exact templates read-only;
- implement approved email, chemistry-hold, Plutio draft, signature/payment receipt, ready-to-begin, and capacity-commit executors;
- add Gravity Forms and Plutio sweepers so missed webhooks converge;
- run sanitized canaries before any customer or coach message.
