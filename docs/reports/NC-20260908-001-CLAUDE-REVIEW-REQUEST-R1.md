# NC-20260908-001 bounded implementation review

## Objective

Review the implemented correction for a noisy customer-support Slack cycle.
The accepted owner behavior is:

1. In `[SOURCE: email-support]`, an imperative Alex/Cherie instruction such as
   "try another browser" or "use incognito" is normally the customer-facing
   troubleshooting step to draft. It is not a request for Sales to launch a
   browser unless the operator explicitly addresses Gru and asks Gru to test.
2. Sales must not browse or diagnose customer login/browser/infrastructure
   reports on its own. With no operator answer, it uses the HUMAN support path.
3. One exact input may produce at most one `[PROCESSING]` receipt across
   automatic retries. A later operator/customer input may receive a new receipt.
4. Approval-card validation feedback should return privately to the live exact
   Sales session for repair. Slack sees a rejection only when that session is
   unavailable. A valid card remains approval-gated.
5. Model-authored Sales final recaps/status claims are not evidence and must not
   reach Slack; useful operator output uses the existing `send_message` path.
6. Passwordless/bearer URL query values must be redacted before Gmail text
   reaches agent, Slack, transcript, or container-log surfaces.
7. Gmail reply subject normalization must treat `RE:` case-insensitively.

## Authority and boundary

- Repository instructions and `groups/sales/CLAUDE.md` / `WORKFLOWS.md` govern.
- Host code and tests are implementation authority.
- No customer message, approval, Gmail send, provider/business-data mutation,
  migration, credential read, or manufactured lead is authorized in review.
- Do not inspect `.env*`, session/auth data, runtime databases, logs, backups,
  or unrelated files.
- Base is release-doc descendant `55c068d2`; live code is `013b1d86`.
- Review only the files listed below plus this request. Write only the response.

## Review files

- `src/index.ts`
- `src/ipc.ts`
- `src/gmail-parser.ts`
- `src/sensitive-url-redaction.ts`
- `src/gmail-api.ts`
- `groups/sales/CLAUDE.md`
- `groups/sales/WORKFLOWS.md`

The associated changed tests are already summarized by the verification below;
do not expand scope into unrelated test or history archaeology.

## Implementation summary

- `src/index.ts` makes Sales final-text suppression a folder invariant, persists
  the defensive flags in required Sales config, and keys processing receipts by
  work-unit plus latest input timestamp. Failed runs retain the timestamp so
  retries stay quiet; success clears it; a later input replaces it.
- `src/ipc.ts` now treats a successfully delivered exact-session rejection as
  private for Sales. Existing visible fallback remains when delivery fails;
  quarantine and all approval/content/fact checks remain.
- `gmail-parser.ts` applies a narrow URL-query redactor before composing agent
  text. It preserves parameter names and URL context while replacing values for
  emailToken/token/access_token/auth_token/magic_token/signature/sig, including
  HTML-escaped ampersands.
- `gmail-api.ts` recognizes any case of the existing `Re:` prefix.
- Sales prompts prohibit autonomous browser diagnostics on support access work,
  define imperative operator wording, require the literal support-card envelope,
  and forbid narration/recaps.

## Verification already completed

- Focused changed-path tests: 169/169 pass.
- Email-critical: 803/803 host tests pass; independent runner 45/45 passes.
- Email incident replay: 13/13 pass.
- Typecheck, production build, Prettier check, and runtime doctor pass under
  Node 22.23.2.
- Full root: 3,675 pass / 32 skip / 3 fail. The three failures are unchanged
  CNPC wrapper, date-sensitive Trafft projection, and Capacity disposable
  reservation expectations; all three reproduce on exact base `55c068d2`.

## Review question and response

Identify only material correctness, safety, regression, or requirement gaps in
this implementation. Pay particular attention to retry identity/lifetime,
whether private rejection can become silent failure, whether unconditional
Sales final suppression hides a required producer, and whether redaction can
leak or corrupt ordinary URLs. Cite exact file evidence. Do not propose broad
architecture or unrelated cleanup.

Write the result to:
`docs/reports/NC-20260908-001-CLAUDE-REVIEW-RESPONSE-R1.md`

If there are no material findings, write `NO MATERIAL FINDINGS` plus a concise
scope/verification statement.
