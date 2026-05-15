import type { Capabilities } from '../types';

const CACHE_KEY = 'capabilities-v1';
// Bandwidth doesn't actually change much within a single viewing session.
// The 30-min TTL we shipped originally is way more aggressive than reality
// and added ~700ms (a 5MB Cloudflare probe) to startup whenever a play
// happened to land on a stale cache. 6 hours covers a typical evening of
// watching without ever re-probing in the play hot path.
const REPROBE_BANDWIDTH_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours
// 25 MB probe — small enough to finish in ~2 sec on broadband, large enough
// to push past TCP slow-start. Empirically validated on this hardwired LG
// TV: 5 MB measured ~60 Mbps, 25 MB measured ~89 Mbps (the real ceiling).
// The smaller probe wasn't measuring sustained throughput, just the burst.
const PROBE_FILE_URL = 'https://speed.cloudflare.com/__down?bytes=25000000'; // 25 MB

const CODEC_TESTS = {
  h264: 'video/mp4; codecs="avc1.4D401E"',
  h265_main: 'video/mp4; codecs="hev1.1.6.L93.B0"',
  h265_main10: 'video/mp4; codecs="hev1.2.4.L93.B0"',
  vp9: 'video/webm; codecs="vp9"',
  av1: 'video/mp4; codecs="av01.0.04M.08"',
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  ac3: 'audio/mp4; codecs="ac-3"',
  eac3: 'audio/mp4; codecs="ec-3"',
} as const;

// canPlayType on WebOS lies in BOTH directions. Returns "probably" for
// codecs the *web* pipeline can't decode (HEVC, AV1, AC-3) and returns
// "" for containers the bridge actually plays fine (e.g. MKV — comes back
// empty but plays through). The right move on WebOS is to ignore
// canPlayType entirely and use what we've empirically verified.
//
// Verified on this LG NANO75 (webOS 6.0) by injecting test <video> elements
// with real Real-Debrid CDN URLs and reading the playback events:
// - 4K HEVC Main10 HDR in MKV → decodes, videoWidth=3840
// - AC-3 audio in MKV → audible (user-confirmed)
// - Multi-audio MKV → videoElement.audioTracks enumerates with language tags,
//   .enabled toggle persists. Standard HTML5 API; no Luna selectTrack needed.
//
// Not yet directly verified but supported by the official codec spec for
// webOS 6.0 (https://webostv.developer.lge.com/develop/specifications/video-audio-60):
// E-AC-3 (Dolby Digital Plus), AV1. Marked true on the strength of the spec;
// will revise if a real-world rip surfaces an issue.
//
// DTS / TrueHD remain false: canPlayType returns "" *and* the upstream
// Chromium bridge has no Dolby/DTS-licensed decoder for either.
const WEBOS_CODECS: Capabilities['codecs'] = {
  h264: true,
  h265_main: true,
  h265_main10: true,
  vp9: true,
  av1: true,
  aac: true,
  ac3: true,
  eac3: true,
};

function isWebOS(): boolean {
  return typeof navigator !== 'undefined' && /web0?os/i.test(navigator.userAgent);
}

export function probeCodecs(): Capabilities['codecs'] {
  if (isWebOS()) return { ...WEBOS_CODECS };
  // Desktop / dev path — let canPlayType decide.
  const v = document.createElement('video');
  const out: Record<string, boolean> = {};
  for (const [key, type] of Object.entries(CODEC_TESTS)) {
    out[key] = v.canPlayType(type) !== '';
  }
  return out as Capabilities['codecs'];
}

export async function probeBandwidthMbps(url = PROBE_FILE_URL): Promise<number> {
  const start = performance.now();
  const r = await fetch(url, { cache: 'no-store' });
  const buf = await r.arrayBuffer();
  const bytes = buf.byteLength;
  const ms = performance.now() - start;
  const mbps = (bytes * 8) / 1_000_000 / (ms / 1000);
  return mbps;
}

export async function ensureCapabilities(): Promise<Capabilities> {
  const cached = readCache();
  const now = Date.now();
  const codecsStale = !cached || JSON.stringify(cached.codecs) !== JSON.stringify(probeCodecs());
  const bandwidthStale = !cached || now - cached.probedAt > REPROBE_BANDWIDTH_AFTER_MS;

  if (cached && !codecsStale && !bandwidthStale) return cached;

  const codecs = probeCodecs();
  let bandwidthMbps = cached?.bandwidthMbps ?? 0;
  if (bandwidthStale || !cached) {
    try { bandwidthMbps = await probeBandwidthMbps(); }
    catch { bandwidthMbps = cached?.bandwidthMbps ?? 50; } // generous default on home wifi; user can lower in settings later
  }
  const fresh: Capabilities = { codecs, bandwidthMbps, probedAt: now };
  writeCache(fresh);
  return fresh;
}

function readCache(): Capabilities | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Capabilities) : null;
  } catch { return null; }
}
function writeCache(c: Capabilities): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* quota: ignore */ }
}
