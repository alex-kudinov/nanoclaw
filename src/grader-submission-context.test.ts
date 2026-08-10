import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  loadRegistryAssignments,
  matchAssignments,
  normalizeLabel,
  parseRootHeader,
  REGISTRY_MAX_BYTES,
  resolveGradingRoot,
  resolveSubmissionContext,
  type RegistryAssignment,
} from './grader-submission-context.js';
import type { AdditionalMount } from './types.js';

const HB = (lessonId: string, canonicalTitle: string) => ({
  workspace: 'main',
  course_id: 'abd312e4-b01a-4718-8918-f79d081753c0',
  lesson_id: lessonId,
  canonical_title: canonicalTitle,
});

const FIXTURE = {
  assignments: [
    {
      code: 'foundation-m1',
      title: 'Module 1 Part 2: Ethical Scenario Analysis',
      aliases: ['module 1 part 2', 'm1p2'],
      heartbeat: HB(
        '2aea66a1-35b5-4074-bad7-7eb57203fbf1',
        'Module 1 Assignment Part 2: Ethical Scenario Analysis',
      ),
    },
    {
      code: 'eval-m4',
      title: 'Module 4 Part 2: Session Analysis of Recording A',
      aliases: ['module 4 part 2', 'm4p2'],
      heartbeat: HB(
        '39fb7b36-4bda-4287-8c26-ef965c47bc44',
        'Module 4 Assignment Part 2: Session Analysis of Recording A',
      ),
    },
    {
      // No heartbeat block: grades from the pack snapshot by design.
      code: 'acc-bars',
      title: 'ACC BARS Module: Rate and Give Feedback',
      aliases: ['acc bars', 'bars'],
    },
  ],
};

const tempRoots: string[] = [];

function makeRoot(registry: unknown, options: { pad?: number } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grading-fixture-'));
  tempRoots.push(dir);
  let body =
    typeof registry === 'string' ? registry : JSON.stringify(registry, null, 2);
  if (options.pad) body += ' '.repeat(options.pad);
  fs.writeFileSync(path.join(dir, 'registry.json'), body, 'utf-8');
  return dir;
}

function mountsFor(hostPath: string): AdditionalMount[] {
  return [
    { hostPath: 'knowledge/agents/grader', containerPath: 'knowledge' },
    { hostPath, containerPath: 'grading' },
  ];
}

function resolveIn(root: string, rootText: string) {
  return resolveSubmissionContext(rootText, mountsFor(root));
}

