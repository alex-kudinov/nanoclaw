import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmpDir = '';

vi.mock('./config.js', () => ({ DATA_DIR: '' }));

import * as configMod from './config.js';
import { writeHostMessage } from './ipc-writer.js';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipc-writer-'));
  (configMod as Record<string, unknown>).DATA_DIR = tmpDir;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('writeHostMessage', () => {
  it('creates a JSON file in ipc/{group}/messages/', () => {
    writeHostMessage('chief', { type: 'message', text: 'hello' });
    const dir = path.join(tmpDir, 'ipc', 'chief', 'messages');
    const files = fs.readdirSync(dir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^classify-\d+-[a-z0-9]+\.json$/);
    const body = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf-8'));
    expect(body).toEqual({ type: 'message', text: 'hello' });
  });

  it('throws on empty groupFolder', () => {
    expect(() => writeHostMessage('', { type: 'test' })).toThrow(
      /non-empty string/,
    );
  });

  it('uses atomic write pattern (tmp then rename)', () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync');
    const renameSpy = vi.spyOn(fs, 'renameSync');

    writeHostMessage('inbox', { type: 'test' });

    const writeCall = writeSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('.tmp'),
    );
    expect(writeCall).toBeDefined();

    const renameCall = renameSpy.mock.calls.find(
      (c) =>
        typeof c[0] === 'string' &&
        (c[0] as string).endsWith('.tmp') &&
        typeof c[1] === 'string' &&
        (c[1] as string).endsWith('.json'),
    );
    expect(renameCall).toBeDefined();

    writeSpy.mockRestore();
    renameSpy.mockRestore();
  });

  it('retries after mkdirSync on ENOENT from writeFileSync', () => {
    const mkdirSpy = vi.spyOn(fs, 'mkdirSync');
    const originalWrite = fs.writeFileSync.bind(fs);
    let firstCall = true;

    const writeSpy = vi
      .spyOn(fs, 'writeFileSync')
      .mockImplementation((...args: Parameters<typeof fs.writeFileSync>) => {
        if (
          firstCall &&
          typeof args[0] === 'string' &&
          (args[0] as string).endsWith('.tmp')
        ) {
          firstCall = false;
          const err = new Error('ENOENT') as NodeJS.ErrnoException;
          err.code = 'ENOENT';
          throw err;
        }
        return originalWrite(...args);
      });

    writeHostMessage('sales', { type: 'retry-test' });

    // mkdirSync called twice: once in try, once in catch retry
    const mkdirCalls = mkdirSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('sales'),
    );
    expect(mkdirCalls.length).toBe(2);

    // File was ultimately written
    const dir = path.join(tmpDir, 'ipc', 'sales', 'messages');
    const files = fs.readdirSync(dir);
    expect(files.length).toBe(1);

    writeSpy.mockRestore();
    mkdirSpy.mockRestore();
  });

  it('throws non-retryable errors immediately', () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      const err = new Error('EACCES') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      throw err;
    });

    expect(() => writeHostMessage('chief', { type: 'fail' })).toThrow('EACCES');

    writeSpy.mockRestore();
  });
});
