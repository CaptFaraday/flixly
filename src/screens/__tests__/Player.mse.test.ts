import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PLAYER_TSX = fs.readFileSync(
  path.resolve(__dirname, '../Player.tsx'),
  'utf8',
);

describe('Player uses useStreamingSource for the video source', () => {
  it('imports useStreamingSource', () => {
    expect(PLAYER_TSX).toMatch(
      /import\s*\{[^}]*\buseStreamingSource\b[^}]*\}\s*from\s*['"]\.\.\/streaming\/useStreamingSource['"]/,
    );
  });

  it('binds <video> src to the hook result, not the raw stream URL', () => {
    expect(PLAYER_TSX).toMatch(/useStreamingSource\s*\(/);
    expect(PLAYER_TSX).not.toMatch(/<video[^>]*\bsrc=\{state\.stream\.url\}/);
  });
});
