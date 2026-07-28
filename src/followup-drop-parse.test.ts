import { describe, it, expect } from 'vitest';
import {
  parseDropInstruction,
  isResumeInstruction,
  matchLeadsByName,
} from './followup-drop-parse.js';

/**
 * Every "recognises" case below is a message the operator actually sent to
 * #gru-sales. They were all delivered only to the sales container, which either
 * wrote the wrong stage or wrote nothing — so the lead was re-drafted the next
 * weekday. These are the regression cases.
 */
describe('parseDropInstruction — real operator messages', () => {
  it('recognises "drop <name>"', () => {
    const t = parseDropInstruction(
      'drop renee carr - cherie is responding directly.',
    );
    expect(t?.names).toContain('renee carr');
  });

  it('recognises a two-name "do not bring it up again" instruction', () => {
    const t = parseDropInstruction(
      'do not bring it up again to that namrata and renee',
    );
    expect(t?.names).toEqual(expect.arrayContaining(['namrata', 'renee']));
  });

  it('recognises "stop following up"', () => {
    expect(parseDropInstruction('stop following up #354')?.ids).toEqual([354]);
  });

  it('recognises "no more follow-ups for #12"', () => {
    expect(parseDropInstruction('no more follow-ups for #12')?.ids).toEqual([
      12,
    ]);
  });

  it('takes the ids on the drop side of a mixed batch line', () => {
    const t = parseDropInstruction('#54 - done drop #283, 349 drop');
    expect(t?.ids).toEqual(expect.arrayContaining([283, 349]));
    expect(t?.ids).not.toContain(54);
  });

  it('does not steal ids that belong to an approval', () => {
    const t = parseDropInstruction('drop 22 ok 25 26 signed up drop 29 ok 31');
    expect(t?.ids).toEqual(expect.arrayContaining([22, 29]));
    expect(t?.ids).not.toContain(25);
    expect(t?.ids).not.toContain(31);
  });

  it('recognises a bare frustrated "drop" with no target', () => {
    const t = parseDropInstruction(
      'this keeps coming up every day even after i say drop - drop means drop',
    );
    expect(t).not.toBeNull();
  });
});

/**
 * Draft edits also start with "drop". The parser is allowed to emit a junk name
 * candidate for these ("pending", "answer directly") — the resolver discards any
 * phrase that matches no queued lead. What must NOT happen is a lead id being
 * invented, which is what would actually suppress the wrong person. The
 * end-to-end silence is asserted in followup-drop.test.ts.
 */
describe('parseDropInstruction — draft edits must not yield lead ids', () => {
  const draftEdits = [
    'drop pricing from the response - the rest is approved',
    "drop cherie's booking link. the rest is approved",
    'drop the price form here, but check why new price is not updated',
    'drop accredication pending - she is targeting sep',
    'drop to answer directly - that is an ai-ism',
  ];

  for (const text of draftEdits) {
    it(`finds no lead id in: "${text.slice(0, 40)}…"`, () => {
      const t = parseDropInstruction(text);
      expect(t?.ids ?? []).toEqual([]);
      expect(t?.explicitIds ?? []).toEqual([]);
    });
  }

  it('returns null when there is no drop language at all', () => {
    expect(parseDropInstruction('approved, send it')).toBeNull();
    expect(parseDropInstruction('')).toBeNull();
  });

  it('marks `#N` explicit and a bare count not', () => {
    expect(parseDropInstruction('drop #283')?.explicitIds).toEqual([283]);
    expect(
      parseDropInstruction('drop those 2 - responded separately')?.explicitIds,
    ).toEqual([]);
  });
});

describe('isResumeInstruction', () => {
  it('spots an undo', () => {
    expect(isResumeInstruction('undrop #213')).toBe(true);
    expect(isResumeInstruction('resume follow-ups for renee')).toBe(true);
  });

  it('does not fire on a drop', () => {
    expect(isResumeInstruction('drop #213')).toBe(false);
  });
});

describe('matchLeadsByName', () => {
  const leads = [
    { pipeline_entry_id: 213, party_id: 10247, display_name: 'Namrata' },
    { pipeline_entry_id: 239, party_id: 10281, display_name: 'Renee' },
    { pipeline_entry_id: 283, party_id: 10300, display_name: 'Kate Fullbrook' },
  ];

  it('matches a fuller name against a shorter stored one', () => {
    // The lead is stored as just "Renee"; the operator wrote "renee carr".
    expect(matchLeadsByName('renee carr', leads)).toHaveLength(1);
  });

  it('matches a first name against a fuller stored one', () => {
    expect(matchLeadsByName('kate', leads)[0].party_id).toBe(10300);
  });

  it('returns every candidate so the caller can refuse to guess', () => {
    const dupes = [
      { pipeline_entry_id: 1, party_id: 11, display_name: 'Renee Carr' },
      { pipeline_entry_id: 2, party_id: 22, display_name: 'Renee Fisher' },
    ];
    expect(matchLeadsByName('renee', dupes)).toHaveLength(2);
  });

  it('does not match an unrelated name', () => {
    expect(matchLeadsByName('sierra hulley', leads)).toEqual([]);
  });
});
