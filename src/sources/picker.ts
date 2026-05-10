import type { StreamCandidate, Capabilities, Settings } from '../types';

export type PickReason =
  | 'no_cached'
  | 'no_compatible_codec'
  | 'no_compatible_audio'
  | 'no_acceptable_language'
  | 'no_acceptable_bitrate'
  | 'no_subtitles';

export type PickResult =
  | { kind: 'pick'; candidate: StreamCandidate }
  | { kind: 'rejected'; reason: PickReason };

export function rankAndPick(
  candidates: StreamCandidate[],
  cachedHashes: string[],
  caps: Capabilities,
  settings: Settings,
  subtitleLanguagesAvailable: string[] | null,
  runtimeHours: number,
  subsAvailable: boolean = subtitleLanguagesAvailable === null ? true : subtitleLanguagesAvailable.length > 0,
): PickResult {
  const cached = new Set(cachedHashes);
  const maxBitrateMbps = caps.bandwidthMbps * 0.6;

  // Hard filters
  const stage1 = candidates.filter((c) => cached.has(c.hash));
  if (stage1.length === 0) return { kind: 'rejected', reason: 'no_cached' };

  const stage2 = stage1.filter((c) => videoCodecOK(c, caps));
  if (stage2.length === 0) return { kind: 'rejected', reason: 'no_compatible_codec' };

  const stage3 = stage2.filter((c) => audioCodecOK(c, caps));
  if (stage3.length === 0) return { kind: 'rejected', reason: 'no_compatible_audio' };

  const stage4 = stage3.filter((c) => audioLanguageOK(c, settings));
  if (stage4.length === 0) return { kind: 'rejected', reason: 'no_acceptable_language' };

  const stage5 = stage4.filter((c) => bitrateOK(c, runtimeHours, maxBitrateMbps));
  if (stage5.length === 0) return { kind: 'rejected', reason: 'no_acceptable_bitrate' };

  if (settings.require_subtitles && !subsAvailable) {
    return { kind: 'rejected', reason: 'no_subtitles' };
  }

  // Soft sort
  const sorted = [...stage5].sort((a, b) => score(b, settings, caps) - score(a, settings, caps));
  return { kind: 'pick', candidate: sorted[0] };
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

  // Source quality
  s += (SOURCE_RANK[c.parsed.source ?? ''] ?? 0) * 5;

  // Tie-breaker: more seeds = more reliably cached
  s += Math.min(c.seeds / 100, 10);

  return s;
}
