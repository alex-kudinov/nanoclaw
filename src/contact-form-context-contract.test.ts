import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function contactPrompt(file: string): string {
  const definitions = JSON.parse(
    readFileSync(resolve(process.cwd(), file), 'utf8'),
  ) as Array<{ id: string; prompt_template?: string }>;
  return (
    definitions.find((definition) => definition.id === 'contact-form')
      ?.prompt_template ?? ''
  );
}

describe('contact-form entry-page propagation contract', () => {
  it.each(['webhooks.json', 'data/webhooks.json'])(
    '%s attaches the normalized entry page to the Inbox packet',
    (file) => {
      expect(contactPrompt(file)).toContain(
        'Entry-Page: {{payload.entry_page}}',
      );
    },
  );

  it('requires Inbox to preserve non-empty source context without inventing it', () => {
    const inbox = readFileSync(
      resolve(process.cwd(), 'groups', 'inbox', 'CLAUDE.md'),
      'utf8',
    );
    expect(inbox).toContain(
      'preserve the host-supplied `Entry-Page` exactly when it is non-empty',
    );
    expect(inbox).toContain(
      'never look up or invent a replacement when it is absent',
    );
    expect(inbox).toContain(
      'Entry-Page: {host-supplied contact-form entry page',
    );
  });
});
