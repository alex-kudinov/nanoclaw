# Checkout failure recovery correction

Status: proposed correction design under `NC-20260829-001`
Authority: accepted
`decision:checkout-failure-customer-recovery-2026-08-29`
Supersedes: no prior evidence; narrows and corrects the implemented mechanics
under `docs/CHECKOUT-RECOVERY-CONTROL.md`

## Outcome

One checkout episode must produce one source-authoritative operational incident
that answers, in plain language:

- who attempted to pay, when exact provider identity permits it;
- which product and amount were involved;
- what Stripe says happened and what the safe next step is;
- whether a customer reminder is permitted and whether one was sent;
- whether the buyer tried again or later purchased.

The checkout page must give the customer immediate safe guidance. Raw provider
codes, internal state names, guessed identity, duplicate webhook attempts, and
separate `payment_failed`/`shadow_ready` broadcasts are not acceptable output.

## Confirmed production failure

The August 29 episode created two distinct Tandem PaymentIntents and six Stripe
failure events. NanoClaw cases 30 and 31 each posted once on admission and once
again after the five-minute shadow transition. Stripe retained the $299 Mentor
Coaching Foundations description, customer, card summary, and `do_not_honor`
decline guidance. The cases retained none of those fields and had no Party link.

Five defects combined:

1. **Exact-byte HMAC was broken.** WordPress signs the exact JSON string.
   n8n parsed that body and called `JSON.stringify` before verification.
   Product name/return URL introduced escaped slash and Unicode differences.
   All natural website facts since August 24 failed; WordPress now holds 99
   queued facts, 57 exhausted.
2. **The Stripe relay discarded its own extraction.** Live Code nodes extract
   email/product/amount fields, but the final HTTP node constructs an ID-only
   seven-field payload. Existing tests stop at the Code-node output.
3. **Failure detail was never extracted.** Decline/advice/error codes,
   customer name, card brand, and last four digits remain in Stripe only.
4. **Operator projection leaked implementation state.** The host posted both
   `payment_failed` and `shadow_ready` with internal consent/eligibility labels.
5. **Party Context was not consumed.** The source graph correctly knows the
   returning Party, but broad minion query remains disabled and checkout cases
   have no deterministic host-owned Party binding.
6. **The send policy contract drifted.** The live website records affirmative
   `checkout-reminder-v3-*` policy variants, while the NanoClaw sender accepts
   only literal `checkout-reminder-v2`. Once transport is repaired, valid v3
   consent would still fail scheduling.

Configuration drift is not the cause: the website/n8n path suffix, ingress
secret fingerprints, relay secret fingerprints, n8n-to-host path fingerprints,
environment presence, workflow activation, and service health match.

## Corrected source contracts

### Website to n8n

- The n8n Webhook node enables raw-body capture.
- HMAC verification uses the exact received raw bytes and only parses JSON
  after timing-safe verification and timestamp validation.
- The parsed body is normalized through the existing allowlist. No unexpected
  source field is forwarded.
- Contract tests include an HTTPS return URL, Unicode product name, and a body
  whose parse/re-serialize bytes differ; only exact-byte verification passes.
- WordPress records bounded delivery status (`last_http_status`, attempts,
  exhausted) and exposes aggregate queue health without payloads or identity.

### Stripe to NanoClaw

The fixed-account Code nodes return, and the HTTP node forwards, exactly:

- existing event/account/PaymentIntent/Checkout/charge aliases;
- verified email/name candidates, Stripe customer ID when present;
- program/product/product name, amount/currency, locale/return URL, and consent
  metadata already present on the Stripe object;
- bounded `last_payment_error` code, decline code, advice code, message class,
  card brand, and last four digits.

The relay never forwards full PaymentMethod, billing address, raw Stripe
payload, bank-account data, card fingerprint, CVC/AVS details, IP, or secret.
Tests exercise the complete Code-node-to-HTTP-body projection; extraction-only
tests are insufficient.

### Host admission and Party binding

Migration 140 adds nullable, admin-only failure context to checkout cases:

- `party_id` plus `party_evidence_tier`;
- last failure/decline/advice codes;
- host-derived `customer_guidance_key`;
- card brand/last4;
- the exact operator-incident reference.

It also adds a dedicated `checkout_recovery_operator_incidents` relation and
an append-only incident-to-case relation. An incident stores a privacy-minimized
subject key, fixed episode start, last failure, quiet-period notification due
time, product/amount/currency grouping facts, attempt/case counts, guidance key,
version, and root-notification receipt. It never stores email, name, raw Stripe
IDs, checkout token, full card data, or raw provider messages.

Binding precedence is:

1. active exact account-scoped Stripe customer external reference;
2. exactly one canonical Party owning the normalized checkout email;
3. unresolved (`party_id=NULL`) with a bounded evidence code.

Name, card suffix, product, amount, browsing time, and temporal proximity never
select or merge a Party. A later exact website PaymentIntent alias enriches the
same case transactionally. Conflicting aliases or identity remain held.

## Customer-safe decline policy

The host and frontend share a closed guidance vocabulary. The customer never
sees raw decline codes or sensitive fraud/lost/stolen/blacklist detail.

| Guidance key | Customer meaning | Next step |
| --- | --- | --- |
| `verify_card_details` | Some card details were not accepted | Check card number, expiry, security code, and billing details |
| `authenticate_payment` | The bank requires verification | Retry and complete the bank authentication step |
| `use_different_method` | This method cannot complete the payment | Use another card or payment method |
| `contact_issuer_or_change_method` | The bank declined without a specific reason | Contact the card issuer or use another payment method |
| `retry_later_or_change_method` | The issuer or network could not process it | Retry once later, then use another method/contact the issuer |
| `generic_decline` | The payment was not approved | Contact the issuer or use another method |

