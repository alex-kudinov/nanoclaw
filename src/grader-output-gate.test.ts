import { describe, expect, it } from 'vitest';

import {
  checkGraderOutput,
  formatGraderOutputBlock,
  GRADER_OPERATOR_PREFIX,
  GRADER_STUDENT_ABSOLUTE_MAX_CHARS,
  GRADER_STUDENT_MAX_CHARS,
  isGraderStudentVerdictUnit,
  type GraderOutputViolationCode,
} from './grader-output-gate.js';

function expectBlocked(text: string, code: GraderOutputViolationCode): void {
  const result = checkGraderOutput(text);
  expect(result.ok).toBe(false);
  expect(result.kind).toBe('student');
  expect(result.violations).toContain(code);
}

describe('checkGraderOutput', () => {
  it('passes concise, specific PASS copy', () => {
    const result = checkGraderOutput(
      'PASS\n\nYour distinction between naming the observed behavior and interpreting its effect makes the feedback usable for the coach.',
    );

    expect(result).toEqual({ ok: true, kind: 'student', violations: [] });
  });

  it('accepts a PASS whose genuine grow begins after an internal blank line', () => {
    const result = checkGraderOutput(
      'PASS\n\nAssigning competency lenses before the recording gives each participant a real appraisal job, and the redirects ask for observed behavior when comments drift into impression.\n\nLeave flexibility in the closing because six individual insights may need more room when the feedback round runs long.',
    );

    expect(result).toEqual({ ok: true, kind: 'student', violations: [] });
  });

  it('passes concise, actionable NO PASS copy', () => {
    const result = checkGraderOutput(
      'NO PASS\n\nAdd the closing-session plan, including how you will review progress and agree the coach’s next development focus.',
    );

    expect(result).toEqual({ ok: true, kind: 'student', violations: [] });
  });

  it('passes direct French, Spanish, and Japanese faculty feedback', () => {
    const cases = [
      [
        'PASS\n\nVotre analyse relie chaque décision au Code de déontologie de l’ICF et explique clairement les mesures proposées.',
        { feedbackLocale: 'fr-FR', feedbackLanguage: 'fr' },
      ],
      [
        'PASS\n\nTu análisis vincula cada decisión con el Código Ético de la ICF y explica con claridad las medidas propuestas.',
        { feedbackLocale: 'es-419', feedbackLanguage: 'es' },
      ],
      [
        'PASS\n\n各場面の判断をICF倫理規定に結びつけ、取るべき対応とその理由を具体的に説明しています。',
        { feedbackLocale: 'ja-JP', feedbackLanguage: 'ja' },
      ],
    ] as const;
    for (const [text, context] of cases) {
      expect(checkGraderOutput(text, context)).toEqual({
        ok: true,
        kind: 'student',
        violations: [],
      });
    }
  });

  it('blocks obvious Japanese or English feedback-language mismatches', () => {
    expect(
      checkGraderOutput(
        'PASS\n\nYour analysis explains the ethical decision and the proposed response.',
        { feedbackLocale: 'ja-JP', feedbackLanguage: 'ja' },
      ).violations,
    ).toContain('feedback-language-mismatch');
    expect(
      checkGraderOutput(
        'PASS\n\n各場面の判断を倫理規定に結びつけ、対応と理由を具体的に説明しています。',
        { feedbackLocale: 'en-US', feedbackLanguage: 'en' },
      ).violations,
    ).toContain('feedback-language-mismatch');
  });

  it.each([
    [
      'PASS\n\nExcellent travail. Votre analyse est précise.',
      { feedbackLocale: 'fr-FR', feedbackLanguage: 'fr' },
      'stock-praise-phrase',
    ],
    [
      'PASS\n\nCabe destacar que tu análisis identifica el acuerdo.',
      { feedbackLocale: 'es-419', feedbackLanguage: 'es' },
      'formulaic-feedback-phrase',
    ],
    [
      'PASS\n\n内部ルーブリックに基づく判定です。',
      { feedbackLocale: 'ja-JP', feedbackLanguage: 'ja' },
      'operator-vocabulary',
    ],
  ] as const)('applies locale-specific closed rules', (text, context, code) => {
    expect(checkGraderOutput(text, context).violations).toContain(code);
  });

  it('passes an operator message without requiring student copy first', () => {
    const result = checkGraderOutput(
      `${GRADER_OPERATOR_PREFIX}\nRecord saved. Completion check pending.`,
    );

    expect(result).toEqual({ ok: true, kind: 'operator', violations: [] });
  });

  it('blocks a second student message in the same thread', () => {
    const result = checkGraderOutput('PASS\n\nA second result.', {
      studentCopyAlreadyDelivered: true,
    });

    expect(result.violations).toContain('duplicate-student-message');
  });

  it.each([
    ['MAYBE\nRevise the final section.', 'invalid-verdict-line'],
    [
      `PASS\n${GRADER_OPERATOR_PREFIX}\nCertificate eligible.`,
      'operator-marker-in-student-copy',
    ],
    [
      'PASS\nThe grading prompt found a certificate eligibility issue.',
      'operator-vocabulary',
    ],
    [
      'NO PASS\nCriterion id m4-style-skill remains open.',
      'internal-criterion-id',
    ],
    ['PASS\n- Clear examples\n- Useful reflection', 'markdown-formatting'],
    ['PASS\nYour example is specific — and well supported.', 'em-dash'],
    [
      'NO PASS\nReplace [student] with the learner name.',
      'unfilled-placeholder',
    ],
    [
      'PASS\nThis is a remarkable and transformative analysis.',
      'ai-style-phrase',
    ],
    ['PASS\nGreat job on this strong submission.', 'stock-praise-phrase'],
    [
      'PASS\n\nThe timestamped example is clear. One thing to keep sharpening is the closing.',
      'formulaic-feedback-phrase',
    ],
    [
      'PASS\nYou addressed all of the assignment requirements.',
      'requirement-compliance-phrase',
    ],
  ] as const)('blocks %s', (text, code) => {
    expectBlocked(text, code);
  });

  it.each([
    'Going forward, connect the calculation to the credential call.',
    'Worth adding a concrete timestamp to the final example.',
    'The bias self-check stands out in this analysis.',
    'The dynamics section is a standout.',
    'The strongest part is the evidence redirect.',
  ])('blocks a cohort-visible grading template: %s', (body) => {
    expectBlocked(`PASS\n\n${body}`, 'formulaic-feedback-phrase');
  });

  it('requires exactly one blank line between verdict and feedback', () => {
    expectBlocked('PASS\n\n', 'paste-unit-formatting');
    expectBlocked('PASS\n\n   ', 'paste-unit-formatting');
    expectBlocked('NO PASS\n\n\t', 'paste-unit-formatting');
    expectBlocked('PASS\nFeedback starts too soon.', 'paste-unit-formatting');
    expectBlocked(
      'PASS\n\n\nFeedback starts too late.',
      'paste-unit-formatting',
    );
    expectBlocked(
      '\nPASS\n\nFeedback has a leading blank.',
      'paste-unit-formatting',
    );
    expect(checkGraderOutput('PASS\r\n\r\nFeedback is selectable.').ok).toBe(
      true,
    );
  });

  it('pins the default length boundary', () => {
    const prefix = 'PASS\n\n';
    const atLimit = `${prefix}${'x'.repeat(
      GRADER_STUDENT_MAX_CHARS - prefix.length,
    )}`;
    const overLimit = `${atLimit}x`;

    expect(checkGraderOutput(atLimit).ok).toBe(true);
    expectBlocked(overLimit, 'student-copy-too-long');
  });

  it('reports multiple rule codes without duplicates', () => {
    const result = checkGraderOutput(
      'PASS\n- Great job — this remarkable submission meets all requirements.',
    );

    expect(result.violations).toEqual(
      expect.arrayContaining([
        'markdown-formatting',
        'em-dash',
        'ai-style-phrase',
        'stock-praise-phrase',
        'requirement-compliance-phrase',
      ]),
    );
    expect(new Set(result.violations).size).toBe(result.violations.length);
  });

  it('passes ordinary faculty prose that is not an internal criterion id', () => {
    expect(
      checkGraderOutput(
        'NO PASS\n\nThe bias self-check is the one criterion still open. You have not addressed all of the requirements for the engagement agreement.',
      ).ok,
    ).toBe(true);
  });

  it('passes a normal request to resubmit a numbered part', () => {
    expect(
      checkGraderOutput(
        'NO PASS\n\nPlease resubmit 2 of the scenarios with the ethical standard named in each analysis.',
      ).ok,
    ).toBe(true);
  });

  it('supports a host-authorized expanded-feedback ceiling', () => {
    const text = `PASS\n\n${'Specific observation. '.repeat(100)}`;
    expect(checkGraderOutput(text).ok).toBe(false);
    expect(checkGraderOutput(text, { studentCopyMaxChars: 3000 }).ok).toBe(
      true,
    );
  });

  it('clamps the expanded ceiling to the absolute one-message cap', () => {
    // Slack splits an over-length post into separately stored chunks, which
    // fractures the copy unit and hides the verdict line from delivery-state
    // derivation. No caller may raise the ceiling past the cap.
    const prefix = 'PASS\n\n';
    const atCap = `${prefix}${'x'.repeat(
      GRADER_STUDENT_ABSOLUTE_MAX_CHARS - prefix.length,
    )}`;
    const overCap = `${atCap}xx`;

    expect(atCap.length).toBe(GRADER_STUDENT_ABSOLUTE_MAX_CHARS);
    expect(checkGraderOutput(atCap, { studentCopyMaxChars: 100_000 }).ok).toBe(
      true,
    );
    const blocked = checkGraderOutput(overCap, {
      studentCopyMaxChars: 100_000,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.violations).toContain('student-copy-too-long');
  });

  it('blocks UTF-16 transport overflow even when code points fit', () => {
    const astralHeavy = `PASS\n\n${'🙂'.repeat(1800)}`;
    expect([...astralHeavy].length).toBeLessThan(3000);
    expect(astralHeavy.length).toBeGreaterThan(
      GRADER_STUDENT_ABSOLUTE_MAX_CHARS,
    );
    expectBlocked(astralHeavy, 'student-copy-too-long');
  });

  it('keeps the absolute cap below Slack’s single-message limit', () => {
    expect(GRADER_STUDENT_ABSOLUTE_MAX_CHARS).toBeLessThan(4000);
    expect(GRADER_STUDENT_ABSOLUTE_MAX_CHARS).toBeGreaterThan(
      GRADER_STUDENT_MAX_CHARS,
    );
  });

  it('normalizes common copy-paste characters for detection only', () => {
    expectBlocked('PASS\r\nGreat\u00a0job.', 'stock-praise-phrase');
    expectBlocked('PASS\nA remar\u200bkable analysis.', 'ai-style-phrase');
    expect(
      checkGraderOutput('PASS\r\n\r\nA concrete example supports the point.')
        .ok,
    ).toBe(true);
  });

  it('blocks near-miss operator markers inside student copy', () => {
    expectBlocked(
      'PASS\nThe example is specific.\nOPERATOR ONLY: DO NOT COPY TO HEARTBEAT\nRecord saved.',
      'operator-marker-in-student-copy',
    );
  });

  it('allows a revised student message after a block was not delivered', () => {
    const blocked = checkGraderOutput('PASS\nGreat job.');
    expect(blocked.ok).toBe(false);

    const revised = checkGraderOutput(
      'PASS\n\nYour comparison of the observed behavior with its effect is clear.',
      { studentCopyAlreadyDelivered: false },
    );
    expect(revised.ok).toBe(true);
  });

  it.each([
    'certificate',
    'quiz',
    'Heartbeat',
    'rubric',
    'calibration',
    'fail criteria',
  ])('blocks bare operator vocabulary: %s', (term) => {
    expectBlocked(
      `PASS\nInternal ${term} state is complete.`,
      'operator-vocabulary',
    );
  });
});

describe('formatGraderOutputBlock', () => {
  it('returns rule labels without echoing rejected text', () => {
    const rejected =
      'PASS\nGreat job. Certificate eligibility and grading confidence are confirmed.';
    const result = checkGraderOutput(rejected);
    const notice = formatGraderOutputBlock(result.violations);

    expect(notice.startsWith(GRADER_OPERATOR_PREFIX)).toBe(true);
    expect(notice).toContain('GRADER OUTPUT BLOCKED');
    expect(notice).toContain('stock-praise-phrase');
    expect(notice).toContain('operator-vocabulary');
    expect(notice).not.toContain('Great job');
    expect(notice).not.toContain('Certificate eligibility');
    expect(notice).not.toContain('grading confidence');
  });

  it('labels an empty violation list as unknown', () => {
    expect(formatGraderOutputBlock([])).toContain('Rules: unknown');
  });

  it('addresses recovery to the operator, not to a container that has exited', () => {
    // The grader is one-shot per submission and never sees this notice, so
    // "revise and run the gate again" addressed nobody.
    expect(formatGraderOutputBlock(['em-dash'])).toContain('Operator:');
    expect(formatGraderOutputBlock(['em-dash'])).toContain('re-trigger');
  });
});

describe('isGraderStudentVerdictUnit', () => {
  it('recognizes both verdict lines', () => {
    expect(isGraderStudentVerdictUnit('PASS\nfeedback')).toBe(true);
    expect(isGraderStudentVerdictUnit('NO PASS\nfeedback')).toBe(true);
  });

  it('rejects operator messages, acks, and prefixed copies', () => {
    expect(
      isGraderStudentVerdictUnit(`${GRADER_OPERATOR_PREFIX}\nRecord saved.`),
    ).toBe(false);
    expect(isGraderStudentVerdictUnit('[PROCESSING] Grading submission')).toBe(
      false,
    );
    // What sendMessage would have published. The whole point of the dedicated
    // post methods is that this string never exists for grader output.
    expect(isGraderStudentVerdictUnit('[grader]\nPASS\nfeedback')).toBe(false);
  });

  it('rejects a verdict word that is not the whole first line', () => {
    expect(isGraderStudentVerdictUnit('PASSING\nfeedback')).toBe(false);
    expect(isGraderStudentVerdictUnit('You PASS\nfeedback')).toBe(false);
    expect(isGraderStudentVerdictUnit('pass\nfeedback')).toBe(false);
  });

  it('agrees with the gate on normalized copy-paste characters', () => {
    const text = '\nPASS\r\nA concrete example supports the point.';
    expect(isGraderStudentVerdictUnit(text)).toBe(true);
    expect(checkGraderOutput(text).kind).toBe('student');
  });

  it('blocks copy that greets a different student than the host resolved', () => {
    const result = checkGraderOutput(
      'PASS\n\nHi Sarah, your distinction between the observed behavior and its effect lands.',
      { expectedStudentName: 'Ada Lovelace' },
    );

    expect(result.ok).toBe(false);
    expect(result.violations).toContain('salutation-name-mismatch');
  });

  it('passes copy that greets the resolved student by full name or first name', () => {
    for (const greeting of ['Hi Ada', 'Hi Ada Lovelace', 'Dear Ada']) {
      const result = checkGraderOutput(
        `PASS\n\n${greeting}, your reading of the recording is specific and usable.`,
        { expectedStudentName: 'Ada Lovelace' },
      );
      expect(result).toEqual({ ok: true, kind: 'student', violations: [] });
    }
  });

  it('passes copy with no salutation at all', () => {
    const result = checkGraderOutput(
      'PASS\n\nYour reading of the recording is specific and usable.',
      { expectedStudentName: 'Ada Lovelace' },
    );
    expect(result).toEqual({ ok: true, kind: 'student', violations: [] });
  });

  it('skips the salutation rule when the host resolved no name', () => {
    const result = checkGraderOutput(
      'PASS\n\nHi Sarah, your reading of the recording is specific and usable.',
    );
    expect(result).toEqual({ ok: true, kind: 'student', violations: [] });
  });

  it('does not read the verdict line as the salutation', () => {
    // "PASS" is a capitalized single token; it must never be mistaken for an
    // address, or every staging unit would block on a name mismatch.
    const result = checkGraderOutput(
      'PASS\n\nYour reading of the recording is specific and usable.',
      { expectedStudentName: 'Pass Anderson' },
    );
    expect(result.ok).toBe(true);
  });

  it('leaves an operator message unchecked for salutation', () => {
    const result = checkGraderOutput(
      `${GRADER_OPERATOR_PREFIX}\nHi Sarah, the record is saved.`,
      { expectedStudentName: 'Ada Lovelace' },
    );
    expect(result).toEqual({ ok: true, kind: 'operator', violations: [] });
  });

  it('does not consult any mutable voice rule', () => {
    const previous = process.env.GRADER_AI_TELLS_EXTRA;
    process.env.GRADER_AI_TELLS_EXTRA = 'example,supports';
    try {
      // The gate now blocks this text; the structural predicate still sees a
      // delivered staging unit, so history does not move when policy does.
      const text = 'PASS\nA concrete example supports the point.';
      expect(checkGraderOutput(text).ok).toBe(false);
      expect(isGraderStudentVerdictUnit(text)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.GRADER_AI_TELLS_EXTRA;
      else process.env.GRADER_AI_TELLS_EXTRA = previous;
    }
  });
});
