# `rows.json` Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node + GitHub Action that hits TMDb + OMDb daily, produces a real `rows.json`, commits it back to the repo, and update the Flixly TV app to fetch from `raw.githubusercontent.com` with stale-while-revalidate caching for a seamless UX.

**Architecture:** Backend script (`backend/`) runs in CI via daily cron + manual `workflow_dispatch`. Writes `rows.json` to repo root. App fetches from `raw.githubusercontent.com/CaptFaraday/flixly/main/rows.json` on cold start using stale-while-revalidate (show cached immediately, refresh in background). Loading skeletons replace blank "Loading…" text so the app boot feels instant. Network-only on the TV — localStorage cache is the practical fallback.

**Tech Stack:** Node 20, TypeScript 5, `tsx` (fast TS execution), `node-fetch` polyfill (Node 20 has fetch built-in, no polyfill needed), Vitest, GitHub Actions, GitHub `gh` CLI for repo + secret setup.

**Spec reference:** `docs/superpowers/specs/2026-05-10-rows-backend-design.md`

---

## File Structure

```
flixly/  (project root)
├── backend/                                NEW
│   ├── tsconfig.json                       Node-target TS config
│   ├── build-rows.ts                       orchestrator entry point
│   ├── sources/
│   │   ├── tmdb.ts                         TMDb client
│   │   ├── tmdb.test.ts
│   │   ├── omdb.ts                         OMDb client
│   │   └── omdb.test.ts
│   └── lib/
│       ├── score.ts                        composite score formula
│       ├── score.test.ts
│       ├── digital-release.ts              resolve digital release date
│       └── digital-release.test.ts
├── src/
│   ├── data/
│   │   └── rows.ts                         MODIFIED — network fetch w/ stale-while-revalidate
│   ├── components/
│   │   ├── Skeleton.tsx                    NEW — generic shimmer skeleton
│   │   ├── HeroSkeleton.tsx                NEW — hero placeholder during load
│   │   ├── RowSkeleton.tsx                 NEW — row placeholder during load
│   │   └── BrandShelfSkeleton.tsx          NEW — brand shelf placeholder
│   ├── screens/
│   │   └── Home.tsx                        MODIFIED — uses skeletons + soft error state
│   └── theme/
│       └── animations.css                  MODIFIED — add shimmer keyframes
├── public/
│   └── sample-rows.json                    REMOVED
├── package.json                            MODIFIED — add backend deps
├── rows.json                               NEW (generated, committed by CI)
├── .github/
│   └── workflows/
│       └── refresh.yml                     NEW — daily cron + commit-back
├── .env.example                            EXISTS
└── README.md                               MODIFIED — backend setup section
```

---

## Task 1: Backend package config + TS setup

**Files:**
- Modify: `package.json` (add `tsx`, `vitest` config for backend)
- Create: `backend/tsconfig.json`

- [ ] **Step 1: Add `tsx` to package.json devDependencies**

Open `package.json`, add to `devDependencies`:

```json
"tsx": "^4.19.2"
```

- [ ] **Step 2: Run `npm install` to install tsx**

```bash
npm install
```

Expected: tsx is added; `npx tsx --version` works.

- [ ] **Step 3: Add backend test files to vitest config**

The existing `vite.config.ts` test config already picks up `**/*.test.ts` recursively, so backend tests will be discovered automatically without changes. Verify:

```bash
npx vitest run --reporter=verbose backend/  # currently 0 tests, should report 0 errors
```

Expected: `No test files found, exiting with code 1`. That's fine — we're confirming vitest is wired correctly.

- [ ] **Step 4: Create `backend/tsconfig.json`**

Backend uses Node target instead of the app's chrome79 target. tsx reads tsconfig from the file location upward, so a local tsconfig keeps the configs separated.

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node", "vitest/globals"],
    "noEmit": true
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 5: Add a backend script to package.json**

Add to `scripts`:

```json
"build-rows": "tsx backend/build-rows.ts"
```

- [ ] **Step 6: Verify**

```bash
npx tsc -b --noEmit
```

Expected: exit 0, no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json backend/tsconfig.json
git commit -m "feat(backend): scaffold Node TS config + tsx runner"
```

---

## Task 2: Composite score helper — write tests

**Files:**
- Create: `backend/lib/score.test.ts`

- [ ] **Step 1: Create `backend/lib/score.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { composite } from './score';

