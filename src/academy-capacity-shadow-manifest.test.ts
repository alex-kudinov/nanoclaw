import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildAcademyCapacityShadowManifest,
  writePrivateAcademyCapacityShadowManifest,
} from '../scripts/build-academy-capacity-shadow-manifest.mjs';
import {
  manifestSha256,
  sha256,
  validateAcademyCapacityShadowManifest,
} from '../scripts/populate-academy-capacity-shadow.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

function rosterFixture() {
  const accRows: Array<Record<string, string>> = [];
  const mcsRows: Array<Record<string, string>> = [];
  for (let index = 1; index <= 10; index += 1)
    accRows.push({
      Email: `acc-module-${index}@example.test`,
      Name: `ACC Module ${index}`,
      'Full Program': '',
      M1: '2026-09-01',
      Refunded: '',
      Cohort: '2026-09',
    });
  for (let index = 1; index <= 11; index += 1)
    accRows.push({
      Email: `acc-full-${index}@example.test`,
      Name: `ACC Full ${index}`,
      'Full Program': '2026-09-01',
      M1: '',
      Refunded: '',
      Cohort: '2026-09',
    });
  const addMcs = (count: number, cohort: string, prefix: string) => {
    for (let index = 1; index <= count; index += 1)
      mcsRows.push({
        Email: `${prefix}-${index}@example.test`,
        Name: `${prefix} ${index}`,
        'MCS Practicum': '2026-09-01',
        Refunded: '',
        Cohort: cohort,
      });
  };
  addMcs(5, 'September 2026 – Thursday', 'mcs-thu');
  addMcs(13, 'September 2026 – Friday', 'mcs-fri');
  addMcs(1, 'January 2027 – Thursday', 'mcs-jan-thu');
  return { accRows, mcsRows };
}

function privateJson(directory: string, name: string, value: unknown) {
  const file = path.join(directory, name);
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return file;
}

describe('Academy capacity private shadow manifest builder', () => {
  it('derives the exact authorized aggregate without persisting source IDs', () => {
    const { accRows, mcsRows } = rosterFixture();
    const held = sha256('acc-module-1@example.test');
    const alias = sha256('acc-full-1@example.test');
    const allow = [
      alias,
      sha256('acc-full-2@example.test'),
      sha256('mcs-fri-1@example.test'),
    ];
    const manifest = buildAcademyCapacityShadowManifest({
      accRows,
      mcsRows,
      allowCreatePartySha256: allow,
      heldFundingSha256: held,
      aliasSha256: alias,
    }) as any;
    expect(validateAcademyCapacityShadowManifest(manifest)).toEqual([]);
    expect(manifest.participants).toHaveLength(40);
    expect(
      manifest.participants.filter(
        (entry: any) => entry.financial_classification === 'held',
      ),
    ).toHaveLength(1);
    expect(
      manifest.participants.filter((entry: any) => entry.allow_create_party),
    ).toHaveLength(3);
    expect(manifest.exceptions).toHaveLength(3);
    expect(manifest.delivery_blocks).toHaveLength(5);
    expect(
      manifest.delivery_blocks.find(
        (entry: any) => entry.delivery_block_key === 'mcs-practicum:2026-09-24',
      ).ends_at,
    ).toBe('2026-12-18T01:00:00.000Z');
    expect(
      manifest.delivery_blocks.find(
        (entry: any) => entry.delivery_block_key === 'mcs-practicum:2026-09-25',
      ).ends_at,
    ).toBe('2026-12-18T17:00:00.000Z');
  });

  it('writes a new mode-0600 manifest and returns only aggregate receipt fields', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'academy-shadow-builder-'),
    );
    temporaryDirectories.push(directory);
    const { accRows, mcsRows } = rosterFixture();
    const held = sha256('acc-module-1@example.test');
    const alias = sha256('acc-full-1@example.test');
    const allow = [
      alias,
      sha256('acc-full-2@example.test'),
      sha256('mcs-fri-1@example.test'),
    ];
    const output = path.join(directory, 'private', 'manifest.json');
    const result = writePrivateAcademyCapacityShadowManifest({
      accRoster: privateJson(directory, 'acc.json', {
        data: { rows: accRows },
      }),
      mcsRoster: privateJson(directory, 'mcs.json', {
        data: { rows: mcsRows },
      }),
      output,
      allowCreatePartySha256: allow,
      heldFundingSha256: held,
      aliasSha256: alias,
    }) as any;
    expect(result).toMatchObject({
      ok: true,
      delivery_blocks: 5,
      participants: 40,
      create_party_allowances: 3,
      held_financial_classifications: 1,
      exceptions: 3,
    });
    expect(Object.keys(result).sort()).toEqual(
      [
        'create_party_allowances',
        'delivery_blocks',
        'exceptions',
        'held_financial_classifications',
        'manifest_sha256',
        'ok',
        'output',
        'participants',
        'source_evidence_sha256',
      ].sort(),
    );
    expect(fs.statSync(output).mode & 0o077).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
    expect(result.manifest_sha256).toBe(manifestSha256(manifest));
  });

  it('refuses an existing output or Party allowance outside the population', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'academy-shadow-builder-'),
    );
    temporaryDirectories.push(directory);
    const { accRows, mcsRows } = rosterFixture();
    const held = sha256('acc-module-1@example.test');
    const alias = sha256('acc-full-1@example.test');
    expect(() =>
      buildAcademyCapacityShadowManifest({
        accRows,
        mcsRows,
        allowCreatePartySha256: [
          alias,
          sha256('missing@example.test'),
          sha256('mcs-fri-1@example.test'),
        ],
        heldFundingSha256: held,
        aliasSha256: alias,
      }),
    ).toThrow('Party creation allowance is outside population');

    const output = path.join(directory, 'already-exists.json');
    fs.writeFileSync(output, '{}', { mode: 0o600 });
    expect(() =>
      writePrivateAcademyCapacityShadowManifest({
        accRoster: privateJson(directory, 'acc.json', {
          data: { rows: accRows },
        }),
        mcsRoster: privateJson(directory, 'mcs.json', {
          data: { rows: mcsRows },
        }),
        output,
        allowCreatePartySha256: [
          alias,
          sha256('acc-full-2@example.test'),
          sha256('mcs-fri-1@example.test'),
        ],
        heldFundingSha256: held,
        aliasSha256: alias,
      }),
    ).toThrow('refusing to overwrite private manifest');
  });
});
