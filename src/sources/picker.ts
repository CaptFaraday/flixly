import type { StreamCandidate, Capabilities, Settings } from '../types';

export type PickReason =
  | 'no_cached'
  | 'no_compatible_codec'
  | 'no_compatible_audio'
  | 'no_acceptable_language'
  | 'no_acceptable_bitrate'
  | 'no_subtitles'
  | 'no_synced_subtitles'
  | 'no_title_match';

export type PickResult =
  | { kind: 'pick'; candidate: StreamCandidate }
  | { kind: 'rejected'; reason: PickReason };

export type PickAllResult =
  | { kind: 'picks'; candidates: StreamCandidate[] }
  | { kind: 'rejected'; reason: PickReason };

/**
 * Return ALL acceptable candidates ranked best-first. The Player iterates
 * this list and falls back to the next when a stream fails to play (e.g.
 * Torrentio's cache says cached but RD has since removed the file). Without
 * this, a single broken top pick produces an error screen even when other
 * cached versions of the same movie would have played fine.
 */
export function rankAll(
  candidates: StreamCandidate[],
  cachedHashes: string[],
  caps: Capabilities,
  settings: Settings,
  subtitleLanguagesAvailable: string[] | null,
  runtimeHours: number,
  subsAvailable: boolean = subtitleLanguagesAvailable === null ? true : subtitleLanguagesAvailable.length > 0,
  movieTitle?: string,
  movieYear?: number,
): PickAllResult {
  const cached = new Set(cachedHashes);
  // Headroom factor: leave ~30% of measured bandwidth as buffer for transient
  // network contention (other devices, ISP jitter, encode-rate variance within
  // a file). 0.7 is the right number for hardwired TVs — wifi would warrant
  // 0.5–0.6 because of sustained-rate fluctuation. Bumping from 0.6 → 0.7
  // unlocks ~17% more candidates without observed buffering on this TV's
  // measured 85 Mbps sustained throughput.
  const maxBitrateMbps = caps.bandwidthMbps * 0.7;

  const stage1 = candidates.filter((c) => cached.has(c.hash));
  if (stage1.length === 0) return { kind: 'rejected', reason: 'no_cached' };
  // Implausible-size filter. Real movies are at least 200 MB (low-quality
  // 720p 1-hour) or runtime_min * 5 MB (whichever is larger). Anything below
  // that is almost always a sample.mkv from a multi-file torrent, an RD-style
  // copyright placeholder, or a junk cache entry. Filtering here saves the
  // user from watching the player flicker through them at playback time.
  const stage1b = stage1.filter((c) => bytesOK(c, runtimeHours));
  if (stage1b.length === 0) return { kind: 'rejected', reason: 'no_cached' };
  const stage2 = stage1b.filter((c) => videoCodecOK(c, caps));
  if (stage2.length === 0) return { kind: 'rejected', reason: 'no_compatible_codec' };
  const stage3 = stage2.filter((c) => audioCodecOK(c, caps));
  if (stage3.length === 0) return { kind: 'rejected', reason: 'no_compatible_audio' };
  const stage4 = stage3.filter((c) => audioLanguageOK(c, settings));
  if (stage4.length === 0) return { kind: 'rejected', reason: 'no_acceptable_language' };
  const stage5 = stage4.filter((c) => bitrateOK(c, runtimeHours, maxBitrateMbps));
  if (stage5.length === 0) return { kind: 'rejected', reason: 'no_acceptable_bitrate' };

  // Title + year sanity check. Torrentio returns whatever is tagged with a
  // given IMDb ID, including mislabeled uploads (Spanish/Latam films
  // uploaded under big-Hollywood-release IMDb IDs to game search rankings).
  // The candidate's filename has to plausibly contain the movie's title or
  // we can't trust it. Skipped if the caller didn't supply title/year.
  const stage6 = (movieTitle && movieYear)
    ? stage5.filter((c) => titleYearOK(c, movieTitle, movieYear))
    : stage5;
  if (stage6.length === 0) return { kind: 'rejected', reason: 'no_title_match' };

  if (settings.require_subtitles && !subsAvailable) {
    return { kind: 'rejected', reason: 'no_subtitles' };
  }

  const sorted = [...stage6].sort((a, b) => score(b, settings, caps) - score(a, settings, caps));
  return { kind: 'picks', candidates: sorted };
}

/** Single-pick wrapper for callers that only want the best one. */
export function rankAndPick(
  candidates: StreamCandidate[],
  cachedHashes: string[],
  caps: Capabilities,
  settings: Settings,
  subtitleLanguagesAvailable: string[] | null,
  runtimeHours: number,
  subsAvailable?: boolean,
  movieTitle?: string,
  movieYear?: number,
): PickResult {
  const all = rankAll(candidates, cachedHashes, caps, settings, subtitleLanguagesAvailable, runtimeHours, subsAvailable, movieTitle, movieYear);
  if (all.kind === 'rejected') return all;
  return { kind: 'pick', candidate: all.candidates[0] };
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'is', 'it', 'for', 'with']);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    // Keep alphanumeric and whitespace only. Note: NOT \w because \w
    // includes underscore, which torrent filenames use as a separator
    // (e.g. "Project_Hail_Mary"). We want underscores split, not joined.
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
}

