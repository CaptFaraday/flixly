import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TmdbClient } from './sources/tmdb';
import type { DiscoverMovie, ReleaseDates } from './sources/tmdb';
import { OmdbClient } from './sources/omdb';
import { composite } from './lib/score';
import { pickReleaseYear } from './lib/release-year';

// ---------- env loading (no dotenv dep — read .env manually) ----------
function loadDotenvIfPresent() {
  try {
    const text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* no .env file — fine in CI where vars come from secrets */ }
}
loadDotenvIfPresent();

const TMDB_TOKEN = process.env.TMDB_TOKEN;
const OMDB_API_KEY = process.env.OMDB_API_KEY;
if (!TMDB_TOKEN) { console.error('Missing TMDB_TOKEN env'); process.exit(1); }
if (!OMDB_API_KEY) { console.error('Missing OMDB_API_KEY env'); process.exit(1); }

const tmdb = new TmdbClient(TMDB_TOKEN);
const omdb = new OmdbClient(OMDB_API_KEY);

// ---------- shared types (matches src/types.ts contract) ----------
interface Movie {
  imdb_id: string;
  tmdb_id: number;
  title: string;
  year: number;
  runtime: number;
  genres: string[];
  poster: string;
  backdrop: string;
  overview: string;
  scores: { rt?: number; metacritic?: number; imdb?: number };
  digital_release_date?: string;
  director?: string;
  cast: string[];
}
type Shelf =
  | { id: string; display: 'row'; title: string; subtitle?: string; items: Movie[] }
  | { id: string; display: 'collection'; title: string; logo_url?: string; background_color?: string; items: Movie[] };
interface RowsFile { generated_at: string; shelves: Shelf[]; }

// ---------- per-run caches ----------
const detailsCache = new Map<number, Promise<any>>();
const omdbCache = new Map<string, Promise<{ rt: number | null; metacritic: number | null; imdb: number | null }>>();

const getDetails = (id: number) => {
  if (!detailsCache.has(id)) detailsCache.set(id, tmdb.getDetails(id));
  return detailsCache.get(id)!;
};
const getCredits = (id: number) => tmdb.getCredits(id);
const getOmdbScores = (imdbId: string) => {
  if (!omdbCache.has(imdbId)) omdbCache.set(imdbId, omdb.getScores(imdbId));
  return omdbCache.get(imdbId)!;
};

const TMDB_IMG = 'https://image.tmdb.org/t/p';
const posterUrl = (p: string | null) => p ? `${TMDB_IMG}/w500${p}` : '';
const backdropUrl = (p: string | null) => p ? `${TMDB_IMG}/original${p}` : '';

// ---------- hydrate a discover result into a full Movie ----------
async function hydrate(d: DiscoverMovie): Promise<Movie | null> {
  const [details, credits] = await Promise.all([getDetails(d.id), getCredits(d.id)]);
  if (!details.imdb_id) return null; // can't fetch OMDb without imdb_id

  const [scores, releaseDates] = await Promise.all([
    getOmdbScores(details.imdb_id),
    tmdb.getReleaseDates(d.id),
  ]);
  const digitalReleaseDate = releaseDates.digital_us ?? details.release_date;

  return {
    imdb_id: details.imdb_id,
    tmdb_id: d.id,
    title: details.title,
    year: pickReleaseYear(details.release_date, releaseDates.earliest),
    runtime: details.runtime ?? 0,
    genres: details.genres,
    poster: posterUrl(details.poster_path),
    backdrop: backdropUrl(details.backdrop_path),
    overview: details.overview,
    scores: {
      ...(scores.rt != null ? { rt: scores.rt } : {}),
      ...(scores.metacritic != null ? { metacritic: scores.metacritic } : {}),
      ...(scores.imdb != null ? { imdb: scores.imdb } : {}),
    },
    ...(digitalReleaseDate ? { digital_release_date: digitalReleaseDate } : {}),
    ...(credits.director ? { director: credits.director } : {}),
    cast: credits.cast,
  };
}

// ---------- row builders ----------
function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

async function buildJustHitStreaming(): Promise<Shelf> {
  const today = new Date();
  const sixtyDaysAgo = new Date(today.getTime() - 60 * 86400_000);
  const r = await tmdb.discover({
    'release_date.gte': ymd(sixtyDaysAgo),
    with_release_type: 4,
    'vote_count.gte': 100,
    with_original_language: 'en',
    sort_by: 'popularity.desc',
    page: 1,
  });
  const candidates = r.results.slice(0, 60);
  const hydrated = (await Promise.all(candidates.map(hydrate))).filter((m): m is Movie => !!m);
  const filtered = hydrated.filter((m) => (m.scores.rt ?? 0) >= 75 || (m.scores.imdb ?? 0) >= 7.0);
  filtered.sort((a, b) => (b.digital_release_date ?? '').localeCompare(a.digital_release_date ?? ''));
  return {
    id: 'just-hit-streaming',
    display: 'row',
    title: 'Just Hit Streaming',
    subtitle: 'Theatrical → home, last 60 days',
    items: filtered.slice(0, 30),
  };
}

