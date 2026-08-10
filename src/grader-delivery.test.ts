import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetGraderDeliveryLocks,
  deliverGraderOutput,
  formatGraderMissingOutputNotice,
  GRADER_GROUP_FOLDER,
  type GraderDeliveryDeps,
  type GraderDeliveryRequest,
} from './grader-delivery.js';
import {
  GRADER_OPERATOR_PREFIX,
  GRADER_STUDENT_ABSOLUTE_MAX_CHARS,
} from './grader-output-gate.js';

const JID = 'slack:C0GRADER';
const THREAD = '1785510996.909209';
const CLEAN_PASS =
  'PASS\n\nYour distinction between naming the observed behavior and interpreting its effect makes the feedback usable for the coach.';
const CLEAN_NO_PASS =
  'NO PASS\n\nAdd the closing-session plan, including how you will review progress and agree the next development focus.';

function makeDeps(overrides: Partial<GraderDeliveryDeps> = {}): {
  deps: GraderDeliveryDeps;
  studentPosts: Array<[string, string, string | undefined]>;
  operatorPosts: Array<[string, string, string | undefined]>;
} {
  const studentPosts: Array<[string, string, string | undefined]> = [];
  const operatorPosts: Array<[string, string, string | undefined]> = [];
  const deps: GraderDeliveryDeps = {
    hasDeliveredStudentCopy: () => false,
    postStudentCopy: async (jid, text, threadTs) => {
      studentPosts.push([jid, text, threadTs]);
      return `ts-student-${studentPosts.length}`;
    },
    postOperatorNotice: async (jid, text, threadTs) => {
      operatorPosts.push([jid, text, threadTs]);
      return `ts-operator-${operatorPosts.length}`;
    },
    ...overrides,
  };
  return { deps, studentPosts, operatorPosts };
}

// A normal grader run: the host resolved the submission before the container
// started, so a run context exists. Cases that specifically test the absence of
// one pass `submissionContext: undefined`.
function request(
  overrides: Partial<GraderDeliveryRequest> = {},
): GraderDeliveryRequest {
  return {
    jid: JID,
    threadTs: THREAD,
    text: CLEAN_PASS,
    source: 'ipc',
    submissionContext: { studentName: 'Ada Lovelace' },
    ...overrides,
  };
}

beforeEach(() => {
  _resetGraderDeliveryLocks();
});

