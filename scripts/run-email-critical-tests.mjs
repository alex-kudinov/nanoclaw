#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { realpathSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export const EMAIL_CRITICAL_TEST_ARGS = [
  'run',
  'src/approved-email-execution.test.ts',
  'src/approval-recap.test.ts',
  'src/approved-send-handoff.test.ts',
  'src/channels/slack.test.ts',
  'src/classify-ipc-handlers.test.ts',
  'src/db.test.ts',
  'src/email-content-guard.test.ts',
  'src/email-delivery-path.test.ts',
  'src/email-transport-canary.test.ts',
  'src/gmail-ipc-handlers.test.ts',
  'src/gmail-parser.test.ts',
  'src/host-router.test.ts',
  'src/ipc-gmail-auth.test.ts',
  'src/ipc-handoff-echo.test.ts',
  'src/proposal-approved-email.test.ts',
  'src/proposal-followup.test.ts',
  'src/routing.test.ts',
  'src/send-watchdog.test.ts',
  'src/slack-approval.test.ts',
  '--pool=forks',
  '--no-file-parallelism',
  '--maxWorkers=1',
];

export function runEmailCriticalTests({ root = process.cwd() } = {}) {
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules', 'vitest', 'vitest.mjs'),
      ...EMAIL_CRITICAL_TEST_ARGS,
    ],
    { cwd: root, stdio: 'inherit' },
  );
  const runnerRoot = path.join(root, 'container', 'agent-runner');
  execFileSync('npm', ['run', 'build'], {
    cwd: runnerRoot,
    stdio: 'inherit',
  });
  execFileSync('npm', ['test'], {
    cwd: runnerRoot,
    stdio: 'inherit',
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  runEmailCriticalTests();
}
