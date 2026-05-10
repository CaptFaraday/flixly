import type { Capabilities } from '../types';

const CACHE_KEY = 'capabilities-v1';
const REPROBE_BANDWIDTH_AFTER_MS = 30 * 60 * 1000; // 30 min
const PROBE_FILE_URL = 'https://speed.cloudflare.com/__down?bytes=5000000'; // 5 MB

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

export function probeCodecs(): Capabilities['codecs'] {
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