afterEach(() => {
  while (tempRoots.length) {
    fs.rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe('normalizeLabel', () => {
  it('folds case, punctuation, and spacing', () => {
    expect(normalizeLabel('Module 4, Part 2')).toBe('module 4 part 2');
    expect(normalizeLabel('  MODULE 4 -- part  2 ')).toBe('module 4 part 2');
    expect(normalizeLabel('Module 4: Part 2!')).toBe('module 4 part 2');
  });

  it('applies NFKC so rich-text paste folds to its registry form', () => {
    expect(normalizeLabel('Ｍｏｄｕｌｅ ４')).toBe('module 4');
  });

  it('keeps letters outside ASCII rather than deleting them', () => {
    expect(normalizeLabel('Café')).toBe('café');
  });

  it('folds a punctuation-only label to nothing', () => {
    expect(normalizeLabel('***')).toBe('');
    expect(normalizeLabel('../../etc/passwd')).toBe('etc passwd');
  });
});

describe('resolveGradingRoot', () => {
  it('reads the registered grading mount, not a message path', () => {
    expect(resolveGradingRoot(mountsFor('/srv/grading'))).toBe('/srv/grading');
  });

  it('expands a home-relative registered path', () => {
    const resolved = resolveGradingRoot([
      { hostPath: '~/dev/grading', containerPath: 'grading' },
    ]);
    expect(resolved).toBe(path.join(os.homedir(), 'dev/grading'));
  });

  it('returns undefined when no grading mount is registered', () => {
    expect(resolveGradingRoot([])).toBeUndefined();
    expect(
      resolveGradingRoot([
        { hostPath: '/srv/other', containerPath: 'knowledge' },
      ]),
    ).toBeUndefined();
  });
});

describe('loadRegistryAssignments', () => {
  it('loads codes, titles, aliases, and heartbeat metadata', () => {
    const assignments = loadRegistryAssignments(makeRoot(FIXTURE))!;
    expect(assignments).toHaveLength(3);
    expect(assignments[0].heartbeat?.lessonId).toBe(
      '2aea66a1-35b5-4074-bad7-7eb57203fbf1',
    );
    expect(assignments[2].heartbeat).toBeUndefined();
  });

  it('rejects a registry over the size cap without parsing it', () => {
    const root = makeRoot(FIXTURE, { pad: REGISTRY_MAX_BYTES });
    expect(loadRegistryAssignments(root)).toBeUndefined();
  });

  it('rejects malformed JSON', () => {
    expect(
      loadRegistryAssignments(makeRoot('{"assignments": [')),
    ).toBeUndefined();
  });

  it('rejects a registry with no assignments array', () => {
    expect(loadRegistryAssignments(makeRoot({ courses: {} }))).toBeUndefined();
  });

  it('rejects a missing registry file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grading-empty-'));
    tempRoots.push(dir);
    expect(loadRegistryAssignments(dir)).toBeUndefined();
  });

  it('rejects heartbeat metadata that is not fully populated', () => {
    const partial = {
      assignments: [
        {
          code: 'foundation-m1',
          title: 'Module 1',
          aliases: [],
          heartbeat: { workspace: 'main', lesson_id: 'x' },
        },
      ],
    };
    expect(loadRegistryAssignments(makeRoot(partial))).toBeUndefined();
  });

  it('rejects malformed assignment entries instead of silently skipping them', () => {
    expect(
      loadRegistryAssignments(
        makeRoot({ assignments: [...FIXTURE.assignments, null] }),
      ),
    ).toBeUndefined();
    expect(
      loadRegistryAssignments(
        makeRoot({
          assignments: [
            { code: 'foundation-m1', title: 'Module 1', aliases: [42] },
          ],
        }),
      ),
    ).toBeUndefined();
  });
});

describe('matchAssignments', () => {
  const assignments = (): RegistryAssignment[] =>
    loadRegistryAssignments(makeRoot(FIXTURE))!;

  it('matches a code, a title, an alias, and a canonical title', () => {
    const list = assignments();
    for (const label of [
      'foundation-m1',
      'Module 1 Part 2: Ethical Scenario Analysis',
      'M1P2',
      'Module 1 Assignment Part 2: Ethical Scenario Analysis',
    ]) {
      expect(matchAssignments(list, label).map((a) => a.code)).toEqual([
        'foundation-m1',
      ]);
    }
  });

  it('does not match a substring or a superstring of a label', () => {
    const list = assignments();
    expect(matchAssignments(list, 'module 1')).toEqual([]);
    expect(matchAssignments(list, 'module 1 part 2 revised')).toEqual([]);
    expect(matchAssignments(list, 'part 2')).toEqual([]);
  });

  it('returns nothing for an empty or punctuation-only label', () => {
    expect(matchAssignments(assignments(), '   ')).toEqual([]);
    expect(matchAssignments(assignments(), '---')).toEqual([]);
  });

  it('returns every candidate when a label is registered twice', () => {
    const duplicated = {
      assignments: [
        { code: 'a-one', title: 'A', aliases: ['module 9'] },
        { code: 'b-two', title: 'B', aliases: ['Module 9'] },
      ],
    };
    const list = loadRegistryAssignments(makeRoot(duplicated))!;
    expect(matchAssignments(list, 'module 9')).toHaveLength(2);
  });
});

