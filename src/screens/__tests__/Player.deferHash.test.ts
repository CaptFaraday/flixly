import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Static-text check (mirrors Player.errors.test.ts) that the subtitle effect
// awaits canPlay BEFORE invoking computeMoviehash. The motivation is on-device:
// computeMoviehash issues HEAD + 2 Range GETs on the same TorBox CDN URL
// <video> is fetching, and the edge throttles per-token bandwidth, so racing
// adds several seconds to time-to-first-frame. We can't easily unit-render
// Player (heavy component, many effects), so we pin the ordering textually.

const PLAYER_TSX = fs.readFileSync(
  path.resolve(__dirname, '../Player.tsx'),
  'utf8',
);

describe('Player defers moviehash until canplay', () => {
  it('awaits awaitCanPlay before calling computeMoviehash', () => {
    const awaitIdx = PLAYER_TSX.indexOf('awaitCanPlay(');
    const hashIdx = PLAYER_TSX.indexOf('computeMoviehash(');
    expect(awaitIdx, 'awaitCanPlay call not found in Player.tsx').toBeGreaterThan(-1);
    expect(hashIdx, 'computeMoviehash call not found in Player.tsx').toBeGreaterThan(-1);
    expect(
      awaitIdx,
      'awaitCanPlay must appear before computeMoviehash in Player.tsx so the hash compute is gated on canplay',
    ).toBeLessThan(hashIdx);
  });
});
