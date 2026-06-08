import { describe, it, expect, vi } from 'vitest';

// Mock db.js so importing the script does not open a real SQLite connection.
vi.mock('../src/db.js', () => ({
  initDatabase: vi.fn(),
  getRegisteredGroup: vi.fn(),
  setRegisteredGroup: vi.fn(),
}));

import { parseArgs, mergeContainerConfig } from './set-group-config.js';
import type { RegisteredGroup } from '../src/types.js';

const baseGroup: RegisteredGroup = {
  name: 'Contador',
  folder: 'contador',
  trigger: '@Gru',
  added_at: '2026-01-01T00:00:00Z',
  containerConfig: {
    additionalMounts: [
      { hostPath: '/x', containerPath: '/y', readonly: true },
    ],
    timeout: 600000,
    spawnTimeout: 90000,
  },
};

describe('parseArgs', () => {
  it('parses --jid and --set key=value', () => {
    const a = parseArgs(['--jid', 'slack:C1', '--set', 'processingMessage=Working…']);
    expect(a).toEqual({
      jid: 'slack:C1',
      key: 'processingMessage',
      value: 'Working…',
    });
  });

  it('keeps = signs in the value', () => {
    const a = parseArgs(['--jid', 'j', '--set', 'model=haiku']);
    expect(a.value).toBe('haiku');
  });

  it('throws when --jid or --set is missing', () => {
    expect(() => parseArgs(['--jid', 'j'])).toThrow();
    expect(() => parseArgs(['--set', 'k=v'])).toThrow();
  });
});

describe('mergeContainerConfig', () => {
  it('adds the new key while preserving every prior containerConfig key', () => {
    const out = mergeContainerConfig(baseGroup, 'processingMessage', 'On it.');
    expect(out.containerConfig?.processingMessage).toBe('On it.');
    expect(out.containerConfig?.timeout).toBe(600000);
    expect(out.containerConfig?.spawnTimeout).toBe(90000);
    expect(out.containerConfig?.additionalMounts).toHaveLength(1);
  });

  it('preserves a previously-set key when adding a different one', () => {
    const withMsg = mergeContainerConfig(baseGroup, 'processingMessage', 'On it.');
    const withModel = mergeContainerConfig(withMsg, 'model', 'haiku');
    expect(withModel.containerConfig?.model).toBe('haiku');
    expect(withModel.containerConfig?.processingMessage).toBe('On it.');
    expect(withModel.containerConfig?.timeout).toBe(600000);
  });

  it('works when the group has no prior containerConfig', () => {
    const bare: RegisteredGroup = {
      name: 'X',
      folder: 'inbox',
      trigger: '@Gru',
      added_at: '2026-01-01T00:00:00Z',
    };
    const out = mergeContainerConfig(bare, 'processingMessage', 'Hi');
    expect(out.containerConfig).toEqual({ processingMessage: 'Hi' });
  });

  it('does not mutate the input group', () => {
    mergeContainerConfig(baseGroup, 'model', 'haiku');
    expect(baseGroup.containerConfig?.model).toBeUndefined();
  });
});
