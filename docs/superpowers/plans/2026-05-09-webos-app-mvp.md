# WebOS App MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v0.1 MVP of a custom Stremio replacement for LG WebOS — a Preact + Vite app that boots on the user's TV, renders a Disney+/HBO Max-style home screen with adaptive Real-Debrid stream selection, and plays movies via HTML5 `<video>`.

**Architecture:** Greenfield Preact 10 + TypeScript + Vite app, no Stremio core, no WASM. Talks directly to Real-Debrid REST + Torrentio addon protocol + OpenSubtitles addon. State in localStorage; metadata cache in IndexedDB. Spatial focus engine as a pure-logic module (~200 lines). Packaged as IPK via `ares-cli`, sideloaded over SSH to the LG 86NANO75UPA at 10.0.0.238.

**Tech Stack:** Preact 10, TypeScript 5, Vite 5, `@preact/signals`, Vitest, `ares-cli` (LG's WebOS CLI), Inter font (UI) + system serif (titles).

**Spec reference:** `docs/superpowers/specs/2026-05-09-stremio-webos-redesign-design.md`

**Out of scope for this plan (separate plans later):**
- The GitHub Action that generates `rows.json` from TMDb + OMDb (this plan uses a hand-written sample)
- v0.2 features (search, watchlist screen, stream picker UI, subtitle add-on integration polish, "queue uncached on RD")
- v0.3+ features (LLM rows, Discord RPC, custom subtitle scrapers, Home Assistant, etc.)

---

## File Structure

```
project root/
├── .gitignore                              # exists
├── package.json
├── tsconfig.json
├── vite.config.ts
├── webos-info.json                         # ares-cli app metadata
├── index.html
├── public/
│   ├── icon.png                            # 130×130 IPK icon
│   ├── icon-large.png                      # 256×256 store icon
│   └── sample-rows.json                    # hand-written test data
├── src/
│   ├── main.tsx                            # entry
│   ├── App.tsx                             # router + screen mounting
│   ├── types.ts                            # shared TS types (Movie, Shelf, Stream, etc.)
│   ├── theme/
│   │   ├── tokens.css                      # CSS variables (colors, type, spacing)
│   │   └── animations.css                  # focus glow, transitions
│   ├── nav/
│   │   ├── spatial.ts                      # focus engine (pure logic)
│   │   ├── spatial.test.ts
│   │   ├── useFocusable.ts                 # Preact hook
│   │   └── input.ts                        # global D-pad listener
│   ├── data/
│   │   └── rows.ts                         # fetch sample-rows.json + parse
│   ├── state/
│   │   ├── store.ts                        # signals-based store
│   │   └── persistence.ts                  # localStorage sync
│   ├── sources/
│   │   ├── realdebrid.ts                   # RD REST client
│   │   ├── realdebrid.test.ts
│   │   ├── torrentio.ts                    # Torrentio addon client
│   │   ├── parse-name.ts                   # torrent filename → structured
│   │   ├── parse-name.test.ts
│   │   ├── capabilities.ts                 # codec + bandwidth probes
│   │   ├── capabilities.test.ts
│   │   ├── picker.ts                       # ranking heuristic
│   │   └── picker.test.ts
│   ├── subtitles/
│   │   ├── opensubtitles.ts                # subtitle addon client + per-movie pre-flight
│   │   └── render.ts                       # WebVTT renderer
│   ├── components/
│   │   ├── PosterCard.tsx
│   │   ├── Row.tsx
│   │   ├── BrandShelf.tsx
│   │   ├── BrandTile.tsx
│   │   ├── Hero.tsx
│   │   └── TopNav.tsx
│   └── screens/
│       ├── Home.tsx
│       ├── Detail.tsx
│       ├── Settings.tsx
│       └── Player.tsx
└── scripts/
    └── deploy.sh                           # build → IPK → ares-install
```

---

## Task 1: Initialize Preact + Vite + TypeScript project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "duane-stremio-webos",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "package": "ares-package dist -o ipk",
    "deploy": "bash scripts/deploy.sh"
  },
  "dependencies": {
    "preact": "^10.22.0",
    "@preact/signals": "^1.3.0"
  },
  "devDependencies": {
    "@preact/preset-vite": "^2.9.0",
    "@types/node": "^20.12.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0",
    "happy-dom": "^15.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2019",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "jsxImportSource": "preact",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2019", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "vitest/globals"],
    "paths": {
      "react": ["./node_modules/preact/compat/"],
      "react-dom": ["./node_modules/preact/compat/"]
    }
  },
  "include": ["src", "vite.config.ts"]
}
```

Target ES2019 because WebOS 6's Chromium is 79.

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    target: 'chrome79',
    cssTarget: 'chrome79',
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
  },
});
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
    <title>duane</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `src/main.tsx`**

```tsx
import { render } from 'preact';
import { App } from './App';

render(<App />, document.getElementById('app')!);
```

- [ ] **Step 6: Create `src/App.tsx`**

```tsx
export function App() {
  return <div style={{ padding: 32, color: '#fff', background: '#0a0a0a', minHeight: '100vh' }}>hello, duane</div>;
}
```

- [ ] **Step 7: Install + verify dev server**

```bash
npm install
npm run dev
```

Expected: opens http://localhost:5173 with "hello, duane" on dark background.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/
git commit -m "feat: scaffold Preact + Vite + TS app"
```

---

## Task 2: Design tokens and base styles

**Files:**
- Create: `src/theme/tokens.css`
- Create: `src/theme/animations.css`
- Modify: `src/main.tsx`

- [ ] **Step 1: Create `src/theme/tokens.css`**

```css
:root {
  /* color */
  --bg: #0a0a0a;
  --text: #f0ece4;
  --text-muted: rgba(240, 236, 228, 0.55);
  --accent: #E50914;
  --surface: rgba(60, 60, 60, 0.55);
  --surface-strong: rgba(60, 60, 60, 0.85);
  --success: #46d369;
  --border: rgba(240, 236, 228, 0.08);

  /* typography */
  --font-display: 'Times New Roman', Georgia, serif;
  --font-ui: 'Helvetica Neue', Arial, sans-serif;

  /* spacing scale (8pt) */
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 16px;
  --s-4: 24px;
  --s-5: 32px;
  --s-6: 48px;
  --s-7: 64px;

  /* radii */
  --r-sm: 2px;
  --r-md: 4px;
  --r-lg: 8px;

  /* motion */
  --t-fast: 120ms cubic-bezier(0.2, 0, 0.13, 1);
  --t-med: 240ms cubic-bezier(0.2, 0, 0.13, 1);
  --t-slow: 480ms cubic-bezier(0.2, 0, 0.13, 1);
}

html, body, #app {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-ui);
  height: 100%;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
}

* { box-sizing: border-box; }
```

- [ ] **Step 2: Create `src/theme/animations.css`**

```css
[data-focused] {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
  transform: scale(1.07) translateY(-4px);
  box-shadow: 0 18px 44px rgba(229, 9, 20, 0.45), 0 8px 16px rgba(0, 0, 0, 0.6);
  z-index: 10;
  position: relative;
  transition:
    transform var(--t-fast),
    box-shadow var(--t-fast),
    outline-offset var(--t-fast);
}

[data-focusable] {
  transition:
    transform var(--t-fast),
    box-shadow var(--t-fast);
}
```

- [ ] **Step 3: Update `src/main.tsx` to import the tokens**

```tsx
import './theme/tokens.css';
import './theme/animations.css';
import { render } from 'preact';
import { App } from './App';

render(<App />, document.getElementById('app')!);
```

- [ ] **Step 4: Run dev, verify dark background and cream text**

```bash
npm run dev
```

Expected: same "hello, duane" but background is `#0a0a0a` (cinematic black) and text is `#f0ece4` (warm cream).

- [ ] **Step 5: Commit**

```bash
git add src/theme src/main.tsx
git commit -m "feat: add design tokens and base focus animations"
```

---

## Task 3: Shared TypeScript types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```ts
export interface Scores {
  rt?: number;
  metacritic?: number;
  imdb?: number;
}

export interface Movie {
  imdb_id: string;
  tmdb_id: number;
  title: string;
  year: number;
  runtime: number;             // minutes
  genres: string[];
  poster: string;              // URL
  backdrop: string;            // URL
  logo?: string;               // URL
  overview: string;
  scores: Scores;
  digital_release_date?: string; // ISO date
  director?: string;
  cast: string[];
}

export interface Row {
  id: string;
  display: 'row';
  title: string;
  subtitle?: string;
  items: Movie[];
}

export interface Collection {
  id: string;
  display: 'collection';
  title: string;
  logo_url?: string;
  background_color?: string;
  items: Movie[];
}

export type Shelf = Row | Collection;

export interface RowsFile {
  generated_at: string;
  shelves: Shelf[];
}

export interface ParsedName {
  resolution?: '720p' | '1080p' | '2160p' | '4k';
  video_codec?: 'h264' | 'h265' | 'vp9' | 'av1';
  audio_codec?: 'aac' | 'ac3' | 'eac3' | 'dts' | 'truehd' | 'flac' | 'opus';
  audio_languages: string[];   // ISO 639-1 codes parsed from filename, e.g. ['en']
  source?: 'remux' | 'bluray' | 'webdl' | 'webrip' | 'hdtv' | 'dvdrip';
  group?: string;
  container?: 'mp4' | 'mkv' | 'webm' | 'avi';
}

export interface StreamCandidate {
  hash: string;                // info hash
  filename: string;
  bytes: number;
  seeds: number;
  parsed: ParsedName;
}

export interface RDStream {
  url: string;                 // unrestricted CDN URL
  filename: string;
  bytes: number;
}

export interface Capabilities {
  codecs: {
    h264: boolean;
    h265_main: boolean;
    h265_main10: boolean;
    vp9: boolean;
    av1: boolean;
    aac: boolean;
    ac3: boolean;
    eac3: boolean;
  };
  bandwidthMbps: number;
  probedAt: number;            // epoch ms
}

export interface Settings {
  rd_api_key: string;
  prefer_4k: boolean;
  audio_language: 'en' | 'es' | 'fr' | 'de' | 'ja' | 'any';
  require_subtitles: boolean;
}

