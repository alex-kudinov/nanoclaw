import { describe, expect, it } from 'vitest';

import {
  extractSalutationName,
  hasWrongStudentSalutation,
  salutationMatchesStudent,
} from './grader-salutation.js';

const STUDENT = 'Ada Lovelace';

const wrong = (body: string) => hasWrongStudentSalutation(body, STUDENT);

describe('extractSalutationName', () => {
  it('reads the name after an explicit greeting', () => {
    expect(extractSalutationName('Hi Ada, your analysis holds up.')).toBe(
      'Ada',
    );
    expect(extractSalutationName('Hello Ada Lovelace:')).toBe('Ada Lovelace');
    expect(extractSalutationName('Dear Ada')).toBe('Ada');
    expect(
      extractSalutationName('Good morning Ada, the plan reads well.'),
    ).toBe('Ada');
  });

  it('reads an address that occupies its own line', () => {
    expect(extractSalutationName('Ada,\n\nYour analysis holds up.')).toBe(
      'Ada',
    );
    expect(extractSalutationName('Ada Lovelace:\n\nYour analysis.')).toBe(
      'Ada Lovelace',
    );
  });

  it('finds no salutation in feedback that opens with a sentence', () => {
    expect(
      extractSalutationName(
        'Your analysis separates observation from judgement.',
      ),
    ).toBeUndefined();
    expect(
      extractSalutationName('The closing plan needs a review point.'),
    ).toBeUndefined();
  });

  it('does not treat a sentence that begins with a greeting word as an address', () => {
    // Six words after "Hello" is prose, not a vocative.
    expect(
      extractSalutationName('Hello and thank you for the resubmission notes.'),
    ).toBeUndefined();
  });

  it('does not treat a sentence-initial connective as an address', () => {
    for (const line of ['However,', 'Overall,', 'Still,', 'Finally,']) {
      expect(
        extractSalutationName(`${line}\n\nthe plan needs work.`),
      ).toBeUndefined();
    }
  });

  it('does not scan past the first line', () => {
    expect(
      extractSalutationName('Your analysis holds up.\n\nHi Sarah, more notes.'),
    ).toBeUndefined();
  });
});

describe('salutationMatchesStudent', () => {
  it('accepts the exact full name and the exact first token', () => {
    expect(salutationMatchesStudent('Ada Lovelace', STUDENT)).toBe(true);
    expect(salutationMatchesStudent('Ada', STUDENT)).toBe(true);
    expect(salutationMatchesStudent('ada', STUDENT)).toBe(true);
  });

  it('rejects a different name', () => {
    expect(salutationMatchesStudent('Sarah', STUDENT)).toBe(false);
    expect(salutationMatchesStudent('Lovelace', STUDENT)).toBe(false);
  });

  it('rejects prefix and superstring aliases in both directions', () => {
    expect(salutationMatchesStudent('Ada', 'Adaline Byron')).toBe(false);
    expect(salutationMatchesStudent('Adaline', STUDENT)).toBe(false);
  });

  it('accepts generic addresses that are not names', () => {
    expect(salutationMatchesStudent('there', STUDENT)).toBe(true);
    expect(salutationMatchesStudent('everyone', STUDENT)).toBe(true);
  });
});

describe('hasWrongStudentSalutation', () => {
  it('passes feedback with no salutation', () => {
    expect(wrong('Your analysis separates observation from judgement.')).toBe(
      false,
    );
  });

  it('passes the right name in either accepted form', () => {
    expect(wrong('Hi Ada, your analysis holds up.')).toBe(false);
    expect(wrong('Hi Ada Lovelace, your analysis holds up.')).toBe(false);
    expect(wrong('Ada,\n\nYour analysis holds up.')).toBe(false);
  });

  it('blocks another person’s name', () => {
    expect(wrong('Hi Sarah, your analysis holds up.')).toBe(true);
    expect(wrong('Dear Michael Chen:\n\nYour analysis.')).toBe(true);
    expect(wrong('Sarah,\n\nYour analysis holds up.')).toBe(true);
  });

  it('blocks a prefix alias of the student’s own name', () => {
    expect(
      hasWrongStudentSalutation('Hi Ada, nice work.', 'Adaline Byron'),
    ).toBe(true);
  });

  it('blocks a Unicode confusable', () => {
    // Cyrillic А (U+0410) in place of Latin A.
    expect(wrong('Hi Аda, your analysis holds up.')).toBe(true);
  });

  it('is not fooled by a zero-width character inside the right name', () => {
    expect(wrong('Hi A​da, your analysis holds up.')).toBe(false);
  });

  it('blocks a punctuation-broken name', () => {
    expect(wrong('Hi A.d.a, your analysis holds up.')).toBe(true);
  });

  it('does nothing when the host supplied no expected name', () => {
    expect(hasWrongStudentSalutation('Hi Sarah, nice work.', undefined)).toBe(
      false,
    );
  });

  it('passes a greeting with no name at all', () => {
    expect(wrong('Hi there, your analysis holds up.')).toBe(false);
    expect(wrong('Hello,\n\nYour analysis holds up.')).toBe(false);
  });
});