describe('deliverGraderOutput', () => {
  it('names the grader folder once, for every caller', () => {
    expect(GRADER_GROUP_FOLDER).toBe('grader');
  });

  it('delivers clean PASS copy through the student transport, byte-for-byte', async () => {
    const { deps, studentPosts, operatorPosts } = makeDeps();

    const result = await deliverGraderOutput(request(), deps);

    expect(result.outcome).toBe('delivered');
    expect(result.kind).toBe('student');
    expect(result.violations).toEqual([]);
    // No group prefix, no rewriting: what the gate validated is what posts.
    expect(studentPosts).toEqual([[JID, CLEAN_PASS, THREAD]]);
    expect(operatorPosts).toEqual([]);
  });

  it('delivers clean NO PASS copy', async () => {
    const { deps, studentPosts } = makeDeps();

    const result = await deliverGraderOutput(
      request({ text: CLEAN_NO_PASS }),
      deps,
    );

    expect(result.outcome).toBe('delivered');
    expect(studentPosts[0][1]).toBe(CLEAN_NO_PASS);
  });

  it('delivers an operator message without requiring a prior student copy', async () => {
    const { deps, studentPosts, operatorPosts } = makeDeps();
    const text = `${GRADER_OPERATOR_PREFIX}\nRecord saved. Completion check pending.`;

    const result = await deliverGraderOutput(request({ text }), deps);

    expect(result).toMatchObject({
      outcome: 'delivered',
      kind: 'operator',
      noticePosted: false,
    });
    expect(operatorPosts).toEqual([[JID, text, THREAD]]);
    expect(studentPosts).toEqual([]);
  });

  it('routes an operator message even when a student copy already exists', async () => {
    const { deps, operatorPosts } = makeDeps({
      hasDeliveredStudentCopy: () => true,
    });
    const text = `${GRADER_OPERATOR_PREFIX}\nCertificate handoff emitted.`;

    const result = await deliverGraderOutput(request({ text }), deps);

    expect(result.outcome).toBe('delivered');
    expect(operatorPosts).toHaveLength(1);
  });

  it('blocks a second student copy in a thread that already has one', async () => {
    const { deps, studentPosts, operatorPosts } = makeDeps({
      hasDeliveredStudentCopy: () => true,
    });

    const result = await deliverGraderOutput(
      request({ text: CLEAN_NO_PASS }),
      deps,
    );

    expect(result.outcome).toBe('blocked');
    expect(result.violations).toContain('duplicate-student-message');
    expect(result.noticePosted).toBe(true);
    // The original delivery is untouched and the rejected bytes never post.
    expect(studentPosts).toEqual([]);
    expect(operatorPosts).toHaveLength(1);
    expect(operatorPosts[0][1]).not.toContain('Add the closing-session plan');
  });

  it('posts only rule codes when a message fails the gate', async () => {
    const { deps, studentPosts, operatorPosts } = makeDeps();
    const rejected =
      'PASS\nGreat job. Certificate eligibility and grading confidence are confirmed.';

    const result = await deliverGraderOutput(request({ text: rejected }), deps);

    expect(result.outcome).toBe('blocked');
    expect(result.violations).toEqual(
      expect.arrayContaining(['stock-praise-phrase', 'operator-vocabulary']),
    );
    expect(studentPosts).toEqual([]);
    const notice = operatorPosts[0][1];
    expect(notice.startsWith(GRADER_OPERATOR_PREFIX)).toBe(true);
    expect(notice).toContain('stock-praise-phrase');
    expect(notice).not.toContain('Great job');
    expect(notice).not.toContain('Certificate eligibility');
    // The notice tells the operator to recover; the one-shot container is gone.
    expect(notice).toContain('re-trigger');
  });

  it('fails closed with nothing posted when the thread is unknown', async () => {
    const { deps, studentPosts, operatorPosts } = makeDeps();

    const result = await deliverGraderOutput(
      request({ threadTs: undefined }),
      deps,
    );

    expect(result.outcome).toBe('blocked');
    expect(result.violations).toEqual(['missing-thread-context']);
    expect(result.noticePosted).toBe(false);
    expect(studentPosts).toEqual([]);
    expect(operatorPosts).toEqual([]);
  });

  it('blocks over-cap student copy rather than letting Slack split it', async () => {
    const { deps, studentPosts } = makeDeps();
    const overCap = `PASS\n\n${'a'.repeat(GRADER_STUDENT_ABSOLUTE_MAX_CHARS)}`;

    const result = await deliverGraderOutput(
      // Even an expanded-mode ceiling above the absolute cap cannot clear it.
      request({ text: overCap, studentCopyMaxChars: 10_000 }),
      deps,
    );

    expect(result.outcome).toBe('blocked');
    expect(result.violations).toContain('student-copy-too-long');
    expect(studentPosts).toEqual([]);
  });

  it('honours an expanded ceiling that stays inside the absolute cap', async () => {
    const { deps, studentPosts } = makeDeps();
    const expanded = `PASS\n\n${'Specific observation. '.repeat(100)}`;

    const blocked = await deliverGraderOutput(
      request({ text: expanded }),
      deps,
    );
    expect(blocked.outcome).toBe('blocked');

    const allowed = await deliverGraderOutput(
      request({ text: expanded, studentCopyMaxChars: 3000 }),
      deps,
    );
    expect(allowed.outcome).toBe('delivered');
    expect(studentPosts).toHaveLength(1);
  });

  it('propagates a strict-send rejection instead of reporting delivery', async () => {
    const { deps } = makeDeps({
      postStudentCopy: async () => {
        throw new Error('Slack is disconnected; grader message was not queued');
      },
    });

    await expect(deliverGraderOutput(request(), deps)).rejects.toThrow(
      /disconnected/,
    );
  });

  it('delivers exactly once when a failed send is followed by a corrected retry', async () => {
    let delivered = false;
    let attempt = 0;
    const posts: string[] = [];
    const deps: GraderDeliveryDeps = {
      hasDeliveredStudentCopy: () => delivered,
      postStudentCopy: async (_jid, text) => {
        attempt++;
        if (attempt === 1) throw new Error('slack api error');
        posts.push(text);
        delivered = true;
        return 'ts-1';
      },
      postOperatorNotice: async () => 'ts-op',
    };

    await expect(deliverGraderOutput(request(), deps)).rejects.toThrow();
    // A failure must not set delivered state, or the corrected retry deadlocks.
    const retry = await deliverGraderOutput(
      request({ text: CLEAN_NO_PASS }),
      deps,
    );
    expect(retry.outcome).toBe('delivered');

    // A third attempt now sees the delivered row and blocks.
    const third = await deliverGraderOutput(request(), deps);
    expect(third.outcome).toBe('blocked');
    expect(third.violations).toContain('duplicate-student-message');
    expect(posts).toEqual([CLEAN_NO_PASS]);
  });

  it('serializes concurrent producers so only one student copy lands', async () => {
    let delivered = false;
    const posts: string[] = [];
    const deps: GraderDeliveryDeps = {
      hasDeliveredStudentCopy: () => delivered,
      postStudentCopy: async (_jid, text) => {
        // Yield inside the critical section: without the lock the second caller
        // would read delivered=false here and post a second verdict.
        await new Promise((resolve) => setTimeout(resolve, 5));
        posts.push(text);
        delivered = true;
        return `ts-${posts.length}`;
      },
      postOperatorNotice: async () => 'ts-op',
    };

    const [first, second] = await Promise.all([
      deliverGraderOutput(request(), deps),
      deliverGraderOutput(request({ text: CLEAN_NO_PASS }), deps),
    ]);

    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(['blocked', 'delivered']);
    expect(posts).toHaveLength(1);
  });

  it('lets concurrent work in different threads proceed independently', async () => {
    const { deps, studentPosts } = makeDeps();

    await Promise.all([
      deliverGraderOutput(request({ threadTs: 'thread-a' }), deps),
      deliverGraderOutput(
        request({ threadTs: 'thread-b', text: CLEAN_NO_PASS }),
        deps,
      ),
    ]);

    expect(studentPosts.map((p) => p[2]).sort()).toEqual([
      'thread-a',
      'thread-b',
    ]);
  });

  it('keeps the queue moving after a rejected predecessor', async () => {
    let first = true;
    const posts: string[] = [];
    const deps: GraderDeliveryDeps = {
      hasDeliveredStudentCopy: () => false,
      postStudentCopy: async (_jid, text) => {
        if (first) {
          first = false;
          throw new Error('slack api error');
        }
        posts.push(text);
        return 'ts-2';
      },
      postOperatorNotice: async () => 'ts-op',
    };

    const failing = deliverGraderOutput(request(), deps);
    const following = deliverGraderOutput(
      request({ text: CLEAN_NO_PASS }),
      deps,
    );

    await expect(failing).rejects.toThrow();
    await expect(following).resolves.toMatchObject({ outcome: 'delivered' });
    expect(posts).toEqual([CLEAN_NO_PASS]);
  });

  it('re-checks the precondition inside the lock and skips when it no longer holds', async () => {
    const { deps, operatorPosts } = makeDeps();

    const result = await deliverGraderOutput(
      request({
        text: formatGraderMissingOutputNotice(),
        source: 'final-text',
        precondition: () => false,
      }),
      deps,
    );

    expect(result.outcome).toBe('skipped');
    expect(operatorPosts).toEqual([]);
  });

  it('loses the missing-output notice to a message that lands during the drain', async () => {
    let threadHasOutput = false;
    const operatorPosts: string[] = [];
    const deps: GraderDeliveryDeps = {
      hasDeliveredStudentCopy: () => threadHasOutput,
      postStudentCopy: async (_jid, text) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        threadHasOutput = true;
        operatorPosts.push(text);
        return 'ts-1';
      },
      postOperatorNotice: async (_jid, text) => {
        operatorPosts.push(text);
        return 'ts-op';
      },
    };

    const [real, notice] = await Promise.all([
      deliverGraderOutput(request(), deps),
      deliverGraderOutput(
        request({
          text: formatGraderMissingOutputNotice(),
          source: 'final-text',
          precondition: () => !threadHasOutput,
        }),
        deps,
      ),
    ]);

    expect(real.outcome).toBe('delivered');
    expect(notice.outcome).toBe('skipped');
    expect(operatorPosts).toEqual([CLEAN_PASS]);
  });
});