export interface ResumePosition {
  imdb_id: string;
  position_seconds: number;
  duration_seconds: number;
  updated_at: number;          // epoch ms
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 4: Sample `rows.json` for development

**Files:**
- Create: `public/sample-rows.json`

- [ ] **Step 1: Create `public/sample-rows.json`**

A 2-row sample with realistic movie metadata. Posters use `picsum.photos` seeded URLs (stable, no API key needed). Real data comes later from the GitHub Action backend.

```json
{
  "generated_at": "2026-05-09T00:00:00Z",
  "shelves": [
    {
      "id": "just-hit-streaming",
      "display": "row",
      "title": "Just Hit Streaming",
      "subtitle": "Theatrical → home, last 60 days",
      "items": [
        {
          "imdb_id": "tt15239678",
          "tmdb_id": 693134,
          "title": "Dune: Part Two",
          "year": 2024,
          "runtime": 166,
          "genres": ["Science Fiction", "Adventure"],
          "poster": "https://picsum.photos/seed/dune2/640/360",
          "backdrop": "https://picsum.photos/seed/dune2-bd/1920/1080",
          "overview": "Paul Atreides unites with the Fremen to wage war against those who destroyed his family.",
          "scores": { "rt": 92, "metacritic": 79, "imdb": 8.5 },
          "digital_release_date": "2024-04-16",
          "director": "Denis Villeneuve",
          "cast": ["Timothée Chalamet", "Zendaya", "Rebecca Ferguson"]
        },
        {
          "imdb_id": "tt28607951",
          "tmdb_id": 1064213,
          "title": "Anora",
          "year": 2024,
          "runtime": 139,
          "genres": ["Drama", "Comedy"],
          "poster": "https://picsum.photos/seed/anora/640/360",
          "backdrop": "https://picsum.photos/seed/anora-bd/1920/1080",
          "overview": "A young sex worker from Brooklyn meets the son of a Russian oligarch and impulsively marries him.",
          "scores": { "rt": 91, "metacritic": 89, "imdb": 7.6 },
          "digital_release_date": "2025-01-14",
          "director": "Sean Baker",
          "cast": ["Mikey Madison", "Mark Eydelshteyn"]
        },
        {
          "imdb_id": "tt8999762",
          "tmdb_id": 549509,
          "title": "The Brutalist",
          "year": 2024,
          "runtime": 215,
          "genres": ["Drama"],
          "poster": "https://picsum.photos/seed/brutalist/640/360",
          "backdrop": "https://picsum.photos/seed/brutalist-bd/1920/1080",
          "overview": "A visionary Hungarian-Jewish architect arrives in postwar America to rebuild his life.",
          "scores": { "rt": 93, "metacritic": 90, "imdb": 7.7 },
          "digital_release_date": "2025-02-04",
          "director": "Brady Corbet",
          "cast": ["Adrien Brody", "Felicity Jones", "Guy Pearce"]
        }
      ]
    },
    {
      "id": "a24",
      "display": "collection",
      "title": "A24",
      "background_color": "#000000",
      "items": [
        {
          "imdb_id": "tt15398776",
          "tmdb_id": 762441,
          "title": "Past Lives",
          "year": 2023,
          "runtime": 105,
          "genres": ["Drama", "Romance"],
          "poster": "https://picsum.photos/seed/pastlives/640/360",
          "backdrop": "https://picsum.photos/seed/pastlives-bd/1920/1080",
          "overview": "Two childhood friends are reunited in NYC for one fateful week.",
          "scores": { "rt": 96, "metacritic": 94, "imdb": 7.8 },
          "director": "Celine Song",
          "cast": ["Greta Lee", "Teo Yoo"]
        },
        {
          "imdb_id": "tt15239696",
          "tmdb_id": 1027497,
          "title": "Civil War",
          "year": 2024,
          "runtime": 109,
          "genres": ["Action", "Drama"],
          "poster": "https://picsum.photos/seed/civilwar/640/360",
          "backdrop": "https://picsum.photos/seed/civilwar-bd/1920/1080",
          "overview": "A team of journalists travel across the United States during a rapidly escalating civil war.",
          "scores": { "rt": 81, "metacritic": 76, "imdb": 7.0 },
          "director": "Alex Garland",
          "cast": ["Kirsten Dunst", "Wagner Moura"]
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add public/sample-rows.json
git commit -m "feat: add sample rows.json for development"
```

---

## Task 5: Suggestion layer — fetch and parse `rows.json`

**Files:**
- Create: `src/data/rows.ts`

- [ ] **Step 1: Create `src/data/rows.ts`**

```ts
import type { RowsFile } from '../types';

const SAMPLE_URL = '/sample-rows.json';
const CACHE_KEY = 'rows-cache-v1';

export async function fetchRows(): Promise<RowsFile> {
  try {
    const r = await fetch(SAMPLE_URL, { cache: 'default' });
    if (!r.ok) throw new Error(`rows fetch ${r.status}`);
    const data = (await r.json()) as RowsFile;
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    return data;
  } catch (e) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached) as RowsFile;
    throw e;
  }
}
```

The graceful-degradation principle: if fetch fails, fall back to last cached version.

- [ ] **Step 2: Commit**

```bash
git add src/data/rows.ts
git commit -m "feat: add rows.json fetcher with localStorage fallback"
```

---

## Task 6: Spatial nav engine — write tests

**Files:**
- Create: `src/nav/spatial.test.ts`

- [ ] **Step 1: Create `src/nav/spatial.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialNav, type Rect } from './spatial';

const rect = (x: number, y: number, w = 100, h = 60): Rect => ({ x, y, w, h });

describe('SpatialNav', () => {
  let nav: SpatialNav;

  beforeEach(() => {
    nav = new SpatialNav();
  });

  it('focuses the first registered element', () => {
    nav.register('a', rect(0, 0));
    expect(nav.focused).toBe('a');
  });

  it('moves right to the nearest element on the right', () => {
    nav.register('a', rect(0, 0));
    nav.register('b', rect(120, 0));
    nav.register('c', rect(0, 100));
    nav.move('right');
    expect(nav.focused).toBe('b');
  });

  it('moves down to the element directly below over diagonal ones', () => {
    nav.register('a', rect(0, 0));
    nav.register('right-diagonal', rect(200, 100));
    nav.register('directly-below', rect(0, 100));
    nav.move('down');
    expect(nav.focused).toBe('directly-below');
  });

  it('does nothing when no element exists in the requested direction', () => {
    nav.register('a', rect(0, 0));
    nav.move('left');
    expect(nav.focused).toBe('a');
  });

  it('unregister removes the element and shifts focus if needed', () => {
    nav.register('a', rect(0, 0));
    nav.register('b', rect(120, 0));
    nav.move('right');
    expect(nav.focused).toBe('b');
    nav.unregister('b');
    expect(nav.focused).toBe('a');
  });

  it('manually setFocus to a registered id', () => {
    nav.register('a', rect(0, 0));
    nav.register('b', rect(120, 0));
    nav.setFocus('b');
    expect(nav.focused).toBe('b');
  });

  it('emits a focus-change event when focus moves', () => {
    nav.register('a', rect(0, 0));
    nav.register('b', rect(120, 0));
    const seen: (string | null)[] = [];
    nav.onFocusChange((id) => seen.push(id));
    nav.move('right');
    expect(seen).toEqual(['b']);
  });

  it('activate triggers the registered handler', () => {
    let pressed = false;
    nav.register('a', rect(0, 0), { onActivate: () => { pressed = true; } });
    nav.activate();
    expect(pressed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — they should fail with "module not found"**

```bash
npm test
```

Expected: FAIL — `Cannot find module './spatial'`.

- [ ] **Step 3: Commit the tests**

```bash
git add src/nav/spatial.test.ts
git commit -m "test: add spatial nav engine specification"
```

---

## Task 7: Spatial nav engine — implement

**Files:**
- Create: `src/nav/spatial.ts`

- [ ] **Step 1: Create `src/nav/spatial.ts`**

```ts
export interface Rect { x: number; y: number; w: number; h: number; }
export type Direction = 'up' | 'down' | 'left' | 'right';

interface Entry {
  id: string;
  rect: Rect;
  onActivate?: () => void;
}

type FocusListener = (id: string | null) => void;

export class SpatialNav {
  private entries = new Map<string, Entry>();
  private currentId: string | null = null;
  private listeners: FocusListener[] = [];

  get focused(): string | null { return this.currentId; }

  register(id: string, rect: Rect, opts?: { onActivate?: () => void }): void {
    this.entries.set(id, { id, rect, onActivate: opts?.onActivate });
    if (this.currentId === null) this.setFocus(id);
  }

  updateRect(id: string, rect: Rect): void {
    const e = this.entries.get(id);
    if (e) e.rect = rect;
  }

  unregister(id: string): void {
    this.entries.delete(id);
    if (this.currentId === id) {
      const next = this.entries.keys().next().value ?? null;
      this.setFocus(next);
    }
  }

  setFocus(id: string | null): void {
    if (id !== null && !this.entries.has(id)) return;
    if (this.currentId === id) return;
    this.currentId = id;
    for (const l of this.listeners) l(id);
  }

  onFocusChange(fn: FocusListener): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((l) => l !== fn); };
  }

  activate(): void {
    if (!this.currentId) return;
    const e = this.entries.get(this.currentId);
    e?.onActivate?.();
  }

  move(direction: Direction): void {
    if (!this.currentId) return;
    const from = this.entries.get(this.currentId);
    if (!from) return;
    const next = this.findNearest(from, direction);
    if (next) this.setFocus(next.id);
  }

  private findNearest(from: Entry, direction: Direction): Entry | null {
    const fcx = from.rect.x + from.rect.w / 2;
    const fcy = from.rect.y + from.rect.h / 2;

    let best: Entry | null = null;
    let bestScore = Infinity;

    for (const e of this.entries.values()) {
      if (e.id === from.id) continue;
      const cx = e.rect.x + e.rect.w / 2;
      const cy = e.rect.y + e.rect.h / 2;
      const dx = cx - fcx;
      const dy = cy - fcy;

      // primary axis check: must be in the right half-plane
      const inDir =
        (direction === 'right' && dx > 0) ||
        (direction === 'left' && dx < 0) ||
        (direction === 'down' && dy > 0) ||
        (direction === 'up' && dy < 0);
      if (!inDir) continue;

      // weighted distance: penalize off-axis movement
      const onAxis = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
      const offAxis = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = onAxis + offAxis * 2;

      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }
}
```

- [ ] **Step 2: Run tests — they should pass**

```bash
npm test
```

Expected: all 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/nav/spatial.ts
git commit -m "feat: implement spatial focus engine"
```

---

## Task 8: `useFocusable` hook + global D-pad input

**Files:**
- Create: `src/nav/useFocusable.ts`
- Create: `src/nav/input.ts`

- [ ] **Step 1: Create `src/nav/useFocusable.ts`**

```ts
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { SpatialNav } from './spatial';

export const navInstance = new SpatialNav();
export const focusedId = signal<string | null>(null);

navInstance.onFocusChange((id) => { focusedId.value = id; });

let counter = 0;
function makeId(prefix = 'f'): string { return `${prefix}-${++counter}`; }

interface Options {
  onActivate?: () => void;
  id?: string;
}

export function useFocusable(opts: Options = {}) {
  const ref = useRef<HTMLElement | null>(null);
  const [id] = useState(() => opts.id ?? makeId());

  useEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    navInstance.register(id, { x: r.left, y: r.top, w: r.width, h: r.height }, { onActivate: opts.onActivate });

    // Re-measure on resize
    const ro = new ResizeObserver(() => {
      if (!ref.current) return;
      const r2 = ref.current.getBoundingClientRect();
      navInstance.updateRect(id, { x: r2.left, y: r2.top, w: r2.width, h: r2.height });
    });
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      navInstance.unregister(id);
    };
  }, [id, opts.onActivate]);

  return {
    ref,
    focused: focusedId.value === id,
    'data-focusable': id,
    'data-focused': focusedId.value === id ? '' : undefined,
  };
}
```

- [ ] **Step 2: Create `src/nav/input.ts`**

```ts
import { navInstance } from './useFocusable';

const KEY_MAP: Record<number, 'up' | 'down' | 'left' | 'right' | 'enter' | 'back'> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'enter',
  461: 'back',  // WebOS Back button
  10009: 'back', // Tizen Back; harmless for LG, kept for safety
  27: 'back',   // Esc as in-browser fallback
};

export function installInputListener(onBack?: () => void): () => void {
  const handler = (e: KeyboardEvent) => {
    const action = KEY_MAP[e.keyCode];
    if (!action) return;
    e.preventDefault();
    switch (action) {
      case 'up': case 'down': case 'left': case 'right':
        navInstance.move(action);
        break;
      case 'enter':
        navInstance.activate();
        break;
      case 'back':
        onBack?.();
        break;
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
```

