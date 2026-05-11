import type { Movie, RowsFile } from '../types';

const ROWS_URL = 'https://raw.githubusercontent.com/CaptFaraday/flixly/main/rows.json';
const CACHE_KEY = 'rows-cache-v1';

interface FetchResult {
  data: RowsFile;
  fromCache: boolean;
}

/**
 * Stale-while-revalidate.
 *
 * 1. If we have a localStorage cache, resolve with it IMMEDIATELY (the
 *    `fromCache: true` result). The UI renders instantly.
 * 2. In parallel, fire a network fetch. If it succeeds, write the fresh
 *    payload to localStorage and call onUpdate so the UI can swap in the
 *    fresh content (skeleton-free, since we already have content rendered).
 * 3. If there is no cache, await the network fetch and resolve with that.
 * 4. If the network fetch fails AND we have no cache, throw.
 */
export function fetchRows(opts: { onUpdate?: (data: RowsFile) => void } = {}): Promise<FetchResult> {
  const cached = readCache();

  const networkPromise = (async (): Promise<RowsFile | null> => {
    try {
      const r = await fetch(ROWS_URL, { cache: 'no-store' });
      if (!r.ok) throw new Error(`rows fetch ${r.status}`);
      const data = (await r.json()) as RowsFile;
      writeCache(data);
      return data;
    } catch {
      return null;
    }
  })();

  if (cached) {
    networkPromise.then((fresh) => {
      if (fresh && opts.onUpdate) {
        if (JSON.stringify(fresh) !== JSON.stringify(cached)) opts.onUpdate(fresh);
      }
    });
    return Promise.resolve({ data: cached, fromCache: true });
  }

  return networkPromise.then((fresh) => {
    if (!fresh) throw new Error('Could not load rows (offline and no cache).');
    return { data: fresh, fromCache: false };
  });
}

function readCache(): RowsFile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as RowsFile) : null;
  } catch { return null; }
}

function writeCache(d: RowsFile): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); }
  catch { /* quota exceeded — ignore */ }
}

/**
 * Find a movie by imdb_id across all shelves in a RowsFile. Returns undefined
 * if not found (e.g. a movie that's in the user's resume state but has aged
 * out of rows.json). Callers should render a placeholder in that case.
 */
export function findMovie(rows: RowsFile | null, imdbId: string): Movie | undefined {
  if (!rows) return undefined;
  for (const shelf of rows.shelves) {
    for (const movie of shelf.items) {
      if (movie.imdb_id === imdbId) return movie;
    }
  }
  return undefined;
}
