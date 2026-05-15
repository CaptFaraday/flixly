import type { Movie } from '../types';

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

function getApiKey(): string {
  // In a Vite build, import.meta.env.VITE_TMDB_API_KEY is statically inlined.
  // In Vitest, Vite's SSR transform writes a fresh import.meta.env literal per
  // module, so test stubs of process.env are the only viable runtime override —
  // we check process.env first so vi.stubEnv() in tests wins over the value
  // statically inlined from .env. Browsers have no process global, so this is
  // a no-op there and import.meta.env wins as intended.
  const fromProc = (globalThis as any).process?.env?.VITE_TMDB_API_KEY as string | undefined;
  if (fromProc) return fromProc;
  const fromMeta = (import.meta as any).env?.VITE_TMDB_API_KEY as string | undefined;
  return fromMeta ?? '';
}

export async function searchMovies(query: string): Promise<Movie[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `${BASE}/search/movie?api_key=${encodeURIComponent(getApiKey())}&query=${encodeURIComponent(q)}&include_adult=false&language=en-US`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`TMDb search ${r.status}`);
  const data = await r.json();
  return (data.results ?? []).slice(0, 30).map(tmdbToMovie);
}

export async function hydrateImdbId(tmdbId: number): Promise<string | null> {
  const url = `${BASE}/movie/${tmdbId}/external_ids?api_key=${encodeURIComponent(getApiKey())}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    return data.imdb_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch the full TMDb movie record (runtime, cast, director, genres, imdb_id)
 * in one call. Search results are sparse — TMDb's /search endpoint only
 * returns title/year/poster/overview, not runtime or credits. Without this
 * the Detail screen shows "0h 0m" and the player's placeholder-detection
 * threshold falls back to the loose absolute 5-minute rule.
 */
export async function hydrateMovie(base: Movie): Promise<Movie | null> {
  const url = `${BASE}/movie/${base.tmdb_id}?api_key=${encodeURIComponent(getApiKey())}&append_to_response=external_ids,credits`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const imdb_id = data.external_ids?.imdb_id ?? '';
    if (!imdb_id) return null;  // can't play without an IMDb ID anyway
    const director = (data.credits?.crew ?? []).find((c: any) => c.job === 'Director')?.name;
    const cast = (data.credits?.cast ?? []).slice(0, 8).map((c: any) => c.name);
    return {
      ...base,
      imdb_id,
      runtime: Number(data.runtime) || base.runtime,
      genres: (data.genres ?? []).map((g: any) => g.name),
      director,
      cast,
      overview: data.overview || base.overview,
    };
  } catch {
    return null;
  }
}

function tmdbToMovie(r: any): Movie {
  return {
    imdb_id: '',
    tmdb_id: r.id,
    title: r.title,
    year: r.release_date ? Number(r.release_date.slice(0, 4)) || 0 : 0,
    runtime: 0,
    genres: [],
    poster: r.poster_path ? `${IMG}/w500${r.poster_path}` : '',
    backdrop: r.backdrop_path ? `${IMG}/original${r.backdrop_path}` : '',
    overview: r.overview ?? '',
    scores: r.vote_average ? { imdb: Number(r.vote_average.toFixed(1)) } : {},
    cast: [],
  };
}
