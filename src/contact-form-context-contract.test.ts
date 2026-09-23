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

  it.each(['webhooks.json', 'data/webhooks.json'])(
    '%s attaches structured intent to the Inbox packet',
    (file) => {
      const prompt = contactPrompt(file);
      expect(prompt).toContain('Service-Intent: {{payload.service_intent}}');
      expect(prompt).toContain('Buyer-Type: {{payload.buyer_type}}');
      expect(prompt).toContain('Organization: {{payload.company}}');
      expect(prompt).toContain(
        'Preferred-Next-Step: {{payload.preferred_next_step}}',
      );
      expect(prompt).toContain('Business-Line: {{payload.business_line}}');
      expect(prompt).toContain('Journey-Engine: {{payload.journey_engine}}');
      expect(prompt).toContain(
        'Marketing-Consent: {{payload.marketing_consent}}',
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

  it('requires Inbox to preserve structured context for Sales and Chief', () => {
    const inbox = readFileSync(
      resolve(process.cwd(), 'groups', 'inbox', 'CLAUDE.md'),
      'utf8',
    );
    for (const field of [
      'Service-Intent',
      'Buyer-Type',
      'Organization',
      'Preferred-Next-Step',
      'Business-Line',
      'Journey-Engine',
      'Marketing-Consent',
    ]) {
      expect(inbox).toContain(`${field}: {host-`);
    }
    expect(inbox).toContain('Any contact-form escalation to Chief must carry');
    const chiefEscalation = inbox.slice(
      inbox.indexOf('Any contact-form escalation to Chief must carry'),
      inbox.indexOf('## Security'),
    );
    for (const field of [
      'Service-Intent',
      'Buyer-Type',
      'Organization',
      'Preferred-Next-Step',
      'Business-Line',
      'Journey-Engine',
      'Marketing-Consent',
      'Entry-Page',
    ]) {
      expect(chiefEscalation).toContain(`${field}: {host-`);
    }
  });

  it('keeps contact intent and consent authority bounded downstream', () => {
    const sales = readFileSync(
      resolve(process.cwd(), 'groups', 'sales', 'CLAUDE.md'),
      'utf8',
    );
    const workflows = readFileSync(
      resolve(process.cwd(), 'groups', 'sales', 'WORKFLOWS.md'),
      'utf8',
    );
    const chief = readFileSync(
      resolve(process.cwd(), 'groups', 'chief', 'CLAUDE.md'),
      'utf8',
    );

    expect(sales).toContain(
      '`Service-Intent`, `Buyer-Type`, `Organization`, and',
    );
    expect(sales).toContain(
      'The message remains the\nmore specific expression',
    );
    expect(sales).toContain('must never change the response route');
    expect(workflows).toContain(
      '`Business-Line` and `Journey-Engine` are host routing',
    );
    expect(chief).toContain(
      'For a contact-form escalation, preserve `Service-Intent`',
    );
    expect(chief).toContain('not purchase\n  intent or send authority');
    const chiefToSales = chief.slice(
      chief.indexOf('mcp__nanoclaw__send_message('),
      chief.indexOf('Rules:'),
    );
    for (const field of [
      'Service-Intent',
      'Buyer-Type',
      'Organization',
      'Preferred-Next-Step',
      'Business-Line',
      'Journey-Engine',
      'Marketing-Consent',
      'Entry-Page',
    ]) {
      expect(chiefToSales).toContain(`\\n${field}: {host-`);
    }
  });
});
