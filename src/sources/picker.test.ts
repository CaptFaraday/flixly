import { describe, it, expect } from 'vitest';
import { rankAndPick, titleYearOK } from './picker';
import type { StreamCandidate, Capabilities, Settings } from '../types';
import { parseName } from './parse-name';

const baseCaps: Capabilities = {
  codecs: { h264: true, h265_main: false, h265_main10: false, vp9: true, av1: false, aac: true, ac3: true, eac3: true },
  bandwidthMbps: 50,
  probedAt: 0,
};
const baseSettings: Settings = { rd_api_key: 'k', torbox_api_key: '', prefer_4k: false, audio_language: 'en', require_subtitles: true };

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

  it('rejects a Dublado (Portuguese dub) candidate in favor of an untagged English release', () => {
    // The 10-movie smoke test surfaced this: with audio_language='en', the
    // ranker was picking 'Project.Hail.Mary.2026.1080p.WEBRip.Dublado.mkv'
    // because the parser fell back to ['en'] when no language tag was found.
    // Fixed by adding 'dublado' as a Portuguese marker.
    const candidates = [
      cand('Project.Hail.Mary.2026.1080p.WEBRip.Dublado.mkv', 4_000_000_000),
      cand('Project.Hail.Mary.2026.1080p.WEB-DL.x264-FLUX.mkv', 4_000_000_000),
    ];
    const r = rankAndPick(candidates, candidates.map((c) => c.hash), baseCaps, baseSettings, ['en'], RUNTIME_HOURS);
    expect(r.kind).toBe('pick');
    if (r.kind === 'pick') expect(r.candidate.filename).not.toContain('Dublado');
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

describe('titleYearOK', () => {
  // Real cases from on-device testing where Torrentio returned a Spanish
  // film tagged with Project Hail Mary's IMDb ID. This filter catches it.
  const projectHailMary = cand('Project.Hail.Mary.2026.PROPER.HDR.2160p.WEB.h265-GRACE.mkv', 0);
  const wrongMovie = cand('Antes Del Fin Del Mundo (2025) 1080p AMZN WEBDL LAT - ZeiZ.mkv', 0);

  it('accepts a candidate whose filename contains the title and year', () => {
    expect(titleYearOK(projectHailMary, 'Project Hail Mary', 2026)).toBe(true);
  });

  it('rejects a candidate whose filename has neither title tokens nor the right year', () => {
    expect(titleYearOK(wrongMovie, 'Project Hail Mary', 2026)).toBe(false);
  });

  it('accepts dotted/underscored variations of the title', () => {
    expect(titleYearOK(cand('Project_Hail_Mary.2026.WEB.x264.mkv', 0), 'Project Hail Mary', 2026)).toBe(true);
    expect(titleYearOK(cand('Project.Hail.Mary.WEB.2026.mkv', 0), 'Project Hail Mary', 2026)).toBe(true);
  });

  it('accepts when only one title token is present but the year matches', () => {
    expect(titleYearOK(cand('Mary.2026.1080p.WEB.x264.mkv', 0), 'Project Hail Mary', 2026)).toBe(true);
  });

  it('rejects when only one title token is present and the year does not match (multi-token title)', () => {
    expect(titleYearOK(cand('Mary.1999.1080p.WEB.x264.mkv', 0), 'Project Hail Mary', 2026)).toBe(false);
  });

  it('strips title stop-words ("the", "of", "a") from the comparison', () => {
    // "The Matrix" → ['matrix']. A filename like "Matrix.1999..." matches.
    expect(titleYearOK(cand('Matrix.1999.BluRay.x264.mkv', 0), 'The Matrix', 1999)).toBe(true);
  });

  it('handles single-token titles by requiring both the token and the year', () => {
    // "Up" (2009) — short title needs strict matching.
    expect(titleYearOK(cand('Up.2009.BluRay.x264.mkv', 0), 'Up', 2009)).toBe(true);
    expect(titleYearOK(cand('Up.2010.BluRay.x264.mkv', 0), 'Up', 2009)).toBe(false);
    expect(titleYearOK(cand('Some.Other.Movie.2009.mkv', 0), 'Up', 2009)).toBe(false);
  });

  it('passes everything when title is empty (cannot meaningfully check)', () => {
    expect(titleYearOK(cand('Whatever.2024.mkv', 0), '', 2024)).toBe(true);
  });
});
