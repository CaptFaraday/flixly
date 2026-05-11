# Nav Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three "Coming soon" nav placeholders in Flixly — Library, Brand Collection, and Search — with real, polished screens that share one `<PosterGrid>` component.

**Architecture:** Three new screen components (`Library.tsx`, `Collection.tsx`, `Search.tsx`), each with its own `.css` file. One shared `<PosterGrid>` component used by all three (6-up portrait poster grid). Search adds an on-screen QWERTY `<Keyboard>` and a browser-side TMDb v3 search client. `BRAND_CONFIG` extracted from `BrandTile` into `src/data/brands.ts` so the Collection screen can reuse it.

**Tech Stack:** Preact 10 + TypeScript, plain CSS (per-component files), Vite-built (`base: './'`, target chrome79), spatial focus engine already established in earlier plans.

**Spec reference:** `docs/superpowers/specs/2026-05-10-nav-surfaces-design.md`

**Out of scope (separate plans):**
- TV show search — Plan 5 will add `/search/multi` results + Series detail screen + episode picker
- Voice search — needs phone-as-remote or WebOS voice API integration
- Search history / recents — future plan

---

## File Structure

```
src/
  data/
    brands.ts                       NEW — BRAND_CONFIG extracted from BrandTile
    tmdb.ts                         NEW — browser-side v3 search client
    tmdb.test.ts                    NEW
    rows.ts                         MODIFY — add findMovie() helper
  components/
    BrandTile.tsx                   MODIFY — import BRAND_CONFIG from data/brands
    PosterCard.tsx                  MODIFY — add optional progress prop (Continue Watching bar)
    PosterCard.css                  MODIFY — add .poster__progress-bar rule
    PosterGrid.tsx                  NEW — shared 6-up portrait grid
    PosterGrid.css                  NEW
    Keyboard.tsx                    NEW — QWERTY on-screen keyboard
    Keyboard.css                    NEW
  screens/
    Library.tsx                     NEW
    Library.css                     NEW
    Collection.tsx                  NEW
    Collection.css                  NEW
    Search.tsx                      NEW
    Search.css                      NEW
  App.tsx                           MODIFY — wire 3 new routes (replace placeholders)
.env                                MODIFY — add VITE_TMDB_API_KEY
.env.example                        MODIFY — document the new var
```

---

## Task 1: Extract `BRAND_CONFIG` to `src/data/brands.ts`

**Files:**
- Create: `src/data/brands.ts`
- Modify: `src/components/BrandTile.tsx`

Pure refactor — no behavior change, but lets the Collection screen reuse the same brand map.

- [ ] **Step 1: Create `src/data/brands.ts`**

```ts
export interface BrandConfig {
  bg: string;
  logo?: string;
  logoFilter?: string;
}

export const BRAND_CONFIG: Record<string, BrandConfig> = {
  a24: { bg: '#000', logo: 'brand-logos/a24.svg', logoFilter: 'invert(1)' },
  neon: { bg: '#00d4d4', logo: 'brand-logos/neon.svg' },
  'studio-ghibli': { bg: '#1e3a5f', logo: 'brand-logos/studio-ghibli.svg', logoFilter: 'invert(1)' },
  pixar: { bg: '#fef3c7', logo: 'brand-logos/pixar.svg' },
  marvel: { bg: '#ed1d24', logo: 'brand-logos/marvel.svg' },
  searchlight: { bg: '#f5b942', logo: 'brand-logos/searchlight.svg' },
  'focus-features': { bg: '#1a1a2e', logo: 'brand-logos/focus-features.svg', logoFilter: 'invert(1)' },
};
```

- [ ] **Step 2: Update `src/components/BrandTile.tsx` to import from there**

Read the file first. Replace the inline `BRAND_CONFIG` declaration with:

```tsx
import { BRAND_CONFIG } from '../data/brands';
```