describe('composite', () => {
  it('combines RT, Metacritic, and IMDb according to the documented weights', () => {
    // RT × 0.5 + MC × 0.3 + (IMDb × 20) × 0.2
    // 90 × 0.5 + 80 × 0.3 + (8 × 20) × 0.2 = 45 + 24 + 32 = 101
    expect(composite({ rt: 90, metacritic: 80, imdb: 8 })).toBe(101);
  });

  it('falls back to TMDb vote_average × 20 when no scores available', () => {
    // (7.5 × 20) = 150 → that is the score in the absence of OMDb data
    expect(composite({ tmdbVoteAvg: 7.5 })).toBe(150);
  });

  it('uses partial scores when only some are present', () => {
    // Only RT given: 80 × 0.5 = 40 (no fallback applied because RT was provided)
    expect(composite({ rt: 80 })).toBe(40);
    // RT + MC: 80 × 0.5 + 70 × 0.3 = 40 + 21 = 61
    expect(composite({ rt: 80, metacritic: 70 })).toBe(61);
  });

  it('returns 0 when nothing is provided', () => {
    expect(composite({})).toBe(0);
  });

  it('treats null/undefined identically', () => {
    expect(composite({ rt: null as any, metacritic: undefined, imdb: 7 })).toBe(28);
  });
});
```

- [ ] **Step 2: Run the tests — they should fail (module missing)**

```bash
npx vitest run backend/lib/score.test.ts
```

Expected: FAIL with "Failed to resolve import './score'".

- [ ] **Step 3: Commit**

```bash
git add backend/lib/score.test.ts
git commit -m "test(backend): composite score specification"
```

---

## Task 3: Composite score helper — implement

**Files:**
- Create: `backend/lib/score.ts`

- [ ] **Step 1: Create `backend/lib/score.ts`**

```ts
export interface ScoreInputs {
  rt?: number | null;          // 0-100
  metacritic?: number | null;  // 0-100
  imdb?: number | null;        // 0-10
  tmdbVoteAvg?: number | null; // 0-10 (TMDb fallback)
}

/**
 * Composite review score, used to rank candidates within rows like
 * "Best of {year}" and "You Probably Missed". When OMDb provides RT/MC/IMDb
 * we use the weighted formula; when none of those exist, we fall back to
 * (TMDb vote_average × 20).
 *
 * Weights (per spec):  RT × 0.5 + Metacritic × 0.3 + (IMDb × 20) × 0.2
 */
export function composite(s: ScoreInputs): number {
  const hasOmdb =
    (s.rt != null && s.rt > 0) ||
    (s.metacritic != null && s.metacritic > 0) ||
    (s.imdb != null && s.imdb > 0);

  if (!hasOmdb) {
    return s.tmdbVoteAvg != null ? s.tmdbVoteAvg * 20 : 0;
  }

  const rtPart = (s.rt ?? 0) * 0.5;
  const mcPart = (s.metacritic ?? 0) * 0.3;
  const imdbPart = (s.imdb ?? 0) * 20 * 0.2;
  return rtPart + mcPart + imdbPart;
}
```

- [ ] **Step 2: Run tests — they should pass**

```bash
npx vitest run backend/lib/score.test.ts
```

Expected: 5 tests passing.

- [ ] **Step 3: Commit**

```bash
git add backend/lib/score.ts
git commit -m "feat(backend): composite score with TMDb fallback"
```

---

## Task 4: TMDb client — write tests

**Files:**
- Create: `backend/sources/tmdb.test.ts`

- [ ] **Step 1: Create `backend/sources/tmdb.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TmdbClient } from './tmdb';

