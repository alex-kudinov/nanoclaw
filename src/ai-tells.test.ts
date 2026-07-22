import { describe, it, expect, afterEach } from 'vitest';
import { scanAiTells } from './ai-tells.js';

afterEach(() => {
  delete process.env.EMAIL_AI_TELLS_EXTRA;
});

describe('scanAiTells — flags banned AI phrasing', () => {
  it('catches the sycophantic opener that reached the Vishal send', () => {
    const found = scanAiTells(
      'Hi Vishal,\n\nThank you for reaching out. Which program?',
    );
    expect(found).toContain('thank you for reaching out');
  });

  it.each([
    [
      'In today’s fast-paced world, coaching matters.',
      "in today's fast-paced world",
    ],
    ["It's worth noting that the cohort fills up.", "it's worth noting"],
    ["I'd be happy to help with next steps.", "i'd be happy to help"],
    [
      'This program will help you unlock your full potential.',
      'unlock your potential',
    ],
    ['I hope this helps! Let me know.', 'i hope this helps'],
    [
      "Don't hesitate to reach out with questions.",
      "don't hesitate to contact us",
    ],
    ['This is a real game-changer for your practice.', 'game-changer'],
    ["That's a great question.", 'great question'],
  ])('flags %j', (input, label) => {
    expect(scanAiTells(input)).toContain(label);
  });

  it('flags unconditionally-banned single words on word boundaries', () => {
    const found = scanAiTells(
      'We delve into a transformative, bespoke curriculum.',
    );
    expect(found).toEqual(
      expect.arrayContaining(['delve', 'transformative', 'bespoke']),
    );
  });

  it('flags the "isn\'t just X, it\'s Y" construction', () => {
    expect(
      scanAiTells("Coaching isn't just a skill, it's a mindset."),
    ).toContain('"isn\'t just X, it\'s Y" construction');
  });

  it('deduplicates repeated tells', () => {
    const found = scanAiTells('delve delve delve');
    expect(found.filter((f) => f === 'delve')).toHaveLength(1);
  });
});

describe('scanAiTells — false-positive aversion', () => {
  it('passes a clean, human-sounding sales reply', () => {
    const clean = [
      'Hi Vishal,',
      '',
      'The ACC program runs $3,999 and the next cohort starts in September.',
      'Cohort sizes stay under 10, so there is real interaction.',
      'If you want more detail on the schedule, the program page has it.',
      '',
      'Best,',
      'The Tandem Coaching Team',
    ].join('\n');
    expect(scanAiTells(clean)).toEqual([]);
  });

  it('does not block context-dependent words excluded from the list', () => {
    // "leverage", "navigate", "comprehensive", "foster", "tailored" are
    // deliberately NOT in the block set — they have legitimate literal uses.
    const legit =
      'Your ACC hours leverage toward PCC. We tailored the plan and can navigate the ICF process together.';
    expect(scanAiTells(legit)).toEqual([]);
  });

  it('lets the correct "we don\'t offer discounts" style answer through', () => {
    expect(
      scanAiTells('We do not offer discounts on the ACC program.'),
    ).toEqual([]);
  });
});

describe('scanAiTells — env extension', () => {
  it('blocks extra phrases from EMAIL_AI_TELLS_EXTRA', () => {
    process.env.EMAIL_AI_TELLS_EXTRA = 'synergize,best in class';
    const found = scanAiTells('We synergize to deliver best in class results.');
    expect(found).toEqual(
      expect.arrayContaining(['synergize', 'best in class']),
    );
  });
});
