import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const producerModule = 'company-work-outcome-quality-assessment';

describe('Company Work outcome-quality assessment source boundary', () => {
  it('is absent from daemon, IPC, scheduler, and container composition', () => {
    for (const file of [
      'src/index.ts',
      'src/ipc.ts',
      'src/task-scheduler.ts',
      'src/container-runner.ts',
    ]) {
      expect(fs.readFileSync(file, 'utf8'), file).not.toContain(producerModule);
    }
  });

  it('does not import Gmail, Slack, SQLite, or agent routing capabilities', () => {
    const implementation = fs.readFileSync(
      'src/company-work-outcome-quality-assessment.ts',
      'utf8',
    );
    const cli = fs.readFileSync(
      'src/company-work-outcome-quality-assessment-cli.ts',
      'utf8',
    );
    const imports = `${implementation}\n${cli}`
      .split('\n')
      .filter((line) => /^import\b/.test(line))
      .join('\n');
    expect(imports).not.toMatch(
      /gmail|slack|\.\/db\.js|router|container|ipc|send-message/i,
    );
  });

  it('is exposed only as an explicit standalone package command', () => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.['company-work:assess-outcome']).toBe(
      'node dist/company-work-outcome-quality-assessment-cli.js',
    );
    expect(packageJson.scripts?.start).not.toContain(producerModule);
  });
});