describe('TmdbClient', () => {
  let fetchSpy: any;

  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => vi.restoreAllMocks());

  it('discover() sends Bearer token and returns parsed results', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      page: 1, total_results: 2, total_pages: 1,
      results: [
        { id: 1, title: 'Movie A', release_date: '2024-04-16', vote_average: 8.0, vote_count: 200, poster_path: '/a.jpg', backdrop_path: '/b.jpg', genre_ids: [18], overview: 'OA', popularity: 100 },
        { id: 2, title: 'Movie B', release_date: '2024-05-01', vote_average: 7.0, vote_count: 150, poster_path: '/c.jpg', backdrop_path: '/d.jpg', genre_ids: [35], overview: 'OB', popularity: 80 },
      ],
    })));

    const c = new TmdbClient('test-token');
    const result = await c.discover({ 'release_date.gte': '2024-04-01' });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].title).toBe('Movie A');

    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toContain('https://api.themoviedb.org/3/discover/movie');
    expect(call[0]).toContain('release_date.gte=2024-04-01');
    expect((call[1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-token',
      Accept: 'application/json',
    });
  });

  it('getDetails() returns expanded movie metadata', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 693134, imdb_id: 'tt15239678', title: 'Dune: Part Two',
      runtime: 166, release_date: '2024-03-01',
      vote_average: 8.5, vote_count: 6000,
      poster_path: '/p.jpg', backdrop_path: '/b.jpg', overview: 'Paul...',
      genres: [{ id: 878, name: 'Science Fiction' }],
      revenue: 711800000, popularity: 145.6,
    })));

    const c = new TmdbClient('test-token');
    const m = await c.getDetails(693134);
    expect(m.title).toBe('Dune: Part Two');
    expect(m.imdb_id).toBe('tt15239678');
    expect(m.runtime).toBe(166);
    expect(m.genres).toEqual(['Science Fiction']);
  });

  it('getCredits() returns simplified cast and director', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 1,
      cast: [
        { name: 'Star A', order: 0 },
        { name: 'Star B', order: 1 },
        { name: 'Bit', order: 50 },
      ],
      crew: [
        { name: 'Some Editor', job: 'Editor' },
        { name: 'Denis V', job: 'Director' },
      ],
    })));

    const c = new TmdbClient('test-token');
    const credits = await c.getCredits(1);
    expect(credits.director).toBe('Denis V');
    expect(credits.cast).toEqual(['Star A', 'Star B', 'Bit']); // top 3 by order
  });

  it('getReleaseDates() filters digital-type entries', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 1,
      results: [
        { iso_3166_1: 'US', release_dates: [
          { type: 3, release_date: '2024-03-01T00:00:00.000Z', note: 'Theatrical' },
          { type: 4, release_date: '2024-04-16T00:00:00.000Z', note: 'Digital' },
        ]},
      ],
    })));

    const c = new TmdbClient('test-token');
    const d = await c.getReleaseDates(1);
    expect(d.digital_us).toBe('2024-04-16');
  });

  it('throws on 401', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"status_message":"bad"}', { status: 401 }));
    const c = new TmdbClient('bad-token');
    await expect(c.discover({})).rejects.toThrow(/TMDb 401/);
  });

  it('retries once on 429 with Retry-After header before failing', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [], page: 1, total_results: 0, total_pages: 0 })));
    const c = new TmdbClient('t');
    const r = await c.discover({});
    expect(r.results).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests — fail (module missing)**

```bash
npx vitest run backend/sources/tmdb.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Commit**

```bash
git add backend/sources/tmdb.test.ts
git commit -m "test(backend): TMDb client specification"
```

---

## Task 5: TMDb client — implement

**Files:**
- Create: `backend/sources/tmdb.ts`

- [ ] **Step 1: Create `backend/sources/tmdb.ts`**

```ts
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
}

export class TmdbClient {
  constructor(private token: string) {}

  private async req(path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, String(v));
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
      });
      if (r.status === 429 && attempt === 0) {
        const wait = Number(r.headers.get('Retry-After') ?? '1') * 1000;
        await new Promise((res) => setTimeout(res, wait));
        continue;
      }
      if (!r.ok) throw new Error(`TMDb ${r.status}: ${await r.text().catch(() => '')}`);
      return r.json();
    }
    throw new Error('TMDb: rate limited and retry failed');
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
    return { digital_us };
  }
}
```

- [ ] **Step 2: Run tests — they should pass**

```bash
npx vitest run backend/sources/tmdb.test.ts
```

Expected: 6 tests passing.

- [ ] **Step 3: Commit**

```bash
git add backend/sources/tmdb.ts
git commit -m "feat(backend): TMDb v4-token REST client"
```

---

## Task 6: OMDb client — write tests

**Files:**
- Create: `backend/sources/omdb.test.ts`

- [ ] **Step 1: Create `backend/sources/omdb.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OmdbClient } from './omdb';

describe('OmdbClient', () => {
  let fetchSpy: any;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => vi.restoreAllMocks());

  it('returns parsed scores when OMDb has data', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      Response: 'True',
      imdbID: 'tt15239678',
      imdbRating: '8.5',
      Metascore: '79',
      Ratings: [
        { Source: 'Internet Movie Database', Value: '8.5/10' },
        { Source: 'Rotten Tomatoes', Value: '92%' },
        { Source: 'Metacritic', Value: '79/100' },
      ],
    })));

    const c = new OmdbClient('test-key');
    const scores = await c.getScores('tt15239678');
    expect(scores).toEqual({ rt: 92, metacritic: 79, imdb: 8.5 });
  });

  it('returns nulls when OMDb has no data', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      Response: 'False',
      Error: 'Movie not found!',
    })));

    const c = new OmdbClient('test-key');
    expect(await c.getScores('tt99999999')).toEqual({ rt: null, metacritic: null, imdb: null });
  });

  it('returns nulls and does not throw on 429 rate-limit', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Request limit reached!', { status: 401 }));
    const c = new OmdbClient('test-key');
    expect(await c.getScores('tt1')).toEqual({ rt: null, metacritic: null, imdb: null });
  });

  it('returns nulls when fields are absent', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      Response: 'True',
      imdbID: 'tt1',
      imdbRating: 'N/A',
      Ratings: [],
    })));
    const c = new OmdbClient('k');
    expect(await c.getScores('tt1')).toEqual({ rt: null, metacritic: null, imdb: null });
  });

  it('sends imdbID and key in query string', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ Response: 'False' })));
    const c = new OmdbClient('mykey123');
    await c.getScores('tt15239678');
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('i=tt15239678');
    expect(url).toContain('apikey=mykey123');
  });
});
```

- [ ] **Step 2: Run tests — fail (module missing)**

```bash
npx vitest run backend/sources/omdb.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add backend/sources/omdb.test.ts
git commit -m "test(backend): OMDb client specification"
```

---

## Task 7: OMDb client — implement

**Files:**
- Create: `backend/sources/omdb.ts`

- [ ] **Step 1: Create `backend/sources/omdb.ts`**

```ts
const BASE = 'https://www.omdbapi.com/';

