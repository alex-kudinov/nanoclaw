# Plan — Inbound triage: Activity lane (script) vs Inquiry lane (LLM)

Status: Phase 1 SHIPPED 2026-05-18 · Created 2026-05-18

## Goal

Move the Chaos path off the LLM agent onto a deterministic host-side handler.
Establish one rule for every inbound path: **activity = deterministic script,
inquiry = LLM**.

## Background

Each inbound path (chaos webhook, contact-form webhook, Gmail/classify, trafft,
stripe) runs its own copy of "is this a lead? → create records / hand to sales,"
with no shared notion of who the person is, what is actually new, or whether a
reply is warranted. Symptoms seen 2026-05-17/18: a 9-day-old form re-attributed
to a plain browse (Suyin); chaos ICF-exam signups drafting cold pitches; a
container + frontier-model inference spawned per chaos visit to run three SQL
inserts. Fixing path-by-path was whack-a-mole — the conflict is structural.

## The principle

- **Activity** — a tracking signal *about* a person: verified site visit,
  form-fill, download, signup, payment, booking. Structured data. → recorded on
  the CRM record by a deterministic host handler. **Never** produces a response.
- **Inquiry** — an inbound *message* a person wrote expecting a reply: a
  contact-form submission carrying a message, an inbound email question. → LLM
  agent reads it, matches a program, drafts. Tokens spent only here.

Chaos is **always** activity → host-side script, zero LLM, no container.

## Phase 1 — Chaos as a host-side activity handler

1. **`src/chaos-activity.ts`** — `handleChaosActivity(payload)`:
   - Resolve party by lowercased email. New → `fn_create_party` (source
     `chaos`) + `fn_add_party_role(prospect)`. Existing → resolve only.
   - Pipeline entry: create one ONLY when the party is net-new in this call
     AND `form_event_type` is `form_contact` or `form_lead_magnet`. Existing
     party → never a new entry.
   - Always `fn_log_interaction` (channel `chaos`) with visitor_id /
     form_element_id / form_page / intent_summary in metadata. form fields are
     journey metadata only — they may be historical; no decision rides on them.
   - Never hand off, never draft, never escalate.
   - Returns `{ disposition: 'new-lead' | 'new-party' | 'returning', partyId }`.
   - Uses `business-db.ts` (host Postgres wrapper).
2. **`src/chaos-activity.test.ts`** — new+form, new+no-form, returning visitor,
   missing email, idempotent re-delivery.
3. **`src/webhook-server.ts`** — add a `handleChaosActivity` dep; the `chaos`
   webhook calls it directly — no `enqueueAgentTask`, no container. Mark the
   `webhook_inbox` row handled/failed from the result. Pattern: mirror
   `handleGmailPush` / booking host-write.
4. **`src/index.ts`** — wire the `handleChaosActivity` dep to the new module.
5. **`src/chaos-reconciler.ts`** — point the daily backstop at the same handler
   instead of the webhook/agent path.
6. **`data/webhooks.json`** — remove the `chaos` `prompt_template` (no longer an
   agent path; the webhook def stays, routes to the host handler).
7. Build, deploy, verify: a real chaos visit writes the right party/interaction
   rows with **zero container spawn**; no chaos→sales handoff.

## Decisions (defaults baked in — override if wrong)

1. **Slack visibility** — handler posts one quiet line to #gru-inbox:
   `[chaos] {name} — {disposition}`. Default: keep it (operator visibility).
2. **Net-new + form → pipeline_entries lead.** Default: yes.
3. **Returning visitor → interaction log only**, no new lead, no role change.
   Default: yes.

## Out of scope

The **inquiry lane** — `contact-form` webhook + inbound email/classify — stays
the LLM agent. That is correct: it reads a real message and drafts a reply.
Untouched by this plan.

## Verification

- A chaos visit: party + interaction rows created; grep logs — no
  `Spawning container agent` for the chaos webhook.
- Token cost per chaos visit ~= 0.
- No `[HANDOFF: inbox->sales]` ever originates from chaos.
- Returning verified visitor → interaction logged, no duplicate lead.

## Notes

- The webhook->GroupQueue change (shipped 2026-05-18) stays — it still
  serializes the remaining agent webhooks (contact-form). Chaos simply stops
  being one.
- Phase 0 (chaos never hands off to sales) is already applied via the chaos
  `prompt_template`; Phase 1 supersedes that template entirely.
