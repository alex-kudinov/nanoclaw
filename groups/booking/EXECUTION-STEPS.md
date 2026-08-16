# Booking Coordinator Execution Steps

Follow this exact order for booking events that reach the agent. Valid `booked`
events normally complete through the host-owned mechanical path and do not
spawn this agent. The host also owns all Trafft API reads and reconciliation;
this container has no Trafft API credentials and must not query or mutate
Trafft directly.

## Step 1 — Parse the event payload

The prompt contains `[SOURCE: trafft]` followed by a raw JSON payload. Parse it to extract fields. Field names may vary by event type — adapt to whatever Trafft sends. Look for patterns like:

- Appointment: status, start date/time, end date/time, price
- Customer: full name, first name, last name, email, phone
- Employee: full name, first name, last name, email
- Service: name, category, duration, price
- Location: name, address

Store the FULL raw payload in the DB regardless of parsing success.

## Step 2 — Write to database

Use the business_v2 schema. Two steps:

**Step 2a — Ensure party exists (upsert by email):**

```bash
PARTY_ID=$(psql -Atc "SELECT business_v2.fn_create_party('person', '${customer_name}', '${customer_email}', 'trafft');")
```

`fn_create_party` is idempotent — it returns the existing party_id if the email is already known.

**Step 2b — Log the interaction (dedup by trafft appointment ID):**

```bash
INTERACTION_ID=$(psql -Atc "SELECT business_v2.fn_log_interaction_dedup(
  ${PARTY_ID},
  'booking',
  'inbound',
  '${service_name} booking',
  '${start_date_time}',
  jsonb_build_object(
    'trafft_appointment_id', '${appointment_id}',
    'service', '${service_name}',
    'employee', '${employee_name}',
    'status', '${status}',
    'event_type', '${event_type}',
    'customer_phone', '${customer_phone}',
    'raw_payload', \$\$${escaped_raw_json}\$\$::jsonb
  ),
  'trafft',
  '${appointment_id}'
);")
```

`fn_log_interaction_dedup` is idempotent — the last two args (`'trafft'`, `'${appointment_id}'`) form the dedup key. Re-delivery of the same webhook produces no duplicate row.

For `customer_created` events where there is no appointment_id, use the customer email as the dedup key: pass `'trafft-customer'` as the source and `'customer:${customer_email}'` as the external_id. Set the subject to `'customer registration'` and omit start_date_time (pass NULL).

IMPORTANT: Always dollar-quote untrusted string values in SQL (`$$...$$`). Never interpolate customer names, emails, or payload fields directly into SQL without quoting.

### Step 2c — Sync to Plutio (canceled/rescheduled events, non-blocking)

After the DB write for `canceled` or `rescheduled` events, create or find the
Plutio contact. Non-blocking — if it fails, continue without plutio_person_id.
Do not repeat this step for a `booked` event: the host-owned identity path
already enqueues the contact sync when it resolves the party.

```bash
PLUTIO_RESULT=$(PATH=/workspace/extra/plutio/tools/plutio:$PATH \
  TOOLBOX_LIB=/workspace/extra/toolbox-lib \
  TOOLBOX_PROJECT_ROOT=/workspace/extra/plutio \
  bash /workspace/extra/plutio/tools/plutio/upsert-person.sh \
  --email "${CUSTOMER_EMAIL}" \
  --first "${FIRST_NAME}" \
  --last "${LAST_NAME}" \
  --phone "${CUSTOMER_PHONE}" 2>/dev/null) && \
PLUTIO_ID=$(echo "$PLUTIO_RESULT" | grep -o '"_id":"[^"]*"' | cut -d'"' -f4)

if [ -n "$PLUTIO_ID" ]; then
  # Store plutio_person_id in the interaction metadata via a supplemental update
  psql -c "UPDATE business_v2.interactions
    SET metadata = metadata || jsonb_build_object('plutio_person_id', '${PLUTIO_ID}')
    WHERE id = ${INTERACTION_ID};"
fi
```

Then log the activity based on event type:

```bash
# For canceled events:
ENTRY="[CANCELLED] ${SERVICE_NAME} on ${START_DATE}"
# For rescheduled events:
ENTRY="[RESCHEDULED] ${SERVICE_NAME} to ${NEW_DATE}"

PATH=/workspace/extra/plutio/tools/plutio:$PATH \
  TOOLBOX_LIB=/workspace/extra/toolbox-lib \
  TOOLBOX_PROJECT_ROOT=/workspace/extra/plutio \
  bash /workspace/extra/plutio/tools/plutio/log-activity.sh \
  --person-id "${PLUTIO_ID}" \
  --entry "${ENTRY}" 2>/dev/null || true
```

Skip silently on failure.

## Step 3 — Post notification to this channel

Call `mcp__nanoclaw__send_message`. **Every notification follows the same scannable skeleton — What, Who, When, Why, then everything else** — so a human can read the first three lines and know what happened without parsing a paragraph. Rules:

- Line 1 (**What**): `[TAG] {service} — {customer_name}`. The tag is the event type.
- `Who:` customer name · email · phone (omit blanks; separate with ` · `).
- `When:` date + time + employee.
- `Why:` and `Source:` — the appointment custom fields (see "Custom fields" below). Omit the line if the field is absent.
- Final line: a `— ` prefixed tail with status / party / interaction id.
- Use ` · ` as the separator. Align the labels with spaces as shown. **No prose paragraphs.**

### Custom fields (reason + source)

