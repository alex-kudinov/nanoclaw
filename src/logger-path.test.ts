import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveJsonlPath } from './logger-path.js';

const roots: string[] = [];

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-logger-path-'));
  roots.push(root);
  return root;
}

function markReleaseBundle(root: string): void {
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'RELEASE.json'), '{}\n');
  fs.writeFileSync(path.join(root, 'FILES.sha256'), 'inventory\n');
  fs.writeFileSync(path.join(root, 'dist', 'release-manifest.json'), '{}\n');
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('structured logger path', () => {
  it('uses the operational working directory by default', () => {
    const root = temporaryRoot();
    expect(resolveJsonlPath({}, root)).toBe(
      path.join(root, 'logs', 'nanoclaw.jsonl'),
    );
  });

  it('disables the implicit sink at an immutable release root', () => {
    const root = temporaryRoot();
    markReleaseBundle(root);
    expect(resolveJsonlPath({}, root)).toBe('');
  });

  it('disables the implicit sink from a directory inside a release', () => {
    const root = temporaryRoot();
    markReleaseBundle(root);
    expect(resolveJsonlPath({}, path.join(root, 'dist'))).toBe('');
  });

  it('honors an explicit operational sink for a release-root diagnostic', () => {
    const root = temporaryRoot();
    markReleaseBundle(root);
    const sink = path.join(temporaryRoot(), 'nanoclaw.jsonl');
    expect(resolveJsonlPath({ NANOCLAW_JSONL_PATH: sink }, root)).toBe(sink);
  });
});
