import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('bounded healer Company Work release wiring', () => {
  it('binds the config and fast-healer activators into the immutable release', () => {
    const builder = fs.readFileSync('scripts/build-release.mjs', 'utf8');
    expect(builder).toContain("'scripts/set-company-healer-work.mjs'");
    expect(builder).toContain("'scripts/activate-healer-release.mjs'");
  });

  it('requires release verification before a direct healer mode runs', () => {
    const entry = fs.readFileSync('src/healer/index.ts', 'utf8');
    expect(entry).toContain('verifyRuntimeRelease({');
    expect(entry).toContain('NANOCLAW_EXPECTED_RELEASE_COMMIT');
  });

  it('keeps activation exact-host, rollback-backed, and one-cycle verified', () => {
    const source = fs.readFileSync(
      'scripts/activate-healer-release.mjs',
      'utf8',
    );
    expect(source).toContain("installed.Label !== 'com.nanoclaw.healer.fast'");
    expect(source).toContain("installed.ProgramArguments[2] !== 'fast'");
    expect(source).toContain("values.get('--confirm-host') !== os.hostname()");
    expect(source).toContain('fs.copyFileSync(plist, rollback');
    expect(source).toContain('after.runs > before.runs');
    expect(source).toContain('after.lastExit !== 0');
  });
});
