import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  CapabilityManifestError,
  MANIFEST_CREDENTIAL_FAMILIES,
  TRACKED_AGENT_FOLDERS,
  assertCapabilityCatalogForGroups,
  capabilityManifestFingerprint,
  capabilityManifestIsEnforced,
  getCapabilityManifestStatus,
  loadCapabilityCatalog,
  manifestAllowsHostOperation,
  parseContainerMemoryMb,
  projectGroupCapabilities,
  resolveCapabilityManifestConfig,
  validateCapabilityManifest,
} from './capability-manifest.js';
import type { RegisteredGroup } from './types.js';

const cleanup: string[] = [];
const defaults = {
  model: 'sonnet',
  timeoutMs: 1_800_000,
  spawnTimeoutMs: 90_000,
  idleTimeoutMs: 1_200_000,
  memoryMb: 768,
  cpus: 2,
};

function group(
  folder: string,
  mounts: RegisteredGroup['containerConfig'] = {},
) {
  return {
    name: folder,
    folder,
    trigger: '@Gru',
    added_at: '2026-08-16T00:00:00Z',
    containerConfig: mounts,
  } satisfies RegisteredGroup;
}

afterEach(() => {
  for (const dir of cleanup.splice(0)) fs.rmSync(dir, { recursive: true });
});

