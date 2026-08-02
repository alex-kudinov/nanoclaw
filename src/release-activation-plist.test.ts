import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { renderPlistXml } from './release-activation-exec.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform !== 'darwin')(
  'release activation real plist integration',
  () => {
    it('renders XML that real plutil can lint and decode without field drift', () => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'nanoclaw-plist-integration-'),
      );
      roots.push(root);
      const plist = {
        Label: 'com.nanoclaw',
        KeepAlive: true,
        ProgramArguments: ['/node22/bin/node', '/release/dist/index.js'],
        EnvironmentVariables: {
          NANOCLAW_CODE_ROOT: '/release',
          NANOCLAW_EXPECTED_RELEASE_COMMIT: 'a'.repeat(40),
        },
      };

      const xml = renderPlistXml(plist, root);
      const rendered = path.join(root, 'candidate.plist');
      fs.writeFileSync(rendered, xml);
      const decoded = JSON.parse(
        execFileSync(
          '/usr/bin/plutil',
          ['-convert', 'json', '-o', '-', rendered],
          { encoding: 'utf8' },
        ),
      );

      expect(xml.subarray(0, 5).toString()).toBe('<?xml');
      expect(decoded).toEqual(plist);
    });
  },
);
