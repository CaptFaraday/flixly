import { describe, it, expect } from 'vitest';
import { rankAndPick } from './picker';
import type { StreamCandidate, Capabilities, Settings } from '../types';
import { parseName } from './parse-name';

const baseCaps: Capabilities = {
  codecs: { h264: true, h265_main: false, h265_main10: false, vp9: true, av1: false, aac: true, ac3: true, eac3: true },
  bandwidthMbps: 50,
  probedAt: 0,
};
const baseSettings: Settings = { rd_api_key: 'k', prefer_4k: false, audio_language: 'en', require_subtitles: true };

const cand = (name: string, bytes: number, seeds = 100, hash = name.replace(/\W/g, '').padEnd(40, 'a').slice(0, 40)): StreamCandidate => ({
  hash, filename: name, bytes, seeds, parsed: parseName(name),
});

const RUNTIME_HOURS = 2;

describe('rankAndPick', () => {
  it('rejects sources whose video codec is unsupported', () => {
    const candidates = [
      cand('Movie.2024.1080p.WEB-DL.HEVC.x265.eng.mkv', 4_000_000_000),
      cand('Movie.2024.1080p.WEB-DL.x264.eng.mkv', 4_000_000_000),
    ];
    const cachedHashes = candidates.map((c) => c.hash);
    const r = rankAndPick(candidates, cachedHashes, baseCaps, baseSettings, ['en'], RUNTIME_HOURS);
    expect(r.kind).toBe('pick');
    if (r.kind === 'pick') expect(r.candidate.filename).toContain('x264');
  });

  it('rejects sources whose audio codec is unsupported (DTS)', () => {
    const candidates = [
      cand('Movie.2024.1080p.BluRay.x264.DTS-HD.eng.mkv', 5_000_000_000),
      cand('Movie.2024.1080p.WEB-DL.x264.AAC.eng.mkv', 4_000_000_000),
    ];
    const r = rankAndPick(candidates, candidates.map((c) => c.hash), baseCaps, baseSettings, ['en'], RUNTIME_HOURS);
    expect(r.kind).toBe('pick');
    if (r.kind === 'pick') expect(r.candidate.filename).toContain('AAC');
  });

  it('rejects sources whose bitrate exceeds available bandwidth', () => {
    // 50 Mbps caps usable bitrate at 30 Mbps (60% headroom)
    // 50GB / 2h = ~55 Mbps -> reject
    // 4GB / 2h  = ~4.4 Mbps -> ok
    const candidates = [
      cand('Movie.2024.2160p.REMUX.x264.eng.mkv', 50_000_000_000),
      cand('Movie.2024.1080p.WEB-DL.x264.eng.mkv', 4_000_000_000),
    ];
    const r = rankAndPick(candidates, candidates.map((c) => c.hash), baseCaps, baseSettings, ['en'], RUNTIME_HOURS);
    expect(r.kind).toBe('pick');
    if (r.kind === 'pick') expect(r.candidate.bytes).toBe(4_000_000_000);
  });

  it('rejects sources with wrong audio language', () => {
    const candidates = [
      cand('Movie.2024.1080p.x264.HINDI.mkv', 4_000_000_000),  // hi only
      cand('Movie.2024.1080p.x264.eng.mkv', 4_000_000_000),
    ];
    const r = rankAndPick(candidates, candidates.map((c) => c.hash), baseCaps, baseSettings, ['en'], RUNTIME_HOURS);
    expect(r.kind).toBe('pick');
    if (r.kind === 'pick') expect(r.candidate.filename).toContain('eng');
  });

  it('returns a no-streams result when no subtitles available and require_subtitles is on', () => {
    const candidates = [cand('Movie.2024.1080p.WEB-DL.x264.eng.mkv', 4_000_000_000)];
    const r = rankAndPick(candidates, candidates.map((c) => c.hash), baseCaps, baseSettings, ['en'], RUNTIME_HOURS, /*subsAvailable*/ false);
    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected') expect(r.reason).toBe('no_subtitles');
  });

  it('prefers 1080p over 4K by default', () => {
    const candidates = [
      cand('Movie.2024.2160p.WEB-DL.x264.eng.mkv', 12_000_000_000),
      cand('Movie.2024.1080p.WEB-DL.x264.eng.mkv', 4_000_000_000),
    ];
    const r = rankAndPick(candidates, candidates.map((c) => c.hash), baseCaps, baseSettings, ['en'], RUNTIME_HOURS);
    expect(r.kind).toBe('pick');
    if (r.kind === 'pick') expect(r.candidate.parsed.resolution).toBe('1080p');
  });

  it('returns rejected with reason no_cached when none of the candidates are cached', () => {
    const candidates = [cand('Movie.2024.1080p.WEB-DL.x264.eng.mkv', 4_000_000_000)];
    const r = rankAndPick(candidates, [], baseCaps, baseSettings, ['en'], RUNTIME_HOURS);
    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected') expect(r.reason).toBe('no_cached');
  });
});