export interface OmdbScores {
  rt: number | null;          // 0-100
  metacritic: number | null;  // 0-100
  imdb: number | null;        // 0-10
}

const NULL_SCORES: OmdbScores = { rt: null, metacritic: null, imdb: null };

export class OmdbClient {
  constructor(private apiKey: string) {}

  /**
   * Best-effort score lookup. Never throws — failures (network, rate-limit,
   * not-found, missing fields) all collapse to nulls so the caller can
   * fall back to TMDb data without try/catch noise.
   */
  async getScores(imdbId: string): Promise<OmdbScores> {
    const url = `${BASE}?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(this.apiKey)}`;
    let raw: any;
    try {
      const r = await fetch(url);
      if (!r.ok) return NULL_SCORES;
      raw = await r.json();
    } catch {
      return NULL_SCORES;
    }
    if (raw.Response !== 'True') return NULL_SCORES;

    const rtRating = (raw.Ratings ?? []).find((r: any) => r.Source === 'Rotten Tomatoes');
    const rt = rtRating ? parseInt(String(rtRating.Value).replace('%', ''), 10) : NaN;

    const mc = parseInt(raw.Metascore, 10);
    const imdb = parseFloat(raw.imdbRating);

    return {
      rt: Number.isFinite(rt) ? rt : null,
      metacritic: Number.isFinite(mc) ? mc : null,
      imdb: Number.isFinite(imdb) ? imdb : null,
    };
  }
}
```

- [ ] **Step 2: Run tests — they should pass**

```bash
npx vitest run backend/sources/omdb.test.ts
```

Expected: 5 tests passing.

- [ ] **Step 3: Commit**

```bash
git add backend/sources/omdb.ts
git commit -m "feat(backend): OMDb client (best-effort, never throws)"
```

---

## Task 8: Digital-release helper — tests + implementation

**Files:**
- Create: `backend/lib/digital-release.test.ts`
- Create: `backend/lib/digital-release.ts`

- [ ] **Step 1: Create `backend/lib/digital-release.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { resolveDigitalReleaseDate } from './digital-release';

