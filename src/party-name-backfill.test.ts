import { describe, expect, it, vi } from 'vitest';

vi.mock('./business-db.js', () => ({
  withAgentContext: vi.fn(),
  withTransaction: vi.fn(),
}));

import { parseCandidateFile, pickCandidate } from './party-name-backfill.js';

const HEADER = 'pid\tcur\tvariants\tnames\tsources';

describe('pickCandidate', () => {
  it('takes a single name or the one variant that is not all lowercase', () => {
    expect(pickCandidate('Robin Rivera')).toBe('Robin Rivera');
    expect(pickCandidate('robin rivera | Robin Rivera')).toBe('Robin Rivera');
    expect(pickCandidate('Robin Rivera | Robin Rivera')).toBe('Robin Rivera');
  });

  it('refuses different names and more than one cased variant', () => {
    expect(pickCandidate('Robin Rivera | Robin Smith')).toBeNull();
    expect(pickCandidate('Robin Rivera | ROBIN RIVERA')).toBeNull();
    expect(
      pickCandidate('robin rivera | ROBIN RIVERA | Robin Rivera'),
    ).toBeNull();
    expect(pickCandidate('')).toBeNull();
  });
});

describe('parseCandidateFile', () => {
  it('reads rows and checks the psql footer count', () => {
    const rows = parseCandidateFile(
      [HEADER, '11641\tsteve\t1\tSteve Rivera\tencharge', '(1 row)', ''].join(
        '\n',
      ),
    );
    expect(rows).toEqual([
      { pid: 11641, cur: 'steve', candidate: 'Steve Rivera' },
    ]);
  });

  it.each([
    ['a different header', ['pid\tcur', '(0 rows)']],
    ['a missing footer', [HEADER, '1\ta\t1\tA B\tx']],
    ['a wrong footer count', [HEADER, '1\ta\t1\tA B\tx', '(2 rows)']],
    [
      'a duplicate pid',
      [HEADER, '1\ta\t1\tA B\tx', '1\ta\t1\tA B\tx', '(2 rows)'],
    ],
    ['a row after the footer', [HEADER, '(0 rows)', '1\ta\t1\tA B\tx']],
    ['a short row', [HEADER, '1\ta\tA B', '(1 row)']],
    ['a non-numeric pid', [HEADER, 'x\ta\t1\tA B\tx', '(1 row)']],
  ])('refuses %s', (_label, lines) => {
    expect(() => parseCandidateFile(lines.join('\n'))).toThrow(
      /candidate file/,
    );
  });
});
