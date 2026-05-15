import { signal, effect } from '@preact/signals';
import { loadJSON, saveJSON } from './persistence';
import type { Movie } from '../types';
import { fetchTorrentioCandidates, type DebridKeys } from '../sources/torrentio';

// Track per-movie stream availability so posters can show a "Not Available
// Yet" badge without each card hitting Torrentio. We populate this signal
// when the Detail screen pre-fetches candidates for any movie the user has
// visited; results are persisted to localStorage so the badge survives
// reloads.

export interface AvailabilityEntry {
  available: boolean;
  checkedAt: number; // epoch ms
}

const TTL_MS = 24 * 60 * 60 * 1000; // re-check after 24h

// The persisted shape is a plain object (Map doesn't JSON-serialize). The
// in-memory signal value is also a plain object so signal-equality checks
// stay cheap.
type AvailabilityMap = Record<string, AvailabilityEntry>;

export const availability = signal<AvailabilityMap>(loadJSON<AvailabilityMap>('availability-v1', {}));
effect(() => saveJSON('availability-v1', availability.value));

export function recordAvailability(imdb_id: string, available: boolean): void {
  if (!imdb_id) return;
  availability.value = {
    ...availability.value,
    [imdb_id]: { available, checkedAt: Date.now() },
  };
}

/**
 * What PosterCard reads. Returns:
 *   - 'unavailable' if we've confirmed no cached streams within the TTL
 *   - 'available' if we've confirmed cached streams exist within the TTL
 *   - 'unknown' if we've never checked or the result is stale
 *
 * Posters show the "Not Available Yet" badge only on 'unavailable'. We
 * deliberately do NOT show "available" indicators — that's the default
 * happy path. Stale or unknown = no badge.
 */
export function getAvailability(imdb_id: string): 'available' | 'unavailable' | 'unknown' {
  if (!imdb_id) return 'unknown';
  const entry = availability.value[imdb_id];
  if (!entry) return 'unknown';
  if (Date.now() - entry.checkedAt > TTL_MS) return 'unknown';
  return entry.available ? 'available' : 'unavailable';
}

/**
 * Background-sweep availability for a list of movies. Skips ones already in
 * cache (fresh entries). Throttled to `concurrency` parallel Torrentio
 * requests so a 60-poster Home doesn't burst 60 simultaneous fetches —
 * we'd be a bad neighbor to Torrentio AND likely hit per-IP rate limits.
 *
 * Each fetch is a no-op against the in-memory `candidateCache` if Detail
 * or Player already kicked off the same imdb_id; promises dedupe
 * automatically. So a movie focused on Home then opened in Detail does
 * one fetch total, not two.
 *
 * Fire and forget — caller doesn't await. UI updates reactively as each
 * recordAvailability call mutates the signal.
 */
export function prefetchAvailability(movies: Movie[], keys: DebridKeys, concurrency = 5): void {
  const queue = movies.filter((m) => m.imdb_id && getAvailability(m.imdb_id) === 'unknown');
  if (queue.length === 0) return;
  let i = 0;
  async function worker() {
    while (i < queue.length) {
      const m = queue[i++];
      try {
        const candidates = await fetchTorrentioCandidates(m.imdb_id, keys);
        recordAvailability(m.imdb_id, candidates.some((c) => !!c.directUrl));
      } catch {
        // Torrentio failure isn't fatal — leave entry unknown so we'll retry
        // next session. Don't record `false` (would falsely flag as
        // "Not Available Yet" when really the network/scrape just blipped).
      }
    }
  }
  for (let n = 0; n < concurrency; n++) void worker();
}
