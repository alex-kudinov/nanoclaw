# Sales — edge cases, activity logging, and tools

Loaded with `CLAUDE.md`.

## Edge Cases

- **Missing Entry ID:** First choose the route. For a Client Support Review,
  omit the Entry ID line entirely and never create a pipeline row. For a
  genuine Sales Review, resolve it through `v_active_pipeline` and
  `fn_create_pipeline_entry` as documented in `WORKFLOWS.md`; never use direct
  base-table DML. Never emit `Entry ID: (none)`.
- **Thread-ID across approval rounds:** The host threads the approved reply
  from the work thread's root handoff or the card's `Thread-ID:` header, so a
  later Slack approval does not lose it. When the root carries no Thread-ID
  but the conversation is an existing email thread, put the real Thread-ID on
  the card header (Carol Del Priore refund, 2026-06-09, went out detached).
- **Forwarded inquiry:** `[SOURCE: forwarded-email]` is intentionally a new
  outbound email. Use the external lead on `Email`/`To`; never turn
  `Source-Thread-ID` into `Thread-ID`, and never address the internal
  `Forwarded-By` teammate.
- **Missing Party ID only (Entry ID present):** Process from handoff alone — Plutio activity log step is the only thing that gets skipped.
- **Client Support Review with no Party ID:** Omit any Party line. Never
  resolve or invent it merely to make support sendable; the host sends to the
  exact approved Email and resolves identity when available.
- **No program match:** explore personal goals under `ORIENT` for advice-seeking
  inquiries. Use `CLARIFY` for a specific question missing one detail; reserve
  `HUMAN` for missing authoritative facts, policy decisions or specialist
  judgment. Do not force a call or program recommendation.
- **Possible prior contact:** Do not infer relationship from a pipeline entry;
  intake creates one for the current inquiry. Use only the pre-inbound evidence
  gate in `WORKFLOWS.md`. If it does not establish prior contact, choose
  `unknown`; if it conflicts with the person's message, choose `HUMAN`.
- **Ambiguous message:** Treat as feedback on most recent pending draft.
- **Unavailable attachment:** Sales has no `gmail_read` authority. Do not call
  it. If the current thread or an exact operator fact answers the request,
  draft from that evidence and state no claim about the attachment. Escalate
  only when the attachment itself is material to a safe answer.
- **Shared Gmail Thread-ID:** Gmail can group replies from different recipients
  of a templated outbound message under one mailbox Thread-ID. Never treat
  Thread-ID reuse alone as a collision, spoofing event, or reason to withhold a
  draft. The current Lead Email/From + Message-ID + Thread-ID tuple identifies
  the work item; the host's exact approval and recipient checks remain the
  send authority.

## Activity Logging (Plutio)

After key actions, log activity to person's Plutio Activity Log. The `plutio_person_id` comes from the inbox→sales handoff. If no `plutio_person_id` available, skip silently.

```bash
PATH=/workspace/extra/plutio/tools/plutio:$PATH \
  TOOLBOX_LIB=/workspace/extra/toolbox-lib \
  TOOLBOX_PROJECT_ROOT=/workspace/extra/plutio \
  bash /workspace/extra/plutio/tools/plutio/log-activity.sh \
  --person-id "${PLUTIO_PERSON_ID}" \
  --entry "${ENTRY}" 2>/dev/null || true
```

Log at these points:

- After an approval of an email card: `--entry "[EMAIL] Approved: ${SUBJECT}"`
- After sending a proposal: `--entry "[PROPOSAL] ${PROGRAM} — $${PRICE}"`
- After conversion: `--entry "[CONVERTED] ${PROGRAM} — $${AMOUNT}"`

Non-blocking — if Plutio fails, continue without error.

## Tools Available

- Read/write files in your workspace (`/workspace/group/`)
- Run bash commands (`psql` for business DB — pre-configured)
- `mcp__nanoclaw__send_message` — send message to Slack channel
- **`chaos/query` + `chaos/get-visitor-journey`** — available for separately
  authorized analysis and evaluation only. Website-path data is currently
  **non-binding and disabled for customer-facing drafting**: do not run a path
  lookup while composing a response. The host-supplied contact-form
  `Entry-Page` exception is already attached to the handoff and is bounded by
  `WORKFLOWS.md`; do not augment it. Every other supplied path signal must
  leave the response unchanged. The broader path feature differs from the
  audited signal and has not passed a blinded path-on/path-off quality
  evaluation.

## External Guides

- **Voice & Tone:** See `VOICE-AND-TONE.md` (banned phrases, banned words, email format)
- **Email Response Rules:** See `EMAIL-RESPONSE-GUIDELINES.md` (program-specific rules, clarifying questions)
- **Workflows:** See `WORKFLOWS.md` (draft format, feedback/approval, follow-ups, activity logging)
- **Database Schema:** See `SCHEMA.md` (PostgreSQL references and common queries)
