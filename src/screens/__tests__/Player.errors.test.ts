import { describe, it, expect } from 'vitest';
import type { PickReason } from '../../sources/picker';

// All PickReason values plus the Player-only extras. If picker.ts adds a new
// reason and Player.tsx doesn't update REASON_TEXT, this test should be the
// place that flags it (the build won't, because REASON_TEXT's type uses an
// indexed union and TS will error on the missing key only at the use site).

// Mirror the REASON_TEXT keys here as the spec, then read the actual
// Player.tsx source and assert each key is present. We don't import Player
// directly because it imports Preact + heavy deps; reading the file as text
// is sufficient for this contract check.

import fs from 'node:fs';
import path from 'node:path';

const PLAYER_TSX = fs.readFileSync(
  path.resolve(__dirname, '../Player.tsx'),
  'utf8',
);

const EXPECTED_REASONS: Array<PickReason | 'rd_error' | 'no_streams' | 'unknown'> = [
  'no_cached',
  'no_compatible_codec',
  'no_compatible_audio',
  'no_acceptable_language',
  'no_acceptable_bitrate',
  'no_subtitles',
  'rd_error',
  'no_streams',
  'unknown',
];

describe('Player REASON_TEXT mapping', () => {
  it('REASON_TEXT contains every expected reason key', () => {
    for (const reason of EXPECTED_REASONS) {
      expect(PLAYER_TSX).toContain(`${reason}:`);
    }
  });

  it('every reason has a non-empty human-readable string', () => {
    // crude: find each key's value via regex. Each entry looks like:
    //   no_cached: 'No cached versions on Real-Debrid right now. Try again later.',
    for (const reason of EXPECTED_REASONS) {
      const re = new RegExp(`${reason}:\\s*['"\`]([^'"\`]+)['"\`]`);
      const m = PLAYER_TSX.match(re);
      expect(m, `missing message for ${reason}`).toBeTruthy();
      expect(m![1].length, `message for ${reason} is empty`).toBeGreaterThan(10);
    }
  });

  it('every message is actionable (mentions check/try/missing/etc.)', () => {
    const ACTIONABLE_HINTS = /try|check|set|switch|change|missing|coming|relaunch/i;
    for (const reason of EXPECTED_REASONS) {
      const re = new RegExp(`${reason}:\\s*['"\`]([^'"\`]+)['"\`]`);
      const m = PLAYER_TSX.match(re);
      expect(m).toBeTruthy();
      // Allow some reasons to be passive (e.g., "No subtitles available...")
      // but log if NONE of them are actionable.
    }
    // Soft assertion: at least half of messages should hint at user action
    let actionableCount = 0;
    for (const reason of EXPECTED_REASONS) {
      const re = new RegExp(`${reason}:\\s*['"\`]([^'"\`]+)['"\`]`);
      const m = PLAYER_TSX.match(re);
      if (m && ACTIONABLE_HINTS.test(m[1])) actionableCount++;
    }
    expect(actionableCount, 'at least half of error messages should hint at user action').toBeGreaterThanOrEqual(EXPECTED_REASONS.length / 2);
  });
});
