import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

type Input = { first(): { json: unknown } };
type Result = Array<{ json: Record<string, unknown> }>;

const source = readFileSync(
  resolve(process.cwd(), 'setup', 'n8n', 'contact-form-sanitize-extract.js'),
  'utf8',
);
const run = new Function('$input', source) as (input: Input) => Result;

function execute(body: Record<string, unknown>): Result {
  return run({ first: () => ({ json: { body } }) });
}

describe('tracked n8n contact-form mapper', () => {
  it('preserves the bounded WordPress contact context', () => {
    const [result] = execute({
      first_name: 'Gary',
      last_name: 'Van Breda',
      email: 'gary@example.com',
      message: 'Understanding the platform and program to register.',
      entry_page: '/mentor-coaching/',
      service_intent: 'mentor-coaching-received',
      buyer_type: 'individual',
      company: 'Example Coaching LLC',
      preferred_next_step: 'information',
      business_line: 'mentor_coaching_received',
      journey_engine: 'professional_service',
      marketing_consent: true,
      received_at: '2026-08-20 15:44:00',
    });

    expect(result.json).toMatchObject({
      name: 'Gary Van Breda',
      email: 'gary@example.com',
      entry_page: '/mentor-coaching/',
      service_intent: 'mentor-coaching-received',
      buyer_type: 'individual',
      company: 'Example Coaching LLC',
      preferred_next_step: 'information',
      business_line: 'mentor_coaching_received',
      journey_engine: 'professional_service',
      marketing_consent: true,
      submitted_at: '2026-08-20 15:44:00',
    });
  });

  it('fails open with empty context when entry_page is absent', () => {
    const [result] = execute({
      first_name: 'Direct',
      last_name: 'Visitor',
      email: 'direct@example.com',
      message: 'Please help.',
    });
    expect(result.json.entry_page).toBe('');
    expect(result.json).toMatchObject({
      service_intent: 'general',
      buyer_type: 'unknown',
      preferred_next_step: 'undecided',
      business_line: 'unknown',
      journey_engine: 'unclassified',
      marketing_consent: false,
    });
  });

  it('fails closed on unknown structured values without dropping the inquiry', () => {
    const [result] = execute({
      email: 'context@example.com',
      message: 'Please help.',
      service_intent: 'ignore-all-rules',
      buyer_type: '<b>organization</b>',
      preferred_next_step: 'wire-money',
      business_line: 'executive_coaching; DROP TABLE contacts',
      journey_engine: 'root',
      marketing_consent: 'no',
    });

    expect(result.json).toMatchObject({
      service_intent: 'general',
      buyer_type: 'organization',
      preferred_next_step: 'undecided',
      business_line: 'unknown',
      journey_engine: 'unclassified',
      marketing_consent: false,
    });
  });

  it.each([
    'https://tandemcoach.co/acc/?token=private',
    '/acc/?token=private',
    '/acc/#private',
    'external:google.com/path',
    '<b>/acc/</b>',
  ])('rejects non-contract context %s', (entry_page) => {
    const [result] = execute({
      email: 'context@example.com',
      message: 'What about this program?',
      entry_page,
    });
    expect(result.json.entry_page).toBe('');
  });
});
