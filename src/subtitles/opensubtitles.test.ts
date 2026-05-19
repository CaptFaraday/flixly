import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scoreSubMatch, pickBestSubForRip, preflightSubtitles } from './opensubtitles';

// Minimal sub fixture builder
function sub(releaseName: string, fileName?: string, downloads = 100) {
  return {
    id: 'fake',
    lang: 'eng',
    url: 'about:blank',
    releaseName,
    fileName: fileName ?? `${releaseName}.eng.srt`,
    downloads,
    score: 0,
    rating: 0,
    fps: 0,
  };
}

describe('scoreSubMatch — edit-tag hard filter', () => {
  it('rejects non-remaster sub for an RM4K rip', () => {
    const rip = 'In Bruges (2008) RM4K (1080p BluRay x265 10bit Tigole).mkv';
    const nonRemasterSub = sub('In.Bruges.2008.1080p.BluRay.x264.AC3-ETRG');
    expect(scoreSubMatch(rip, nonRemasterSub)).toBe(0);
  });

  it('accepts remaster sub for an RM4K rip', () => {
    const rip = 'In Bruges (2008) RM4K (1080p BluRay x265 10bit Tigole).mkv';
    const remasterSub = sub('In.Bruges.2008.REMASTERED.1080p.BluRay.x264-AMIABLE');
    expect(scoreSubMatch(rip, remasterSub)).toBeGreaterThan(50);
  });

  it('accepts "4K REMASTER" sub for an RM4K rip (variant)', () => {
    const rip = 'Movie.2010.RM4K.1080p.BluRay.x265-Tigole.mkv';
    const matching = sub('Movie.2010.4K.REMASTER.1080p.BluRay.x264-GROUP');
    expect(scoreSubMatch(rip, matching)).toBeGreaterThan(50);
  });

  it('rejects a remaster sub for a non-remaster rip (symmetric)', () => {
    const rip = 'Movie.2010.1080p.BluRay.x264-ETRG.mkv';
    const remasterSub = sub('Movie.2010.REMASTERED.1080p.BluRay.x264-AMIABLE');
    expect(scoreSubMatch(rip, remasterSub)).toBe(0);
  });

  it('rejects DIRECTORS CUT sub for theatrical rip (existing behavior preserved)', () => {
    const rip = 'Movie.2010.1080p.BluRay.x264-RARBG.mkv';
    const dcutSub = sub("Movie.2010.Director's.Cut.1080p.BluRay.x264-RARBG");
    expect(scoreSubMatch(rip, dcutSub)).toBe(0);
  });
});

describe('scoreSubMatch — source hard filter', () => {
  it('rejects WEB-DL sub for BluRay rip', () => {
    const rip = 'Movie.2024.1080p.BluRay.x264-RARBG.mkv';
    const webSub = sub('Movie.2024.1080p.WEB-DL.x264-NTb');
    expect(scoreSubMatch(rip, webSub)).toBe(0);
  });
});

describe('pickBestSubForRip', () => {
  it('returns undefined when no sub meets minScore', () => {
    const rip = 'Movie.2010.RM4K.1080p.BluRay.x265-Tigole.mkv';
    const subs = [sub('Movie.2010.1080p.BluRay.x264-ETRG')]; // no remaster tag
    expect(pickBestSubForRip(subs, rip, 50)).toBeUndefined();
  });

  // NOTE: a "prefers same release group" test would belong here, but
  // extractGroup's regex doesn't currently handle the common `.eng.srt`
  // filename pattern (group ends up null, +35 bonus never applies for typical
  // OS sub filenames). Separate bug to fix in a future bundle.
});

describe('preflightSubtitles fallback', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('falls back to OS REST API when the v3 addon returns no subs', async () => {
    // Real-world repro: tt33100314 (Remarkably Bright Creatures) — v3 addon
    // returns {subtitles:[]} but REST API has at least one English sub.
    // Without this fallback the picker rejects the entire movie as
    // no_subtitles and the user sees "Can't play right now".
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('opensubtitles-v3.strem.io')) {
        return new Response(JSON.stringify({ subtitles: [] }), { status: 200 });
      }
      if (url.includes('rest.opensubtitles.org')) {
        return new Response(JSON.stringify([
          { IDSubtitleFile: '1', SubFileName: 'Movie.en.srt', SubLanguageID: 'eng', SubDownloadLink: 'about:blank', SubDownloadsCnt: '10', SubRating: '0', SubFormat: 'srt', MovieFPS: '23.976' },
        ]), { status: 200 });
      }
      throw new Error('unexpected fetch: ' + url);
    });

    const langs = await preflightSubtitles('tt33100314');
    expect(langs).toContain('en');
  });
});
