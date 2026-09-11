import { spawn } from 'node:child_process';

import { describe, expect, it } from 'vitest';

describe('website checkout TEST service CLI', () => {
  it('sanitizes every startup failure without exposing paths or exception text', async () => {
    const secretPath = `/private/runtime-secret-${Date.now()}.json`;
    const result = await new Promise<{
      code: number | null;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          'scripts/run-website-checkout-test-service.ts',
          '--config',
          secretPath,
        ],
        {
          cwd: process.cwd(),
          env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += String(chunk)));
      child.stderr.on('data', (chunk) => (stderr += String(chunk)));
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, stdout, stderr }));
    });
    expect(result).toEqual({
      code: 1,
      stdout: '',
      stderr: 'ERROR website-checkout-test code=startup_failed\n',
    });
    expect(JSON.stringify(result)).not.toContain(secretPath);
  });
});
