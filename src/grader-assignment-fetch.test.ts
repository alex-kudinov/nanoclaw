import { describe, expect, it } from 'vitest';

import {
  CONTENT_MAX_CHARS,
  fetchLiveAssignment,
  RESPONSE_MAX_BYTES,
  type AssignmentFetchDeps,
} from './grader-assignment-fetch.js';
import type { HeartbeatAssignmentRef } from './grader-submission-context.js';

const REF: HeartbeatAssignmentRef = {
  workspace: 'main',
  courseId: 'abd312e4-b01a-4718-8918-f79d081753c0',
  lessonId: '39fb7b36-4bda-4287-8c26-ef965c47bc44',
  canonicalTitle: 'Module 4 Assignment Part 2: Session Analysis of Recording A',
};

const BODY = 'Watch Recording A and complete the observation form.';

function payload(overrides: Record<string, unknown> = {}) {
  return {
    id: REF.lessonId,
    title: REF.canonicalTitle,
    content: BODY,
    ...overrides,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function deps(
  respond: (url: string, init?: RequestInit) => Promise<Response>,
  overrides: Partial<AssignmentFetchDeps> = {},
): AssignmentFetchDeps {
  return {
    readSecret: (key) => (key === 'HEARTBEAT_API_KEY' ? 'hb-token' : undefined),
    fetchImpl: ((url: string, init?: RequestInit) =>
      respond(url, init)) as unknown as typeof fetch,
    now: () => new Date('2026-08-09T21:40:00.000Z'),
    ...overrides,
  };
}

describe('fetchLiveAssignment', () => {
  it('returns the live assignment with a hash and fetch time', async () => {
    const result = await fetchLiveAssignment(
      REF,
      deps(async () => jsonResponse(payload())),
    );

    expect(result).toEqual({
      ok: true,
      assignment: {
        lessonId: REF.lessonId,
        canonicalTitle: REF.canonicalTitle,
        content: BODY,
        fetchedAt: '2026-08-09T21:40:00.000Z',
        contentHash: expect.stringMatching(/^[0-9a-f]{16}$/),
        contentChars: BODY.length,
      },
    });
  });

  it('reads the credential for the registered workspace and sends it as a bearer token', async () => {
    const seen: Array<[string, RequestInit | undefined]> = [];
    const readKeys: string[] = [];
    await fetchLiveAssignment(REF, {
      ...deps(async (url, init) => {
        seen.push([url, init]);
        return jsonResponse(payload());
      }),
      readSecret: (key) => {
        readKeys.push(key);
        return 'hb-token';
      },
    });

    expect(readKeys).toEqual(['HEARTBEAT_API_KEY']);
    expect(seen[0][0]).toBe(
      `https://api.heartbeat.chat/v0/lessons/${REF.lessonId}`,
    );
    const headers = seen[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer hb-token');
  });

  it('reads the circle workspace credential when the registry says so', async () => {
    const readKeys: string[] = [];
    await fetchLiveAssignment(
      { ...REF, workspace: 'circle' },
      {
        ...deps(async () => jsonResponse(payload())),
        readSecret: (key) => {
          readKeys.push(key);
          return 'circle-token';
        },
      },
    );
    expect(readKeys).toEqual(['HEARTBEAT_CIRCLE_API_KEY']);
  });

  it('never reaches the network for a lesson id outside the allowlist shape', async () => {
    let called = false;
    const result = await fetchLiveAssignment(
      { ...REF, lessonId: '../../../admin' },
      deps(async () => {
        called = true;
        return jsonResponse(payload());
      }),
    );

    expect(result).toEqual({ ok: false, code: 'assignment-not-allowlisted' });
    expect(called).toBe(false);
  });

  it('fails closed when the credential is missing', async () => {
    let called = false;
    const result = await fetchLiveAssignment(REF, {
      readSecret: () => undefined,
      fetchImpl: (async () => {
        called = true;
        return jsonResponse(payload());
      }) as unknown as typeof fetch,
    });

    expect(result).toEqual({ ok: false, code: 'heartbeat-credential-missing' });
    expect(called).toBe(false);
  });

  it('fails closed for an unknown workspace', async () => {
    const result = await fetchLiveAssignment(
      { ...REF, workspace: 'staging' },
      deps(async () => jsonResponse(payload())),
    );
    expect(result).toEqual({ ok: false, code: 'heartbeat-credential-missing' });
  });

  it('fails closed on a non-success status', async () => {
    const result = await fetchLiveAssignment(
      REF,
      deps(async () => jsonResponse({ error: 'nope' }, { status: 404 })),
    );
    expect(result).toEqual({ ok: false, code: 'heartbeat-request-failed' });
  });

  it('fails closed on a timeout or transport error', async () => {
    const result = await fetchLiveAssignment(
      REF,
      deps(async () => {
        throw new DOMException('The operation was aborted', 'TimeoutError');
      }),
    );
    expect(result).toEqual({ ok: false, code: 'heartbeat-request-failed' });
  });

  it('rejects a body whose declared length exceeds the transport cap', async () => {
    const result = await fetchLiveAssignment(
      REF,
      deps(async () =>
        jsonResponse(payload(), {
          headers: { 'content-length': String(RESPONSE_MAX_BYTES + 1) },
        }),
      ),
    );
    expect(result).toEqual({ ok: false, code: 'heartbeat-response-invalid' });
  });

  it('rejects a body that streams past the transport cap without declaring it', async () => {
    const oversized = 'x'.repeat(RESPONSE_MAX_BYTES + 1024);
    const result = await fetchLiveAssignment(
      REF,
      deps(async () => new Response(oversized, { status: 200 })),
    );
    expect(result).toEqual({ ok: false, code: 'heartbeat-response-invalid' });
  });

  it('rejects content past the content cap even when the body fits', async () => {
    const result = await fetchLiveAssignment(
      REF,
      deps(async () =>
        jsonResponse(payload({ content: 'y'.repeat(CONTENT_MAX_CHARS + 1) })),
      ),
    );
    expect(result).toEqual({ ok: false, code: 'heartbeat-response-invalid' });
  });

  it('rejects a response that is not JSON', async () => {
    const result = await fetchLiveAssignment(
      REF,
      deps(async () => jsonResponse('<html>login</html>')),
    );
    expect(result).toEqual({ ok: false, code: 'heartbeat-response-invalid' });
  });

  it('rejects a JSON response that is not an object', async () => {
    for (const body of ['[]', '"text"', 'null']) {
      const result = await fetchLiveAssignment(
        REF,
        deps(async () => jsonResponse(body)),
      );
      expect(result).toEqual({ ok: false, code: 'heartbeat-response-invalid' });
    }
  });

  it('rejects a lesson whose returned id is not the requested one', async () => {
    const result = await fetchLiveAssignment(
      REF,
      deps(async () =>
        jsonResponse(payload({ id: 'c7dde04f-3f8b-49b2-8d30-852f49456145' })),
      ),
    );
    expect(result).toEqual({ ok: false, code: 'heartbeat-lesson-mismatch' });
  });

  it('rejects a lesson whose id field is missing entirely', async () => {
    const { id: _id, ...withoutId } = payload();
    const result = await fetchLiveAssignment(
      REF,
      deps(async () => jsonResponse(withoutId)),
    );
    expect(result).toEqual({ ok: false, code: 'heartbeat-lesson-mismatch' });
  });

  it('rejects a renamed lesson', async () => {
    const result = await fetchLiveAssignment(
      REF,
      deps(async () => jsonResponse(payload({ title: 'Module 4 Assignment' }))),
    );
    expect(result).toEqual({ ok: false, code: 'heartbeat-lesson-mismatch' });
  });

  it('accepts a title that differs only by surrounding whitespace or NFKC form', async () => {
    const result = await fetchLiveAssignment(
      REF,
      deps(async () =>
        jsonResponse(payload({ title: `  ${REF.canonicalTitle} ` })),
      ),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects blank or missing content', async () => {
    for (const content of ['', '   \n\t', undefined, 42]) {
      const result = await fetchLiveAssignment(
        REF,
        deps(async () => jsonResponse(payload({ content }))),
      );
      expect(result).toEqual({ ok: false, code: 'heartbeat-content-empty' });
    }
  });

  it('reads lesson fields nested under data', async () => {
    const result = await fetchLiveAssignment(
      REF,
      deps(async () => jsonResponse({ data: payload() })),
    );
    expect(result).toMatchObject({ ok: true });
  });

  it('returns only a code on failure, never response content', async () => {
    const result = await fetchLiveAssignment(
      REF,
      deps(async () =>
        jsonResponse(
          payload({ id: 'wrong', content: 'SECRET ASSIGNMENT TEXT' }),
        ),
      ),
    );
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(Object.keys(result)).toEqual(['ok', 'code']);
  });

  it('hashes content stably and distinctly', async () => {
    const first = await fetchLiveAssignment(
      REF,
      deps(async () => jsonResponse(payload())),
    );
    const same = await fetchLiveAssignment(
      REF,
      deps(async () => jsonResponse(payload())),
    );
    const other = await fetchLiveAssignment(
      REF,
      deps(async () => jsonResponse(payload({ content: `${BODY} Revised.` }))),
    );

    expect(first.ok && same.ok && other.ok).toBe(true);
    if (!first.ok || !same.ok || !other.ok) return;
    expect(first.assignment.contentHash).toBe(same.assignment.contentHash);
    expect(first.assignment.contentHash).not.toBe(other.assignment.contentHash);
  });
});