describe('resolveDigitalReleaseDate', () => {
  it('returns digital_us when present', async () => {
    const tmdb = { getReleaseDates: vi.fn().mockResolvedValue({ digital_us: '2024-04-16' }) };
    expect(await resolveDigitalReleaseDate(tmdb as any, 1)).toBe('2024-04-16');
  });

  it('returns release_date as fallback when no digital window exists', async () => {
    const tmdb = {
      getReleaseDates: vi.fn().mockResolvedValue({ digital_us: undefined }),
      getDetails: vi.fn().mockResolvedValue({ release_date: '2024-03-01' } as any),
    };
    expect(await resolveDigitalReleaseDate(tmdb as any, 1)).toBe('2024-03-01');
  });

  it('caches per call so repeated lookups hit the network once', async () => {
    const getReleaseDates = vi.fn().mockResolvedValue({ digital_us: '2024-04-16' });
    const tmdb = { getReleaseDates };
    const cache = new Map<number, Promise<string | undefined>>();
    await resolveDigitalReleaseDate(tmdb as any, 1, cache);
    await resolveDigitalReleaseDate(tmdb as any, 1, cache);
    expect(getReleaseDates).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests — fail**

```bash
npx vitest run backend/lib/digital-release.test.ts
```

- [ ] **Step 3: Create `backend/lib/digital-release.ts`**

```ts
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
```

- [ ] **Step 4: Run tests — pass**

```bash
npx vitest run backend/lib/digital-release.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add backend/lib/digital-release.ts backend/lib/digital-release.test.ts
git commit -m "feat(backend): digital-release-date resolver with per-run cache"
```

---

## Task 9: build-rows.ts orchestrator

**Files:**
- Create: `backend/build-rows.ts`

This is the largest single task — composes everything else. No unit tests for the orchestrator itself; we'll smoke-test by running it locally in Task 10.

- [ ] **Step 1: Create `backend/build-rows.ts`**

```ts
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TmdbClient } from './sources/tmdb';
import type { DiscoverMovie } from './sources/tmdb';
import { OmdbClient } from './sources/omdb';
import { composite } from './lib/score';
import { resolveDigitalReleaseDate } from './lib/digital-release';

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
const releaseCache = new Map<number, Promise<string | undefined>>();

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

  const [scores, digitalReleaseDate] = await Promise.all([
    getOmdbScores(details.imdb_id),
    resolveDigitalReleaseDate(tmdb, d.id, releaseCache),
  ]);

  return {
    imdb_id: details.imdb_id,
    tmdb_id: d.id,
    title: details.title,
    year: Number(details.release_date?.slice(0, 4)) || 0,
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
  // Hydrate up to 60 candidates so we have headroom after quality filtering
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
  // Re-fetch details to get revenue (already cached)
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
  { id: 'neon',           title: 'NEON',          companyId: 193481, background_color: '#003a3a', voteCountMin: 20 },
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
```

- [ ] **Step 2: Verify it type-checks**

```bash
npx tsc -b --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/build-rows.ts
git commit -m "feat(backend): rows.json builder orchestrator"
```

---

## Task 10: Local smoke test of the backend

This is a manual verification task — no code changes.

- [ ] **Step 1: Verify `.env` has both keys**

```bash
cat .env
```

Expected: lines for `TMDB_TOKEN`, `TMDB_API_KEY`, `OMDB_API_KEY`. The OMDb key must have been activated via the email link before this step or scores will all be null.

- [ ] **Step 2: Run the builder**

```bash
npm run build-rows
```

Expected: takes 30–60 seconds. Logs `Building rows.json for {year}…` then `Wrote …/rows.json — 10 shelves, ~230 items.` Exit code 0.

- [ ] **Step 3: Eyeball the output**

```bash
head -120 rows.json
```

Verify:
- `generated_at` is current ISO timestamp
- First shelf is `just-hit-streaming` with real movies (not Picsum URLs)
- Brand shelves have items (A24, NEON, etc. are populated)
- Movie posters are TMDb image URLs (`https://image.tmdb.org/t/p/w500/...`)
- Cast and director fields are populated

- [ ] **Step 4: If any row is empty or malformed, debug now before pushing CI**

Common issues:
- Empty `just-hit-streaming` → no movies hit the digital window in last 60 days, OR OMDb key isn't activated. Loosen the date window temporarily, or skip the RT/IMDb filter to confirm
- Empty `studio-ghibli` → vote_count threshold too high; in `BRANDS` change `voteCountMin: 20` → `voteCountMin: 5` for that entry
- `marvel` shows nothing modern → wrong company id; try `7505` (Marvel Entertainment) instead of `420`

Fix any issues, re-run, re-eyeball.

- [ ] **Step 5: Once happy, commit the first rows.json**

```bash
git add rows.json
git commit -m "data: initial rows.json from local backend run"
```

The commit doesn't push yet — we don't have a remote. Task 12 sets that up.

---

## Task 11: Create the GitHub repo

- [ ] **Step 1: Confirm gh CLI is logged in**

```bash
gh auth status
```

Expected: logged in to `github.com` as `CaptFaraday`.

- [ ] **Step 2: Create the repo (public)**

```bash
gh repo create CaptFaraday/flixly --public --source=. --remote=origin --description "Custom Stremio replacement for LG WebOS"
```

Expected: creates the repo + sets `origin` remote. No push yet.

- [ ] **Step 3: Push the existing branch**

```bash
git push -u origin master
```

Expected: pushes all current commits. The repo is now live with rows.json visible at `https://github.com/CaptFaraday/flixly/blob/master/rows.json`.

- [ ] **Step 4: Verify the raw URL works from a browser or curl**

```bash
curl -sS -o /dev/null -w "%{http_code} %{size_download}\n" https://raw.githubusercontent.com/CaptFaraday/flixly/master/rows.json
```

Expected: `200 <some-large-number>`. (Note: branch is `master` because that's what `git init` created. If you want `main`, rename now: `git branch -m master main && git push origin main && gh repo edit --default-branch main`.)

- [ ] **Step 5: Decide branch name + lock it in**

If staying with `master`, no action needed but update the workflow file path in Task 13 to match. If switching to `main`:

```bash
git branch -m master main
git push origin main
git push origin --delete master
gh repo edit --default-branch main
```

For the rest of the plan I'll assume the branch is `main`. If you keep `master`, swap that name everywhere below.

---

## Task 12: Set GitHub Action secrets

- [ ] **Step 1: Set TMDB_TOKEN**

```bash
gh secret set TMDB_TOKEN --body "$(grep ^TMDB_TOKEN= .env | cut -d= -f2-)"
```

Expected: `✓ Set Actions secret TMDB_TOKEN for CaptFaraday/flixly`.

- [ ] **Step 2: Set OMDB_API_KEY**

```bash
gh secret set OMDB_API_KEY --body "$(grep ^OMDB_API_KEY= .env | cut -d= -f2-)"
```

- [ ] **Step 3: List secrets to confirm**

```bash
gh secret list
```

Expected: both secrets shown with recent timestamps.

---

## Task 13: refresh.yml workflow

**Files:**
- Create: `.github/workflows/refresh.yml`

- [ ] **Step 1: Create `.github/workflows/refresh.yml`**

```yaml
name: refresh rows.json

on:
  schedule:
    - cron: '0 9 * * *'      # 09:00 UTC daily
  workflow_dispatch:          # manual trigger

permissions:
  contents: write             # so the action can commit rows.json back

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx tsx backend/build-rows.ts
        env:
          TMDB_TOKEN: ${{ secrets.TMDB_TOKEN }}
          OMDB_API_KEY: ${{ secrets.OMDB_API_KEY }}
      - name: commit rows.json
        run: |
          git config user.name "flixly-bot"
          git config user.email "actions@github.com"
          if git diff --quiet rows.json; then
            echo "No changes to rows.json"
          else
            git add rows.json
            git commit -m "data: refresh rows.json [$(date -u +%Y-%m-%d)]"
            git push
          fi
```

- [ ] **Step 2: Commit + push**

```bash
git add .github/workflows/refresh.yml
git commit -m "ci: daily refresh.yml for rows.json"
git push
```

- [ ] **Step 3: Trigger the workflow manually to verify it runs**

```bash
gh workflow run refresh.yml
sleep 5
gh run list --workflow=refresh.yml --limit=1
```

Expected: a queued or in_progress run shows up.

- [ ] **Step 4: Watch the run**

```bash
gh run watch  # follow the most recent run
```

Expected: green checkmark when done. Total time ~3–4 min (npm ci is the slow part).

- [ ] **Step 5: Verify the workflow updated rows.json (or noop'd)**

```bash
git pull
git log --oneline -3
```

Expected: if rows.json content actually changed since the local-run commit, you'll see a new commit from `flixly-bot`. If unchanged, the workflow correctly noop'd.

---

## Task 14: Update `src/data/rows.ts` to network fetch with stale-while-revalidate

**Files:**
- Modify: `src/data/rows.ts`

This is where the seamless-UX direction lives in the app code. Stale-while-revalidate means: **always show cached data immediately on cold start, then refresh in the background**. The user never sees a blank loading screen on the second-or-later cold start.

- [ ] **Step 1: Replace `src/data/rows.ts` with**

```ts
import type { RowsFile } from '../types';

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
    // Fire-and-forget the refresh; notify caller when fresh data arrives
    networkPromise.then((fresh) => {
      if (fresh && opts.onUpdate) {
        // Only notify if the payload actually changed — avoids wasted re-renders
        if (JSON.stringify(fresh) !== JSON.stringify(cached)) opts.onUpdate(fresh);
      }
    });
    return Promise.resolve({ data: cached, fromCache: true });
  }

  // No cache — must await the network
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
```

- [ ] **Step 2: Verify type-checks**

```bash
npx tsc -b --noEmit
```

Expected: exit 0. (Home.tsx still has the old single-arg call signature — Task 16 updates it. Until then, type errors are expected. Skip type-check at this point if needed.)

Actually re-running: `npx tsc -b --noEmit` will fail because Home.tsx calls `fetchRows().then(setData)` with the old signature. That's OK — Task 16 fixes it. Don't commit yet.

---

## Task 15: Add loading skeletons + shimmer animation

**Files:**
- Create: `src/components/Skeleton.tsx`
- Create: `src/components/HeroSkeleton.tsx`
- Create: `src/components/RowSkeleton.tsx`
- Create: `src/components/BrandShelfSkeleton.tsx`
- Modify: `src/theme/animations.css`

Skeletons replace the "Loading…" text on cold starts (when no localStorage cache exists). The same shimmer effect is reused across the four skeletons.

- [ ] **Step 1: Add shimmer keyframes to `src/theme/animations.css`**

Append to the existing file:

```css
@keyframes flixly-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

[data-skeleton] {
  background: linear-gradient(
    90deg,
    rgba(40, 40, 44, 0.6) 0%,
    rgba(60, 60, 65, 0.85) 50%,
    rgba(40, 40, 44, 0.6) 100%
  );
  background-size: 200% 100%;
  animation: flixly-shimmer 1.6s linear infinite;
  border-radius: 4px;
}
```

- [ ] **Step 2: Create `src/components/Skeleton.tsx`**

```tsx
interface Props {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: any;
}

export function Skeleton({ width, height, radius, style }: Props) {
  return (
    <div
      data-skeleton
      style={{
        width, height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}
```

- [ ] **Step 3: Create `src/components/HeroSkeleton.tsx`**

```tsx
import { Skeleton } from './Skeleton';

export function HeroSkeleton() {
  return (
    <div style={frameStyle}>
      <div style={overlayStyle} />
      <div style={contentStyle}>
        <Skeleton width={140} height={26} radius={999} style={{ marginBottom: 24 }} />
        <Skeleton width={'72%'} height={84} radius={4} style={{ marginBottom: 18 }} />
        <Skeleton width={'42%'} height={20} radius={4} style={{ marginBottom: 22 }} />
        <Skeleton width={'94%'} height={18} radius={4} style={{ marginBottom: 8 }} />
        <Skeleton width={'88%'} height={18} radius={4} style={{ marginBottom: 32 }} />
        <div style={{ display: 'flex', gap: 12 }}>
          <Skeleton width={130} height={48} radius={4} />
          <Skeleton width={170} height={48} radius={4} />
        </div>
      </div>
    </div>
  );
}

const frameStyle: any = {
  position: 'absolute', top: 0, left: 0, right: 0, height: '60%',
  overflow: 'hidden',
};
const overlayStyle: any = {
  position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
  background: 'linear-gradient(180deg, rgba(20,20,22,0.4) 0%, rgba(10,10,10,0.85) 75%, var(--bg) 100%)',
};
const contentStyle: any = {
  position: 'absolute', bottom: '11%', left: '5%', maxWidth: '42%',
  zIndex: 5,
};
```

- [ ] **Step 4: Create `src/components/RowSkeleton.tsx`**

```tsx
import { Skeleton } from './Skeleton';

export function RowSkeleton() {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginBottom: 18 }}>
        <Skeleton width={220} height={26} radius={4} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 18 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} height={0} style={{ aspectRatio: '16/9', height: 'auto' }} radius={8} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create `src/components/BrandShelfSkeleton.tsx`**

```tsx
import { Skeleton } from './Skeleton';

export function BrandShelfSkeleton() {
  return (
    <section>
      <div style={{ marginBottom: 18 }}>
        <Skeleton width={220} height={26} radius={4} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 18 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} height={0} style={{ aspectRatio: '16/9', height: 'auto' }} radius={8} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Verify type-checks**

```bash
npx tsc -b --noEmit
```

Expected: still has the Home.tsx error from Task 14 — fix in Task 16.

---

## Task 16: Update Home screen for stale-while-revalidate + skeletons

**Files:**
- Modify: `src/screens/Home.tsx`

- [ ] **Step 1: Replace `src/screens/Home.tsx` with**

```tsx
import { useEffect, useState } from 'preact/hooks';
import { TopNav } from '../components/TopNav';
import { Hero } from '../components/Hero';
import { Row } from '../components/Row';
import { BrandShelf } from '../components/BrandShelf';
import { HeroSkeleton } from '../components/HeroSkeleton';
import { RowSkeleton } from '../components/RowSkeleton';
import { BrandShelfSkeleton } from '../components/BrandShelfSkeleton';
import { fetchRows } from '../data/rows';
import type { RowsFile, Movie, Collection, Row as RowType } from '../types';

interface Props {
  onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void;
  onSelectMovie: (m: Movie) => void;
  onSelectCollection: (c: Collection) => void;
}

export function Home({ onNavigate, onSelectMovie, onSelectCollection }: Props) {
  const [data, setData] = useState<RowsFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRows({ onUpdate: setData })
      .then(({ data }) => setData(data))
      .catch((e) => setError(String(e instanceof Error ? e.message : e)));
  }, []);

  if (error && !data) {
    return (
      <>
        <TopNav current="home" onNavigate={onNavigate} />
        <div style={errorStyle}>
          <h2 style={errorTitleStyle}>Couldn't load rows</h2>
          <p style={errorBodyStyle}>{error}</p>
          <p style={errorHintStyle}>Check your network and relaunch the app.</p>
        </div>
      </>
    );
  }

  if (!data) {
    // First-launch loading — render skeletons that match the real layout
    return (
      <>
        <TopNav current="home" onNavigate={onNavigate} />
        <HeroSkeleton />
        <div style={belowHeroStyle}>
          <BrandShelfSkeleton />
          <RowSkeleton />
        </div>
      </>
    );
  }

  const rows = data.shelves.filter((s): s is RowType => s.display === 'row');
  const collections = data.shelves.filter((s): s is Collection => s.display === 'collection');
  const heroMovie = rows[0]?.items[0];

  return (
    <>
      <TopNav current="home" onNavigate={onNavigate} />
      {heroMovie && <Hero movie={heroMovie} onPlay={() => onSelectMovie(heroMovie)} onMoreInfo={() => onSelectMovie(heroMovie)} />}
      <div style={belowHeroStyle}>
        {collections.length > 0 && <BrandShelf collections={collections} onSelect={onSelectCollection} />}
        {rows.map((row) => (
          <Row key={row.id} title={row.title} subtitle={row.subtitle} items={row.items} onSelect={onSelectMovie} />
        ))}
      </div>
    </>
  );
}

const belowHeroStyle: any = {
  position: 'absolute', top: '57%', left: '5%', right: '5%', bottom: '4%',
  display: 'flex', flexDirection: 'column', gap: 44,
  zIndex: 4,
};
const errorStyle: any = {
  padding: '120px 64px', maxWidth: 700,
};
const errorTitleStyle: any = {
  fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 400,
  margin: '0 0 16px', color: 'var(--text)',
};
const errorBodyStyle: any = {
  fontSize: 18, opacity: 0.8, marginBottom: 12,
};
const errorHintStyle: any = {
  fontSize: 16, opacity: 0.55,
};
```

- [ ] **Step 2: Verify type-checks**

```bash
npx tsc -b --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Verify tests still pass**

```bash
npm test
```

Expected: all 30 + 14 (5 score + 6 tmdb + 5 omdb + 3 digital-release - some math may shift slightly) tests passing. Verify count.

- [ ] **Step 4: Commit**

```bash
git add src/data/rows.ts src/screens/Home.tsx src/components/Skeleton.tsx src/components/HeroSkeleton.tsx src/components/RowSkeleton.tsx src/components/BrandShelfSkeleton.tsx src/theme/animations.css
git commit -m "feat(app): stale-while-revalidate rows.json fetch + loading skeletons"
```

---

## Task 17: Remove the bundled sample-rows.json

**Files:**
- Delete: `public/sample-rows.json`

- [ ] **Step 1: Delete the file**

```bash
rm public/sample-rows.json
```

- [ ] **Step 2: Verify no remaining references**

```bash
grep -rn 'sample-rows' src/ scripts/ backend/ docs/ 2>/dev/null | grep -v '^\s*//' | grep -v '^Binary'
```

Expected: zero matches in source code (some doc references in spec files are fine — they're describing past state).

- [ ] **Step 3: Verify build still works**

```bash
npm run build
```

Expected: exit 0, dist produced. Bundle size should drop ~3KB without the JSON.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove bundled sample-rows.json (replaced by network fetch)"
```

---

## Task 18: Deploy + verify on TV

This is the final manual verification on the actual TV.

- [ ] **Step 1: Deploy**

```bash
bash scripts/deploy.sh
```

Expected: build succeeds, IPK created, scp'd to TV, installed via luna, launched.

- [ ] **Step 2: First-launch experience (cache miss)**

If you've cleared localStorage or this is a fresh install, the first launch should:
1. Show TopNav immediately (logo + nav items)
2. Show Hero / BrandShelf / Row **skeletons** (shimmering grey boxes) within ~50ms
3. Replace skeletons with real content within ~500ms (the network fetch completes)

If you don't see skeletons because localStorage already has cached data from Plan 1, force-clear by SSH'ing to the TV:

```bash
ssh -p 9922 -i $HOME/.ssh/webos_rsa_dec -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa prisoner@10.0.0.238 \
  "rm -rf /home/prisoner/.local/share/com.flixly.tv 2>/dev/null; rm -rf /home/prisoner/.cache/com.flixly.tv 2>/dev/null; echo 'cleared'"
```

Then relaunch the app.

- [ ] **Step 3: Subsequent-launch experience (cache hit + revalidate)**

Close the app, relaunch. Should:
1. Show TopNav + cached content **immediately** (no skeletons — already have data)
2. Background fetch completes silently
3. If fresh data differs from cached, content swaps in (you may not visibly notice unless rows.json updated since last launch)

- [ ] **Step 4: Take a screenshot to confirm real movies show up**

```bash
sleep 5
node scripts/tv-screenshot.mjs tv-rows-live.png
```

Open `tv-rows-live.png` and verify:
- Hero shows a real recent-movie title and backdrop (not Picsum)
- Brand shelf has 7 real branded tiles
- "Just Hit Streaming" row shows real recent movies with TMDb-quality posters

- [ ] **Step 5: Test offline fallback**

Disable wifi on the TV (WebOS settings → Network → Disconnect), relaunch the app:
- Should still show last cached rows.json content
- No error UI

Re-enable wifi, no further verification needed.

- [ ] **Step 6: Test the manual workflow trigger end-to-end**

```bash
gh workflow run refresh.yml
gh run watch
git pull  # pull any new rows.json commit from CI
```

Expected: workflow runs green, CI commits a fresh rows.json (or noops if no changes), local repo gets updated.

---

## Plan complete

After Task 18, the rows.json backend is live and the TV app is fetching real curated movies daily.

### Files deferred to later plans

- The **continue-watching** row (sourced from localStorage `resumePositions`) — Plan 4 (Library)
- The **watchlist** row (sourced from localStorage `watchlist` + TMDb hydration) — Plan 4
- The **search screen** — Plan 3
- The **stream picker UI** for long-press OK — Plan 4
- **"Coming Soon to Streaming"** row — needs JustWatch-style scrape data; deferred indefinitely
