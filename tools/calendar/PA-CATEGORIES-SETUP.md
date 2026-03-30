# Power Automate — Add Categories to Calendar Export

## What to Change

In the PA flow that exports calendar events to OneDrive, add the `categories` field to the `@@EXPORT_META` block.

## Steps

1. Open Power Automate → find the calendar export flow
2. In the "Compose" or "Set variable" action that builds the `@@EXPORT_META` block, add:
   ```
   categories: @{join(triggerOutputs()?['body/categories'], ', ')}
   ```
   This joins the array of category strings with comma-space delimiter.

3. Place it **before** the `last_modified` line in the metadata block

4. If the event has no categories, the expression produces an empty string: `categories:`

## Wire Format

```
categories: Reporting Up, Running Status
```

- Comma-space delimiter (`, `)
- No quoting
- Empty if no categories: `categories:`

## Test

1. Apply a category to one calendar event in Outlook (e.g., "Running Status")
2. Wait for next PA export cycle
3. Check the export .txt file in OneDrive Drop → Calendar/
4. Verify the `categories:` line appears in @@EXPORT_META
5. Run `python process_calendar.py --force EVENT_ID` to verify parsing
6. Check output note has `categories: [Running Status]` in frontmatter