describe('formatGraderMissingOutputNotice', () => {
  it('is fixed, operator-marked, and carries no model bytes', () => {
    const notice = formatGraderMissingOutputNotice();

    expect(notice.startsWith(GRADER_OPERATOR_PREFIX)).toBe(true);
    expect(notice).toContain('re-trigger');
    // Classified as operator-only by the gate, so it can never be mistaken for
    // a staging unit and can never set delivery state.
    expect(notice.split('\n')[0]).toBe(GRADER_OPERATOR_PREFIX);
  });

  it('is delivered through the operator transport, never the student one', async () => {
    const { deps, studentPosts, operatorPosts } = makeDeps();

    const result = await deliverGraderOutput(
      request({
        text: formatGraderMissingOutputNotice(),
        source: 'final-text',
      }),
      deps,
    );

    expect(result.kind).toBe('operator');
    expect(studentPosts).toEqual([]);
    expect(operatorPosts).toHaveLength(1);
  });
});

describe('submission context', () => {
  it('refuses student copy when the host has no run context', async () => {
    const { deps, studentPosts, operatorPosts } = makeDeps();

    const result = await deliverGraderOutput(
      request({ submissionContext: undefined }),
      deps,
    );

    expect(result.outcome).toBe('blocked');
    expect(result.kind).toBe('student');
    expect(result.violations).toEqual(['missing-submission-context']);
    expect(studentPosts).toEqual([]);
    expect(operatorPosts).toHaveLength(1);
    expect(operatorPosts[0][1]).toContain('missing-submission-context');
    expect(operatorPosts[0][1]).toContain(
      'post a new submission root with the student name on line 1',
    );
    expect(operatorPosts[0][1]).not.toContain('re-trigger the grading run');
  });

  it('never echoes the refused copy back into the operator notice', async () => {
    const { deps, operatorPosts } = makeDeps();
    const text =
      'PASS\n\nA specific observation the operator must not see twice.';

    await deliverGraderOutput(
      request({ text, submissionContext: undefined }),
      deps,
    );

    expect(operatorPosts[0][1]).not.toContain('specific observation');
  });

  it('still delivers operator-only output without a run context', async () => {
    const { deps, studentPosts, operatorPosts } = makeDeps();

    const result = await deliverGraderOutput(
      request({
        text: `${GRADER_OPERATOR_PREFIX}\nHolding: the assignment could not be resolved.`,
        submissionContext: undefined,
      }),
      deps,
    );

    expect(result.outcome).toBe('delivered');
    expect(result.kind).toBe('operator');
    expect(studentPosts).toEqual([]);
    expect(operatorPosts).toHaveLength(1);
  });

  it('reports the context failure alongside any voice failures', async () => {
    const { deps } = makeDeps();

    const result = await deliverGraderOutput(
      request({ text: 'Great job on this one.', submissionContext: undefined }),
      deps,
    );

    expect(result.violations[0]).toBe('missing-submission-context');
    expect(result.violations).toContain('invalid-verdict-line');
    expect(result.violations).toContain('stock-praise-phrase');
  });

  it('applies the resolved student name to the salutation rule', async () => {
    const { deps, studentPosts, operatorPosts } = makeDeps();

    const blocked = await deliverGraderOutput(
      request({
        text: 'PASS\n\nHi Sarah, your reading of the recording is specific.',
      }),
      deps,
    );
    expect(blocked.outcome).toBe('blocked');
    expect(blocked.violations).toEqual(['salutation-name-mismatch']);
    expect(studentPosts).toEqual([]);

    const delivered = await deliverGraderOutput(
      request({
        text: 'PASS\n\nHi Ada, your reading of the recording is specific.',
      }),
      deps,
    );
    expect(delivered.outcome).toBe('delivered');
    expect(studentPosts).toHaveLength(1);
    expect(operatorPosts).toHaveLength(1);
  });
});

describe('policy drift', () => {
  it('does not consult the voice rule set to decide prior delivery', async () => {
    // The boundary asks the host predicate, which is structural. Tightening a
    // rule (simulated here by an env-driven phrase extension) must not make a
    // delivered copy look undelivered and permit a second student post.
    const hasDelivered = vi.fn(() => true);
    const { deps, studentPosts } = makeDeps({
      hasDeliveredStudentCopy: hasDelivered,
    });
    const previous = process.env.GRADER_AI_TELLS_EXTRA;
    process.env.GRADER_AI_TELLS_EXTRA = 'distinction';
    try {
      const result = await deliverGraderOutput(request(), deps);
      expect(result.outcome).toBe('blocked');
      expect(result.violations).toContain('duplicate-student-message');
      expect(studentPosts).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.GRADER_AI_TELLS_EXTRA;
      else process.env.GRADER_AI_TELLS_EXTRA = previous;
    }
    expect(hasDelivered).toHaveBeenCalledWith(JID, THREAD);
  });
});