describe('parseRootHeader', () => {
  it('takes the first two nonblank lines and ignores the submission body', () => {
    const root =
      'Ada Lovelace\nModule 4, Part 2\n\nMy analysis of the recording begins here.\nMore body.';
    expect(parseRootHeader(root)).toEqual(['Ada Lovelace', 'Module 4, Part 2']);
  });

  it('skips leading blank lines and folds CRLF', () => {
    expect(parseRootHeader('\r\n\r\nAda\r\nModule 4, Part 2\r\n')).toEqual([
      'Ada',
      'Module 4, Part 2',
    ]);
  });

  it('drops an over-long header line rather than treating prose as a label', () => {
    const root = `${'x'.repeat(500)}\nModule 4, Part 2`;
    expect(parseRootHeader(root)).toEqual(['Module 4, Part 2']);
  });

  it('returns nothing for an empty root', () => {
    expect(parseRootHeader('   \n\n')).toEqual([]);
  });
});

describe('resolveSubmissionContext', () => {
  it('resolves a two-line submission header', () => {
    const result = resolveIn(
      makeRoot(FIXTURE),
      'Ada Lovelace\nModule 4, Part 2\n\nThe coach opened by restating the goal.',
    );
    expect(result).toEqual({
      kind: 'resolved',
      studentName: 'Ada Lovelace',
      assignment: expect.objectContaining({ code: 'eval-m4' }),
    });
  });

  it('strips the documented grade verb from a two-line header name', () => {
    const result = resolveIn(
      makeRoot(FIXTURE),
      'grade Ada Lovelace\nModule 4, Part 2\n\nBody.',
    );
    expect(result).toMatchObject({
      kind: 'resolved',
      studentName: 'Ada Lovelace',
    });
  });

  it('resolves a header whose label is the canonical Heartbeat title', () => {
    const result = resolveIn(
      makeRoot(FIXTURE),
      'Ada Lovelace\nModule 4 Assignment Part 2: Session Analysis of Recording A\n\nBody.',
    );
    expect(result).toMatchObject({
      kind: 'resolved',
      studentName: 'Ada Lovelace',
    });
  });

  it('resolves the legacy one-line grade command, taking the longest label suffix', () => {
    const root = makeRoot(FIXTURE);
    expect(
      resolveIn(root, 'grade Hanne module 1 part 2\n\nBody.'),
    ).toMatchObject({
      kind: 'resolved',
      studentName: 'Hanne',
      assignment: expect.objectContaining({ code: 'foundation-m1' }),
    });
    // "bars" also resolves, but "acc bars" is longer, so the name is not eaten.
    expect(resolveIn(root, 'grade Paulo acc bars\n\nBody.')).toMatchObject({
      kind: 'resolved',
      studentName: 'Paulo',
      assignment: expect.objectContaining({ code: 'acc-bars' }),
    });
  });

  it('treats a one-line operator command as carrying no submission', () => {
    const root = makeRoot(FIXTURE);
    expect(resolveIn(root, 'help')).toEqual({ kind: 'no-submission' });
    expect(resolveIn(root, 'status Hanne')).toEqual({ kind: 'no-submission' });
    expect(resolveIn(root, '')).toEqual({ kind: 'no-submission' });
  });

  it('blocks an unknown assignment label', () => {
    expect(
      resolveIn(
        makeRoot(FIXTURE),
        'Ada Lovelace\nModule 12: Astronomy\n\nBody.',
      ),
    ).toEqual({ kind: 'blocked', code: 'assignment-unresolved' });
  });

  it('blocks a traversal-like label instead of touching the filesystem', () => {
    expect(
      resolveIn(makeRoot(FIXTURE), 'Ada\n../../etc/passwd\n\nBody.'),
    ).toEqual({ kind: 'blocked', code: 'assignment-unresolved' });
  });

  it('blocks a label that matches more than one assignment', () => {
    const duplicated = {
      assignments: [
        { code: 'a-one', title: 'A', aliases: ['module 9'] },
        { code: 'b-two', title: 'B', aliases: ['Module 9'] },
      ],
    };
    expect(resolveIn(makeRoot(duplicated), 'Ada\nModule 9\n\nBody.')).toEqual({
      kind: 'blocked',
      code: 'assignment-ambiguous',
    });
  });

  it('blocks when the header has a label but no name', () => {
    expect(resolveIn(makeRoot(FIXTURE), '\nModule 4, Part 2\n\nBody.')).toEqual(
      {
        kind: 'blocked',
        code: 'assignment-unresolved',
      },
    );
  });

  it('blocks when no grading mount is registered', () => {
    expect(
      resolveSubmissionContext('Ada\nModule 4, Part 2', [
        { hostPath: '/srv/other', containerPath: 'knowledge' },
      ]),
    ).toEqual({ kind: 'blocked', code: 'grading-root-unavailable' });
    expect(
      resolveSubmissionContext('Ada\nModule 4, Part 2', undefined),
    ).toEqual({
      kind: 'blocked',
      code: 'grading-root-unavailable',
    });
  });

  it('blocks when the registry cannot be read', () => {
    expect(resolveIn(makeRoot('not json'), 'Ada\nModule 4, Part 2')).toEqual({
      kind: 'blocked',
      code: 'registry-unreadable',
    });
  });

  it('blocks when a mandatory Foundation mapping is absent', () => {
    const missing = {
      assignments: FIXTURE.assignments.map((assignment) =>
        assignment.code === 'foundation-m1'
          ? { ...assignment, heartbeat: undefined }
          : assignment,
      ),
    };
    // JSON serialization removes the undefined property, exercising omission.
    expect(resolveIn(makeRoot(missing), 'Ada\nModule 1 Part 2')).toEqual({
      kind: 'blocked',
      code: 'heartbeat-mapping-missing',
    });
  });

  it('never returns submission or assignment content on a block', () => {
    const result = resolveIn(
      makeRoot(FIXTURE),
      'Ada Lovelace\nModule 12: Astronomy\n\nSECRET SUBMISSION BODY',
    );
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(Object.keys(result)).toEqual(['kind', 'code']);
  });
});

