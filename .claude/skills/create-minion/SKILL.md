---
name: create-minion
description: Scaffold a new NanoClaw minion agent through an interactive interview. Produces groups/{name}/CLAUDE.md, knowledge/agents/{name}/ starter files, and registration instructions. Use when adding a new specialized agent to the lair. Triggers on "create minion", "new minion", "add minion", or "new agent".
---

# Create Minion

Scaffold a new NanoClaw minion from scratch.

## Before Starting

Read the framework reference:
- `docs/MINION-FRAMEWORK.md` — architecture, pattern library, universal anatomy, naming conventions
- `groups/_TEMPLATE/CLAUDE.md` — the blank form to fill in

## Phase 1: Interview

Ask the user ALL of these questions in a single message. Do not ask one at a time.

```
Let's spec this minion. Answer what you know — skip anything that isn't clear yet and we'll work it out.

1. Role — What does this minion do in one sentence?
2. Trigger — What starts it?
   (a) Slack/channel message in a dedicated channel
   (b) [HANDOFF: X→this] from another minion
   (c) Webhook event (what endpoint/event type?)
   (d) Scheduled task
   (e) Multiple — describe
3. Input shape — What fields arrive? What does the message look like?
4. Output destination — Where does output go?
   (a) Same Slack channel
   (b) Different Slack channel (which?)
   (c) Handoff to another minion (which?)
   (d) Email (via gmail_send / gmail_reply)
   (e) File / DB only
5. First response? — Will processing take more than a few seconds? If yes, the minion will send an acknowledgment before starting work.
6. Approval required? — Does it take any irreversible external action? (send email, post publicly, issue certificate, modify external system)
7. Tools — Check all that apply:
   (a) psql (business DB — PostgreSQL)
   (b) Gmail tools (gmail_send, gmail_reply, gmail_search, gmail_read)
   (c) External bash tooling (what tools, mounted where?)
   (d) Web browsing (agent-browser)
   (e) Other MCP tools
8. Knowledge files — Which does it need?
   (a) KNOWLEDGE.md (business facts, pricing, FAQs)
   (b) SCHEDULE.md (live cohort dates)
   (c) LEARNED.md (accumulated feedback lessons)
   (d) None
9. Handoff chain — Does it receive handoffs from other minions? Does it hand off to others?
10. Safety rails — What must this minion NEVER do? List 3-5 critical rules.
11. DB access — Which tables? Read-only or read-write?
    (Current tables: leads, tasks, proposals, contracts, invoices)
    (Current PG roles: nanoclaw_inbox, nanoclaw_sales, nanoclaw_chief, nanoclaw_admin)
```

## Phase 2: Clarify

After the user answers, ask follow-up questions only if critical information is still missing:

- If they didn't name the Slack channel: "What's the Slack channel name? (format: #gru-{slug})"
- If approval is yes but they didn't describe the loop: "Describe the collect → draft → approve cycle: what does the review message look like, what triggers execution?"
- If they mentioned external tools: "What's the host path for the tooling? What container path should it mount to?"
- If they mentioned a handoff: "What fields does the handoff pass? Full list."
- If they need DB access but no existing role fits: "We'll need a new PostgreSQL role. What permissions does it need?"

Do NOT ask about things that can be inferred from the pattern library or framework doc.

## Phase 3: Pattern Selection

Based on the answers, identify which pattern(s) this minion uses:

- **Webhook Ingestion** — triggered by external HTTP event through n8n
- **Inbound Processor** — classify → store → route → acknowledge
- **Approval Loop** — collect → draft → [REVIEW] → feedback or approve → execute
- **Coordinator** — receives escalations, full DB visibility, directs humans
- **Command Executor** — user language → command table → tool invocation
- **Personal Assistant** — conversational + tool use

Tell the user which pattern(s) you're using and why, then confirm before generating files.

## Phase 4: Generate Files

Generate all files in parallel.

### File 1: `groups/{slug}/CLAUDE.md`

Fill in the template from `groups/_TEMPLATE/CLAUDE.md`. Remove all comment lines (lines starting with `<!--`). Remove sections that don't apply (e.g., no "First Response" if they said processing is fast, no "Approval Mode" if approval is not required, no "Handoff" section if it doesn't hand off, no "Conversation Context" if single-turn only).

