import type { Movie } from '../types';

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

function getApiKey(): string {
  // In a Vite build, import.meta.env.VITE_TMDB_API_KEY is statically inlined.
  // In Vitest, Vite's SSR transform writes a fresh import.meta.env literal per
  // module, so test stubs of process.env are the only viable runtime override.
  const fromMeta = (import.meta as any).env?.VITE_TMDB_API_KEY as string | undefined;
  if (fromMeta) return fromMeta;
  const fromProc = (globalThis as any).process?.env?.VITE_TMDB_API_KEY as string | undefined;
  return fromProc ?? '';
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
