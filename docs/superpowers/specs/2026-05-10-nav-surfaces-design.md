# Nav Surfaces (Search + Library + Brand Collections) — Design Spec

**Date:** 2026-05-10
**Author:** Duane (with Claude)
**Status:** Draft, awaiting review
**Plan reference:** TBD (Plan 4 in the WebOS app series)
**Parent spec:** `docs/superpowers/specs/2026-05-09-stremio-webos-redesign-design.md`

---

## Overview

Fill the three "Coming soon" nav dead-ends in the Flixly TV app with real screens:

1. **Library** — Continue Watching + Watchlist, sourced from existing localStorage state
2. **Brand Collection** — clicking A24/NEON/Pixar/etc. opens that collection's full poster grid with a brand-themed header
3. **Search** — TMDb v3 live search with an on-screen QWERTY keyboard and live result grid

The three are built in one plan because they share infrastructure (a `<PosterGrid>` component) and they're related ("fill the nav surfaces"). After this plan the only nav placeholder left is whatever future v0.3 surfaces (Discord, phone-as-remote, etc.) we add.

## Goals

- Pressing Library / Search / a brand tile takes the user to a real, polished screen — no more "Coming soon" placeholders
- Library makes "Continue Watching" feel as natural as Netflix / Disney+ — the row populated from localStorage, with a progress bar at the bottom of each card
- Brand Collection pages feel like real branded landings (big logo header, full poster grid)
- Search works with the TV remote — D-pad through a QWERTY grid, results update live as you type, no fumbling

## Non-goals

- Voice search — defer until phone-as-remote is built (v0.3+)
- Search history / recent searches — defer
- Genre / category browse — defer
- Reordering watchlist items — defer
- Sharing collections — N/A for personal use

## Constraints

| Constraint | Implication |
|---|---|
| **TV remote text input** | An on-screen QWERTY keyboard, navigated by D-pad. No phone-as-remote yet |
| **WebOS Chromium 79** | Same gotchas as before — no `aspect-ratio`, no flex `gap`, no `inset` shorthand, no `:focus-visible`. Use the patterns established in Plan 3 |
| **TMDb v3 API key, not v4 token** | v3 keys are designed for client-side use; safe to ship in the bundle. Add via `VITE_TMDB_API_KEY` env var. v4 token stays server-only (CI / backend) |
| **TMDb search returns `tmdb_id`, not `imdb_id`** | When user clicks a search result, must fetch `/movie/{tmdb_id}/external_ids` to get the imdb_id before navigating to Detail (which requires it for RD playback) |
| **Public GitHub repo** | The v3 TMDb key gets shipped in the public bundle. That's documented as acceptable by TMDb |

---

## Approach

**Three new screens with one shared component.** Each screen is its own `.tsx + .css` pair. The shared piece is `<PosterGrid>` — a full-page grid of portrait posters, used by all three screens.

Rejected: a single generic `<PosterGridScreen mode="search|library|collection">`. Each mode has too much unique logic (Search has a keyboard, Library has two rows, Collection has a brand header) — separate files read cleaner.

---

## Architecture

### File additions

```
src/
  screens/
    Search.tsx + Search.css
    Library.tsx + Library.css
    Collection.tsx + Collection.css
  components/
    PosterGrid.tsx + PosterGrid.css      # shared
    Keyboard.tsx + Keyboard.css          # Search-only
  data/
    tmdb.ts                              # browser-side v3 search client
    brands.ts                            # BRAND_CONFIG extracted from BrandTile (shared with Collection)
```

### Router changes (`src/App.tsx`)

Existing route discriminated union already has `search`, `library`, `collection` cases — they just route to placeholders. Replace the placeholder bodies:

```tsx
case 'search':     return <Search onNavigate={...} onSelectMovie={...} />;
case 'library':    return <Library onNavigate={...} onSelectMovie={...} />;
case 'collection': return <Collection collection={r.collection} onNavigate={...} onSelectMovie={...} />;
```

The Home screen's `onSelectCollection={(c) => push({ name: 'collection', collection: c })}` is already wired — it just needs the screen on the other end.

### Shared components