The `keyCode` values 37–40 are arrow keys (work in browser dev too); `461` is LG's Back button on the remote.

- [ ] **Step 3: Smoke check by adding a temporary focusable to App.tsx**

```tsx
import { useFocusable } from './nav/useFocusable';
import { useEffect } from 'preact/hooks';
import { installInputListener } from './nav/input';

export function App() {
  useEffect(() => installInputListener(), []);
  const a = useFocusable({ onActivate: () => alert('A activated') });
  const b = useFocusable({ onActivate: () => alert('B activated') });
  return (
    <div style={{ padding: 32, display: 'flex', gap: 16 }}>
      <div ref={a.ref as any} {...a} style={{ padding: 24, background: '#222' }}>A</div>
      <div ref={b.ref as any} {...b} style={{ padding: 24, background: '#222' }}>B</div>
    </div>
  );
}
```

```bash
npm run dev
```

Expected: arrow-right moves the red focus glow from A to B. Enter triggers an alert. Revert App.tsx after smoke check.

- [ ] **Step 4: Revert App.tsx to its prior `hello, duane` content** (we'll rebuild it properly in later tasks)

- [ ] **Step 5: Commit**

```bash
git add src/nav/useFocusable.ts src/nav/input.ts
git commit -m "feat: add useFocusable hook and global D-pad input"
```

---

## Task 9: Persistent state store

**Files:**
- Create: `src/state/store.ts`
- Create: `src/state/persistence.ts`

- [ ] **Step 1: Create `src/state/persistence.ts`**

```ts
export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.warn('localStorage full', e);
    }
  }
}
```

- [ ] **Step 2: Create `src/state/store.ts`**

```ts
import { signal, effect } from '@preact/signals';
import type { Settings, ResumePosition } from '../types';
import { loadJSON, saveJSON } from './persistence';

const defaultSettings: Settings = {
  rd_api_key: '',
  prefer_4k: false,
  audio_language: 'en',
  require_subtitles: true,
};

export const settings = signal<Settings>(loadJSON('settings-v1', defaultSettings));
export const watchlist = signal<string[]>(loadJSON('watchlist-v1', []));        // imdb_ids
export const resumePositions = signal<Record<string, ResumePosition>>(loadJSON('resume-v1', {}));

effect(() => saveJSON('settings-v1', settings.value));
effect(() => saveJSON('watchlist-v1', watchlist.value));
effect(() => saveJSON('resume-v1', resumePositions.value));

export function setRDKey(key: string): void {
  settings.value = { ...settings.value, rd_api_key: key };
}
export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  settings.value = { ...settings.value, [key]: value };
}
export function toggleWatchlist(imdb_id: string): void {
  const list = watchlist.value;
  watchlist.value = list.includes(imdb_id) ? list.filter((id) => id !== imdb_id) : [...list, imdb_id];
}
export function recordResume(imdb_id: string, position_seconds: number, duration_seconds: number): void {
  resumePositions.value = {
    ...resumePositions.value,
    [imdb_id]: { imdb_id, position_seconds, duration_seconds, updated_at: Date.now() },
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/state
git commit -m "feat: add signals-based state store with localStorage persistence"
```

---

## Task 10: TopNav, Hero, Row, PosterCard, BrandShelf, BrandTile components

**Files:**
- Create: `src/components/TopNav.tsx`
- Create: `src/components/Hero.tsx`
- Create: `src/components/PosterCard.tsx`
- Create: `src/components/Row.tsx`
- Create: `src/components/BrandTile.tsx`
- Create: `src/components/BrandShelf.tsx`

- [ ] **Step 1: Create `src/components/TopNav.tsx`**

```tsx
import { useFocusable } from '../nav/useFocusable';

interface Props {
  current: 'home' | 'search' | 'library' | 'settings';
  onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void;
}

export function TopNav({ current, onNavigate }: Props) {
  const items: Props['current'][] = ['home', 'search', 'library', 'settings'];
  return (
    <nav style={navStyle}>
      <span style={logoStyle}>duane</span>
      {items.map((id) => <NavItem key={id} id={id} active={current === id} onActivate={() => onNavigate(id)} />)}
    </nav>
  );
}

function NavItem({ id, active, onActivate }: { id: string; active: boolean; onActivate: () => void }) {
  const f = useFocusable({ onActivate, id: `nav-${id}` });
  return (
    <span ref={f.ref as any} {...f} style={{ ...navItemStyle, opacity: active ? 1 : 0.55, fontWeight: active ? 600 : 400 }}>
      {id[0].toUpperCase() + id.slice(1)}
    </span>
  );
}

const navStyle: any = {
  position: 'absolute', top: 0, left: 0, right: 0, height: 64, zIndex: 20,
  display: 'flex', alignItems: 'center', padding: '0 48px', gap: 32,
  background: 'linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.4) 60%, transparent)',
};
const logoStyle: any = {
  fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 700,
  color: 'var(--accent)', fontSize: 28, letterSpacing: '-1px', marginRight: 16,
};
const navItemStyle: any = { fontSize: 16, color: 'var(--text)', cursor: 'pointer', padding: '4px 8px' };
```

- [ ] **Step 2: Create `src/components/Hero.tsx`**

```tsx
import { useFocusable } from '../nav/useFocusable';
import type { Movie } from '../types';

interface Props { movie: Movie; onPlay: () => void; onMoreInfo: () => void; }

export function Hero({ movie, onPlay, onMoreInfo }: Props) {
  const playBtn = useFocusable({ onActivate: onPlay, id: 'hero-play' });
  const infoBtn = useFocusable({ onActivate: onMoreInfo, id: 'hero-info' });

  return (
    <div style={{ ...heroStyle, backgroundImage: `url(${movie.backdrop})` }}>
      <div style={overlayStyle} />
      <div style={vignetteStyle} />
      <div style={contentStyle}>
        <div style={pillStyle}>JUST HIT STREAMING</div>
        <h1 style={titleStyle}>{movie.title}</h1>
        <div style={metaStyle}>
          <span>{movie.year}</span>
          <span>{Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</span>
          {movie.scores.rt != null && <span style={{ color: 'var(--success)', fontWeight: 700 }}>{movie.scores.rt}% RT</span>}
          {movie.scores.imdb != null && <span>★ {movie.scores.imdb}</span>}
        </div>
        <p style={descStyle}>{movie.overview}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <span ref={playBtn.ref as any} {...playBtn} style={btnPrimary}>▶ Play</span>
          <span ref={infoBtn.ref as any} {...infoBtn} style={btnSecondary}>ⓘ More Info</span>
        </div>
      </div>
    </div>
  );
}

const heroStyle: any = { position: 'absolute', top: 0, left: 0, right: 0, height: '58%', backgroundSize: 'cover', backgroundPosition: 'center' };
const overlayStyle: any = { position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 25%, var(--bg) 100%), linear-gradient(90deg, var(--bg) 0%, rgba(10,10,10,0.7) 30%, transparent 65%), radial-gradient(ellipse 80% 60% at 70% 45%, rgba(229, 9, 20, 0.18) 0%, transparent 55%)' };
const vignetteStyle: any = { position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 45%, transparent 30%, rgba(0,0,0,0.55) 95%)', pointerEvents: 'none' };
const contentStyle: any = { position: 'absolute', bottom: '18%', left: '3%', maxWidth: '50%', zIndex: 5 };
const pillStyle: any = { display: 'inline-block', background: 'rgba(229, 9, 20, 0.12)', border: '1px solid rgba(229,9,20,0.7)', color: '#ff5560', padding: '5px 14px', borderRadius: 2, fontSize: 12, fontWeight: 700, letterSpacing: '2.5px', marginBottom: 18 };
const titleStyle: any = { fontFamily: 'var(--font-display)', fontSize: 84, fontWeight: 400, letterSpacing: '-3px', lineHeight: 0.92, margin: '0 0 16px' };
const metaStyle: any = { display: 'flex', gap: 16, alignItems: 'center', fontSize: 14, letterSpacing: '1.4px', marginBottom: 14, color: 'rgba(240,236,228,0.85)', textTransform: 'uppercase' };
const descStyle: any = { fontSize: 16, lineHeight: 1.55, marginBottom: 24, opacity: 0.9, maxWidth: '90%' };
const btnBase: any = { padding: '13px 26px', borderRadius: 4, fontSize: 14, fontWeight: 700, letterSpacing: '0.4px', cursor: 'pointer' };
const btnPrimary: any = { ...btnBase, background: 'var(--text)', color: 'var(--bg)' };
const btnSecondary: any = { ...btnBase, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' };
```

- [ ] **Step 3: Create `src/components/PosterCard.tsx`**

```tsx
import { useFocusable } from '../nav/useFocusable';
import type { Movie } from '../types';

export function PosterCard({ movie, onActivate }: { movie: Movie; onActivate: () => void }) {
  const f = useFocusable({ onActivate, id: `poster-${movie.imdb_id}` });
  return (
    <div ref={f.ref as any} {...f} style={cardStyle}>
      <img src={movie.poster} alt="" style={imgStyle} />
      <div style={infoStyle}>
        <div style={titleStyle}>{movie.title}</div>
        <div style={metaStyle}>{movie.year} · ★ {movie.scores.imdb ?? '—'}</div>
      </div>
    </div>
  );
}

const cardStyle: any = { aspectRatio: '16/9', borderRadius: 4, overflow: 'hidden', position: 'relative', background: '#1a1a1a', cursor: 'pointer' };
const imgStyle: any = { width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.85) saturate(0.85) contrast(1.05)' };
const infoStyle: any = { position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 35%, rgba(0,0,0,0.92) 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '8px 11px' };
const titleStyle: any = { fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, letterSpacing: '-0.3px', lineHeight: 1.05 };
const metaStyle: any = { fontSize: 9.5, opacity: 0.7, letterSpacing: '1.2px', marginTop: 3, textTransform: 'uppercase' };
```

- [ ] **Step 4: Create `src/components/Row.tsx`**

```tsx
import type { Movie } from '../types';
import { PosterCard } from './PosterCard';

interface Props { title: string; subtitle?: string; items: Movie[]; onSelect: (m: Movie) => void; }

export function Row({ title, subtitle, items, onSelect }: Props) {
  return (
    <div>
      <div style={labelStyle}>{title}{subtitle && <span style={subStyle}> · {subtitle}</span>}</div>
      <div style={gridStyle}>
        {items.slice(0, 7).map((m) => <PosterCard key={m.imdb_id} movie={m} onActivate={() => onSelect(m)} />)}
      </div>
    </div>
  );
}

const labelStyle: any = { fontSize: 14, fontWeight: 700, marginBottom: 10, letterSpacing: '-0.2px' };
const subStyle: any = { fontWeight: 400, opacity: 0.6, marginLeft: 8 };
const gridStyle: any = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 };
```

- [ ] **Step 5: Create `src/components/BrandTile.tsx`**

```tsx
import { useFocusable } from '../nav/useFocusable';
import type { Collection } from '../types';

export function BrandTile({ collection, onActivate }: { collection: Collection; onActivate: () => void }) {
  const f = useFocusable({ onActivate, id: `brand-${collection.id}` });
  return (
    <div ref={f.ref as any} {...f} style={{ ...tileStyle, background: collection.background_color ?? '#222' }}>
      {collection.logo_url
        ? <img src={collection.logo_url} alt={collection.title} style={logoStyle} />
        : <span style={textStyle}>{collection.title}</span>}
    </div>
  );
}

const tileStyle: any = { aspectRatio: '16/9', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' };
const logoStyle: any = { maxWidth: '70%', maxHeight: '60%' };
const textStyle: any = { fontWeight: 800, letterSpacing: '1.5px', fontSize: 18, color: '#fff' };
```

- [ ] **Step 6: Create `src/components/BrandShelf.tsx`**

```tsx
import type { Collection } from '../types';
import { BrandTile } from './BrandTile';

export function BrandShelf({ collections, onSelect }: { collections: Collection[]; onSelect: (c: Collection) => void }) {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, letterSpacing: '-0.2px' }}>Studios &amp; Brands</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
        {collections.slice(0, 7).map((c) => <BrandTile key={c.id} collection={c} onActivate={() => onSelect(c)} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/components
git commit -m "feat: add TopNav, Hero, Row, PosterCard, BrandShelf components"
```

---

## Task 11: Home screen

**Files:**
- Create: `src/screens/Home.tsx`

- [ ] **Step 1: Create `src/screens/Home.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks';
import { TopNav } from '../components/TopNav';
import { Hero } from '../components/Hero';
import { Row } from '../components/Row';
import { BrandShelf } from '../components/BrandShelf';
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
    fetchRows().then(setData).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div style={errorStyle}>Couldn't load rows: {error}</div>;
  if (!data) return <div style={loadingStyle}>Loading…</div>;

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

const belowHeroStyle: any = { position: 'absolute', top: '60%', left: '3%', right: '3%', display: 'flex', flexDirection: 'column', gap: 24 };
const loadingStyle: any = { padding: 64, opacity: 0.6 };
const errorStyle: any = { padding: 64, color: 'var(--accent)' };
```

- [ ] **Step 2: Commit**

```bash
git add src/screens/Home.tsx
git commit -m "feat: assemble home screen"
```

---

## Task 12: Settings screen

**Files:**
- Create: `src/screens/Settings.tsx`

- [ ] **Step 1: Create `src/screens/Settings.tsx`**

```tsx
import { useFocusable } from '../nav/useFocusable';
import { settings, setSetting } from '../state/store';
import type { Settings as SettingsT } from '../types';
import { TopNav } from '../components/TopNav';

export function Settings({ onNavigate }: { onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void }) {
  const s = settings.value;
  return (
    <>
      <TopNav current="settings" onNavigate={onNavigate} />
      <div style={pageStyle}>
        <h1 style={h1Style}>Settings</h1>
        <RDKeyField value={s.rd_api_key} />
        <ToggleField label="Prefer 4K when available" value={s.prefer_4k} onChange={(v) => setSetting('prefer_4k', v)} />
        <SelectField
          label="Audio language"
          value={s.audio_language}
          options={[['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['ja', '日本語'], ['any', 'Any']]}
          onChange={(v) => setSetting('audio_language', v as SettingsT['audio_language'])}
        />
        <ToggleField
          label="Require subtitles"
          value={s.require_subtitles}
          onChange={(v) => setSetting('require_subtitles', v)}
        />
      </div>
    </>
  );
}

function RDKeyField({ value }: { value: string }) {
  const f = useFocusable({
    id: 'set-rd-key',
    onActivate: () => {
      const next = window.prompt('Real-Debrid API key', value);
      if (next != null) setSetting('rd_api_key', next.trim());
    },
  });
  const masked = value ? `${value.slice(0, 4)}…${value.slice(-4)}` : '(not set)';
  return (
    <div style={fieldStyle}>
      <div style={labelStyle}>Real-Debrid API key</div>
      <div ref={f.ref as any} {...f} style={valueStyle}>{masked}</div>
    </div>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const f = useFocusable({ id: `toggle-${label}`, onActivate: () => onChange(!value) });
  return (
    <div style={fieldStyle}>
      <div style={labelStyle}>{label}</div>
      <div ref={f.ref as any} {...f} style={valueStyle}>{value ? 'On' : 'Off'}</div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (v: string) => void;
}) {
  const f = useFocusable({
    id: `select-${label}`,
    onActivate: () => {
      const idx = options.findIndex(([v]) => v === value);
      const next = options[(idx + 1) % options.length];
      onChange(next[0]);
    },
  });
  const display = options.find(([v]) => v === value)?.[1] ?? value;
  return (
    <div style={fieldStyle}>
      <div style={labelStyle}>{label}</div>
      <div ref={f.ref as any} {...f} style={valueStyle}>{display}</div>
    </div>
  );
}

const pageStyle: any = { padding: '96px 64px', maxWidth: 800 };
const h1Style: any = { fontFamily: 'var(--font-display)', fontSize: 48, marginBottom: 32 };
const fieldStyle: any = { display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, padding: '14px 0', alignItems: 'center', borderBottom: '1px solid var(--border)' };
const labelStyle: any = { color: 'var(--text-muted)', letterSpacing: '1.2px', textTransform: 'uppercase', fontSize: 12 };
const valueStyle: any = { padding: '10px 16px', borderRadius: 4, background: 'var(--surface)', cursor: 'pointer' };
```

(The `window.prompt` is a temporary stand-in for an on-screen keyboard. Acceptable for MVP — the RD key only gets entered once.)

- [ ] **Step 2: Commit**

```bash
git add src/screens/Settings.tsx
git commit -m "feat: settings screen with RD key and playback prefs"
```

---

## Task 13: Router and App composition

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace `src/App.tsx`**

```tsx
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { Home } from './screens/Home';
import { Settings } from './screens/Settings';
import { installInputListener } from './nav/input';
import type { Movie, Collection } from './types';

type Route =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'library' }
  | { name: 'settings' }
  | { name: 'detail'; movie: Movie }
  | { name: 'collection'; collection: Collection }
  | { name: 'player'; movie: Movie };

export const route = signal<Route>({ name: 'home' });

const stack: Route[] = [{ name: 'home' }];
function push(r: Route) { stack.push(r); route.value = r; }
function pop() {
  if (stack.length > 1) { stack.pop(); route.value = stack[stack.length - 1]; }
}

export function App() {
  useEffect(() => installInputListener(pop), []);
  const r = route.value;
  switch (r.name) {
    case 'home':
      return <Home
        onNavigate={(to) => push({ name: to } as Route)}
        onSelectMovie={(movie) => push({ name: 'detail', movie })}
        onSelectCollection={(collection) => push({ name: 'collection', collection })}
      />;
    case 'settings':
      return <Settings onNavigate={(to) => push({ name: to } as Route)} />;
    case 'detail':
      return <DetailPlaceholder movie={r.movie} />;
    case 'player':
      return <PlayerPlaceholder movie={r.movie} />;
    default:
      return <div style={{ padding: 64 }}>Coming soon: {r.name}</div>;
  }
}

function DetailPlaceholder({ movie }: { movie: Movie }) {
  return <div style={{ padding: 64 }}><h1>{movie.title}</h1><p>Detail screen — Task 22 builds this.</p></div>;
}
function PlayerPlaceholder({ movie }: { movie: Movie }) {
  return <div style={{ padding: 64 }}><h1>Playing {movie.title}</h1><p>Player — Task 23+ builds this.</p></div>;
}
```

- [ ] **Step 2: Verify in dev**

```bash
npm run dev
```

Expected: home screen renders with hero, brand shelf, two rows. Arrow keys move focus. Pressing Enter on a poster routes to the detail placeholder. Esc/Back returns to Home. Selecting "Settings" in the top nav opens the settings page.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: signals-based router with back-stack"
```

---

## Task 14: ares-cli + IPK packaging + first deploy

**Files:**
- Create: `webos-info.json`
- Create: `scripts/deploy.sh`
- Create: `public/icon.png` (130×130 — placeholder for now)
- Create: `public/icon-large.png` (256×256 — placeholder)

- [ ] **Step 1: Install ares-cli globally**

```bash
npm install -g @webos-tools/cli
```

(LG renamed `ares-cli` to `@webos-tools/cli`. If that fails, fall back to `npm install -g ares-cli`.)

- [ ] **Step 2: Register the TV with ares-cli**

```bash
ares-setup-device --add tv --info "host=10.0.0.238,port=9922,username=prisoner,privatekey=/path/to/webos_rsa_dec,passphrase=,description=Living room LG"
ares-setup-device --list
```

Expected output: `tv | (default) | 10.0.0.238 | prisoner`. Key path comes from the user's `LG_TV_NOTES.md` (`/tmp/webos_rsa_dec`).

- [ ] **Step 3: Create `webos-info.json`** at the project root

```json
{
  "id": "com.duane.stremio",
  "version": "0.1.0",
  "vendor": "Duane",
  "type": "web",
  "main": "index.html",
  "title": "duane",
  "icon": "icon.png",
  "largeIcon": "icon-large.png",
  "iconColor": "red",
  "appDescription": "Custom Stremio for WebOS",
  "resolution": "1920x1080",
  "uiRevision": 2
}
```

ares-cli reads `webos-info.json` (or `appinfo.json`) from the *built* app directory; we'll have the build copy it.

- [ ] **Step 4: Update `vite.config.ts` to copy `webos-info.json` into `dist/` as `appinfo.json`**

```ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [
    preact(),
    {
      name: 'copy-webos-info',
      closeBundle() {
        copyFileSync(
          resolve(__dirname, 'webos-info.json'),
          resolve(__dirname, 'dist', 'appinfo.json'),
        );
      },
    },
  ],
  build: {
    target: 'chrome79',
    cssTarget: 'chrome79',
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
  },
});
```

- [ ] **Step 5: Add placeholder icons** (any 130×130 and 256×256 PNGs work for now)

```bash
# Generate 130×130 and 256×256 solid-red PNGs as placeholders.
# Replace later with real artwork.
node -e "
const fs = require('fs');
function pngSolid(w, h, r, g, b) {
  // crude raw PNG synthesis avoided; instead, emit a 1x1 PNG and expect the TV to scale.
  // simpler: use a hardcoded base64 1x1 red PNG, repeat the file at both sizes (LG accepts).
}
" || true