describe('the tracked grading registry', () => {
  // registry.json is the host's fetch allowlist. These read the real file: a
  // label that stops resolving here is a live grading outage, not a unit-test
  // detail. No student data is involved - the registry holds no submissions.
  const REAL_ROOT = path.join(os.homedir(), 'dev', 'grading');
  const real = () => loadRegistryAssignments(REAL_ROOT);

  const CASES: Array<[string, string]> = [
    ['Module 1, Part 2', 'foundation-m1'],
    ['module 2 part 2', 'foundation-m2'],
    ['Module 3', 'foundation-m3'],
    ['Module 4, Part 2', 'eval-m4'],
    ['Module 5', 'eval-m5'],
    ['Module 6', 'facilitation-m6'],
  ];

  it.skipIf(!fs.existsSync(path.join(REAL_ROOT, 'registry.json')))(
    'resolves every short Foundation label to its intended lesson',
    () => {
      const assignments = real()!;
      for (const [label, code] of CASES) {
        const matches = matchAssignments(assignments, label);
        expect(matches.map((a) => a.code)).toEqual([code]);
        expect(matches[0].heartbeat?.lessonId).toMatch(/^[0-9a-f-]{36}$/);
      }
    },
  );

  it.skipIf(!fs.existsSync(path.join(REAL_ROOT, 'registry.json')))(
    'resolves every canonical Heartbeat title to its own assignment',
    () => {
      const assignments = real()!;
      for (const assignment of assignments) {
        if (!assignment.heartbeat) continue;
        const matches = matchAssignments(
          assignments,
          assignment.heartbeat.canonicalTitle,
        );
        expect(matches.map((a) => a.code)).toEqual([assignment.code]);
      }
    },
  );
});
