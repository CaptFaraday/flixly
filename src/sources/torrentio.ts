import type { StreamCandidate } from '../types';
import { parseName } from './parse-name';

// Public Torrentio addon. We always hit it WITH the user's RD key configured
// in the URL path so server-side cache pre-checking happens and we get
// resolver URLs back. Without the RD key in the path, Torrentio returns
// every torrent it knows about and we'd have to check cache ourselves —
// but RD removed the /torrents/instantAvailability endpoint in 2024 (returns
// 403 disabled_endpoint), so client-side cache checking no longer works.
const TORRENTIO_BASE = 'https://torrentio.strem.fun';

interface TorrentioStream {
  name: string;
  title: string;
  // Present when Torrentio returns the un-resolved form (no debrid configured).
  // ABSENT when configured with a debrid key — Torrentio drops infoHash from
  // the response and embeds the hash in the resolver URL path instead.
  infoHash?: string;
  // When Torrentio is configured with a debrid key, each stream includes
  // a resolver URL: hitting it 302-redirects to a time-limited RD CDN URL.
  // We hand this straight to <video src=...> — no addMagnet/unrestrict needed.
  url?: string;
  fileIdx?: number;
  behaviorHints?: { bingeGroup?: string; videoSize?: number; filename?: string };
}

// Extract the BitTorrent infohash from either the explicit `infoHash` field
// or the resolver URL (path segment after the provider+key, format
// `/resolve/<provider>/<key>/<hash>/...`). Returns empty string if neither.
function extractHash(s: TorrentioStream): string {
  if (s.infoHash) return s.infoHash.toLowerCase();
  if (s.url) {
    const m = s.url.match(/\/resolve\/[^/]+\/[^/]+\/([a-f0-9]{40})\//i);
    if (m) return m[1].toLowerCase();
  }
  return '';
}

function extractFilename(title: string, hint?: string): string {
  return hint || title.split('\n')[0]?.trim() || '';
}
function extractSeeds(title: string): number {
  const m = title.match(/👤\s*(\d+)/);
  return m ? Number(m[1]) : 0;
}
function extractBytes(title: string, hint?: number): number {
  if (hint) return hint;
  const m = title.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2].toUpperCase() === 'GB' ? Math.round(n * 1_000_000_000) : Math.round(n * 1_000_000);
}

export interface DebridKeys {
  torbox?: string;
  realdebrid?: string;
}

// Cache fetch promises by (imdbId, debrid keys) so concurrent calls from
// Detail (pre-fetch) and Player (actual play) share one in-flight request,
// and a second play of the same movie is instant. Keyed on debrid keys too
// so a key change invalidates the relevant slice. Promises are stored, not
// resolved values — so a slow-running first request is shared, not duplicated.
const candidateCache = new Map<string, Promise<StreamCandidate[]>>();
export function fetchTorrentioCandidates(imdbId: string, keys: DebridKeys): Promise<StreamCandidate[]> {
  const cacheKey = `${imdbId}|${keys.torbox || ''}|${keys.realdebrid || ''}`;
  let p = candidateCache.get(cacheKey);
  if (p) return p;
  p = fetchTorrentioCandidatesInner(imdbId, keys).catch((e) => {
    // On failure, evict so the next call retries instead of returning the
    // failure forever.
    candidateCache.delete(cacheKey);
    throw e;
  });
  candidateCache.set(cacheKey, p);
  return p;
}
async function fetchTorrentioCandidatesInner(imdbId: string, keys: DebridKeys): Promise<StreamCandidate[]> {
  // Pipe-separated config segment (%7C = '|'):
  //   cachedonly=true     — drop uncached streams server-side; everything
  //                         returned is known-playable on this debrid account.
  //   qualityfilter=cam,scr — strip obvious garbage we'd reject anyway.
  //   torbox=KEY OR realdebrid=KEY — debrid backend; torbox preferred since
  //                         RD's May 2026 filter-gate broke most cached content.
  //                         Torrentio uses this for both server-side cache
  //                         lookup AND for building per-stream resolver URLs.
  const debridParam = keys.torbox
    ? `torbox=${encodeURIComponent(keys.torbox)}`
    : keys.realdebrid
      ? `realdebrid=${encodeURIComponent(keys.realdebrid)}`
      : null;
  if (!debridParam) throw new Error('No debrid key configured (set torbox or realdebrid in Settings)');
  const config = `cachedonly=true%7Cqualityfilter=cam,scr%7C${debridParam}`;
  const r = await fetch(`${TORRENTIO_BASE}/${config}/stream/movie/${imdbId}.json`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Torrentio ${r.status}`);
  const data = (await r.json()) as { streams: TorrentioStream[] };
  return (data.streams ?? []).map((s) => {
    const filename = extractFilename(s.title, s.behaviorHints?.filename);
    return {
      hash: extractHash(s),
      filename,
      bytes: extractBytes(s.title, s.behaviorHints?.videoSize),
      seeds: extractSeeds(s.title),
      parsed: parseName(filename),
      directUrl: s.url,
    };
  });
}