# Easiest: open Paint, save two solid-red PNGs at the required sizes, save to public/.
```

If on a fresh system without Paint: any PNG file at the right path will pass the IPK packager; the user can replace it later.

- [ ] **Step 6: Create `scripts/deploy.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ build"
npm run build

echo "→ package"
mkdir -p ipk
ares-package dist -o ipk

IPK=$(ls -t ipk/*.ipk | head -1)
echo "→ installing $IPK on tv"
ares-install -d tv "$IPK"

echo "→ launching"
ares-launch -d tv com.duane.stremio
echo "✓ done"
```

```bash
chmod +x scripts/deploy.sh
```

- [ ] **Step 7: Run a build + deploy**

```bash
npm run deploy
```

Expected: builds, packages an IPK in `ipk/`, installs it on the TV, launches it. The TV should show "duane" in italic red, the home screen with the sample data, and respond to the remote's D-pad.

- [ ] **Step 8: Commit**

```bash
git add webos-info.json scripts/deploy.sh public/icon.png public/icon-large.png vite.config.ts
git commit -m "feat: ares-cli deploy pipeline + webos app metadata"
```

---

## Task 15: Torrent-name parser — write tests

**Files:**
- Create: `src/sources/parse-name.test.ts`

- [ ] **Step 1: Create `src/sources/parse-name.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseName } from './parse-name';

describe('parseName', () => {
  it('parses a typical 1080p WEB-DL', () => {
    const p = parseName('Dune.Part.Two.2024.1080p.WEB-DL.DDP5.1.H.264-FLUX.mkv');
    expect(p.resolution).toBe('1080p');
    expect(p.video_codec).toBe('h264');
    expect(p.audio_codec).toBe('eac3');
    expect(p.source).toBe('webdl');
    expect(p.container).toBe('mkv');
    expect(p.group).toBe('FLUX');
  });

  it('parses 4K HDR REMUX with TrueHD', () => {
    const p = parseName('Anora.2024.2160p.BluRay.REMUX.HEVC.TrueHD.7.1.Atmos-FraMeSToR.mkv');
    expect(p.resolution).toBe('2160p');
    expect(p.video_codec).toBe('h265');
    expect(p.audio_codec).toBe('truehd');
    expect(p.source).toBe('remux');
  });

  it('extracts language tags', () => {
    const p = parseName('Movie.2024.1080p.MULTI.ENG.HINDI.x264-GROUP.mkv');
    expect(p.audio_languages.sort()).toEqual(['en', 'hi']);
  });

  it('defaults to English when no language is mentioned', () => {
    const p = parseName('Movie.2024.1080p.WEB-DL.x264.mkv');
    expect(p.audio_languages).toEqual(['en']);
  });

  it('handles HEVC variants', () => {
    expect(parseName('X.2024.HEVC.mkv').video_codec).toBe('h265');
    expect(parseName('X.2024.x265.mkv').video_codec).toBe('h265');
    expect(parseName('X.2024.h.265.mkv').video_codec).toBe('h265');
  });

  it('handles AAC vs DDP variants', () => {
    expect(parseName('X.AAC.mp4').audio_codec).toBe('aac');
    expect(parseName('X.DDP5.1.mkv').audio_codec).toBe('eac3');
    expect(parseName('X.DD5.1.mkv').audio_codec).toBe('ac3');
    expect(parseName('X.DTS-HD.mkv').audio_codec).toBe('dts');
  });

  it('returns undefined for fields not detectable', () => {
    const p = parseName('Random.mkv');
    expect(p.resolution).toBeUndefined();
    expect(p.video_codec).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — they should fail (module missing)**

```bash
npm test
```

- [ ] **Step 3: Commit**

```bash
git add src/sources/parse-name.test.ts
git commit -m "test: torrent name parser specification"
```

---

## Task 16: Torrent-name parser — implement

**Files:**
- Create: `src/sources/parse-name.ts`

- [ ] **Step 1: Create `src/sources/parse-name.ts`**

```ts
import type { ParsedName } from '../types';

const RES_PATTERNS: Array<[RegExp, ParsedName['resolution']]> = [
  [/\b(2160p|4k|uhd)\b/i, '2160p'],
  [/\b1080p\b/i, '1080p'],
  [/\b720p\b/i, '720p'],
];

const VCODEC_PATTERNS: Array<[RegExp, ParsedName['video_codec']]> = [
  [/\b(hevc|h\.?265|x265)\b/i, 'h265'],
  [/\b(avc|h\.?264|x264)\b/i, 'h264'],
  [/\bvp9\b/i, 'vp9'],
  [/\bav1\b/i, 'av1'],
];

const ACODEC_PATTERNS: Array<[RegExp, ParsedName['audio_codec']]> = [
  [/\btrue.?hd\b/i, 'truehd'],
  [/\bdts(.hd)?\b/i, 'dts'],
  [/\bflac\b/i, 'flac'],
  [/\bopus\b/i, 'opus'],
  [/\b(ddp|e.?ac.?3|eac3)\b/i, 'eac3'],
  [/\b(dd|ac.?3|ac3)\b/i, 'ac3'],
  [/\baac\b/i, 'aac'],
];

const SOURCE_PATTERNS: Array<[RegExp, ParsedName['source']]> = [
  [/\bremux\b/i, 'remux'],
  [/\b(bluray|bdrip)\b/i, 'bluray'],
  [/\bweb.?dl\b/i, 'webdl'],
  [/\bweb.?rip\b/i, 'webrip'],
  [/\bhdtv\b/i, 'hdtv'],
  [/\bdvdrip\b/i, 'dvdrip'],
];

const LANG_PATTERNS: Array<[RegExp, string]> = [
  [/\benglish|eng\b/i, 'en'],
  [/\bspanish|esp\b/i, 'es'],
  [/\bfrench|fre|fra\b/i, 'fr'],
  [/\bgerman|ger|deu\b/i, 'de'],
  [/\bjapanese|jpn|jap\b/i, 'ja'],
  [/\bhindi|hin\b/i, 'hi'],
  [/\bkorean|kor\b/i, 'ko'],
  [/\bitalian|ita\b/i, 'it'],
  [/\bportuguese|por\b/i, 'pt'],
];

const CONTAINER_PATTERNS: Array<[RegExp, ParsedName['container']]> = [
  [/\.mp4$/i, 'mp4'],
  [/\.mkv$/i, 'mkv'],
  [/\.webm$/i, 'webm'],
  [/\.avi$/i, 'avi'],
];

const GROUP_PATTERN = /-([A-Za-z0-9]+)(?:\.[a-z0-9]+)?$/;

function firstMatch<T>(name: string, patterns: Array<[RegExp, T]>): T | undefined {
  for (const [re, val] of patterns) if (re.test(name)) return val;
  return undefined;
}

export function parseName(name: string): ParsedName {
  const langs = LANG_PATTERNS.filter(([re]) => re.test(name)).map(([, code]) => code);
  const audio_languages = langs.length > 0 ? Array.from(new Set(langs)) : ['en'];
  return {
    resolution: firstMatch(name, RES_PATTERNS),
    video_codec: firstMatch(name, VCODEC_PATTERNS),
    audio_codec: firstMatch(name, ACODEC_PATTERNS),
    source: firstMatch(name, SOURCE_PATTERNS),
    container: firstMatch(name, CONTAINER_PATTERNS),
    group: name.match(GROUP_PATTERN)?.[1],
    audio_languages,
  };
}
```

- [ ] **Step 2: Run tests — they should pass**

```bash
npm test
```

- [ ] **Step 3: Commit**

```bash
git add src/sources/parse-name.ts
git commit -m "feat: implement torrent name parser"
```

---

## Task 17: Capabilities module — write tests

**Files:**
- Create: `src/sources/capabilities.test.ts`

- [ ] **Step 1: Create `src/sources/capabilities.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { probeCodecs, probeBandwidthMbps } from './capabilities';

describe('probeCodecs', () => {
  beforeEach(() => {
    const orig = HTMLVideoElement.prototype.canPlayType;
    HTMLVideoElement.prototype.canPlayType = function (type: string) {
      if (type.includes('avc1')) return 'probably';
      if (type.includes('hev1.1')) return 'maybe';
      if (type.includes('hev1.2')) return '';
      if (type.includes('mp4a')) return 'probably';
      if (type.includes('ac-3')) return '';
      if (type.includes('ec-3')) return '';
      return '';
    } as any;
    return () => { HTMLVideoElement.prototype.canPlayType = orig; };
  });

  it('marks H264 supported when canPlayType says probably', () => {
    expect(probeCodecs().h264).toBe(true);
  });

  it('marks H265 main supported when canPlayType says maybe', () => {
    expect(probeCodecs().h265_main).toBe(true);
  });

  it('marks H265 main10 unsupported when canPlayType says empty', () => {
    expect(probeCodecs().h265_main10).toBe(false);
  });

  it('marks AC3/E-AC3 unsupported when canPlayType says empty', () => {
    const c = probeCodecs();
    expect(c.ac3).toBe(false);
    expect(c.eac3).toBe(false);
  });
});

describe('probeBandwidthMbps', () => {
  it('estimates Mbps from byte count and elapsed ms', async () => {
    const fakeBlob = new ArrayBuffer(5_000_000); // 5 MB
    let resolveFetch: (v: Response) => void;
    const fetchPromise = new Promise<Response>((res) => { resolveFetch = res; });
    vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchPromise as any);

    const start = performance.now();
    vi.spyOn(performance, 'now').mockImplementation(() => start);
    const result = probeBandwidthMbps('https://example/test.bin');
    vi.spyOn(performance, 'now').mockImplementation(() => start + 4000); // 4 seconds

    resolveFetch!(new Response(fakeBlob));
    const mbps = await result;

    // 5 MB in 4 s ≈ 10 Mbps
    expect(mbps).toBeGreaterThan(8);
    expect(mbps).toBeLessThan(12);
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run tests, expect failure (module missing)**

```bash
npm test
```

- [ ] **Step 3: Commit**

```bash
git add src/sources/capabilities.test.ts
git commit -m "test: capabilities probe specification"
```

---

## Task 18: Capabilities module — implement

**Files:**
- Create: `src/sources/capabilities.ts`

- [ ] **Step 1: Create `src/sources/capabilities.ts`**

```ts
import type { Capabilities } from '../types';

const CACHE_KEY = 'capabilities-v1';
const REPROBE_BANDWIDTH_AFTER_MS = 30 * 60 * 1000; // 30 min
const PROBE_FILE_URL = 'https://speed.cloudflare.com/__down?bytes=5000000'; // 5 MB

const CODEC_TESTS = {
  h264: 'video/mp4; codecs="avc1.4D401E"',
  h265_main: 'video/mp4; codecs="hev1.1.6.L93.B0"',
  h265_main10: 'video/mp4; codecs="hev1.2.4.L93.B0"',
  vp9: 'video/webm; codecs="vp9"',
  av1: 'video/mp4; codecs="av01.0.04M.08"',
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  ac3: 'audio/mp4; codecs="ac-3"',
  eac3: 'audio/mp4; codecs="ec-3"',
} as const;

export function probeCodecs(): Capabilities['codecs'] {
  const v = document.createElement('video');
  const out: Record<string, boolean> = {};
  for (const [key, type] of Object.entries(CODEC_TESTS)) {
    out[key] = v.canPlayType(type) !== '';
  }
  return out as Capabilities['codecs'];
}

export async function probeBandwidthMbps(url = PROBE_FILE_URL): Promise<number> {
  const start = performance.now();
  const r = await fetch(url, { cache: 'no-store' });
  const buf = await r.arrayBuffer();
  const bytes = buf.byteLength;
  const ms = performance.now() - start;
  const mbps = (bytes * 8) / 1_000_000 / (ms / 1000);
  return mbps;
}

export async function ensureCapabilities(): Promise<Capabilities> {
  const cached = readCache();
  const now = Date.now();
  const codecsStale = !cached || JSON.stringify(cached.codecs) !== JSON.stringify(probeCodecs());
  const bandwidthStale = !cached || now - cached.probedAt > REPROBE_BANDWIDTH_AFTER_MS;

  if (cached && !codecsStale && !bandwidthStale) return cached;

  const codecs = probeCodecs();
  let bandwidthMbps = cached?.bandwidthMbps ?? 0;
  if (bandwidthStale || !cached) {
    try { bandwidthMbps = await probeBandwidthMbps(); }
    catch { bandwidthMbps = cached?.bandwidthMbps ?? 25; } // pessimistic-ish default if probe fails
  }
  const fresh: Capabilities = { codecs, bandwidthMbps, probedAt: now };
  writeCache(fresh);
  return fresh;
}

function readCache(): Capabilities | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Capabilities) : null;
  } catch { return null; }
}
function writeCache(c: Capabilities): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* quota: ignore */ }
}
```

- [ ] **Step 2: Run tests — they should pass**

```bash
npm test
```

- [ ] **Step 3: Commit**

```bash
git add src/sources/capabilities.ts
git commit -m "feat: codec + bandwidth capability probes"
```

---

## Task 19: Real-Debrid client — write tests

**Files:**
- Create: `src/sources/realdebrid.test.ts`

- [ ] **Step 1: Create `src/sources/realdebrid.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RDClient } from './realdebrid';

