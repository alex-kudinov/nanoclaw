import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Set the sink path BEFORE logger.js is imported (it reads the env at module
// init). The logger is imported dynamically inside the test for the same reason.
const tmp = path.join(os.tmpdir(), `nanoclaw-logger-test-${process.pid}.jsonl`);

async function waitForLine(file: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const line = content.split('\n').find((l) => l.trim());
      if (line) return line;
    } catch {
      // not written yet
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('timed out waiting for a JSON line');
}

describe('logger JSON sink', () => {
  beforeAll(() => {
    process.env.NANOCLAW_JSONL_PATH = tmp;
    try {
      fs.rmSync(tmp);
    } catch {
      /* fresh */
    }
  });
  afterAll(() => {
    try {
      fs.rmSync(tmp);
    } catch {
      /* gone */
    }
  });

  it('writes parseable JSON lines carrying level, msg, and bound fields', async () => {
    const { logger } = await import('./logger.js');
    logger.error({ err: new Error('boom'), group: 'sales' }, 'test-error');
    const obj = JSON.parse(await waitForLine(tmp));
    expect(obj.level).toBe(50);
    expect(obj.msg).toBe('test-error');
    expect(obj.group).toBe('sales');
    expect(obj.err.type).toBeDefined();
    expect(obj.err.message).toBe('boom');
  });
});