`do_not_honor` maps to `contact_issuer_or_change_method`. Fraud-related and
sensitive codes always map to `generic_decline`. Stripe's human-readable error
message is evidence, not directly rendered customer copy.

The checkout frontend renders localized English, Spanish, Japanese, and French
copy from the safe guidance key available on the Stripe.js error. It preserves
the payment form and alternative-method controls. This immediate inline message
does not send an email. Outbound reminders retain the existing prospective,
policy-v2, consent, purchase-suppression, and provider-acceptance gates.

## One operator incident

- Individual provider events remain append-only evidence.
- `payment.failed` does not post immediately.
- The five-minute host sweep groups due cases by exact Party when resolved, or
  by email HMAC when unresolved, plus Stripe account/product/amount/currency.
- The first case's `started_at` is the fixed episode anchor. A case joins that
  incident only when its `started_at` is at or after the anchor and strictly
  before anchor plus 30 minutes. The window never rolls forward.
- Find-or-create runs inside the same transaction under a PostgreSQL advisory
  lock derived from the privacy-minimized subject/account/product/amount tuple.
  After taking the lock, the host re-reads the most recent open incident and
  either joins it or inserts one exact `incident_key`. A unique constraint on
  `incident_key` plus unique incident-to-case `case_id` is defense in depth;
  `ON CONFLICT` makes exact replay a no-op.
- Notification is due after five quiet minutes from the last failed attempt,
  capped at the fixed episode end. New failures before notification move only
  the quiet-period due time. This lets the observed 10:06–10:12 attempt cluster
  produce one useful root after it becomes quiet.
- One durable operator incident references every case and counts PaymentIntents
  and provider attempts. The root uses stable
  `threadKey=checkout:failure:<incident UUID>`; a genuinely later material
  change after root notification is a reply in that same thread, never another
  root notification.
- Slack copy contains no internal state names. Example:

  `Payment unsuccessful: Mentor Coaching Foundations — $299 USD`

  `Customer: returning prospect (Party 10216)`

  `Stripe: Visa ending 3188; bank declined without a specific reason.`

  `Next step: customer should contact the issuer or use another payment method.`

  `Attempts: 2 PaymentIntents / 6 provider failures in 7 minutes.`

  `Reminder: not sent — checkout reminder consent was not received.`

The message may include an internally authorized customer name only when the
case has exact Party/email evidence. It never includes full email, raw Stripe
IDs, checkout token, recovery URL, or raw error text.

## Historical queue and cutover

The 99 queued website facts are evidence of the outage, not automatic customer
work. Before any corrected n8n webhook is activated:

1. save the exact WordPress option to a mode-0600 protected backup;
2. record aggregate event/attempt/exhaustion counts and a content hash;
3. move existing entries to a separately named held option and clear the active
   delivery queue through one exact WP-CLI maintenance command;
4. delete every scheduled `tandem_checkout_recovery_retry` cron event and read
   back zero before n8n can accept corrected traffic;
5. deploy a source-epoch option/check so a held pre-cutover item cannot be
   reintroduced into the active queue by stale code or an overlapping cron;
6. do not replay held facts through case scheduling, reminders, or Slack;
7. start a new prospective source epoch at the corrected deployment time.

Any later historical reconciliation requires a separate exact owner decision.

## Deployment sequence

1. Build and verify NanoClaw migration/source from exact live lineage with all
   gates off for the new operator incident.
2. Back up PostgreSQL, SQLite, plist, live n8n workflow exports, website Git and
   checkout queue, and current configuration fingerprints.
3. Quarantine the WordPress queue with the exact WP-CLI maintenance command,
   delete/read back zero retry cron events, set the prospective source epoch,
   and verify the active queue is empty. The existing broken n8n relay remains
   unchanged during this step, so no queued fact can escape.
4. Deploy the exact Tandemweb source-epoch/customer-guidance commit and reset
   opcode/cache through the established workflow. New events during the bounded
   remaining maintenance window may enter only the new active queue.
5. Apply migration 140 and activate the reviewed NanoClaw release.
6. After zero active n8n executions, briefly deactivate each affected workflow,
   apply an exact-node patch with expected before hashes, reactivate, and verify
   node projection hashes and trigger event sets. Credential bindings and all
   unrelated nodes remain byte-identical. Only the new-epoch queue may now
   drain.
7. Use only structural/non-customer canaries: offline exact-byte signatures,
   exported workflow shape, NanoClaw parser/store fixtures, release-root host
   checks, and a non-delivering frontend error fixture. Do not manufacture a
   real Stripe failure, send a customer reminder, or replay historical work.
8. Observe the next natural checkout lifecycle as the outcome canary.

## Rollback

- Disable the website producer and new n8n Stripe failure forwarding first.
- Restore n8n workflows from protected full exports and re-enable their prior
  active states.
- Restore the website commit/config without restoring the active historical
  queue.
- Point NanoClaw back to the prior immutable release. Migration 140 is additive
  and remains unless a separately reviewed empty-data rollback is safe.
- Verify payments, refunds, Contador, checkout sends, website checkout, Gmail,
  Slack, Party Context, and queues separately.

## Explicit exclusions

No retroactive contact with the affected customer, historical queue replay,
payment retry, refund, roster/access/accounting change, inferred Party merge,
broad minion query activation, raw provider payload retention, or unrelated
checkout/lifecycle/Sales change is authorized.