describe('RDClient', () => {
  let client: RDClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new RDClient('test-api-key');
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => vi.restoreAllMocks());

  it('checkCache sends auth header and returns cached hashes', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': { rd: [{ '1': { filename: 'movie.mkv', filesize: 5_000_000_000 } }] },
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb': [],
    })));
    const cached = await client.checkCache(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']);
    expect(cached).toEqual(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
    const call = fetchSpy.mock.calls[0];
    expect((call[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-api-key' });
  });

  it('unrestrict returns a streamable URL', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'torrent-id' })))
      .mockResolvedValueOnce(new Response(''))
      .mockResolvedValueOnce(new Response(JSON.stringify({ links: ['https://rd.example/file'] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ download: 'https://cdn.example/movie.mkv' })));

    const url = await client.unrestrict('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(url).toBe('https://cdn.example/movie.mkv');
  });

  it('throws on 401 invalid key', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"error":"bad_token"}', { status: 401 }));
    await expect(client.checkCache(['x'])).rejects.toThrow(/RD api/);
  });
});
```

- [ ] **Step 2: Run tests — fail (module missing)**

```bash
npm test
```

- [ ] **Step 3: Commit**

```bash
git add src/sources/realdebrid.test.ts
git commit -m "test: real-debrid client specification"
```

---

## Task 20: Real-Debrid client — implement

**Files:**
- Create: `src/sources/realdebrid.ts`

- [ ] **Step 1: Create `src/sources/realdebrid.ts`**

```ts
const BASE = 'https://api.real-debrid.com/rest/1.0';

