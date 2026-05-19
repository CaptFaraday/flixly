const BASE = 'https://api.themoviedb.org/3';

export interface DiscoverFilters {
  'release_date.gte'?: string;
  'release_date.lte'?: string;
  primary_release_year?: number;
  'vote_count.gte'?: number;
  with_companies?: number | string;
  with_release_type?: number;
  with_original_language?: string;
  sort_by?: string;
  page?: number;
}

export interface DiscoverMovie {
  id: number;
  title: string;
  release_date: string;
  vote_average: number;
  vote_count: number;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  overview: string;
  popularity: number;
}

export interface DiscoverResponse {
  page: number;
  total_results: number;
  total_pages: number;
  results: DiscoverMovie[];
}

export interface MovieDetails {
  id: number;
  imdb_id: string | null;
  title: string;
  runtime: number | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  genres: string[];
  revenue: number;
  popularity: number;
}

export interface Credits {
  director: string | undefined;
  cast: string[];
}

export interface ReleaseDates {
  digital_us: string | undefined;       // ISO YYYY-MM-DD or undefined
  earliest: string | undefined;         // ISO YYYY-MM-DD: earliest release across all countries/types
}

// Module-level concurrency limiter so all TmdbClient instances share
// one in-flight pool. TMDb's documented limit is ~50/sec and we have
// many parallel callers; cap at 10 in-flight to stay well below.
const MAX_CONCURRENT = 10;
let inFlight = 0;
const waitQueue: Array<() => void> = [];
async function acquire(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) { inFlight++; return; }
  return new Promise((resolve) => waitQueue.push(() => { inFlight++; resolve(); }));
}
function release(): void {
  inFlight--;
  const next = waitQueue.shift();
  if (next) next();
}

export class TmdbClient {
  constructor(private token: string) {}

  private async req(path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, String(v));
    }

    await acquire();
    try {
      // Retry up to 3 times on 429 with exponential backoff (TMDb's Retry-After
      // header is not always present, so we use a sensible default).
      for (let attempt = 0; attempt < 4; attempt++) {
        const r = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
        });
        if (r.status === 429 && attempt < 3) {
          const headerWait = Number(r.headers.get('Retry-After') ?? '0') * 1000;
          const backoff = Math.max(headerWait, (attempt + 1) * 1000);
          await new Promise((res) => setTimeout(res, backoff));
          continue;
        }
        if (!r.ok) throw new Error(`TMDb ${r.status}: ${await r.text().catch(() => '')}`);
        return r.json();
      }
      throw new Error('TMDb: rate limited and retry failed');
    } finally {
      release();
    }
  }

  async discover(filters: DiscoverFilters): Promise<DiscoverResponse> {
    return this.req('/discover/movie', filters as any);
  }

  async getDetails(tmdbId: number): Promise<MovieDetails> {
    const raw = await this.req(`/movie/${tmdbId}`);
    return {
      id: raw.id,
      imdb_id: raw.imdb_id ?? null,
      title: raw.title,
      runtime: raw.runtime ?? null,
      release_date: raw.release_date,
      vote_average: raw.vote_average,
      vote_count: raw.vote_count,
      poster_path: raw.poster_path,
      backdrop_path: raw.backdrop_path,
      overview: raw.overview,
      genres: (raw.genres ?? []).map((g: any) => g.name),
      revenue: raw.revenue ?? 0,
      popularity: raw.popularity ?? 0,
    };
  }

  async getCredits(tmdbId: number): Promise<Credits> {
    const raw = await this.req(`/movie/${tmdbId}/credits`);
    const director = (raw.crew ?? []).find((c: any) => c.job === 'Director')?.name;
    const cast = (raw.cast ?? [])
      .slice()
      .sort((a: any, b: any) => (a.order ?? 99) - (b.order ?? 99))
      .slice(0, 3)
      .map((c: any) => c.name);
    return { director, cast };
  }

  async getReleaseDates(tmdbId: number): Promise<ReleaseDates> {
    const raw = await this.req(`/movie/${tmdbId}/release_dates`);
    const us = (raw.results ?? []).find((r: any) => r.iso_3166_1 === 'US');
    const digital = us?.release_dates?.find((r: any) => r.type === 4);
    const digital_us = digital ? digital.release_date.slice(0, 10) : undefined;

    // Earliest release across all countries/types. Anchors year() for
    // titles whose /movie/.release_date points at a re-release event
    // (Hamilton: TMDb primary date 2025-09-05, Disney+ original 2020-07-03).
    let earliest: string | undefined;
    for (const country of raw.results ?? []) {
      for (const r of country.release_dates ?? []) {
        const d = (r.release_date ?? '').slice(0, 10);
        if (d && (!earliest || d < earliest)) earliest = d;
      }
    }
    return { digital_us, earliest };
  }
}