Delete the local `BrandConfig` interface and `BRAND_CONFIG` const declarations from BrandTile.tsx (they're now in brands.ts).

- [ ] **Step 3: Verify**

```bash
npx tsc -b --noEmit
npm run build
npm test
```

All clean, 49/49 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/data/brands.ts src/components/BrandTile.tsx
git commit -m "refactor: extract BRAND_CONFIG to src/data/brands.ts for reuse"
```

---

## Task 2: `PosterCard` gets a `progress` prop for Continue Watching bar

**Files:**
- Modify: `src/components/PosterCard.tsx`
- Modify: `src/components/PosterCard.css`

The Continue Watching row needs to show a thin progress bar at the bottom of each poster (showing `position / duration`). Adding an optional `progress?: number` prop is the cleanest way.

- [ ] **Step 1: Update `src/components/PosterCard.tsx` to accept and render progress**

Read the file. Change the props signature and add the bar:

```tsx
import { useFocusable } from '../nav/useFocusable';
import './PosterCard.css';
import type { Movie } from '../types';

interface Props {
  movie: Movie;
  rowId: string;
  onActivate: () => void;
  progress?: number;  // 0..1 — when set, renders a resume bar at the bottom
}

export function PosterCard({ movie, rowId, onActivate, progress }: Props) {
  const { ref, ...rest } = useFocusable({ onActivate, id: `poster-${rowId}-${movie.imdb_id}` });
  return (
    <div ref={ref as any} {...rest} className="poster">
      <div className="poster__inner">
        <img src={movie.poster} alt="" className="poster__img" />
        <div className="poster__info">
          <div className="poster__title">{movie.title}</div>
          <div className="poster__meta">
            <span className="poster__year">{movie.year}</span>
            {movie.scores.imdb != null && <span className="poster__rating">★ {movie.scores.imdb}</span>}
          </div>
        </div>
        {progress != null && progress > 0 && (
          <div className="poster__progress-track">
            <div className="poster__progress-bar" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append the progress-bar CSS to `src/components/PosterCard.css`**

Read the file first. Add these rules at the end:

```css
.poster__progress-track {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  background: rgba(0, 0, 0, 0.55);
}
.poster__progress-bar {
  height: 100%;
  background: var(--accent);
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc -b --noEmit
npm run build
npm test
```

Tests still 49/49. No visual change since no consumer passes `progress` yet.

- [ ] **Step 4: Commit**

```bash
git add src/components/PosterCard.tsx src/components/PosterCard.css
git commit -m "feat(ui): PosterCard accepts optional progress for Continue Watching bar"
```

---

## Task 3: `findMovie` helper in `src/data/rows.ts`

**Files:**
- Modify: `src/data/rows.ts`

The Library screen needs to hydrate `imdb_id` strings (from `watchlist` + `resumePositions`) into full `Movie` objects. Since rows.json already has full Movie objects for everything on the home screen, we scan it.

- [ ] **Step 1: Read `src/data/rows.ts` and append the helper**

Add to the bottom of the file:

```ts
import type { Movie } from '../types';

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
```

(`Movie` import may already exist from `RowsFile`'s definition — if so, skip the import line.)

- [ ] **Step 2: Verify**

```bash
npx tsc -b --noEmit
npm test
```

- [ ] **Step 3: Commit**

```bash
git add src/data/rows.ts
git commit -m "feat(data): findMovie helper for hydrating imdb_ids from rows.json"
```

---

## Task 4: `<PosterGrid>` shared component

**Files:**
- Create: `src/components/PosterGrid.tsx`
- Create: `src/components/PosterGrid.css`

A full-page 6-up portrait poster grid. Library uses it twice (CW + Watchlist), Collection uses it once, Search uses it once.

- [ ] **Step 1: Create `src/components/PosterGrid.tsx`**

```tsx
import './PosterGrid.css';
import { PosterCard } from './PosterCard';
import type { Movie } from '../types';

interface Props {
  items: Movie[];
  idPrefix: string;
  onSelect: (m: Movie) => void;
  emptyText?: string;
  progressMap?: Record<string, number>;
}

export function PosterGrid({ items, idPrefix, onSelect, emptyText, progressMap }: Props) {
  if (items.length === 0) {
    return <div className="poster-grid__empty">{emptyText ?? 'Nothing here yet.'}</div>;
  }
  return (
    <div className="poster-grid">
      {items.map((m) => (
        <PosterCard
          key={m.imdb_id || `${m.tmdb_id}`}
          movie={m}
          rowId={idPrefix}
          onActivate={() => onSelect(m)}
          progress={progressMap?.[m.imdb_id]}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/PosterGrid.css`**

```css
.poster-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--s-3);
}

.poster-grid__empty {
  padding: var(--s-5) 0;
  color: var(--text-muted);
  font-size: 20px;
  letter-spacing: 0.5px;
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc -b --noEmit
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/PosterGrid.tsx src/components/PosterGrid.css
git commit -m "feat(ui): shared PosterGrid component (6-up portrait grid)"
```

---

## Task 5: `<Library>` screen

**Files:**
- Create: `src/screens/Library.tsx`
- Create: `src/screens/Library.css`

Two stacked sections: Continue Watching + My Watchlist. Both backed by localStorage signals that already exist.

- [ ] **Step 1: Create `src/screens/Library.tsx`**

```tsx
import './Library.css';
import { useEffect, useState } from 'preact/hooks';
import { TopNav } from '../components/TopNav';
import { PosterGrid } from '../components/PosterGrid';
import { fetchRows, findMovie } from '../data/rows';
import { watchlist, resumePositions } from '../state/store';
import type { RowsFile, Movie } from '../types';

interface Props {
  onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void;
  onSelectMovie: (m: Movie) => void;
}

const FINISHED_THRESHOLD = 0.95;  // hide resume entries past 95% (already-watched)

export function Library({ onNavigate, onSelectMovie }: Props) {
  const [rows, setRows] = useState<RowsFile | null>(null);

  useEffect(() => {
    fetchRows({ onUpdate: setRows }).then(({ data }) => setRows(data)).catch(() => { /* localStorage cache will still work */ });
  }, []);

  // Continue Watching: sort resume entries by updated_at desc, skip finished
  const resumeEntries = Object.values(resumePositions.value)
    .filter((r) => r.duration_seconds > 0 && r.position_seconds / r.duration_seconds < FINISHED_THRESHOLD)
    .sort((a, b) => b.updated_at - a.updated_at);

  const continueWatching: Movie[] = resumeEntries
    .map((r) => findMovie(rows, r.imdb_id))
    .filter((m): m is Movie => !!m);

  const progressMap: Record<string, number> = Object.fromEntries(
    resumeEntries.map((r) => [r.imdb_id, r.position_seconds / r.duration_seconds]),
  );

  // Watchlist: imdb_ids in order they were added; hydrate to Movie
  const watchlistMovies: Movie[] = watchlist.value
    .map((id) => findMovie(rows, id))
    .filter((m): m is Movie => !!m);

  return (
    <>
      <TopNav current="library" onNavigate={onNavigate} />
      <main className="library">
        <h1 className="library__title">Library</h1>

        <section className="library__section">
          <h2 className="library__row-title">Continue Watching</h2>
          <PosterGrid
            items={continueWatching}
            idPrefix="cw"
            onSelect={onSelectMovie}
            progressMap={progressMap}
            emptyText="Nothing in progress. Movies you start will appear here."
          />
        </section>

        <section className="library__section">
          <h2 className="library__row-title">My Watchlist</h2>
          <PosterGrid
            items={watchlistMovies}
            idPrefix="wl"
            onSelect={onSelectMovie}
            emptyText="Your watchlist is empty. Press + Watchlist from any movie's detail page."
          />
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 2: Create `src/screens/Library.css`**

```css
.library {
  padding: calc(80px + var(--s-5)) var(--s-9) var(--s-7);  /* leave room for fixed TopNav */
}

.library__title {
  margin: 0 0 var(--s-7);
  font-family: var(--font-display);
  font-size: 64px;
  font-weight: 400;
  letter-spacing: -1.5px;
  color: var(--text);
}

.library__section + .library__section {
  margin-top: var(--s-7);
}

.library__row-title {
  margin: 0 0 var(--s-4);
  font-family: var(--font-ui);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.4px;
  color: var(--text);
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc -b --noEmit
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/screens/Library.tsx src/screens/Library.css
git commit -m "feat(ui): Library screen — Continue Watching + Watchlist"
```

---

## Task 6: `<Collection>` screen

**Files:**
- Create: `src/screens/Collection.tsx`
- Create: `src/screens/Collection.css`

Brand header + full poster grid of the collection's items.

- [ ] **Step 1: Create `src/screens/Collection.tsx`**

```tsx
import './Collection.css';
import { TopNav } from '../components/TopNav';
import { PosterGrid } from '../components/PosterGrid';
import { BRAND_CONFIG } from '../data/brands';
import type { Collection as CollectionT, Movie } from '../types';

interface Props {
  collection: CollectionT;
  onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void;
  onSelectMovie: (m: Movie) => void;
}

export function Collection({ collection, onNavigate, onSelectMovie }: Props) {
  const cfg = BRAND_CONFIG[collection.id];
  const bg = cfg?.bg ?? '#161616';

  return (
    <>
      <TopNav current="home" onNavigate={onNavigate} />
      <main className="collection">
        <header
          className="collection__header"
          style={{ background: `radial-gradient(ellipse 90% 80% at 50% 30%, rgba(255,255,255,0.08) 0%, transparent 60%), ${bg}` }}
        >
          {cfg?.logo ? (
            <img
              src={cfg.logo}
              alt={collection.title}
              className="collection__logo"
              style={cfg.logoFilter ? { filter: cfg.logoFilter } : undefined}
            />
          ) : (
            <h1 className="collection__title-fallback">{collection.title}</h1>
          )}
        </header>

        <div className="collection__body">
          <h2 className="collection__films-label">Films</h2>
          <PosterGrid
            items={collection.items}
            idPrefix={`collection-${collection.id}`}
            onSelect={onSelectMovie}
            emptyText="No films available right now. Check back tomorrow."
          />
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 2: Create `src/screens/Collection.css`**

```css
.collection {
  padding-top: 80px;  /* leave room for fixed TopNav */
}

.collection__header {
  height: 28vh;
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.collection__logo {
  max-width: 30%;
  max-height: 60%;
  object-fit: contain;
  display: block;
}

.collection__title-fallback {
  margin: 0;
  font-family: var(--font-display);
  font-size: 72px;
  color: #fff;
  letter-spacing: -1px;
}

.collection__body {
  padding: var(--s-7) var(--s-9);
}

.collection__films-label {
  margin: 0 0 var(--s-4);
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-muted);
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc -b --noEmit
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/screens/Collection.tsx src/screens/Collection.css
git commit -m "feat(ui): brand Collection screen with hero header + poster grid"
```

---

## Task 7: TMDb browser-side search client — write tests

**Files:**
- Create: `src/data/tmdb.test.ts`

- [ ] **Step 1: Create `src/data/tmdb.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { searchMovies, hydrateImdbId } from './tmdb';

describe('TMDb browser client', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    // Ensure the API key env is set for the duration of the test
    (import.meta as any).env = { ...(import.meta as any).env, VITE_TMDB_API_KEY: 'test-key' };
  });
  afterEach(() => vi.restoreAllMocks());

  describe('searchMovies', () => {
    it('returns empty array for empty query without hitting network', async () => {
      const result = await searchMovies('   ');
      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('calls /search/movie and maps results to Movie shape', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        results: [
          {
            id: 693134,
            title: 'Dune: Part Two',
            release_date: '2024-03-01',
            poster_path: '/p.jpg',
            backdrop_path: '/b.jpg',
            overview: 'Paul...',
            vote_average: 8.5,
          },
          {
            id: 1,
            title: 'No date',
            release_date: '',
            poster_path: null,
            backdrop_path: null,
            overview: '',
            vote_average: 0,
          },
        ],
      })));

      const result = await searchMovies('dune');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        tmdb_id: 693134,
        title: 'Dune: Part Two',
        year: 2024,
        poster: 'https://image.tmdb.org/t/p/w500/p.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/b.jpg',
        scores: { imdb: 8.5 },
      });
      expect(result[1]).toMatchObject({
        tmdb_id: 1,
        title: 'No date',
        year: 0,
        poster: '',
        backdrop: '',
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('/search/movie');
      expect(url).toContain('query=dune');
      expect(url).toContain('api_key=test-key');
    });

    it('returns up to 30 results', async () => {
      const fakeResults = Array.from({ length: 50 }).map((_, i) => ({
        id: i + 1, title: `Movie ${i + 1}`, release_date: '2024-01-01',
        poster_path: '/x.jpg', backdrop_path: '/y.jpg', overview: '', vote_average: 7,
      }));
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ results: fakeResults })));

      const result = await searchMovies('many');
      expect(result).toHaveLength(30);
    });

    it('throws on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 401 }));
      await expect(searchMovies('x')).rejects.toThrow(/TMDb search 401/);
    });
  });

  describe('hydrateImdbId', () => {
    it('fetches external_ids and returns imdb_id', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        imdb_id: 'tt15239678',
        id: 693134,
      })));

      const id = await hydrateImdbId(693134);
      expect(id).toBe('tt15239678');

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('/movie/693134/external_ids');
    });

    it('returns null when imdb_id is missing', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 })));
      expect(await hydrateImdbId(1)).toBe(null);
    });

    it('returns null on non-OK response (caller treats as failure)', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 404 }));
      expect(await hydrateImdbId(1)).toBe(null);
    });
  });
});
```

- [ ] **Step 2: Run tests — should fail (module not found)**

```bash
npx vitest run src/data/tmdb.test.ts
```

Expected: FAIL with "Failed to resolve import './tmdb'".

- [ ] **Step 3: Commit**

```bash
git add src/data/tmdb.test.ts
git commit -m "test(data): browser-side TMDb client specification"
```

---

## Task 8: TMDb browser-side search client — implement

**Files:**
- Create: `src/data/tmdb.ts`

- [ ] **Step 1: Create `src/data/tmdb.ts`**

```ts
import type { Movie } from '../types';

const API_KEY = (import.meta as any).env?.VITE_TMDB_API_KEY as string | undefined;
const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

export async function searchMovies(query: string): Promise<Movie[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `${BASE}/search/movie?api_key=${encodeURIComponent(API_KEY ?? '')}&query=${encodeURIComponent(q)}&include_adult=false&language=en-US`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`TMDb search ${r.status}`);
  const data = await r.json();
  return (data.results ?? []).slice(0, 30).map(tmdbToMovie);
}

export async function hydrateImdbId(tmdbId: number): Promise<string | null> {
  const url = `${BASE}/movie/${tmdbId}/external_ids?api_key=${encodeURIComponent(API_KEY ?? '')}`;
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
```

- [ ] **Step 2: Run tests — should pass**

```bash
npx vitest run src/data/tmdb.test.ts
```

Expected: 7 tests passing.

- [ ] **Step 3: Verify build and full test suite**

```bash
npx tsc -b --noEmit
npm test
```

All 49 + 7 = 56 tests passing.

- [ ] **Step 4: Commit**

```bash
git add src/data/tmdb.ts
git commit -m "feat(data): browser-side TMDb v3 search client"
```

---

## Task 9: Add `VITE_TMDB_API_KEY` to env files

**Files:**
- Modify: `.env`
- Modify: `.env.example`

- [ ] **Step 1: Read `.env` and append**

Add (use the same value as the existing `TMDB_API_KEY` line):

```
# Same as TMDB_API_KEY, but VITE_-prefixed so it's exposed to the browser bundle
# (TMDb v3 keys are intended by TMDb for client-side use)
VITE_TMDB_API_KEY=<same value as TMDB_API_KEY above>
```

Replace `<same value as TMDB_API_KEY above>` with the actual key value already in the file.

- [ ] **Step 2: Read `.env.example` and append the placeholder**

```
# Same as TMDB_API_KEY, exposed to the TV app bundle for live search
VITE_TMDB_API_KEY=
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore(env): document VITE_TMDB_API_KEY for browser-side search"
```

(`.env` itself is gitignored — not staged.)

---

## Task 10: `<Keyboard>` on-screen QWERTY component

**Files:**
- Create: `src/components/Keyboard.tsx`
- Create: `src/components/Keyboard.css`

- [ ] **Step 1: Create `src/components/Keyboard.tsx`**

```tsx
import './Keyboard.css';
import { useFocusable } from '../nav/useFocusable';

interface Props {
  onChar: (c: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSpace: () => void;
}

const ROW_1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
const ROW_2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'];
const ROW_3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];

export function Keyboard({ onChar, onBackspace, onClear, onSpace }: Props) {
  return (
    <div className="keyboard">
      <div className="keyboard__row">{ROW_1.map((c) => <Key key={c} char={c} onActivate={() => onChar(c)} />)}</div>
      <div className="keyboard__row">{ROW_2.map((c) => <Key key={c} char={c} onActivate={() => onChar(c)} />)}</div>
      <div className="keyboard__row">{ROW_3.map((c) => <Key key={c} char={c} onActivate={() => onChar(c)} />)}</div>
      <div className="keyboard__row keyboard__row--special">
        <SpecialKey id="kbd-backspace" label="⌫" onActivate={onBackspace} />
        <SpecialKey id="kbd-space" label="Space" wide onActivate={onSpace} />
        <SpecialKey id="kbd-clear" label="Clear" onActivate={onClear} />
      </div>
    </div>
  );
}

function Key({ char, onActivate }: { char: string; onActivate: () => void }) {
  const { ref, ...rest } = useFocusable({ id: `kbd-${char}`, onActivate });
  return <span ref={ref as any} {...rest} className="keyboard__key">{char}</span>;
}

function SpecialKey({ id, label, wide, onActivate }: { id: string; label: string; wide?: boolean; onActivate: () => void }) {
  const { ref, ...rest } = useFocusable({ id, onActivate });
  return (
    <span ref={ref as any} {...rest} className={`keyboard__key keyboard__key--special${wide ? ' keyboard__key--wide' : ''}`}>
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Create `src/components/Keyboard.css`**

```css
.keyboard {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  user-select: none;
}

.keyboard__row {
  display: flex;
  gap: var(--s-2);
  justify-content: center;
}

.keyboard__row--special {
  margin-top: var(--s-2);
}

.keyboard__key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  height: 56px;
  padding: 0 var(--s-2);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: pointer;
  border: 1px solid var(--border);
}

.keyboard__key--special {
  font-size: 16px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  padding: 0 var(--s-3);
}

.keyboard__key--wide {
  min-width: 140px;
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc -b --noEmit
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Keyboard.tsx src/components/Keyboard.css
git commit -m "feat(ui): on-screen QWERTY Keyboard component for TV remote"
```

---

## Task 11: `<Search>` screen

**Files:**
- Create: `src/screens/Search.tsx`
- Create: `src/screens/Search.css`

- [ ] **Step 1: Create `src/screens/Search.tsx`**

```tsx
import './Search.css';
import { useEffect, useRef, useState } from 'preact/hooks';
import { TopNav } from '../components/TopNav';
import { Keyboard } from '../components/Keyboard';
import { PosterGrid } from '../components/PosterGrid';
import { searchMovies, hydrateImdbId } from '../data/tmdb';
import type { Movie } from '../types';

interface Props {
  onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void;
  onSelectMovie: (m: Movie) => void;
}

const DEBOUNCE_MS = 250;

export function Search({ onNavigate, onSelectMovie }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(false);

  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const myId = ++requestIdRef.current;
    debounceRef.current = window.setTimeout(async () => {
      try {
        const r = await searchMovies(query);
        if (myId === requestIdRef.current) {
          setResults(r);
          setLoading(false);
        }
      } catch (e) {
        if (myId === requestIdRef.current) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => { if (debounceRef.current != null) window.clearTimeout(debounceRef.current); };
  }, [query]);

  const handleSelectResult = async (m: Movie) => {
    if (hydrating) return;
    setHydrating(true);
    try {
      const imdbId = await hydrateImdbId(m.tmdb_id);
      if (!imdbId) {
        setError(`Couldn't open — TMDb doesn't have an IMDb mapping for "${m.title}".`);
        return;
      }
      onSelectMovie({ ...m, imdb_id: imdbId });
    } finally {
      setHydrating(false);
    }
  };

  return (
    <>
      <TopNav current="search" onNavigate={onNavigate} />
      <main className="search">
        <aside className="search__pane">
          <div className="search__query">{query || <span className="search__placeholder">Type to search</span>}</div>
          <Keyboard
            onChar={(c) => setQuery((q) => q + c.toLowerCase())}
            onBackspace={() => setQuery((q) => q.slice(0, -1))}
            onClear={() => setQuery('')}
            onSpace={() => setQuery((q) => q + ' ')}
          />
        </aside>
        <section className="search__results">
          {renderResultsState({ query, loading, error, results, onSelect: handleSelectResult, hydrating })}
        </section>
      </main>
    </>
  );
}

function renderResultsState({ query, loading, error, results, onSelect, hydrating }: {
  query: string; loading: boolean; error: string | null; results: Movie[]; onSelect: (m: Movie) => void; hydrating: boolean;
}) {
  if (error) return <div className="search__hint search__hint--error">{error}</div>;
  if (hydrating) return <div className="search__hint">Opening…</div>;
  if (!query.trim()) return <div className="search__hint">Start typing to search TMDb's library.</div>;
  if (loading) return <div className="search__hint">Searching…</div>;
  return (
    <PosterGrid
      items={results}
      idPrefix="search"
      onSelect={onSelect}
      emptyText={`Nothing found for "${query}".`}
    />
  );
}
```

- [ ] **Step 2: Create `src/screens/Search.css`**

```css
.search {
  display: flex;
  padding: calc(80px + var(--s-5)) var(--s-9) var(--s-7);
  gap: var(--s-6);
}

.search__pane {
  flex: 0 0 28%;
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.search__query {
  min-height: 64px;
  padding: var(--s-3) var(--s-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  font-family: var(--font-ui);
  font-size: 28px;
  color: var(--text);
  letter-spacing: 0.5px;
  word-break: break-word;
}

.search__placeholder {
  color: var(--text-muted);
  font-size: 22px;
  font-style: italic;
}

.search__results {
  flex: 1 1 auto;
  min-width: 0;
}

.search__hint {
  padding: var(--s-5) 0;
  color: var(--text-muted);
  font-size: 20px;
  letter-spacing: 0.5px;
}

.search__hint--error {
  color: var(--accent);
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc -b --noEmit
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/screens/Search.tsx src/screens/Search.css
git commit -m "feat(ui): Search screen with on-screen keyboard + live TMDb results"
```

---

## Task 12: Wire the three screens into `App.tsx` router

**Files:**
- Modify: `src/App.tsx`

Replace the three placeholder route cases with the real screens.

- [ ] **Step 1: Read `src/App.tsx` and update**

Find the `switch (r.name)` block. The current `case 'search':`, `case 'library':`, and `case 'collection':` either render placeholders or fall through to the default "Coming soon" branch. Replace with:

Add these imports at the top:

```tsx
import { Search } from './screens/Search';
import { Library } from './screens/Library';
import { Collection } from './screens/Collection';
```

In the switch:

```tsx
case 'search':
  return <Search
    onNavigate={(to) => push({ name: to } as Route)}
    onSelectMovie={(movie) => push({ name: 'detail', movie })}
  />;
case 'library':
  return <Library
    onNavigate={(to) => push({ name: to } as Route)}
    onSelectMovie={(movie) => push({ name: 'detail', movie })}
  />;
case 'collection':
  return <Collection
    collection={r.collection}
    onNavigate={(to) => push({ name: to } as Route)}
    onSelectMovie={(movie) => push({ name: 'detail', movie })}
  />;
```

- [ ] **Step 2: Verify**

```bash
npx tsc -b --noEmit
npm test
npm run build
```

All clean, 56/56 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(router): wire Search / Library / Collection screens (kill 'Coming soon' placeholders)"
```

---

## Task 13: Deploy + verify on TV

Manual verification step.

- [ ] **Step 1: Deploy**

```bash
bash scripts/deploy.sh
```

Expected: build → IPK → install → launch.

- [ ] **Step 2: Library**

- Open the app, navigate to Library nav item
- Should show "Library" title, two sections
- Continue Watching should show movies you've started (with red progress bars on each card) OR the empty state if nothing
- My Watchlist should show movies you've added (or empty state)

- [ ] **Step 3: Brand Collection**

- From Home, focus the A24 (or NEON / Pixar / etc.) brand tile, press OK
- Should open the Collection screen with the brand logo big at top, then films grid below
- Posters should be the full collection (~20 items per brand from rows.json)
- Press Back, should return to Home with the BrandTile re-focused

- [ ] **Step 4: Search**

- Navigate to Search nav item
- See keyboard on left, results area on right ("Start typing to search...")
- D-pad to a letter, press OK — letter appends to query
- After 250ms, results grid populates
- D-pad right from a rightmost letter → focuses first result poster
- D-pad left from leftmost poster → focuses nearest letter
- Press OK on a result → "Opening…" briefly → Detail screen for that movie

- [ ] **Step 5: Capture screenshots**

```bash
node scripts/tv-screenshot.mjs tv-library.png
# navigate to a brand collection on the TV, then:
node scripts/tv-screenshot.mjs tv-collection.png
# navigate to search and type a few letters, then:
node scripts/tv-screenshot.mjs tv-search.png
```

(Or use the controller's tooling to capture these between dispatches.)

- [ ] **Step 6: File any visual issues as follow-ups**

If anything looks off — spacing, alignment, focus state visibility — note it and decide whether to fix now or defer.

---

## Plan complete

After Task 13, all three nav dead-ends are filled.

### Files deferred to later plans

- **Plan 5 (TV shows)**: `/search/multi`, Series detail screen, episode picker, Player support for episodes, Watchlist/Continue Watching for shows
- **Voice search**: needs WebOS voice API or phone-as-remote integration
- **Search history**: track recent queries in localStorage, show as suggestions when query is empty