export class RDClient {
  constructor(private apiKey: string) {}

  private async req(path: string, init: RequestInit = {}): Promise<Response> {
    const r = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.apiKey}`, ...(init.headers ?? {}) },
    });
    if (!r.ok) throw new Error(`RD api ${r.status}: ${await r.text().catch(() => '')}`);
    return r;
  }

  /** Returns the subset of hashes RD has cached. */
  async checkCache(hashes: string[]): Promise<string[]> {
    if (hashes.length === 0) return [];
    const path = `/torrents/instantAvailability/${hashes.join('/')}`;
    const r = await this.req(path);
    const data = (await r.json()) as Record<string, unknown>;
    const cached: string[] = [];
    for (const [hash, val] of Object.entries(data)) {
      // RD returns either an empty array (not cached) or a non-empty object {rd: [{...}]}
      if (val && typeof val === 'object' && 'rd' in (val as object)) cached.push(hash);
    }
    return cached;
  }

  /** Add a magnet, then unrestrict the largest video file in it. Returns CDN URL. */
  async unrestrict(infoHash: string): Promise<string> {
    const magnet = `magnet:?xt=urn:btih:${infoHash}`;
    const addBody = new URLSearchParams({ magnet });
    const addR = await this.req('/torrents/addMagnet', { method: 'POST', body: addBody });
    const { id } = (await addR.json()) as { id: string };

    // Select all files (RD requires a selection; pass "all")
    const selectBody = new URLSearchParams({ files: 'all' });
    await this.req(`/torrents/selectFiles/${id}`, { method: 'POST', body: selectBody });

    // Poll until ready (cached should be near-instant; cap at 8 seconds)
    let info: any;
    for (let i = 0; i < 16; i++) {
      const ir = await this.req(`/torrents/info/${id}`);
      info = await ir.json();
      if (info.status === 'downloaded') break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (info.status !== 'downloaded') throw new Error('RD: torrent not cached or stalled');

    // Pick largest file's link
    const links: string[] = info.links;
    if (!links?.length) throw new Error('RD: no links returned');

    // unrestrict the largest link
    const unBody = new URLSearchParams({ link: links[0] });
    const unR = await this.req('/unrestrict/link', { method: 'POST', body: unBody });
    const { download } = (await unR.json()) as { download: string };
    return download;
  }
}
```

Note: The flow `addMagnet → selectFiles → info → unrestrict` is the documented RD sequence. For cached torrents `status` flips to `downloaded` almost immediately.

- [ ] **Step 2: Run tests — they should pass**

```bash
npm test
```

- [ ] **Step 3: Commit**

```bash
git add src/sources/realdebrid.ts
git commit -m "feat: real-debrid REST client"
```

---

## Task 21: Torrentio client

**Files:**
- Create: `src/sources/torrentio.ts`

- [ ] **Step 1: Create `src/sources/torrentio.ts`**

```ts
import type { StreamCandidate } from '../types';
import { parseName } from './parse-name';

// Public Torrentio addon manifest. Configurable later if user wants a different scraper addon.
const TORRENTIO_BASE = 'https://torrentio.strem.fun';

interface TorrentioStream {
  name: string;
  title: string;
  infoHash: string;
  fileIdx?: number;
  behaviorHints?: { bingeGroup?: string; videoSize?: number };
}

/**
 * Torrentio's response title encodes filename + seeds + size on multiple lines.
 * Example title:
 *   "Dune.Part.Two.2024.1080p.WEB-DL.DDP5.1.H.264-FLUX.mkv\n👤 1234 💾 5.4 GB"
 */
function extractFilename(title: string): string {
  return title.split('\n')[0]?.trim() ?? '';
}
function extractSeeds(title: string): number {
  const m = title.match(/👤\s*(\d+)/);
  return m ? Number(m[1]) : 0;
}
function extractBytes(title: string, hint?: number): number {
  if (hint) return hint;
  const m = title.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2].toUpperCase() === 'GB' ? Math.round(n * 1_000_000_000) : Math.round(n * 1_000_000);
}

export async function fetchTorrentioCandidates(imdbId: string): Promise<StreamCandidate[]> {
  const r = await fetch(`${TORRENTIO_BASE}/stream/movie/${imdbId}.json`);
  if (!r.ok) throw new Error(`Torrentio ${r.status}`);
  const data = (await r.json()) as { streams: TorrentioStream[] };
  return (data.streams ?? []).map((s) => {
    const filename = extractFilename(s.title);
    return {
      hash: s.infoHash.toLowerCase(),
      filename,
      bytes: extractBytes(s.title, s.behaviorHints?.videoSize),
      seeds: extractSeeds(s.title),
      parsed: parseName(filename),
    };
  });
}
```

- [ ] **Step 2: Smoke test in dev console** (optional)

```js
// In browser dev console after `npm run dev`:
import('/src/sources/torrentio.ts').then(({ fetchTorrentioCandidates }) =>
  fetchTorrentioCandidates('tt15239678').then(console.log));
```

Expected: array of candidates for Dune Part Two with parsed metadata.

- [ ] **Step 3: Commit**

```bash
git add src/sources/torrentio.ts
git commit -m "feat: torrentio scraper client"
```

---

## Task 22: Stream picker — write tests

**Files:**
- Create: `src/sources/picker.test.ts`

- [ ] **Step 1: Create `src/sources/picker.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { rankAndPick } from './picker';
import type { StreamCandidate, Capabilities, Settings } from '../types';
import { parseName } from './parse-name';

const baseCaps: Capabilities = {
  codecs: { h264: true, h265_main: false, h265_main10: false, vp9: true, av1: false, aac: true, ac3: true, eac3: true },
  bandwidthMbps: 50,
  probedAt: 0,
};
const baseSettings: Settings = { rd_api_key: 'k', prefer_4k: false, audio_language: 'en', require_subtitles: true };

const cand = (name: string, bytes: number, seeds = 100, hash = name.replace(/\W/g, '').padEnd(40, 'a').slice(0, 40)): StreamCandidate => ({
  hash, filename: name, bytes, seeds, parsed: parseName(name),
});

const RUNTIME_HOURS = 2;

describe('rankAndPick', () => {
  it('rejects sources whose video codec is unsupported', () => {
    const candidates = [
      cand('Movie.2024.1080p.WEB-DL.HEVC.x265.eng.mkv', 4_000_000_000),
      cand('Movie.2024.1080p.WEB-DL.x264.eng.mkv', 4_000_000_000),
    ];
    const cachedHashes = candidates.map((c) => c.hash);
    const r = rankAndPick(candidates, cachedHashes, baseCaps, baseSettings, ['en'], RUNTIME_HOURS);
    expect(r.kind).toBe('pick');
    if (r.kind === 'pick') expect(r.candidate.filename).toContain('x264');
  });

  it('rejects sources whose audio codec is unsupported (DTS)', () => {
    const candidates = [
      cand('Movie.2024.1080p.BluRay.x264.DTS-HD.eng.mkv', 5_000_000_000),
      cand('Movie.2024.1080p.WEB-DL.x264.AAC.eng.mkv', 4_000_000_000),
    ];
    const r = rankAndPick(candidates, candidates.map((c) => c.hash), baseCaps, baseSettings, ['en'], RUNTIME_HOURS);
    expect(r.kind).toBe('pick');
    if (r.kind === 'pick') expect(r.candidate.filename).toContain('AAC');
  });

  it('rejects sources whose bitrate exceeds available bandwidth', () => {
    // 50 Mbps caps usable bitrate at 30 Mbps (60% headroom)
    // 50GB / 2h = ~55 Mbps -> reject
    // 4GB / 2h  = ~4.4 Mbps -> ok
    const candidates = [
      cand('Movie.2024.2160p.REMUX.x264.eng.mkv', 50_000_000_000),
      cand('Movie.2024.1080p.WEB-DL.x264.eng.mkv', 4_000_000_000),
    ];
    const r = rankAndPick(candidates, candidates.map((c) => c.hash), baseCaps, baseSettings, ['en'], RUNTIME_HOURS);
    expect(r.kind).toBe('pick');
    if (r.kind === 'pick') expect(r.candidate.bytes).toBe(4_000_000_000);
  });

  it('rejects sources with wrong audio language', () => {
    const candidates = [
      cand('Movie.2024.1080p.x264.HINDI.mkv', 4_000_000_000),  // hi only
      cand('Movie.2024.1080p.x264.eng.mkv', 4_000_000_000),
    ];
    const r = rankAndPick(candidates, candidates.map((c) => c.hash), baseCaps, baseSettings, ['en'], RUNTIME_HOURS);
    expect(r.kind).toBe('pick');
    if (r.kind === 'pick') expect(r.candidate.filename).toContain('eng');
  });

  it('returns a no-streams result when no subtitles available and require_subtitles is on', () => {
    const candidates = [cand('Movie.2024.1080p.WEB-DL.x264.eng.mkv', 4_000_000_000)];
    const r = rankAndPick(candidates, candidates.map((c) => c.hash), baseCaps, baseSettings, ['en'], RUNTIME_HOURS, /*subsAvailable*/ false);
    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected') expect(r.reason).toBe('no_subtitles');
  });

  it('prefers 1080p over 4K by default', () => {
    const candidates = [
      cand('Movie.2024.2160p.WEB-DL.x264.eng.mkv', 12_000_000_000),
      cand('Movie.2024.1080p.WEB-DL.x264.eng.mkv', 4_000_000_000),
    ];
    const r = rankAndPick(candidates, candidates.map((c) => c.hash), baseCaps, baseSettings, ['en'], RUNTIME_HOURS);
    expect(r.kind).toBe('pick');
    if (r.kind === 'pick') expect(r.candidate.parsed.resolution).toBe('1080p');
  });

  it('returns rejected with reason no_cached when none of the candidates are cached', () => {
    const candidates = [cand('Movie.2024.1080p.WEB-DL.x264.eng.mkv', 4_000_000_000)];
    const r = rankAndPick(candidates, [], baseCaps, baseSettings, ['en'], RUNTIME_HOURS);
    expect(r.kind).toBe('rejected');
    if (r.kind === 'rejected') expect(r.reason).toBe('no_cached');
  });
});
```

- [ ] **Step 2: Run tests, expect failure (module missing)**

```bash
npm test
```

- [ ] **Step 3: Commit**

```bash
git add src/sources/picker.test.ts
git commit -m "test: stream picker ranking specification"
```

---

## Task 23: Stream picker — implement

**Files:**
- Create: `src/sources/picker.ts`

- [ ] **Step 1: Create `src/sources/picker.ts`**

```ts
import type { StreamCandidate, Capabilities, Settings } from '../types';

export type PickReason =
  | 'no_cached'
  | 'no_compatible_codec'
  | 'no_compatible_audio'
  | 'no_acceptable_language'
  | 'no_acceptable_bitrate'
  | 'no_subtitles';

export type PickResult =
  | { kind: 'pick'; candidate: StreamCandidate }
  | { kind: 'rejected'; reason: PickReason };

export function rankAndPick(
  candidates: StreamCandidate[],
  cachedHashes: string[],
  caps: Capabilities,
  settings: Settings,
  subtitleLanguagesAvailable: string[] | null,
  runtimeHours: number,
  subsAvailable: boolean = subtitleLanguagesAvailable === null ? true : subtitleLanguagesAvailable.length > 0,
): PickResult {
  const cached = new Set(cachedHashes);
  const maxBitrateMbps = caps.bandwidthMbps * 0.6;

  // Hard filters
  const stage1 = candidates.filter((c) => cached.has(c.hash));
  if (stage1.length === 0) return { kind: 'rejected', reason: 'no_cached' };

  const stage2 = stage1.filter((c) => videoCodecOK(c, caps));
  if (stage2.length === 0) return { kind: 'rejected', reason: 'no_compatible_codec' };

  const stage3 = stage2.filter((c) => audioCodecOK(c, caps));
  if (stage3.length === 0) return { kind: 'rejected', reason: 'no_compatible_audio' };

  const stage4 = stage3.filter((c) => audioLanguageOK(c, settings));
  if (stage4.length === 0) return { kind: 'rejected', reason: 'no_acceptable_language' };

  const stage5 = stage4.filter((c) => bitrateOK(c, runtimeHours, maxBitrateMbps));
  if (stage5.length === 0) return { kind: 'rejected', reason: 'no_acceptable_bitrate' };

  if (settings.require_subtitles && !subsAvailable) {
    return { kind: 'rejected', reason: 'no_subtitles' };
  }

  // Soft sort
  const sorted = [...stage5].sort((a, b) => score(b, settings, caps) - score(a, settings, caps));
  return { kind: 'pick', candidate: sorted[0] };
}

function videoCodecOK(c: StreamCandidate, caps: Capabilities): boolean {
  const v = c.parsed.video_codec;
  if (!v) return true; // unknown — give it a chance
  if (v === 'h264') return caps.codecs.h264;
  if (v === 'h265') return caps.codecs.h265_main || caps.codecs.h265_main10;
  if (v === 'vp9') return caps.codecs.vp9;
  if (v === 'av1') return caps.codecs.av1;
  return true;
}

function audioCodecOK(c: StreamCandidate, caps: Capabilities): boolean {
  const a = c.parsed.audio_codec;
  if (!a) return true; // unknown — assume AAC
  if (a === 'aac') return caps.codecs.aac;
  if (a === 'ac3') return caps.codecs.ac3;
  if (a === 'eac3') return caps.codecs.eac3;
  // dts, truehd, flac, opus all unsupported in <video> on Chromium 79 web context
  return false;
}

function audioLanguageOK(c: StreamCandidate, settings: Settings): boolean {
  if (settings.audio_language === 'any') return true;
  return c.parsed.audio_languages.includes(settings.audio_language);
}

function bitrateOK(c: StreamCandidate, runtimeHours: number, maxMbps: number): boolean {
  if (runtimeHours <= 0) return true;
  const bitrateMbps = (c.bytes * 8) / 1_000_000 / (runtimeHours * 3600);
  return bitrateMbps <= maxMbps;
}

const SOURCE_RANK: Record<string, number> = { remux: 5, bluray: 4, webdl: 3, webrip: 2, hdtv: 1, dvdrip: 0 };

function score(c: StreamCandidate, settings: Settings, _caps: Capabilities): number {
  let s = 0;
  // Resolution preference
  const target: '1080p' | '2160p' = settings.prefer_4k ? '2160p' : '1080p';
  if (c.parsed.resolution === target) s += 100;
  else if (c.parsed.resolution === '1080p') s += 50;
  else if (c.parsed.resolution === '2160p') s += 30;

  // File size sanity for 1080p (sweet spot 2–6 GB)
  if (c.parsed.resolution === '1080p') {
    const gb = c.bytes / 1_000_000_000;
    if (gb >= 2 && gb <= 6) s += 30;
    else if (gb > 12) s -= 30; // 1080p REMUX overkill
  }

  // Source quality
  s += (SOURCE_RANK[c.parsed.source ?? ''] ?? 0) * 5;

  // Tie-breaker: more seeds = more reliably cached
  s += Math.min(c.seeds / 100, 10);

  return s;
}
```

- [ ] **Step 2: Run tests — they should pass**

```bash
npm test
```

- [ ] **Step 3: Commit**

```bash
git add src/sources/picker.ts
git commit -m "feat: stream ranking and picker with hard filters + soft scoring"
```

---

## Task 24: OpenSubtitles addon client + per-movie pre-flight cache

**Files:**
- Create: `src/subtitles/opensubtitles.ts`

- [ ] **Step 1: Create `src/subtitles/opensubtitles.ts`**

```ts
const OS_BASE = 'https://opensubtitles-v3.strem.io';

export interface SubtitleTrack { lang: string; url: string; id: string; }

const cache = new Map<string, SubtitleTrack[]>();

export async function fetchSubtitlesForMovie(imdbId: string): Promise<SubtitleTrack[]> {
  if (cache.has(imdbId)) return cache.get(imdbId)!;
  try {
    const r = await fetch(`${OS_BASE}/subtitles/movie/${imdbId}.json`);
    if (!r.ok) throw new Error(`OS ${r.status}`);
    const data = (await r.json()) as { subtitles?: Array<{ lang: string; url: string; id: string }> };
    const tracks: SubtitleTrack[] = (data.subtitles ?? []).map((s) => ({ lang: s.lang, url: s.url, id: s.id }));
    cache.set(imdbId, tracks);
    return tracks;
  } catch {
    cache.set(imdbId, []);
    return [];
  }
}

/** Returns the set of language codes for which we have subtitles. */
export async function preflightSubtitles(imdbId: string): Promise<string[]> {
  const tracks = await fetchSubtitlesForMovie(imdbId);
  return Array.from(new Set(tracks.map((t) => normalizeLang(t.lang))));
}

function normalizeLang(lang: string): string {
  // OpenSubtitles uses 3-letter codes; normalize to 2-letter where possible.
  const map: Record<string, string> = {
    eng: 'en', spa: 'es', fre: 'fr', ger: 'de', jpn: 'ja',
    hin: 'hi', kor: 'ko', ita: 'it', por: 'pt', rus: 'ru',
  };
  return map[lang.toLowerCase()] ?? lang.toLowerCase();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/subtitles/opensubtitles.ts
git commit -m "feat: opensubtitles addon client with per-movie cache"
```

---

## Task 25: Detail screen

**Files:**
- Create: `src/screens/Detail.tsx`

- [ ] **Step 1: Create `src/screens/Detail.tsx`**

```tsx
import { useFocusable } from '../nav/useFocusable';
import { TopNav } from '../components/TopNav';
import type { Movie } from '../types';
import { toggleWatchlist, watchlist } from '../state/store';

interface Props {
  movie: Movie;
  onPlay: () => void;
  onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void;
}

export function Detail({ movie, onPlay, onNavigate }: Props) {
  const playBtn = useFocusable({ id: 'detail-play', onActivate: onPlay });
  const watchBtn = useFocusable({ id: 'detail-watch', onActivate: () => toggleWatchlist(movie.imdb_id) });
  const inList = watchlist.value.includes(movie.imdb_id);

  return (
    <>
      <TopNav current="home" onNavigate={onNavigate} />
      <div style={{ ...heroStyle, backgroundImage: `url(${movie.backdrop})` }}>
        <div style={overlayStyle} />
      </div>
      <div style={contentStyle}>
        <h1 style={titleStyle}>{movie.title}</h1>
        <div style={metaStyle}>
          <span>{movie.year}</span>
          <span>{Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</span>
          {movie.scores.rt != null && <span style={{ color: 'var(--success)', fontWeight: 700 }}>{movie.scores.rt}% RT</span>}
          {movie.director && <span>Dir. {movie.director}</span>}
        </div>
        <p style={{ fontSize: 18, lineHeight: 1.6, maxWidth: 720, marginBottom: 32 }}>{movie.overview}</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <span ref={playBtn.ref as any} {...playBtn} style={btnPrimary}>▶ Play</span>
          <span ref={watchBtn.ref as any} {...watchBtn} style={btnSecondary}>{inList ? '✓ In Watchlist' : '+ Watchlist'}</span>
        </div>
        {movie.cast.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>Cast</div>
            <div style={{ fontSize: 16 }}>{movie.cast.join(' · ')}</div>
          </div>
        )}
      </div>
    </>
  );
}

const heroStyle: any = { position: 'absolute', top: 0, left: 0, right: 0, height: '50%', backgroundSize: 'cover', backgroundPosition: 'center' };
const overlayStyle: any = { position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, var(--bg) 100%), linear-gradient(90deg, var(--bg) 0%, rgba(10,10,10,0.6) 40%, transparent 70%)' };
const contentStyle: any = { position: 'absolute', top: '40%', left: '5%', right: '5%' };
const titleStyle: any = { fontFamily: 'var(--font-display)', fontSize: 72, fontWeight: 400, letterSpacing: '-2px', lineHeight: 1, margin: '0 0 16px' };
const metaStyle: any = { display: 'flex', gap: 20, fontSize: 14, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 20, color: 'rgba(240,236,228,0.85)' };
const btnBase: any = { padding: '14px 28px', borderRadius: 4, fontSize: 14, fontWeight: 700, cursor: 'pointer' };
const btnPrimary: any = { ...btnBase, background: 'var(--text)', color: 'var(--bg)' };
const btnSecondary: any = { ...btnBase, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' };
```

- [ ] **Step 2: Wire detail into router by replacing the placeholder in `src/App.tsx`**

Replace the `case 'detail':` line with:

```tsx
case 'detail':
  return <Detail
    movie={r.movie}
    onPlay={() => push({ name: 'player', movie: r.movie })}
    onNavigate={(to) => push({ name: to } as Route)}
  />;
```

And add the import at the top:

```tsx
import { Detail } from './screens/Detail';
```

(Remove the `DetailPlaceholder` function — no longer used.)

- [ ] **Step 3: Smoke test in dev**

```bash
npm run dev
```

Expected: clicking a poster from Home shows the Detail screen with backdrop, title, metadata, Play and Watchlist buttons. Watchlist toggles persist across reload.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Detail.tsx src/App.tsx
git commit -m "feat: detail screen with watchlist toggle"
```

---

## Task 26: Player screen

**Files:**
- Create: `src/screens/Player.tsx`

- [ ] **Step 1: Create `src/screens/Player.tsx`**

```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Movie, RDStream } from '../types';
import { settings, recordResume, resumePositions } from '../state/store';
import { ensureCapabilities } from '../sources/capabilities';
import { fetchTorrentioCandidates } from '../sources/torrentio';
import { RDClient } from '../sources/realdebrid';
import { rankAndPick, type PickReason } from '../sources/picker';
import { preflightSubtitles, fetchSubtitlesForMovie } from '../subtitles/opensubtitles';

