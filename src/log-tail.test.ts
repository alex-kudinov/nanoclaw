import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { LogTail, createOutputParser } from './log-tail.js';

describe('LogTail', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logtail-'));
    file = path.join(dir, 'out.log');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads appended bytes across polls and tracks offset', () => {
    const chunks: string[] = [];
    const tail = new LogTail(file, (c) => chunks.push(c), 10);
    fs.writeFileSync(file, 'hello ');
    tail.start(0);
    fs.appendFileSync(file, 'world');
    tail.drainNow();
    tail.stop();
    expect(chunks.join('')).toBe('hello world');
    expect(tail.getOffset()).toBe(Buffer.byteLength('hello world'));
  });

  it('resumes from a given offset (adoption replay boundary)', () => {
    fs.writeFileSync(file, 'already-routed|fresh');
    const chunks: string[] = [];
    const tail = new LogTail(file, (c) => chunks.push(c), 10);
    tail.start(Buffer.byteLength('already-routed|'));
    tail.drainNow();
    tail.stop();
    expect(chunks.join('')).toBe('fresh');
  });

  it('survives a consumer that throws', () => {
    fs.writeFileSync(file, 'boom');
    const tail = new LogTail(
      file,
      () => {
        throw new Error('consumer bug');
      },
      10,
    );
    tail.start(0);
    tail.drainNow();
    tail.stop();
    expect(tail.getOffset()).toBe(4); // still consumed
  });
});

describe('createOutputParser', () => {
  const START = '---NANOCLAW_OUTPUT_START---';
  const END = '---NANOCLAW_OUTPUT_END---';

  it('parses marker pairs split across chunks and strips heartbeats', () => {
    const outputs: unknown[] = [];
    let activity = 0;
    const parser = createOutputParser({
      onOutput: (o) => outputs.push(o),
      onActivity: () => activity++,
    });
    parser.feed(`---NANOCLAW_HEARTBEAT---\n${START}\n{"status":"suc`);
    parser.feed(`cess","result":"hi"}\n${END}\n`);
    expect(outputs).toEqual([{ status: 'success', result: 'hi' }]);
    expect(activity).toBe(2);
    expect(parser.pendingBytes()).toBeLessThan(10);
  });

  it('tolerates malformed JSON without dying', () => {
    const outputs: unknown[] = [];
    const parser = createOutputParser({ onOutput: (o) => outputs.push(o) });
    parser.feed(`${START}\nnot-json\n${END}\n${START}\n{"ok":1}\n${END}\n`);
    expect(outputs).toEqual([{ ok: 1 }]);
  });
});