/**
 * Verify the filename plausibly belongs to the requested movie. Two signals:
 *   - Title token overlap: how many non-stop-word tokens from the movie's
 *     title appear in the filename.
 *   - Year match: is the movie's release year present as a 4-digit year in
 *     the filename.
 *
 * Acceptance:
 *   - If the title has 2+ tokens: need 2 token matches, OR 1 token + year.
 *   - If the title has 1 token (rare; e.g. "Up"): need that token AND year.
 *
 * This catches mislabeled uploads where a foreign film was tagged with the
 * IMDb ID of a popular release for SEO. Real rips of major movies always
 * include the title and year in the filename.
 */
export function titleYearOK(c: StreamCandidate, movieTitle: string, movieYear: number): boolean {
  const titleTokens = tokenize(movieTitle);
  if (titleTokens.length === 0) return true; // can't check meaningfully
  const fileTokens = new Set(tokenize(c.filename));
  const matched = titleTokens.filter((t) => fileTokens.has(t)).length;
  const yearMatch = movieYear > 0 && new RegExp(`\\b${movieYear}\\b`).test(c.filename);
  if (titleTokens.length >= 2) {
    return matched >= 2 || (matched >= 1 && yearMatch);
  }
  return matched >= 1 && yearMatch;
}

function videoCodecOK(c: StreamCandidate, caps: Capabilities): boolean {
  const v = c.parsed.video_codec;
  if (!v) return true; // unknown — give it a chance
  if (v === 'h264') return caps.codecs.h264;
  if (v === 'h265') return caps.codecs.h265_main || caps.codecs.h265_main10;
  if (v === 'vp9') return caps.codecs.vp9;
  if (v === 'av1') return caps.codecs.av1;
  return true;
}

function audioCodecOK(c: StreamCandidate, caps: Capabilities): boolean {
  const a = c.parsed.audio_codec;
  if (!a) return true; // unknown — assume AAC
  if (a === 'aac') return caps.codecs.aac;
  if (a === 'ac3') return caps.codecs.ac3;
  if (a === 'eac3') return caps.codecs.eac3;
  // dts, truehd, flac, opus all unsupported in <video> on Chromium 79 web context
  return false;
}

function audioLanguageOK(c: StreamCandidate, settings: Settings): boolean {
  if (settings.audio_language === 'any') return true;
  return c.parsed.audio_languages.includes(settings.audio_language);
}

function bitrateOK(c: StreamCandidate, runtimeHours: number, maxMbps: number): boolean {
  if (runtimeHours <= 0) return true;
  const bitrateMbps = (c.bytes * 8) / 1_000_000 / (runtimeHours * 3600);
  return bitrateMbps <= maxMbps;
}

const MIN_BYTES_ABSOLUTE = 200_000_000;        // 200 MB — covers an unknown-runtime case
const MIN_BYTES_PER_MINUTE = 5_000_000;        // 5 MB/min ≈ 666 kbps, well below any real movie
function bytesOK(c: StreamCandidate, runtimeHours: number): boolean {
  if (!c.bytes) return false;                    // no size reported = can't vouch for it
  const expected = runtimeHours > 0
    ? Math.max(MIN_BYTES_ABSOLUTE, runtimeHours * 60 * MIN_BYTES_PER_MINUTE)
    : MIN_BYTES_ABSOLUTE;
  return c.bytes >= expected;
}

const SOURCE_RANK: Record<string, number> = { remux: 5, bluray: 4, webdl: 3, webrip: 2, hdtv: 1, dvdrip: 0 };

function score(c: StreamCandidate, settings: Settings, _caps: Capabilities): number {
  let s = 0;
  // Resolution preference
  const target: '1080p' | '2160p' = settings.prefer_4k ? '2160p' : '1080p';
  if (c.parsed.resolution === target) s += 100;
  else if (c.parsed.resolution === '1080p') s += 50;
  else if (c.parsed.resolution === '2160p') s += 30;

  // File size sanity for 1080p (sweet spot 2–6 GB)
  if (c.parsed.resolution === '1080p') {
    const gb = c.bytes / 1_000_000_000;
    if (gb >= 2 && gb <= 6) s += 30;
    else if (gb > 12) s -= 30; // 1080p REMUX overkill
  }

  // Source quality. Screener tier (CAM/HDCAM/TELESYNC/SCR/etc.) gets a
  // large flat penalty so even a 1080p CAM upscale ranks below a 720p
  // WEB-DL. Screeners are only picked when nothing cleaner exists.
  if (c.parsed.source === 'screener') s -= 200;
  else s += (SOURCE_RANK[c.parsed.source ?? ''] ?? 0) * 5;

  // Tie-breaker: more seeds = more reliably cached
  s += Math.min(c.seeds / 100, 10);

  return s;
}