type State =
  | { kind: 'preparing'; step: string }
  | { kind: 'playing'; stream: RDStream }
  | { kind: 'error'; reason: PickReason | 'rd_error' | 'no_streams' | 'unknown'; detail?: string };

const REASON_TEXT: Record<PickReason | 'rd_error' | 'no_streams' | 'unknown', string> = {
  no_cached: 'No cached versions on Real-Debrid right now. Try again later.',
  no_compatible_codec: 'All cached versions use a video codec your TV can\'t play in the browser (likely H.265).',
  no_compatible_audio: 'All cached versions use an audio codec your TV can\'t play (e.g. DTS or TrueHD).',
  no_acceptable_language: 'No cached version with the right audio language. Try changing Audio Language in Settings.',
  no_acceptable_bitrate: 'All cached versions are too high-bitrate for your network right now.',
  no_subtitles: 'No subtitles available for this title in your preferred language.',
  rd_error: 'Real-Debrid request failed. Check your API key in Settings.',
  no_streams: 'No sources found for this title.',
  unknown: 'Something went wrong starting playback.',
};

export function Player({ movie, onClose }: { movie: Movie; onClose: () => void }) {
  const [state, setState] = useState<State>({ kind: 'preparing', step: 'starting' });
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = settings.value;
        if (!s.rd_api_key) {
          setState({ kind: 'error', reason: 'rd_error', detail: 'Set your Real-Debrid API key in Settings first.' });
          return;
        }

        setState({ kind: 'preparing', step: 'probing' });
        const caps = await ensureCapabilities();
        if (cancelled) return;

        setState({ kind: 'preparing', step: 'fetching sources' });
        const [candidates, subLangs] = await Promise.all([
          fetchTorrentioCandidates(movie.imdb_id),
          preflightSubtitles(movie.imdb_id),
        ]);
        if (cancelled) return;
        if (candidates.length === 0) { setState({ kind: 'error', reason: 'no_streams' }); return; }

        setState({ kind: 'preparing', step: 'checking real-debrid' });
        const rd = new RDClient(s.rd_api_key);
        const cached = await rd.checkCache(candidates.map((c) => c.hash));
        if (cancelled) return;

        const subsAvailable = subLangs.includes(s.audio_language) || subLangs.includes('en');
        const result = rankAndPick(candidates, cached, caps, s, subLangs, movie.runtime / 60, subsAvailable);
        if (result.kind === 'rejected') { setState({ kind: 'error', reason: result.reason }); return; }

        setState({ kind: 'preparing', step: 'unrestricting' });
        const url = await rd.unrestrict(result.candidate.hash);
        if (cancelled) return;

        setState({ kind: 'playing', stream: { url, filename: result.candidate.filename, bytes: result.candidate.bytes } });
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', reason: 'rd_error', detail: String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, [movie.imdb_id]);

  // Resume tracking
  useEffect(() => {
    if (state.kind !== 'playing') return;
    const v = videoRef.current;
    if (!v) return;
    const id = setInterval(() => {
      if (!v.paused && v.currentTime > 0) {
        recordResume(movie.imdb_id, v.currentTime, v.duration || movie.runtime * 60);
      }
    }, 10_000);
    return () => clearInterval(id);
  }, [state.kind, movie.imdb_id, movie.runtime]);

  // Apply resume position when video metadata loads
  useEffect(() => {
    const v = videoRef.current;
    if (!v || state.kind !== 'playing') return;
    const onLoaded = () => {
      const r = resumePositions.value[movie.imdb_id];
      if (r && r.position_seconds < r.duration_seconds * 0.95) {
        v.currentTime = r.position_seconds;
      }
      v.play().catch(() => {/* user gesture not present in dev sometimes */});
    };
    v.addEventListener('loadedmetadata', onLoaded);
    return () => v.removeEventListener('loadedmetadata', onLoaded);
  }, [state.kind, movie.imdb_id]);

  // Subtitle track
  useEffect(() => {
    if (state.kind !== 'playing') return;
    const v = videoRef.current;
    if (!v) return;
    (async () => {
      const tracks = await fetchSubtitlesForMovie(movie.imdb_id);
      const en = tracks.find((t) => t.lang === 'eng' || t.lang === 'en');
      if (!en) return;
      const trackEl = document.createElement('track');
      trackEl.kind = 'subtitles';
      trackEl.label = 'English';
      trackEl.srclang = 'en';
      trackEl.src = en.url;
      trackEl.default = true;
      v.appendChild(trackEl);
    })();
  }, [state.kind, movie.imdb_id]);

  // Esc/back closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.keyCode === 461 || e.keyCode === 27) { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (state.kind === 'preparing') {
    return <div style={overlayStyle}><div style={spinnerTextStyle}>{state.step}…</div></div>;
  }
  if (state.kind === 'error') {
    return (
      <div style={overlayStyle}>
        <h2 style={{ fontSize: 28, marginBottom: 12 }}>Can't play right now</h2>
        <p style={{ maxWidth: 600, opacity: 0.85 }}>{REASON_TEXT[state.reason]}{state.detail && ` — ${state.detail}`}</p>
        <button onClick={onClose} style={errorBtnStyle}>Back</button>
      </div>
    );
  }
  return (
    <video
      ref={videoRef}
      src={state.stream.url}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', background: '#000' }}
      controls
      autoPlay
      crossOrigin="anonymous"
    />
  );
}