async function buildBestOfYear(year: number): Promise<Shelf> {
  const r = await tmdb.discover({
    primary_release_year: year,
    'vote_count.gte': 200,
    with_original_language: 'en',
    sort_by: 'vote_average.desc',
    page: 1,
  });
  const candidates = r.results.slice(0, 50);
  const hydrated = (await Promise.all(candidates.map(hydrate))).filter((m): m is Movie => !!m);
  hydrated.sort((a, b) => composite({
    rt: b.scores.rt, metacritic: b.scores.metacritic, imdb: b.scores.imdb,
    tmdbVoteAvg: undefined,
  }) - composite({
    rt: a.scores.rt, metacritic: a.scores.metacritic, imdb: a.scores.imdb,
    tmdbVoteAvg: undefined,
  }));
  return {
    id: `best-of-${year}`,
    display: 'row',
    title: `Best of ${year} So Far`,
    subtitle: `Top movies from ${year}`,
    items: hydrated.slice(0, 30),
  };
}

async function buildYouProbablyMissed(year: number): Promise<Shelf> {
  const r = await tmdb.discover({
    primary_release_year: year,
    'vote_count.gte': 100,
    sort_by: 'vote_average.desc',
    page: 1,
  });
  const candidates = r.results.slice(0, 60);
  const hydrated = (await Promise.all(candidates.map(hydrate))).filter((m): m is Movie => !!m);
  const withRevenue = await Promise.all(hydrated.map(async (m) => {
    const d = await getDetails(m.tmdb_id);
    return { movie: m, revenue: d.revenue ?? 0 };
  }));
  const filtered = withRevenue
    .filter((x) => x.revenue < 50_000_000 && (x.movie.scores.rt ?? 0) >= 80)
    .map((x) => x.movie);
  filtered.sort((a, b) => composite({
    rt: b.scores.rt, metacritic: b.scores.metacritic, imdb: b.scores.imdb,
  }) - composite({
    rt: a.scores.rt, metacritic: a.scores.metacritic, imdb: a.scores.imdb,
  }));
  return {
    id: 'you-probably-missed',
    display: 'row',
    title: 'You Probably Missed',
    subtitle: `Critically loved, didn't get the spotlight`,
    items: filtered.slice(0, 30),
  };
}

interface BrandConfig {
  id: string;
  title: string;
  companyId: number;
  background_color: string;
  voteCountMin?: number;
}

const BRANDS: BrandConfig[] = [
  { id: 'a24',            title: 'A24',           companyId: 41077,  background_color: '#0d0d0d', voteCountMin: 20 },
  { id: 'neon',           title: 'NEON',          companyId: 90733,  background_color: '#003a3a', voteCountMin: 20 },
  { id: 'studio-ghibli',  title: 'Studio Ghibli', companyId: 10342,  background_color: '#1e3a5f', voteCountMin: 20 },
  { id: 'pixar',          title: 'Pixar',         companyId: 3,      background_color: '#5b3b1e', voteCountMin: 100 },
  { id: 'marvel',         title: 'Marvel',        companyId: 420,    background_color: '#5a0d0d', voteCountMin: 100 },
  { id: 'searchlight',    title: 'Searchlight',   companyId: 43,     background_color: '#3d4a1e', voteCountMin: 50 },
  { id: 'focus-features', title: 'Focus',         companyId: 10146,  background_color: '#4a1e3a', voteCountMin: 50 },
];

async function buildBrand(b: BrandConfig): Promise<Shelf> {
  const r = await tmdb.discover({
    with_companies: b.companyId,
    'vote_count.gte': b.voteCountMin ?? 20,
    sort_by: 'popularity.desc',
    page: 1,
  });
  const candidates = r.results.slice(0, 30);
  const hydrated = (await Promise.all(candidates.map(hydrate))).filter((m): m is Movie => !!m);
  return {
    id: b.id,
    display: 'collection',
    title: b.title,
    background_color: b.background_color,
    items: hydrated.slice(0, 20),
  };
}

// ---------- main ----------
async function main() {
  const year = new Date().getUTCFullYear();
  console.log(`Building rows.json for ${year}…`);

  const [justHit, bestOf, missed, ...brands] = await Promise.all([
    buildJustHitStreaming(),
    buildBestOfYear(year),
    buildYouProbablyMissed(year - 1),
    ...BRANDS.map(buildBrand),
  ]);

  const file: RowsFile = {
    generated_at: new Date().toISOString(),
    shelves: [justHit, bestOf, missed, ...brands],
  };

  const out = resolve(process.cwd(), 'rows.json');
  writeFileSync(out, JSON.stringify(file, null, 2));
  console.log(`Wrote ${out} — ${file.shelves.length} shelves, ${file.shelves.reduce((n, s) => n + s.items.length, 0)} items.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
