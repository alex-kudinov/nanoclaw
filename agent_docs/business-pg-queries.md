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
FROM procurement_opportunities WHERE status NOT IN ('rejected','expired')
ORDER BY close_date;
```

## Invoices pending
```sql
SELECT i.id, c.client, i.amount, i.status, i.due_date
FROM invoices i JOIN contracts c ON i.contract_id = c.id
WHERE i.status = 'pending' ORDER BY i.due_date;
```

## Hive sync failures
```sql
SELECT gmail_thread_id, sender_email, subject, label, reaper_attempts, hive_sync_dead_lettered
FROM email_classifications
WHERE hive_synced = false AND hive_sync_dead_lettered = false
ORDER BY classified_at DESC;
```