const overlayStyle: any = { position: 'fixed', inset: 0, background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 64, color: 'var(--text)' };
const spinnerTextStyle: any = { fontSize: 16, opacity: 0.6, letterSpacing: '1.5px', textTransform: 'uppercase' };
const errorBtnStyle: any = { marginTop: 24, padding: '12px 24px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' };
```

- [ ] **Step 2: Wire Player into the router** in `src/App.tsx`

Replace the `case 'player':` line with:

```tsx
case 'player':
  return <Player movie={r.movie} onClose={pop} />;
```

Add the import:

```tsx
import { Player } from './screens/Player';
```

(Remove the `PlayerPlaceholder` function.)

- [ ] **Step 3: Verify in dev with a real RD key**

```bash
npm run dev
```

Expected flow: Settings → enter RD key → back to Home → click a movie → Detail → Play → "probing" → "fetching sources" → "checking real-debrid" → "unrestricting" → video starts. Esc/Back returns to Detail.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Player.tsx src/App.tsx
git commit -m "feat: player screen with adaptive picker, RD playback, resume, subs"
```

---

## Task 27: README with setup instructions

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# duane — Custom Stremio for WebOS

A from-scratch Stremio replacement for the LG 86NANO75UPA. Sideloads via WebOS Developer Mode.

## Quick start

```bash
npm install
npm run dev          # browser dev at http://localhost:5173
npm run test         # vitest unit tests
npm run deploy       # build IPK + ares-install to TV
```

## TV setup (one-time)

```bash
npm install -g @webos-tools/cli
ares-setup-device --add tv \
  --info "host=10.0.0.238,port=9922,username=prisoner,privatekey=/path/to/webos_rsa_dec,passphrase=,description=Living room LG"
```

The TV must have Developer Mode enabled and the dev mode app started (it expires every ~50 hours).

## First-run on the TV

1. Launch "duane" from the WebOS app menu
2. Go to Settings → enter your Real-Debrid API key (https://real-debrid.com/apitoken)
3. Adjust audio language and subtitle settings if needed
4. Back to Home — pick something and press Play

## Tech stack

- Preact 10 + TypeScript + Vite (target: chrome79)
- @preact/signals for state
- Vitest + happy-dom for unit tests
- Real-Debrid REST API + Torrentio addon + OpenSubtitles addon (all baked in, no user config)
- Custom spatial focus engine (`src/nav/spatial.ts`)
- Adaptive stream picker (`src/sources/picker.ts`) — codec probe + bandwidth probe + audio-language + subtitle pre-flight

## Project layout

See `docs/superpowers/specs/2026-05-09-stremio-webos-redesign-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions"
```

---

## Task 28: Manual TV verification checklist

**Files:**
- Create: `docs/manual-test-plan.md`

This task produces a checklist the engineer (or you) walks through after each release. Manual testing is the only honest answer for TV apps.

- [ ] **Step 1: Create `docs/manual-test-plan.md`**

```markdown
# Manual Test Plan — WebOS

Walk this list after each `npm run deploy`.

## Cold start
- [ ] App launches in under 2 seconds from app menu
- [ ] Home screen renders within 1 second of launch
- [ ] No flash of unstyled content; no console errors

## Spatial nav
- [ ] D-pad arrows move focus to a sensible nearest neighbor
- [ ] Focus glow is clearly visible (red outline + slight scale)
- [ ] OK/Enter activates the focused element
- [ ] Back button returns to the previous screen
- [ ] Holding D-pad in one direction keeps moving (not just one step)

## Home screen
- [ ] Hero auto-loads with a backdrop and title
- [ ] Brand shelf renders correctly
- [ ] Two rows are visible
- [ ] Posters lazy-load images smoothly

## Detail screen
- [ ] Backdrop, title, metadata, cast, overview render
- [ ] Watchlist toggle persists across cold restart
- [ ] Play button is initially focused

## Settings
- [ ] RD API key prompt accepts text via remote keyboard
- [ ] Toggles flip on activate
- [ ] Language cycles through options
- [ ] Settings persist across cold restart

## Playback (with valid RD key)
- [ ] "probing → fetching → checking RD → unrestricting" status updates flow
- [ ] Video starts within 10 seconds for a popular cached title
- [ ] English subtitles appear (small text, white)
- [ ] Resume: close mid-movie, relaunch → resumes within 5s of where you left
- [ ] Back during playback returns to Detail; resume saved

## Error paths
- [ ] No RD key → clear error: "Set your Real-Debrid API key in Settings"
- [ ] Invalid RD key → clear error: "Real-Debrid request failed"
- [ ] Obscure movie with no streams → "No sources found"
- [ ] H.265-only movie on H.265-unsupported TV → "All cached versions use a video codec your TV can't play"
```

- [ ] **Step 2: Commit**

```bash
git add docs/manual-test-plan.md
git commit -m "docs: manual TV verification checklist"
```

---

## Task 29: Self-test of the whole MVP path on the TV

This is a verification task, not a coding task. After every previous task is complete, walk through the Manual Test Plan on the TV.

- [ ] Walk every item in `docs/manual-test-plan.md` on the actual TV
- [ ] File any failures as follow-up tasks (do not "fix and ship" silently)
- [ ] Once all items pass, tag the commit:

```bash
git tag v0.1.0
```

---

## Plan complete

This plan covers everything from `npm install` to a working v0.1 MVP that plays movies on the TV. Subsequent plans will cover:

- **Plan 2:** `rows.json` GitHub Action backend (replaces `public/sample-rows.json` with daily-refreshed real data)
- **Plan 3:** Search screen (TMDb metadata client + autocomplete + IndexedDB cache layer)
- **Plan 4:** Library / Continue Watching / stream-picker UI
- **Plan 5+:** v0.3 power-user features one at a time

Files deferred to later plans: `src/data/tmdb.ts`, `src/data/cache.ts` (Plan 3, when search needs them).
