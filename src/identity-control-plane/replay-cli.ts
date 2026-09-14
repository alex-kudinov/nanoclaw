import { runD0Replay } from './replay.js';

const report = runD0Replay();
if (report.proofPassed !== 12 || report.failurePassed !== 27) {
  process.stderr.write(`${JSON.stringify(report)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
