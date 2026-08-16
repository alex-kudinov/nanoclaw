/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('firebase-admin/app', () => ({
  cert: vi.fn((x: unknown) => ({ __cert: x })),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => {
  const FieldValue = {
    arrayUnion: (...args: unknown[]) => ({ __arrayUnion: args }),
  };
  return {
    FieldValue,
    getFirestore: vi.fn(),
  };
});

vi.mock('fs', () => ({
  readFileSync: vi.fn(() =>
    JSON.stringify({ type: 'service_account', project_id: 'test-proj' }),
  ),
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore as sdkGetFirestore } from 'firebase-admin/firestore';
import {
  assignConversation,
  setConversationStatus,
  tagConversation,
  recordClassification,
  resolveTeamUidByEmail,
  resetHiveBridgeCache,
  getFirestore,
  HiveConversationNotFoundError,
} from './hive-bridge.js';
import { logger } from './logger.js';

const mockGetApps = getApps as unknown as ReturnType<typeof vi.fn>;
const mockInitApp = initializeApp as unknown as ReturnType<typeof vi.fn>;
const mockGetFirestore = sdkGetFirestore as unknown as ReturnType<typeof vi.fn>;

type FirestoreMock = {
  collection: ReturnType<typeof vi.fn>;
};
type ColMock = {
  doc: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
};
type DocMock = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

function buildFirestoreMock(): {
  firestore: FirestoreMock;
  conversationsCol: ColMock;
  teamCol: ColMock;
  conversationsDoc: DocMock;
} {
  const conversationsDoc: DocMock = { get: vi.fn(), set: vi.fn() };
  const conversationsCol: ColMock = {
    doc: vi.fn(() => conversationsDoc),
    where: vi.fn(),
  };
  const teamCol: ColMock = {
    doc: vi.fn(),
    where: vi.fn(() => ({
      limit: () => ({ get: vi.fn() }),
    })),
  };
  const firestore: FirestoreMock = {
    collection: vi.fn((name: string) => {
      if (name === 'conversations') return conversationsCol;
      if (name === 'team') return teamCol;
      throw new Error(`unexpected collection: ${name}`);
    }),
  };
  return { firestore, conversationsCol, teamCol, conversationsDoc };
}

let env: Record<string, string | undefined>;

beforeEach(() => {
  env = {
    HIVE_FIRESTORE_KEY_PATH: process.env.HIVE_FIRESTORE_KEY_PATH,
    HIVE_PROJECT_ID: process.env.HIVE_PROJECT_ID,
    TEAM_UID_ALEX: process.env.TEAM_UID_ALEX,
    TEAM_UID_CHERIE: process.env.TEAM_UID_CHERIE,
    ACTION_SAFETY_ENFORCEMENT_ENABLED:
      process.env.ACTION_SAFETY_ENFORCEMENT_ENABLED,
    EXTERNAL_WRITE_SAFE_MODE: process.env.EXTERNAL_WRITE_SAFE_MODE,
    EXTERNAL_WRITE_DISABLED_SYSTEMS:
      process.env.EXTERNAL_WRITE_DISABLED_SYSTEMS,
  };
  process.env.HIVE_FIRESTORE_KEY_PATH = '/fake/path/key.json';
  process.env.HIVE_PROJECT_ID = 'test-proj';
  delete process.env.TEAM_UID_ALEX;
  delete process.env.TEAM_UID_CHERIE;
  process.env.ACTION_SAFETY_ENFORCEMENT_ENABLED = '0';
  process.env.EXTERNAL_WRITE_SAFE_MODE = '0';
  process.env.EXTERNAL_WRITE_DISABLED_SYSTEMS = '';
  mockGetApps.mockReturnValue([{ name: 'hive-bridge' }]);
  mockInitApp.mockReset();
  mockGetFirestore.mockReset();
  resetHiveBridgeCache();
});

afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('getFirestore', () => {
  it('initializes the app once and returns a Firestore singleton', () => {
    mockGetApps
      .mockReturnValueOnce([])
      .mockReturnValue([{ name: 'hive-bridge' }]);
    const fake = { __fake: true };
    mockGetFirestore.mockReturnValue(fake);
    const a = getFirestore();
    const b = getFirestore();
    expect(a).toBe(b);
    expect(mockInitApp).toHaveBeenCalledTimes(1);
  });

  it('throws when HIVE_PROJECT_ID is missing', () => {
    delete process.env.HIVE_PROJECT_ID;
    expect(() => getFirestore()).toThrow(/HIVE_PROJECT_ID/);
  });
});

describe('resolveTeamUidByEmail', () => {
  it('returns uid of first active team doc and caches the result', async () => {
    const { firestore, teamCol } = buildFirestoreMock();
    const teamGet = vi.fn().mockResolvedValue({
      empty: false,
      docs: [{ id: 'uid-alex', data: () => ({ active: true }) }],
    });
    teamCol.where.mockReturnValue({ limit: () => ({ get: teamGet }) });
    mockGetFirestore.mockReturnValue(firestore);
    const uid1 = await resolveTeamUidByEmail('ALEX@tandem.co');
    const uid2 = await resolveTeamUidByEmail('alex@tandem.co');
    expect(uid1).toBe('uid-alex');
    expect(uid2).toBe('uid-alex');
    // Case normalization + cache hit → single Firestore call
    expect(teamCol.where).toHaveBeenCalledTimes(1);
    expect(teamCol.where).toHaveBeenCalledWith('email', '==', 'alex@tandem.co');
  });

  it('returns null when doc is inactive', async () => {
    const { firestore, teamCol } = buildFirestoreMock();
    teamCol.where.mockReturnValue({
      limit: () => ({
        get: vi.fn().mockResolvedValue({
          empty: false,
          docs: [{ id: 'uid-dead', data: () => ({ active: false }) }],
        }),
      }),
    });
    mockGetFirestore.mockReturnValue(firestore);
    const uid = await resolveTeamUidByEmail('inactive@tandem.co');
    expect(uid).toBeNull();
  });

  it('returns null when no match', async () => {
    const { firestore, teamCol } = buildFirestoreMock();
    teamCol.where.mockReturnValue({
      limit: () => ({
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      }),
    });
    mockGetFirestore.mockReturnValue(firestore);
    expect(await resolveTeamUidByEmail('ghost@tandem.co')).toBeNull();
  });
});

describe('assignConversation / setConversationStatus / tagConversation', () => {
  it('writes with { merge: true } and arrayUnion for tags', async () => {
    const { firestore, conversationsDoc } = buildFirestoreMock();
    mockGetFirestore.mockReturnValue(firestore);

    await assignConversation('thr-1', 'uid-abc');
    expect(conversationsDoc.set).toHaveBeenCalledWith(
      { assignee: 'uid-abc' },
      { merge: true },
    );

    await setConversationStatus('thr-1', 'open');
    expect(conversationsDoc.set).toHaveBeenLastCalledWith(
      { status: 'open' },
      { merge: true },
    );

    await tagConversation('thr-1', ['MrGru/financial/receipt']);
    const tagCall = conversationsDoc.set.mock.calls.at(-1)![0] as any;
    expect(tagCall.tags).toEqual({
      __arrayUnion: ['MrGru/financial/receipt'],
    });
  });

  it('tagConversation is a no-op with empty array', async () => {
    const { firestore, conversationsDoc } = buildFirestoreMock();
    mockGetFirestore.mockReturnValue(firestore);
    await tagConversation('thr-1', []);
    expect(conversationsDoc.set).not.toHaveBeenCalled();
  });

  it.each([
    ['global', '1', '', 'global_safe_mode'],
    ['per-system', '0', 'hive_firestore', 'system_safe_mode'],
  ])(
    'denies every %s safe-mode mutation before Firestore initialization',
    async (_mode, globalSafeMode, disabledSystems, expectedCode) => {
      process.env.EXTERNAL_WRITE_SAFE_MODE = globalSafeMode;
      process.env.EXTERNAL_WRITE_DISABLED_SYSTEMS = disabledSystems;
      const getFirestoreTripwire = vi.fn(() => {
        throw new Error('Firestore must not initialize');
      });

      await expect(
        assignConversation('thr-1', 'uid-abc', {
          getFirestore: getFirestoreTripwire,
        }),
      ).rejects.toMatchObject({
        system: 'hive_firestore',
        code: expectedCode,
      });
      await expect(
        setConversationStatus('thr-1', 'open', {
          getFirestore: getFirestoreTripwire,
        }),
      ).rejects.toMatchObject({
        system: 'hive_firestore',
        code: expectedCode,
      });
      await expect(
        tagConversation('thr-1', ['MrGru/financial/receipt'], {
          getFirestore: getFirestoreTripwire,
        }),
      ).rejects.toMatchObject({
        system: 'hive_firestore',
        code: expectedCode,
      });
      expect(getFirestoreTripwire).not.toHaveBeenCalled();
      expect(mockGetFirestore).not.toHaveBeenCalled();
    },
  );
});

describe('recordClassification', () => {
  it.each([
    ['global', '1', '', 'global_safe_mode'],
    ['per-system', '0', 'hive_firestore', 'system_safe_mode'],
  ])(
    'denies the composite %s safe-mode operation before Firestore initialization',
    async (_mode, globalSafeMode, disabledSystems, expectedCode) => {
      process.env.EXTERNAL_WRITE_SAFE_MODE = globalSafeMode;
      process.env.EXTERNAL_WRITE_DISABLED_SYSTEMS = disabledSystems;

      await expect(
        recordClassification('thr-1', 'MrGru/financial/receipt', ['cherie']),
      ).rejects.toMatchObject({
        system: 'hive_firestore',
        code: expectedCode,
      });
      expect(mockGetFirestore).not.toHaveBeenCalled();
      expect(mockInitApp).not.toHaveBeenCalled();
    },
  );

  it('creates conversation doc via merge when it does not exist', async () => {
    const { firestore, conversationsDoc } = buildFirestoreMock();
    conversationsDoc.get.mockResolvedValue({ exists: false });
    mockGetFirestore.mockReturnValue(firestore);
    await recordClassification('thr-ghost', 'MrGru/lead/inquiry', ['alex']);
    // Should write tags via merge:true (creating the doc)
    expect(conversationsDoc.set).toHaveBeenCalled();
  });

  it('tags only when no TEAM_UID_* env matches', async () => {
    const { firestore, conversationsDoc } = buildFirestoreMock();
    conversationsDoc.get.mockResolvedValue({
      exists: true,
      data: () => ({ assignee: null, tags: [] }),
    });
    mockGetFirestore.mockReturnValue(firestore);
    await recordClassification('thr-1', 'MrGru/lead/inquiry', [
      'alex',
      'cherie',
    ]);
    // One call (tag only) — no assignee/status writes
    expect(conversationsDoc.set).toHaveBeenCalledTimes(1);
    expect(conversationsDoc.set).toHaveBeenCalledWith(
      expect.objectContaining({ tags: expect.any(Object) }),
      { merge: true },
    );
  });

  it('assigns + sets status + tags when TEAM_UID_ALEX is set', async () => {
    process.env.TEAM_UID_ALEX = 'uid-alex-123';
    const { firestore, conversationsDoc } = buildFirestoreMock();
    conversationsDoc.get.mockResolvedValue({
      exists: true,
      data: () => ({ assignee: null, tags: [] }),
    });
    mockGetFirestore.mockReturnValue(firestore);
    await recordClassification('thr-1', 'MrGru/lead/inquiry', ['alex']);
    // 3 merges: assignee, status, tags
    expect(conversationsDoc.set).toHaveBeenCalledTimes(3);
    const calls = conversationsDoc.set.mock.calls.map((c: any[]) => c[0]);
    expect(calls).toContainEqual({ assignee: 'uid-alex-123' });
    expect(calls).toContainEqual({ status: 'open' });
  });

  it('short-circuits when existing assignee + tag already match', async () => {
    process.env.TEAM_UID_ALEX = 'uid-alex-123';
    const { firestore, conversationsDoc } = buildFirestoreMock();
    conversationsDoc.get.mockResolvedValue({
      exists: true,
      data: () => ({
        assignee: 'uid-alex-123',
        tags: ['MrGru/lead/inquiry'],
      }),
    });
    mockGetFirestore.mockReturnValue(firestore);
    await recordClassification('thr-1', 'MrGru/lead/inquiry', ['alex']);
    expect(conversationsDoc.set).not.toHaveBeenCalled();
  });

  it('uses the first matching slug for assignee', async () => {
    process.env.TEAM_UID_CHERIE = 'uid-cherie-9';
    const { firestore, conversationsDoc } = buildFirestoreMock();
    conversationsDoc.get.mockResolvedValue({
      exists: true,
      data: () => ({ assignee: null, tags: [] }),
    });
    mockGetFirestore.mockReturnValue(firestore);
    // alex has no env; cherie has one — cherie should be assignee
    await recordClassification('thr-1', 'MrGru/lead/inquiry', [
      'alex',
      'cherie',
    ]);
    const calls = conversationsDoc.set.mock.calls.map((c: any[]) => c[0]);
    expect(calls).toContainEqual({ assignee: 'uid-cherie-9' });
  });
});
