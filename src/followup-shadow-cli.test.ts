import { describe, expect, it } from 'vitest';

import {
  FOLLOWUP_SHADOW_APPLY_CONFIRMATION,
  parseFollowupShadowArgs,
} from './followup-shadow-cli.js';

const NOW = new Date('2026-08-21T16:00:00.000Z');
const DIGEST = 'a'.repeat(64);

describe('follow-up shadow CLI gate', () => {
  it('defaults to a read-only scan', () => {
    expect(parseFollowupShadowArgs([], NOW)).toEqual({
      mode: 'dry_run',
      observedAt: NOW.toISOString(),
      expectedSnapshotFingerprint: null,
      confirmation: null,
    });
  });

  it('binds apply to an exact reviewed source snapshot and confirmation', () => {
    expect(
      parseFollowupShadowArgs(
        [
          '--apply',
          '--observed-at',
          NOW.toISOString(),
          '--expected-snapshot-fingerprint',
          DIGEST,
          '--confirm-apply',
          FOLLOWUP_SHADOW_APPLY_CONFIRMATION,
        ],
        NOW,
      ),
    ).toMatchObject({
      mode: 'apply',
      observedAt: NOW.toISOString(),
      expectedSnapshotFingerprint: DIGEST,
    });
  });

  it('refuses loose apply, duplicate modes, and apply flags on dry-run', () => {
    expect(() => parseFollowupShadowArgs(['--apply'], NOW)).toThrow(
      'snapshot-fingerprint',
    );
    expect(() =>
      parseFollowupShadowArgs(
        [
          '--apply',
          '--expected-snapshot-fingerprint',
          DIGEST,
          '--confirm-apply',
          'yes',
        ],
        NOW,
      ),
    ).toThrow('exact apply confirmation');
    expect(() =>
      parseFollowupShadowArgs(['--dry-run', '--apply'], NOW),
    ).toThrow('mode may be supplied only once');
    expect(() =>
      parseFollowupShadowArgs(['--expected-snapshot-fingerprint', DIGEST], NOW),
    ).toThrow('not valid for dry-run');
  });
});
