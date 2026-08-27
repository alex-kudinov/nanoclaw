# Common Queries: nanoclaw_business (Postgres)

## Active leads
```sql
SELECT id, name, email, company, source, status, assigned_to, created_at
FROM leads WHERE status NOT IN ('closed','rejected') ORDER BY created_at DESC;
```

## Lead pipeline summary
```sql
SELECT status, count(*) FROM leads GROUP BY status ORDER BY count DESC;
```

## Booking events (recent)
```sql
SELECT id, event_type, status, customer_name, service_name, start_date_time, follow_up_status
FROM booking_events ORDER BY created_at DESC LIMIT 20;
```

## Email classifications (recent)
```sql
SELECT gmail_thread_id, sender_email, subject, label, confidence, classified_at
FROM email_classifications ORDER BY classified_at DESC LIMIT 20;
```

## Classification rules (active)
```sql
SELECT pattern_type, pattern_value, target_label, source, hit_count, enabled
FROM classification_rules WHERE enabled = true ORDER BY hit_count DESC;
```

## Classification taxonomy
```sql
SELECT label, parent_label, description, auto_archive, hive_share_target, digest_priority
FROM classification_taxonomy WHERE enabled = true ORDER BY label;
```

## Procurement opportunities (open)
```sql
SELECT id, title, agency, close_date, category, relevance, status
FROM public.procurement_opportunities WHERE status NOT IN ('rejected','expired')
ORDER BY close_date;
```

## Procurement host-normalized review queue
```sql
SELECT opportunity_id, source, source_key, title, agency, close_date,
       category, review_state, review_version, days_until_close
FROM public.v_procurement_review_queue
ORDER BY close_date NULLS LAST, first_seen_at;
```

This view contains only migration-114 control-plane rows. Legacy rows without a
`source_key` are excluded. Agents should use the bounded
`procurement_queue` tool instead of issuing this query directly.

## Procurement open review cards (host/admin audit)
```sql
SELECT opportunity_id, review_version, channel_jid, message_ts, action_epoch,
       recommendation, state, created_at
FROM public.procurement_review_cards
WHERE state = 'open'
ORDER BY created_at;
```

The Procurement agent does not run this query. Review cards are created and
applied only through the host boundary.

## Invoices pending
```sql
SELECT i.id, c.client, i.amount, i.status, i.due_date
FROM invoices i JOIN contracts c ON i.contract_id = c.id
WHERE i.status = 'pending' ORDER BY i.due_date;
```

## Relationship Context client/customer projection aggregate

This query is aggregate-only. It does not return Party identity or projection
payloads.

```sql
SELECT value->>'relationship_state' AS relationship_state,
       count(*) AS parties,
       count(*) FILTER (
         WHERE (value->>'customer_or_client')::boolean
       ) AS customer_or_client_parties,
       count(*) FILTER (
         WHERE (value->>'active_subscription')::boolean
       ) AS active_subscription_parties,
       min(version) AS min_version,
       max(version) AS max_version
FROM business_v2.party_context_projections
WHERE section = 'relationship'
  AND projection_key = 'relationship.client_status.v1'
GROUP BY value->>'relationship_state'
ORDER BY relationship_state;
```

Projection coverage must equal all active canonical Parties. Missing evidence
is not proof of non-client status:

```sql
SELECT count(*) FILTER (WHERE party.merged_into IS NULL) AS active_parties,
       count(projection.id) FILTER (
         WHERE party.merged_into IS NULL
       ) AS projected_parties
FROM business_v2.parties party
LEFT JOIN business_v2.party_context_projections projection
  ON projection.party_id = party.id
 AND projection.section = 'relationship'
 AND projection.projection_key = 'relationship.client_status.v1';
```

## Plutio coaching-engagement aggregate

This query returns controlled states and counts only. It never returns source
record IDs, Party identity, custom-field values, or provider payloads.

```sql
WITH latest AS (
  SELECT DISTINCT ON (current_party_id,source_scope,source_record_id)
         current_party_id,id,value,fresh_until
  FROM business_v2.party_context_observations
  WHERE fact_type = 'relationship.plutio.coaching_project@1'
    AND current_party_id IS NOT NULL
  ORDER BY current_party_id,source_scope,source_record_id,
           observed_at DESC,id DESC
)
SELECT value->>'engagement_state' AS engagement_state,
       count(*) AS projects,
       count(DISTINCT current_party_id) AS parties,
       count(*) FILTER (
         WHERE value->>'engagement_state' = 'current'
           AND fresh_until > now()
       ) AS fresh_current_projects,
       count(*) FILTER (
         WHERE value->>'engagement_state' = 'current'
           AND (fresh_until IS NULL OR fresh_until <= now())
       ) AS stale_current_projects
FROM latest
GROUP BY value->>'engagement_state'
ORDER BY engagement_state;
```

## Hive sync failures
```sql
SELECT gmail_thread_id, sender_email, subject, label, reaper_attempts, hive_sync_dead_lettered
FROM email_classifications
WHERE hive_synced = false AND hive_sync_dead_lettered = false
ORDER BY classified_at DESC;
```
