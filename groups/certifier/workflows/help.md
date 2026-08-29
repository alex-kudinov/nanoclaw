# Help Workflow

Read the Available Presets mapping in `CLAUDE.md`, then read
`/workspace/extra/sertifier/lib/presets.json` for descriptions, canonical
campaign keys, and required attributes. Build the list dynamically.

Post plain text through `mcp__nanoclaw__send_message`:

```text
*Certificate Manager — Help*

*Fast Send*
• send ai for coaches to person@example.com
  For an exact attribute-free preset alias and exact Heartbeat identity, this
  adds the recipient to the preset's canonical campaign and sends immediately.

*Other Commands*
• Request a certificate — provide name, email, and certificate type
• Batch — attach CSV and say "send {certificate type} to this list"
• "send" or ✅/👍 on a review — execute the selected pending request
• "cancel" — cancel a non-uncertain pending request
• Search — "does Jane Doe have a certificate?"

*Available Certificates*
{For each preset: description, one send alias, canonical campaign key, and
required attribute titles.}

*Safety*
Exact fast-send commands still stop on missing identity, duplicate state,
campaign drift, or uncertain provider acceptance. Attribute-bearing presets
collect the missing values and show a review before sending.
```
