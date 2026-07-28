import { describe, expect, it } from 'vitest';

import { splitForSlack } from './message-split.js';

describe('splitForSlack', () => {
  it('returns the text unchanged when it fits', () => {
    expect(splitForSlack('short', 100)).toEqual(['short']);
  });

  it('returns the text unchanged at exactly the cap', () => {
    const text = 'a'.repeat(100);
    expect(splitForSlack(text, 100)).toEqual([text]);
  });

  it('never exceeds the cap', () => {
    const text = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    for (const chunk of splitForSlack(text, 100)) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it('breaks on a blank line when one is available', () => {
    const para = 'x'.repeat(70);
    const chunks = splitForSlack(`${para}\n\n${para}`, 100);
    expect(chunks).toEqual([para, para]);
  });

  it('breaks on a newline when no blank line fits', () => {
    const line = 'y'.repeat(70);
    const chunks = splitForSlack(`${line}\n${line}`, 100);
    expect(chunks).toEqual([line, line]);
  });

  it('never splits inside a word', () => {
    // The Oana Tue regression: a raw slice produced "…no att" / "estation…".
    const text = `${'word '.repeat(30)}attestation letter follows here`;
    for (const chunk of splitForSlack(text, 100)) {
      expect(chunk).not.toMatch(/^estation/);
    }
    expect(splitForSlack(text, 100).join(' ')).toContain('attestation');
  });

  it('preserves every non-whitespace character across chunks', () => {
    const text = Array.from(
      { length: 120 },
      (_, i) => `sentence number ${i} with some words`,
    ).join('\n\n');
    const rejoined = splitForSlack(text, 400).join('\n\n');
    expect(rejoined.replace(/\s+/g, '')).toEqual(text.replace(/\s+/g, ''));
  });

  it('hard-cuts text with no usable boundary', () => {
    const text = 'z'.repeat(250);
    const chunks = splitForSlack(text, 100);
    expect(chunks).toEqual(['z'.repeat(100), 'z'.repeat(100), 'z'.repeat(50)]);
  });

  it('does not emit a tiny chunk to honour an early boundary', () => {
    // A newline at index 5 is below the fill floor and must be ignored.
    const text = `head\n${'q'.repeat(300)}`;
    expect(splitForSlack(text, 100)[0].length).toBeGreaterThan(60);
  });

  it('emits no empty chunks', () => {
    const text = `${'a'.repeat(90)}\n\n\n\n${'b'.repeat(90)}`;
    for (const chunk of splitForSlack(text, 100)) {
      expect(chunk.length).toBeGreaterThan(0);
    }
  });

  it('rejects a non-positive cap', () => {
    expect(() => splitForSlack('abc', 0)).toThrow(RangeError);
  });
});
