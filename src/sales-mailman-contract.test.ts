import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const salesPrompt = fs.readFileSync(
  path.join(root, 'groups', 'sales', 'CLAUDE.md'),
  'utf8',
);
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
  it('requires one recipient and a successful typed handoff', () => {
    expect(salesPrompt).toContain('One approval turn = one recipient');
    expect(salesPrompt).toContain('target_group: "mailman"');
    expect(salesPrompt).toContain('is a delivery failure');
    expect(workflow).toContain(
      'This turn is exclusively for this one approved',
    );
    expect(workflow).toContain(
      'Never print this block as final assistant prose',
    );
  });

  it('forbids fake Thread-ID placeholders', () => {
    expect(salesPrompt).toContain(
      'include the line only when a real Gmail thread ID',
    );
    expect(workflow).toContain('OMIT THIS ENTIRE LINE when none exists');
    expect(workflow).toContain('never use "(none)"');
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

  it('keeps Mailman verbatim and revalidates approved Cc against live Gmail evidence', () => {
    expect(normalizedMailmanPrompt).toContain(
      'pass it unchanged to the Gmail tool',
    );
    expect(mailmanPrompt).toContain('never weaken the card');
    expect(mailmanProcedure).toContain('at most ten visible CC recipients');
    expect(normalizedMailmanProcedure).toContain(
      "exact approved address is visible on Gmail's latest external message",
    );
    expect(mailmanProcedure).toContain('Never supply BCC.');
    expect(mailmanProcedure).toContain(
      'latest-visible-thread-participant checks',
    );
  });
});
