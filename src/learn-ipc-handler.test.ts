import { describe, expect, it } from 'vitest';

import { deriveLessonTitle } from './learn-ipc-handler.js';

describe('deriveLessonTitle', () => {
  it('uses the first sentence when it is a reasonable length', () => {
    expect(
      deriveLessonTitle(
        'Preserve Thread-ID from handoffs. It threads replies.',
      ),
    ).toBe('Preserve Thread-ID from handoffs');
  });

  it('never returns "Untitled" for a long first sentence with no early punctuation', () => {
    // This is the exact shape that used to fall through to "Untitled": a first
    // sentence longer than 60 chars with the first period past char 60.
    const lesson =
      'When a lead asks about group pricing for eight or more participants we should route to a human for the discount decision rather than quoting one ourselves.';
    const title = deriveLessonTitle(lesson);
    expect(title).not.toBe('Untitled');
    expect(title.length).toBeLessThanOrEqual(73); // 72 + ellipsis
    expect(title.endsWith('…')).toBe(true);
    expect(title.startsWith('When a lead asks about group pricing')).toBe(true);
  });

  it('uses only the first line of a multi-line lesson', () => {
    expect(
      deriveLessonTitle(
        'Do not offer a Cherie consult by default.\nMore detail here.',
      ),
    ).toBe('Do not offer a Cherie consult by default');
  });

  it('falls back to a generic non-empty title on empty input', () => {
    expect(deriveLessonTitle('')).toBe('Lesson');
    expect(deriveLessonTitle('   \n  ')).toBe('Lesson');
  });

  it('handles a short lesson with no sentence terminator', () => {
    expect(deriveLessonTitle('Subject lines must be ASCII-only')).toBe(
      'Subject lines must be ASCII-only',
    );
  });
});
