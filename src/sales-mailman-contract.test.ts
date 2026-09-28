import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import { readGroupPrompt } from './group-prompt.js';

const root = process.cwd();
const salesPrompt = readGroupPrompt(path.join(root, 'groups', 'sales'));
const workflow = fs.readFileSync(
  path.join(root, 'groups', 'sales', 'WORKFLOWS.md'),
  'utf8',
);
const inboxPrompt = fs.readFileSync(
  path.join(root, 'groups', 'inbox', 'CLAUDE.md'),
  'utf8',
);
const chiefProcedure = fs.readFileSync(
  path.join(root, 'groups', 'chief', 'SUPPORT-REPLY.md'),
  'utf8',
);
const chiefPrompt = fs.readFileSync(
  path.join(root, 'groups', 'chief', 'CLAUDE.md'),
  'utf8',
);
const mailmanPrompt = fs.readFileSync(
  path.join(root, 'groups', 'mailman', 'CLAUDE.md'),
  'utf8',
);
const mailmanProcedure = fs.readFileSync(
  path.join(root, 'groups', 'mailman', 'OUTBOUND-EMAIL.md'),
  'utf8',
);
const normalizedChiefPrompt = chiefPrompt.replace(/\s+/g, ' ');
const normalizedMailmanPrompt = mailmanPrompt.replace(/\s+/g, ' ');
const normalizedMailmanProcedure = mailmanProcedure.replace(/\s+/g, ' ');

describe('Sales to Mailman approval contract', () => {
  it('keeps one recipient per approval turn and leaves the send to the host (NC-20260927-001)', () => {
    expect(salesPrompt).toContain('One approval turn = one recipient');
    expect(salesPrompt).toContain('**sends that card itself**');
    expect(salesPrompt).toContain(
      'Do not emit a\n`[HANDOFF: sales→mailman]` for an approved card',
    );
    expect(workflow).toContain(
      'This turn is exclusively for this one approved recipient',
    );
    expect(workflow).toContain(
      '**The host sends the exact approved card itself**',
    );
    expect(workflow).not.toContain('Hand off to Mailman for email sending');
  });

  it('forbids fake Thread-ID placeholders', () => {
    expect(salesPrompt).toContain(
      'include the line only when a real Gmail thread ID',
    );
    expect(salesPrompt).toContain('Never put `(none)`, `N/A`');
  });

  it('preserves host-supplied recipient context across inbox routing', () => {
    expect(inboxPrompt).toContain(
      '`Visible-Cc`, `Reply-All-Candidates`, and `Recipient-Context` lines exactly',
    );
    expect(inboxPrompt).toContain('never expose BCC');
    expect(inboxPrompt).toContain('Omit them for a forwarded inquiry');
  });

  it('requires an operator-visible exact Cc before Chief or Sales can hand off', () => {
    expect(normalizedChiefPrompt).toContain(
      'Preserve the host-supplied `Visible-To`, `Visible-Cc`, `Reply-All-Candidates`, and `Recipient-Context` lines exactly',
    );
    expect(normalizedChiefPrompt).toContain(
      'They are visible-envelope context, not automatic reply-all permission; BCC is never available.',
    );
    expect(chiefProcedure).toContain(
      'Chief does not draft or approve customer email.',
    );
    expect(workflow).toContain(
      "The card's exact `Email:` and optional `Cc:` are operator-visible and immutable",
    );
  });

  it('keeps Mailman verbatim and binds approved Cc to the exact action', () => {
    expect(normalizedMailmanPrompt).toContain(
      'pass it unchanged to the Gmail tool',
    );
    expect(mailmanPrompt).toContain('never weaken the card');
    expect(mailmanProcedure).toContain('at most ten visible CC recipients');
    expect(normalizedMailmanProcedure).toContain(
      'exact action-bound approved card authorizes its CC list',
    );
    expect(normalizedMailmanProcedure).toContain('Never supply BCC.');
    expect(mailmanProcedure).toContain('approved-CC equality checks');
  });
});
