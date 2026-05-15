const API_BASE = 'https://api.torbox.app/v1/api';

export type CachedFile = { id: number; name: string; short_name: string; size: number; mimetype: string };
export type CachedEntry = { hash: string; bestVideoFile: CachedFile | null };

/**
 * Real-time check of which hashes are streaming-ready on TorBox right now.
 *
 * Why: Torrentio's `cachedonly=true` filter checks Torrentio's scraper DB
 * ("we saw this hash as cached on TorBox the last time we crawled, hours
 * or days ago"). That cache is stale by the time the user presses Play —
 * TorBox evicts files as their storage fills. Passing a stale-cached URL
 * to `<video>` quietly creates a TorBox queue entry and serves the 30-sec
 * "Torrent is being downloaded to debrid…" placeholder MP4 while it
 * actually downloads. This endpoint is canonical (Torrentio uses it
 * internally during scraping) and eliminates ~80-95% of placeholder hits.
 *
 * Returns a Map keyed by lowercase hash. The bestVideoFile is the largest
 * `video/*` mimetype entry in the torrent — used to enrich our candidate
 * `bytes` field with the real per-file size (so picker decisions get more
 * accurate too).
 *
 * Empty input or missing key returns an empty map.
 * Network/HTTP failures return an empty map (caller falls back to
 * unfiltered candidates — multi-candidate fallback still catches issues).
 */
export async function checkCached(hashes: string[], apiKey: string): Promise<Map<string, CachedEntry>> {
  if (hashes.length === 0 || !apiKey) return new Map();
  try {
    const r = await fetch(`${API_BASE}/torrents/checkcached?format=list&list_files=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes }),
    });
    if (!r.ok) return new Map();
    const json = (await r.json()) as { data?: Array<{ hash: string; files?: CachedFile[] }> };
    const out = new Map<string, CachedEntry>();
    for (const entry of json.data ?? []) {
      const videos = (entry.files ?? []).filter((f) => (f.mimetype ?? '').startsWith('video/'));
      videos.sort((a, b) => b.size - a.size);
      const lc = (entry.hash ?? '').toLowerCase();
      if (lc) out.set(lc, { hash: lc, bestVideoFile: videos[0] ?? null });
    }
    return out;
  } catch (e) {
    console.warn('[flixly:torbox] checkCached failed', e);
    return new Map();
  }
}

/**
 * Delete a torrent from the user's TorBox queue by its info hash.
 *
 * Why: every time the player advances past a candidate (placeholder, codec
 * mismatch, network error), TorBox keeps the torrent it queued in response
 * to our resolve request. On Essential ($3/mo, 3 active slots) those failed
 * candidates accumulate as zombies and eventually saturate slots — at which
 * point new resolve calls return TorBox's "this torrent is being downloaded"
 * 30-second placeholder for everything. This cleanup keeps the queue lean.
 *
 * Fire-and-forget. Errors are swallowed because cleanup must not block the
 * player's fallback path or surface to the user.
 */
export async function deleteTorrentByHash(hash: string, apiKey: string): Promise<boolean> {
  if (!hash || !apiKey) return false;
  try {
    const list = await fetch(`${API_BASE}/torrents/mylist?bypass_cache=true`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!list.ok) return false;
    const json = (await list.json()) as { data?: Array<{ id: number; hash: string }> };
    const lc = hash.toLowerCase();
    const match = (json.data ?? []).find((e) => (e.hash ?? '').toLowerCase() === lc);
    if (!match) return false;
    const del = await fetch(`${API_BASE}/torrents/controltorrent`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ torrent_id: match.id, operation: 'delete', all: false }),
    });
    return del.ok;
  } catch (e) {
    console.warn('[flixly:torbox] cleanup failed for hash', hash, e);
    return false;
  }
}
