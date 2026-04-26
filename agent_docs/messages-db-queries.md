# Common Queries: store/messages.db

## Recent messages from a group
```sql
SELECT datetime(timestamp/1000,'unixepoch','localtime') as t, from_group, sender, substr(content,1,200)
FROM messages WHERE from_group = '{group_name}' ORDER BY timestamp DESC LIMIT 20;
```

## Job status
```sql
SELECT name, enabled, last_run, last_result, last_duration_ms, substr(last_output,1,300)
FROM jobs WHERE enabled = 1 ORDER BY last_run DESC;
```

## Job run history
```sql
SELECT job_name, started_at, finished_at, status, substr(output,1,300)
FROM job_run_logs WHERE job_name = '{job_name}' ORDER BY started_at DESC LIMIT 10;
```

## Messages in a date range
```sql
SELECT datetime(timestamp/1000,'unixepoch','localtime') as t, from_group, sender, substr(content,1,200)
FROM messages WHERE timestamp BETWEEN strftime('%s','{date}') * 1000 AND strftime('%s','{date}','1 day') * 1000
ORDER BY timestamp;
```

## Registered groups
```sql
SELECT folder, channel, chat_jid, is_main, requires_trigger,
       json_extract(container_config, '$.additionalMounts') as mounts
FROM registered_groups;
```

## Scheduled tasks
```sql
SELECT id, group_folder, substr(prompt,1,100), schedule_type, schedule_value, status, next_run
FROM scheduled_tasks WHERE status = 'active' ORDER BY next_run;
```
