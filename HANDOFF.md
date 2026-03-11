# Handoff — 2026-03-04 Session 15

## Session Summary

- **Corrected sales CLAUDE.md Voice & Tone section** (continued from session 14):
  - Replaced abrupt example `"The program page has everything you need to decide"` (Alex's voice) with Cherie's warmer version: `"If you need more information, a lot of it is on the program page. Feel free to read and reach out with any questions."`
  - Added **Email Format (Required)** subsection mandating `Hi [First Name],` greeting and `Warmly, / Tandem Coaching Team` sign-off in every draft
  - Clarified these are structural conventions, NOT sycophantic openers — always required
- **Synced `groups/sales/CLAUDE.md`** to Mac Mini via rsync
- **Saved handoff** (session 14 HANDOFF.md committed as `88dfed5`)
- **Updated MEMORY.md** with Gmail dedup fix, schedule fix, stuck containers pattern, Cherie's voice rules, psql path

## Current State

- **Branch:** main (23 commits ahead of upstream/main, 3 behind)
- **Last commit:** `88dfed5 save: 2026-03-04 session 14 — Gmail dedup, schedule fix, sales voice`
- **Uncommitted changes:** Large — same batch as session 14 (~502 insertions across 16 modified files)
- **Untracked files:** `knowledge/agents/mailman/`, `knowledge/agents/sales/LEARNED.md`, `scripts/submit-lead.ts`, `src/channels/gmail.test.ts`, `src/learn-ipc-handler.ts`
- **Files touched this session:**
  - `groups/sales/CLAUDE.md` — final voice corrections (Cherie's example, email format section)
  - `HANDOFF.md` — updated for session 14 (now superseded by this file)

## Active Problem Context

No active bugs. All session 14 work is stable and synced. The large uncommitted diff (sessions 11–14 accumulated work) is the main outstanding item.

## Decisions & Reasoning

- **Email greeting/sign-off always required:** Anti-sycophantic rule applies to hollow filler phrases, not structural email conventions. The section is explicitly labeled "Email Format (Required)" and notes they are "not sycophantic openers."
- **Cherie's voice for emails:** User confirmed sales emails use Cherie's warm authority, not Alex's directness. Alex's style is appropriate for other content types but not for sales correspondence.

## Open Items & Blockers

- **Commit the accumulated diff** — ~502 insertions across 16 files from sessions 11–14. Should be split into logical commits before pushing.
- **Review untracked files** before committing: `LEARNED.md`, `submit-lead.ts`, `learn-ipc-handler.ts`, `gmail.test.ts`, `knowledge/agents/mailman/`
- **`processedIds` cap bug** in `gmail.ts` lines 281–288 (low urgency — only triggers at 5000 IDs)
- **Test voice updates** — send a test lead, verify Cherie's voice + greeting + sign-off in draft

## Next Steps

1. Commit accumulated work in logical chunks:
   - Gmail dedup fix (`gmail.ts` + `db.ts`)
   - `data/business/CLAUDE.md`
   - `groups/sales/CLAUDE.md` voice section
2. Review and commit/gitignore untracked files
3. Send a test lead to verify the voice, greeting, and sign-off appear correctly in the next draft

## Gotchas Discovered

(All captured in session 14 — no new gotchas this session)

## Environment Notes

- **Mac Mini (production):** `mini-claw` (Tailscale) / `192.168.1.50` (LAN). SSH key: `~/Sync/keys/xbohdpukc`
- **NanoClaw service:** `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`
- **Build + restart:** `npm run build && launchctl kickstart -k gui/$(id -u)/com.nanoclaw`
- **rsync target:** `mini-claw:~/dev/NanoClaw/`
