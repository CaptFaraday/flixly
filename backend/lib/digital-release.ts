import type { TmdbClient } from '../sources/tmdb';

/**
 * Resolves the digital release date for a movie. Prefers the explicit US
 * digital-release window from TMDb; falls back to the movie's main
 * release_date when no digital window is recorded.
 *
 * Pass an optional `cache` (Map) when looking up many movies in one run to
 * avoid double-fetching.
 */
export async function resolveDigitalReleaseDate(
  tmdb: Pick<TmdbClient, 'getReleaseDates' | 'getDetails'>,
  tmdbId: number,
  cache?: Map<number, Promise<string | undefined>>,
): Promise<string | undefined> {
  if (cache?.has(tmdbId)) return cache.get(tmdbId);
  const promise = (async () => {
    const r = await tmdb.getReleaseDates(tmdbId);
    if (r.digital_us) return r.digital_us;
    const d = await tmdb.getDetails(tmdbId);
    return d.release_date || undefined;
  })();
  cache?.set(tmdbId, promise);
  return promise;
}