describe('capability manifests', () => {
  it('loads one strict manifest for every tracked operative group', () => {
    const catalog = loadCapabilityCatalog(process.cwd());
    expect(catalog.map((manifest) => manifest.agent.folder)).toEqual([
      ...TRACKED_AGENT_FOLDERS,
    ]);
    expect(getCapabilityManifestStatus(process.cwd())).toMatchObject({
      trackedManifestCount: 17,
      validManifestCount: 17,
      invalidManifestCount: 0,
    });
    expect(
      catalog.find((manifest) => manifest.agent.folder === 'booking')
        ?.credentials.families,
    ).toEqual(['business_db']);
    const operativeFolders = fs
      .readdirSync(path.join(process.cwd(), 'groups'), { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !['_TEMPLATE', 'global'].includes(entry.name) &&
          fs.existsSync(
            path.join(process.cwd(), 'groups', entry.name, 'CLAUDE.md'),
          ),
      )
      .map((entry) => entry.name)
      .sort();
    expect([...TRACKED_AGENT_FOLDERS].sort()).toEqual(operativeFolders);
  });

  it('rejects unknown fields instead of silently widening the contract', () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'capabilities', 'sales.json'),
        'utf8',
      ),
    );
    manifest.tools.shellEscape = true;
    expect(() => validateCapabilityManifest(manifest, 'sales')).toThrow(
      /tools keys differ/,
    );
  });

  it('keeps current compatibility behavior while enforcement is disabled', () => {
    const projection = projectGroupCapabilities({
      group: group('not-yet-tracked'),
      isMain: false,
      defaults,
      config: { enforcementEnabled: false, valid: true },
    });
    expect(projection.enforced).toBe(false);
    expect(projection.mcpTools).toContain('jobs');
    expect(projection.credentialFamilies).toEqual([
      ...MANIFEST_CREDENTIAL_FAMILIES,
    ]);
  });

  it('enforces only explicitly selected groups during a staged rollout', () => {
    const config = resolveCapabilityManifestConfig({
      CAPABILITY_MANIFEST_ENFORCEMENT_ENABLED: '0',
      CAPABILITY_MANIFEST_ENFORCED_GROUPS: 'campanero',
    });
    expect(config).toEqual({
      enforcementEnabled: false,
      enforcedGroups: ['campanero'],
      valid: true,
    });
    expect(capabilityManifestIsEnforced(config, 'campanero')).toBe(true);
    expect(capabilityManifestIsEnforced(config, 'sales')).toBe(false);

    const campanero = projectGroupCapabilities({
      group: group('campanero', {
        additionalMounts: [
          { hostPath: '/opaque/knowledge', containerPath: 'knowledge' },
          { hostPath: '/opaque/docs', containerPath: 'agent_docs' },
        ],
      }),
      isMain: false,
      defaults,
      codeRoot: process.cwd(),
      config,
    });
    expect(campanero.enforced).toBe(true);
    expect(campanero.claudeTools).toEqual([]);
    expect(campanero.mcpTools).toEqual(['jobs']);
    expect(campanero.credentialFamilies).toEqual([]);

    const sales = projectGroupCapabilities({
      group: group('sales'),
      isMain: false,
      defaults,
      codeRoot: process.cwd(),
      config,
    });
    expect(sales.enforced).toBe(false);
    expect(sales.mcpTools).toContain('gmail_search');
    expect(sales.credentialFamilies).toEqual([...MANIFEST_CREDENTIAL_FAMILIES]);
  });

  it('rejects malformed, duplicate, and unknown staged group lists', () => {
    for (const value of [
      'campanero,campanero',
      '../sales',
      'feature-requests',
    ]) {
      expect(
        resolveCapabilityManifestConfig({
          CAPABILITY_MANIFEST_ENFORCEMENT_ENABLED: '0',
          CAPABILITY_MANIFEST_ENFORCED_GROUPS: value,
        }),
      ).toMatchObject({ valid: false, errorCode: 'invalid_group_list' });
    }
  });

  it('refuses a staged group that is not registered at startup', () => {
    expect(() =>
      assertCapabilityCatalogForGroups(
        { sales: group('sales') },
        {
          codeRoot: process.cwd(),
          config: {
            enforcementEnabled: false,
            enforcedGroups: ['campanero'],
            valid: true,
          },
        },
      ),
    ).toThrow(/configured group is not registered/);
  });

  it('ignores registered legacy groups outside the staged allowlist', () => {
    expect(() =>
      assertCapabilityCatalogForGroups(
        {
          campanero: group('campanero', {
            additionalMounts: [
              { hostPath: '/opaque/knowledge', containerPath: 'knowledge' },
              { hostPath: '/opaque/docs', containerPath: 'agent_docs' },
            ],
          }),
          legacy: group('feature-requests'),
        },
        {
          codeRoot: process.cwd(),
          config: {
            enforcementEnabled: false,
            enforcedGroups: ['campanero'],
            valid: true,
          },
        },
      ),
    ).not.toThrow();
  });

  it('projects only declared tools and mounts when enforcement is enabled', () => {
    const projection = projectGroupCapabilities({
      group: group('sales', {
        additionalMounts: [
          { hostPath: '/opaque/host/path', containerPath: 'plutio' },
        ],
      }),
      isMain: false,
      defaults,
      codeRoot: process.cwd(),
      config: { enforcementEnabled: true, valid: true },
    });
    expect(projection.enforced).toBe(true);
    expect(projection.mcpTools).toContain('gmail_search');
    expect(projection.mcpTools).not.toContain('gmail_send');
    expect(projection.additionalMounts).toHaveLength(1);
    expect(projection.credentialFamilies).toEqual(['business_db', 'plutio']);
  });

  it('rejects unknown credential families instead of widening secret access', () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'capabilities', 'booking.json'),
        'utf8',
      ),
    );
    manifest.credentials.families.push('trafft_admin');
    expect(() => validateCapabilityManifest(manifest, 'booking')).toThrow(
      /credentials\.families contains an unknown value/,
    );
  });

  it('binds credential-family changes into the adoption fingerprint', () => {
    const manifest = validateCapabilityManifest(
      JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), 'capabilities', 'booking.json'),
          'utf8',
        ),
      ),
      'booking',
    );
    const narrowed = structuredClone(manifest);
    narrowed.credentials.families = [];
    expect(capabilityManifestFingerprint(narrowed)).not.toBe(
      capabilityManifestFingerprint(manifest),
    );
  });

  it('denies an undeclared cross-agent mount and an oversized runtime', () => {
    expect(() =>
      projectGroupCapabilities({
        group: group('grader', {
          additionalMounts: [
            { hostPath: '/opaque/host/path', containerPath: 'plutio' },
          ],
        }),
        isMain: false,
        defaults,
        codeRoot: process.cwd(),
        config: { enforcementEnabled: true, valid: true },
      }),
    ).toThrow(CapabilityManifestError);
    expect(() =>
      projectGroupCapabilities({
        group: group('sales', { memory: '3G' }),
        isMain: false,
        defaults,
        codeRoot: process.cwd(),
        config: { enforcementEnabled: true, valid: true },
      }),
    ).toThrow(/memory exceeds/);
  });

  it('denies cross-agent host operations under enforcement', () => {
    const config = { enforcementEnabled: true, valid: true } as const;
    expect(
      manifestAllowsHostOperation('sales', false, 'gmail_search', {
        codeRoot: process.cwd(),
        config,
      }),
    ).toBe(true);
    expect(
      manifestAllowsHostOperation('sales', false, 'gmail_send', {
        codeRoot: process.cwd(),
        config,
      }),
    ).toBe(false);
    expect(
      manifestAllowsHostOperation('grader', false, 'jobs_mutate', {
        codeRoot: process.cwd(),
        config,
      }),
    ).toBe(false);
  });

  it('fails closed for invalid enablement and missing enforced manifests', () => {
    expect(
      resolveCapabilityManifestConfig({
        CAPABILITY_MANIFEST_ENFORCEMENT_ENABLED: 'yes',
      }),
    ).toMatchObject({ enforcementEnabled: true, valid: false });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-capability-'));
    cleanup.push(dir);
    expect(() =>
      projectGroupCapabilities({
        group: group('sales'),
        isMain: false,
        defaults,
        codeRoot: dir,
        config: { enforcementEnabled: true, valid: true },
      }),
    ).toThrow(/manifest_missing/);
  });

  it('parses container memory ceilings without unit ambiguity', () => {
    expect(parseContainerMemoryMb('768M')).toBe(768);
    expect(parseContainerMemoryMb('2G')).toBe(2048);
    expect(parseContainerMemoryMb('wat')).toBeNull();
  });
});
