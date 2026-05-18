import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PLAYER_TSX = fs.readFileSync(
  path.resolve(__dirname, '../Player.tsx'),
  'utf8',
);

describe('Player runs probeCandidate before declaring playback', () => {
  it('imports probeCandidate from the streaming module', () => {
    expect(PLAYER_TSX).toMatch(
      /import\s*\{[^}]*\bprobeCandidate\b[^}]*\}\s*from\s*['"]\.\.\/streaming\/probeCandidate['"]/,
    );
  });

  it('calls probeCandidate during Stage 1 (preparing)', () => {
    expect(PLAYER_TSX).toMatch(/probeCandidate\s*\(/);
  });
});