Use this identity line: `You are Gru, acting as the {Role Title} for Tandem Coaching (tandemcoach.co) — an ICF-accredited coaching education and executive coaching firm. Your job is to {job}.`

Execution steps must be deterministic and numbered. Every step that posts to Slack must include the exact message template with `{placeholders}`.

Approval protocol table must list every action as either `[AUTO]` or `[REQUIRES-APPROVAL]`.

Security section must name the specific fields that are untrusted (not generic "user input").

### File 2: `knowledge/agents/{slug}/KNOWLEDGE.md` (if knowledge needed)

```markdown
# {Role Title} — Knowledge Base

## Services & Programs

{Placeholder — populate from tandem-knowledge/KNOWLEDGE.md or relevant source}

## FAQs

{Placeholder}
```

### File 3: `knowledge/agents/{slug}/LEARNED.md` (if LEARNED.md needed)

```markdown
# {Role Title} — Lessons Learned

Lessons are appended automatically after feedback-and-approval cycles.
Format: date header + lesson text.
```

### File 4: `knowledge/agents/{slug}/SCHEDULE.md` (if SCHEDULE.md needed)

```markdown
# {Role Title} — Schedule

{Placeholder — populated by calendar_ctas.py or relevant automation}
```

## Phase 5: Present & Confirm

Show all generated files to the user. Then show the registration instructions:

```
Registration — run from the main agent or directly:

Option A: MCP tool (from main agent)
  register_group with jid="{channel_id}", name="{Role Title}", folder="{slug}",
  trigger="@Gru", requiresTrigger=false, containerConfig={...mounts...}

Option B: Direct SQL
  INSERT INTO registered_groups
    (jid, name, folder, trigger_pattern, requires_trigger, is_main, container_config)
  VALUES
    ('{channel_id}', '{Role Title}', '{slug}', '@Gru', 0, 0,
     '{"additionalMounts":[{"hostPath":"knowledge/agents/{slug}","containerPath":"knowledge","readonly":true}]}');

Get the Slack channel ID: right-click channel → View channel details → Channel ID at bottom.
```

Set `requires_trigger = 0` if the minion has a dedicated channel where all messages should trigger it.
Set `requires_trigger = 1` if it shares a channel and needs a trigger word.

Ask:
```
Files ready to write:

- groups/{slug}/CLAUDE.md
- knowledge/agents/{slug}/KNOWLEDGE.md (if applicable)
- knowledge/agents/{slug}/LEARNED.md (if applicable)
- knowledge/agents/{slug}/SCHEDULE.md (if applicable)

Registration instructions above — run after you have the channel ID.

Write the files? (yes / make changes first)
```

## Phase 6: Write Files

On confirmation, write all files. Then:

1. Remind the user of any manual steps:
   - Create the Slack channel `#gru-{slug}` and get its channel ID
   - Register the group using the SQL or MCP tool instructions above
   - If knowledge files are empty stubs: "Populate KNOWLEDGE.md from the tandem-knowledge source or the relevant data"
   - If external tools are needed: "Verify the tool mount paths match what's configured in the registration"
   - If DB access is needed: "Create the PostgreSQL role with appropriate permissions"
   - Build and restart: `npm run build && launchctl kickstart -k gui/$(id -u)/com.nanoclaw`

2. If the minion uses webhook ingestion: remind them to configure the n8n workflow (sanitize fields, add `X-Webhook-Secret` header, target `http://mini-claw:8088/hook/{event-type}`).

3. If the minion is in the handoff chain: remind them to update the upstream minion's CLAUDE.md to include the `[HANDOFF: upstream→{slug}]` output block.

## Quality Checklist

Before writing, verify the generated CLAUDE.md has:

- [ ] Identity line uses "Gru" (not "Mr. Gru") and names the role clearly
- [ ] First Response section included if processing takes >5s
- [ ] Conversation Context section included if multi-turn
- [ ] Trigger detection section matches what they described
- [ ] Execution steps are numbered and deterministic — no ambiguity
- [ ] Every Slack post has a literal message template
- [ ] Approval protocol lists every action as [AUTO] or [REQUIRES-APPROVAL]
- [ ] Handoff block includes all fields verbatim (no summarizing)
- [ ] Security section names specific untrusted fields
- [ ] Communication section: plain text, no markdown, send_message for all output
- [ ] No comment lines (<!-- -->) left in the output
- [ ] No template placeholders (curly braces) left unfilled