Trafft flattens the booking-form answers onto the payload as bracket keys, e.g. `customFields[0][label]` = `What would you like to discuss?` / `customFields[0][value]` = the answer, plus `How did you learn about Tandem?`. The host already parses these into the booked interaction's `metadata.custom_fields` (a JSON array of `{label, value}`). To populate `Why:`/`Source:`, read them from the DB rather than re-parsing brackets:

```bash
psql -Atc "SELECT jsonb_pretty(metadata->'custom_fields')
  FROM business_v2.interactions
  WHERE source_provider='trafft' AND source_id='${appointment_id}';"
```

- **Why:** = the value whose label matches "discuss"/"reason"/"topic".
- **Source:** = the value whose label matches "how did you"/"hear"/"learn about".
- **Any other custom field** the customer answered: print it on its own `{label}: {value}` line after `Source:` — never hard-code only Why/Source, so a new booking-form question shows up automatically.
- **Skip `Tandem Customer ID` (and a bare `cid`)** — it is the internal Chaos fingerprint, not a customer answer; it must never appear in a posting.

For **booked** (NOTE: booked events are normally written mechanically by the host with no agent run — use this only if you were spawned for a booked event):
```
[BOOKING] {service} — {name}
Who:    {name} · {email} · {phone}
When:   {start_date} {start_time} · {employee}
Why:    {reason}
Source: {source}
— {status} · party {party_id} · interaction {interaction_id}
```

For **canceled**:
```
[CANCELED] {service} — {name}
Who:    {name} · {email}
When:   was {start_date} {start_time}
— interaction {interaction_id}
```

For **rescheduled**:
```
[RESCHEDULED] {service} — {name}
Who:    {name} · {email}
When:   → {new_date} {new_time}  (was {old_date} {old_time})
— interaction {interaction_id}
```

For **status_changed**:
```
[STATUS] {service} — {name}
Who:    {name} · {email}
When:   {start_date} {start_time}
Status: → {new_status}
— interaction {interaction_id}
```

For **customer_created**:
```
[NEW CUSTOMER] {name}
Who:    {name} · {email} · {phone}
— party {party_id}
```

### Sales handoff — ON DEMAND ONLY (never automatic)

**Do NOT hand bookings off to sales automatically.** A booking is just a booking; the booking channel is for booking notices only (`[BOOKING]`, `[CANCELED]`, `[RESCHEDULED]`, `[STATUS]`, `[NEW CUSTOMER]`). Auto-handing every consultation call to sales burns sales tokens on calls that may never need it.

Hand off to sales **only when an operator explicitly asks** — e.g. a human in this channel (or chief) says "pass this booking to sales", "hand this off to sales", "send {name} to sales". When that happens:

1. Read `metadata.custom_fields` from the booked interaction (query above) to populate `Why:`/`Source:` — never write "no context on program interest" when the customer answered "What would you like to discuss?" on the form.
2. Deliver it to the **sales** channel, not this one, by calling `mcp__nanoclaw__send_message` with `target_group: "sales"`. Use the `→` arrow in the marker (the host also accepts `->`). Do not emit the handoff as your final reply text — only the `send_message` call delivers it.

```
[HANDOFF: booking→sales]
{service} — {name}
Who:    {name} · {email} · {phone}
When:   {start_date} {start_time} CT · {employee}
Why:    {reason}
Source: {source}
— party {party_id} · interaction {interaction_id} · plutio {plutio_person_id}
Notes: {ONE sentence of genuinely new context, or omit the line. No filler.}
```

Keep `Notes:` to a single sentence and only when it adds something the fields above do not (e.g. "Returning student — last engagement Mar 2026"). Do not restate the reason, speculate about phone-number geography, or pad. If there is nothing to add, drop the line.

## Step 4 — Cross-reference (customer_created only)

For customer_created events, check if this email exists in business_v2 as a known party:

```bash
psql -c "SELECT party_id, display_name, primary_email, tags, created_at
  FROM business_v2.v_party_contact_card
  WHERE primary_email = '${customer_email}'
  LIMIT 5;"
```

If found, append to your notification:
```
Existing party found: Party #{party_id} ({display_name}), tags: {tags}
```

## Step 5 — Handle manual queries

If the message does NOT contain `[SOURCE: trafft]`, it's a manual query from a human:

- "show recent bookings" →
  ```bash
  psql -c "SELECT i.id, i.subject, i.direction, i.occurred_at, p.display_name, i.metadata->>'status' AS status
    FROM business_v2.interactions i
    JOIN business_v2.parties p ON p.id = i.party_id
    WHERE i.channel = 'booking'
    ORDER BY i.occurred_at DESC
    LIMIT 10;"
  ```

- "check customer {email}" →
  ```bash
  psql -c "SELECT i.id, i.subject, i.direction, i.occurred_at, i.metadata
    FROM business_v2.interactions i
    JOIN business_v2.parties p ON p.id = i.party_id
    JOIN business_v2.party_contacts pc ON pc.party_id = p.id
    WHERE pc.value = '{email}'
    ORDER BY i.occurred_at DESC;"
  ```

- "pass this booking to sales" / "hand {name} off to sales" / "send to sales" → the operator wants an on-demand sales handoff. Identify the booking (most recent for that customer, or the one named/quoted), then follow **Sales handoff — ON DEMAND ONLY** above: build the `[HANDOFF: booking→sales]` block and deliver it with `mcp__nanoclaw__send_message` + `target_group: "sales"`. Do not post it to this channel.

Post results via `mcp__nanoclaw__send_message`.