**`<PosterGrid>`** (`src/components/PosterGrid.tsx`)
Renders a 6-up portrait poster grid. Reuses `<PosterCard>` internally. Props:
- `items: Movie[]`
- `onSelect: (m: Movie) => void`
- `idPrefix: string` (so focus IDs stay unique per place it's mounted — e.g. `'cw'` for Continue Watching, `'wl'` for Watchlist, `'search'`, `'collection-a24'`)
- `emptyText?: string` (rendered as muted text when items is empty)
- `progressMap?: Record<string, number>` (imdb_id → 0..1 progress, optional — only Continue Watching uses this)

`<PosterCard>` gets one new optional prop: `progress?: number` (0..1). When set, renders a 4px red bar at the bottom of the card with width = `progress * 100%`.

**`<Keyboard>`** (`src/components/Keyboard.tsx`)
QWERTY grid component for the Search screen. Props:
- `onChar(c: string)` — single letter pressed
- `onBackspace()` — ⌫ pressed
- `onClear()` — Clear pressed
- `onSpace()` — Space pressed

Layout: 3 rows of letter cells (10/9/7), 1 special-keys row at the bottom. Each cell is a `useFocusable({ id: 'kbd-${char}' })`. The spatial nav engine handles intra-keyboard movement and the natural-geometry transition from the rightmost letter to the first poster in the results grid (no special wiring).

**`brands.ts`** (`src/data/brands.ts`)
Extract `BRAND_CONFIG` from `BrandTile.tsx` so `Collection.tsx` can import the same map. Single source of truth for per-brand bg color, logo path, and `invert(1)` filter flag.

### TMDb browser client (`src/data/tmdb.ts`)

```ts
const API_KEY = import.meta.env.VITE_TMDB_API_KEY as string;
const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

export async function searchMovies(query: string): Promise<Movie[]>;
export async function hydrateImdbId(tmdbId: number): Promise<string | null>;
```

`searchMovies` calls `/search/movie?api_key=...&query=...` and returns `Movie[]` (max 30, mapped from TMDb shape — see snippet in Section 4 of the brainstorming notes). `hydrateImdbId` calls `/movie/{id}/external_ids` and returns the `imdb_id` field (used when user clicks a search result to navigate to Detail).

---

## Library screen

### Layout

```
TopNav (Library active)
─────────────────────────────────────
  Library              (screen title, --s-7 below TopNav)

  Continue Watching    (row label)
  [portrait grid, 6-up, with red progress bar overlay]

  My Watchlist         (row label)
  [portrait grid, 6-up]
```

### Data sources

- **Continue Watching**: read `resumePositions.value` (existing `Record<imdb_id, ResumePosition>` signal). Sort by `updated_at` desc. Filter out entries where `position_seconds / duration_seconds >= 0.95` (finished). Hydrate each `imdb_id` to a `Movie` via a new `findMovie(rows, imdbId)` helper in `src/data/rows.ts` that scans all shelves' items.
- **Watchlist**: read `watchlist.value` (existing `string[]`). Same hydration pattern.
- Both lists use `<PosterGrid>` with the appropriate `idPrefix`. Continue Watching's grid also receives `progressMap` mapping each imdb_id → `position_seconds / duration_seconds`.

### Empty states

- Continue Watching empty: "Nothing in progress. Movies you start will appear here."
- Watchlist empty: "Your watchlist is empty. Press `+ Watchlist` from any movie's detail page."

### Edge cases

- imdb_id in resume / watchlist not present in rows.json (movie aged out): render with placeholder poster (gray box) + title-only text. Defer "hydrate from TMDb in real time" to a future plan.
- Same movie in both lists: render in both (no dedup; they're conceptually distinct).

---

## Brand Collection screen

### Layout

```
TopNav
─────────────────────────────────────
┌─────────────────────────────────┐
│                                 │
│      [Brand logo, large]        │   25% viewport height
│                                 │   bg = brand color
└─────────────────────────────────┘
  Films

  [6-up portrait poster grid]      ← scrolls if items > one row
```

### Components

- `<Collection>` screen composes `TopNav` + brand header + `<PosterGrid>`
- Header uses `BRAND_CONFIG[collection.id]` from `src/data/brands.ts` — same map `BrandTile` uses, ensuring consistency
- Logo rendered at `max-width: 30%` of viewport, centered, with `filter` if the brand needs it (same `invert(1)` flag for dark logos)

### Data source

`collection.items` from rows.json — already populated. No new network calls for this screen.

### Empty state

"No films available right now. Check back tomorrow." (Shouldn't normally happen — rows.json bundles 20 items per collection.)

### Focus and navigation

- Initial focus: first poster in the grid (the brand header isn't interactive)
- Pressing Back returns to Home; Home's back-stack restores the originally-focused BrandTile

---

## Search screen

### Layout

```
TopNav (Search active)
─────────────────────────────────────
┌────────────────┐  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐
│ search input   │  │P1││P2││P3││P4││P5││P6│
└────────────────┘  └──┘└──┘└──┘└──┘└──┘└──┘
  Q W E R T Y U I O P
  A S D F G H J K L         ← results grid (PosterGrid), 6-up
  Z X C V B N M
  ⌫  Space   Clear
  ← keyboard column ~28% wide
```

### Components

- `<Search>` screen — composes TopNav + search-input display + `<Keyboard>` + `<PosterGrid>`
- `<Keyboard>` as described above
- Local state: `const [query, setQuery] = useState('')`, `const [results, setResults] = useState<Movie[]>([])`, `const [loading, setLoading] = useState(false)`, `const [error, setError] = useState<string | null>(null)`

### Search behavior

- Every change to `query` triggers a debounced search (250ms). The debounce uses a `useRef` to store the timer ID so re-renders don't lose it.
- Empty query → `results = []`, no fetch fired
- Each fetch: call `searchMovies(query)`. On success: `setResults(...)`, `setLoading(false)`. On error: `setError(...)`, `setLoading(false)`.
- Concurrent requests: track a request counter and ignore stale responses (the user types fast → multiple requests in flight; only the latest wins)

### Empty / loading states

| State | UI |
|---|---|
| No query yet | "Start typing to search TMDb's library." muted text in grid area |
| Loading (after debounce, before response) | 6 poster skeletons (reuse the existing shimmer skeleton) |
| Results | the grid populates |
| No results | "Nothing found for '{query}'." muted |
| TMDb error | "Couldn't reach TMDb. Check your connection." muted |

### Pressing OK on a search result

Search results have `imdb_id: ''` initially (TMDb search doesn't return it). On click:
1. Show a brief loading toast/overlay
2. Call `hydrateImdbId(result.tmdb_id)` → returns `string | null`
3. If null: error toast: "Couldn't open — TMDb doesn't have an IMDb mapping for this title."
4. Otherwise: route to Detail with the hydrated Movie (set `imdb_id` to the returned value)

### Focus quirks

- Initial focus: `Q` key (top-left of keyboard)
- Right-arrow from rightmost letter (`P`, `L`, `M`) → focuses first visible poster in results grid (geometry-based, no special wiring)
- Left-arrow from leftmost poster → focuses nearest letter in same vertical row
- Backspace on empty query: no-op (don't beep)
- TopNav stays reachable: pressing Up from `Q`/`A`/`Z` → focuses the Search nav item

---

## Schema additions

### `src/types.ts`

No new types — `Movie`, `Collection`, `ResumePosition` already exist.

### `.env`

Add `VITE_TMDB_API_KEY=<v3-key>` (same value as the existing `TMDB_API_KEY`). The v3 key is intended by TMDb for client-side use; safe to ship in the bundle.

### `.env.example`

Add a documented placeholder:

```
# TMDb v3 API key — shipped to the TV app for live search
VITE_TMDB_API_KEY=
```

---

## Error handling

- **TMDb search fails**: show muted error in grid; don't break the keyboard
- **TMDb returns 0 results**: "Nothing found for '...'" (not an error)
- **Network down during search**: same as TMDb fail — clear muted error
- **Watchlist / resume reference a movie not in rows.json**: render with placeholder poster, title-only — don't error
- **VITE_TMDB_API_KEY missing**: Search screen renders a one-time setup error: "Build is missing TMDb key — check .env"

---

## Testing

| Layer | Approach |
|---|---|
| `searchMovies` / `hydrateImdbId` | Vitest with `vi.spyOn(fetch)` returning canned TMDb responses. Verify URL shape and parse logic |
| `<Keyboard>` | No unit tests — purely UI. Manual verify on TV |
| `<PosterGrid>` / screens | No unit tests — visual. Manual verify on TV with screenshot |
| Continue Watching progress bar | Manual — play a movie partway, return to Library, check the bar |

---

## Phasing within this plan

Build in this order so each piece is testable in isolation:

1. **`brands.ts` extraction** — refactor only, no behavior change. BrandTile keeps working
2. **`PosterGrid` component** — new shared component, no consumer yet
3. **Library screen** — first screen, simplest, builds on PosterGrid
4. **Collection screen** — second simplest, brand header + PosterGrid
5. **TMDb browser client** — `src/data/tmdb.ts` + tests
6. **Keyboard component** — standalone, testable in isolation
7. **Search screen** — composes Keyboard + PosterGrid + TMDb client
8. **Wire everything into App.tsx router** — last step, replaces the three placeholder routes
9. **Deploy + verify on TV** — Library has Continue Watching content if you've played anything; Watchlist if you've bookmarked anything; Collections work for every brand tile; Search works with live TMDb queries

---

## Open questions / followups

- **Continue Watching limit** — currently no cap on how many entries. Probably fine for personal use but consider capping at 30 most-recent if `resumePositions` grows large.
- **Watchlist sort order** — render in the order you added them (chronological) or by title? Current spec: chronological (insertion order from the existing `watchlist` array)
- **Search of TV shows** — TMDb's `/search/multi` returns movies + TV + people. For now we only support movies. Adding TV later would require multi-source handling in the Player (Stremio addons for TV episodes are different from movies)
- **VITE_TMDB_API_KEY exposure** — the v3 key is shipped publicly. TMDb's rate limit is generous (~50/sec) and they accept this. If we ever see abuse, regenerate the key
