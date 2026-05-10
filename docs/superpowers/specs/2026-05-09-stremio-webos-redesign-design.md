# Custom Stremio for WebOS — Design Spec

**Date:** 2026-05-09
**Author:** Duane (with Claude)
**Status:** Draft, awaiting review
**Target hardware:** LG 86NANO75UPA, WebOS 6.0, firmware 03.53.45

---

## Overview

A from-scratch Stremio client for one specific LG TV. Replaces the official Stremio app with a custom UI that fixes its two biggest weaknesses: a generic, dated frontend, and bad content discovery. Talks to the existing Stremio addon ecosystem (Torrentio, Real-Debrid, OpenSubtitles) for content delivery, but everything the user sees and touches is ours.

Built for personal use only — sideloaded via WebOS Developer Mode, no LG Content Store submission, no multi-account support, no Stremio account sync.

## Goals

- Open the app, see rows of *actually good* movies — primarily films that recently moved from theatrical to home viewing, plus other curated rails
- Disney+/HBO Max-style layout (hero + brand shelf + poster rows), but with a more cinematic, exclusive feel inspired by Netflix
- Snappy on a 6-year-old chip — sub-500ms cold start, no jank
- Fully hackable: every layer (suggestion logic, subtitle sources, stream sources, player overlays, themes) is owned and modifiable
- Pleasant remote-driven navigation — focus changes feel responsive, predictable, and visually clear

## Non-Goals

- Multi-user or profile support
- Stremio account login or cross-device sync
- LG Content Store submission
- Backwards compatibility with older WebOS versions (3.x, 4.x, 5.x)
- Live TV / IPTV addons
- TV series / episode tracking (movies-first; series can come later if wanted)

## Constraints

| Constraint | Implication |
|---|---|
| **Chromium 79** (WebOS 6 WAM engine) | ES2019 OK; flexbox `gap` does NOT work (added Chromium 84) — use grid `gap` or margins |
| **ARMv7 hardware** | Avoid heavy JS (no large WASM blobs); test on real device often |
| **Sideload only** | No LG-store branding/IP concerns; can use Stremio brand visuals freely |
| **Single user** | No auth, profiles, multi-device sync — simplifies state to localStorage |
| **No backend services** | Daily compute runs as GitHub Action (free tier); TV pulls a static JSON |

---

## Approach

**Build a brand-new Preact + Vite client that talks to the Stremio addon protocol directly.**

Considered and rejected:

- **Fork stremio-web and replace UI** — drags in 5MB WASM core for features (account sync, library sharing) we explicitly don't need. Slow on Chromium 79.
- **Use `stremio-core-web` as a library** — same WASM cost, plus its Redux-flavored API fights modern reactive frameworks.

Going greenfield is cheaper because Stremio's addon protocol is small (manifest + a handful of GET endpoints returning JSON) and we don't need anything else from Stremio's stack.

---

## Architecture

Three independent pieces, clear boundaries:

### 1. The WebOS app (TV)
Sideloaded IPK. Preact + Vite, ~200KB gzipped. Shell loads from local install. Dynamic data fetched on launch. Persistent state in `localStorage`. The only piece running on the TV.

### 2. The suggestion backend (GitHub Action)
A scheduled workflow runs daily, ~60 seconds. Pulls TMDb + OMDb, builds a `rows.json`, commits to repo. Served via `raw.githubusercontent.com`. No server to own.

### 3. The Stremio addon ecosystem (existing internet services)
Torrentio + Real-Debrid for streams, an OpenSubtitles-style addon for subtitles. Speaks Stremio's addon protocol over HTTPS. Unchanged, untouched. We hit it only when the user presses Play.

### Data flow

| Moment | What happens |
|---|---|
| **Cold start** | Shell from local IPK (~50ms) → parallel fetch `rows.json` (~100ms with 304s) → render home. localStorage gives us "Continue Watching" + watchlist |
| **Click into a movie** | Metadata already in `rows.json`. For full cast/similar/etc, fetch from TMDb (cached in IndexedDB, 1-day TTL). No addon traffic yet |
| **Click Play** | Hit configured stream addons in parallel → URLs (Real-Debrid pre-resolves to direct CDN) → pick best (or show picker) → HTML5 `<video>`. Subtitle addons fetched in parallel. Resume position to localStorage every 10s |

### Cache layers

- IPK = local shell (no fetch needed)
- `localStorage` = user state (~1MB plenty)
- `IndexedDB` = TMDb metadata cache
- HTTP cache = poster images

---

## App module breakdown

| Module | Job | Talks to |
|---|---|---|
| **Spatial nav** | Owns focus. D-pad in → focus change. Pure logic, no DOM dep | Nothing |
| **Addon client** | Stremio protocol over HTTP. `fetchStreams()`, `fetchSubtitles()`, `fetchMeta()`. Stateless | Network |
| **Suggestion layer** | Fetches `rows.json` from GitHub, parses, exposes typed rows | Network |
| **Metadata layer** | TMDb client + IndexedDB cache + dedup | Network + cache |
| **State store** | Signals-based reactive store. Watchlist, resume positions, settings | localStorage |
| **Player** | HTML5 `<video>` wrapper, controls overlay, subtitle renderer, resume tracker | Addon client, State |
| **Theme** | CSS variables, fonts, spacing/motion tokens. One file | Nothing |
| **Screens** | Home / Detail / Library / Search / Player / Settings. Thin composition | Everything |

### File structure

```
app/src/
  screens/        Home.tsx, Detail.tsx, Library.tsx, Search.tsx, Player.tsx, Settings.tsx
  nav/            spatial.ts, useFocusable.ts
  addon/          protocol.ts, client.ts, registry.ts
  data/           rows.ts, tmdb.ts, cache.ts
  state/          store.ts, persistence.ts
  player/         Player.tsx, controls.tsx, subtitles.ts
  theme/          tokens.css, animations.css
  components/     PosterCard.tsx, Row.tsx, Hero.tsx, BrandShelf.tsx, FocusGlow.tsx
backend/
  build-rows.ts
  sources/        tmdb.ts, quality.ts
  .github/workflows/refresh.yml
```

### Critical design decision: spatial nav as its own module

Most TV apps die on D-pad navigation. We will write a small (~200-line) spatial nav engine as **pure logic**: it tracks a registry of focusable rectangles and, given a direction, picks the next one by geometry. Components register via `useFocusable({ ref, onActivate })`. Focus state lives outside the component tree. Visuals are CSS-only (`[data-focused]` selector). Testable without a DOM.

---

## Suggestion backend

### What the GitHub Action does

1. Hits **TMDb** for: titles, posters, backdrops, cast, runtime, digital release date, watch providers, genres, popularity
2. Hits **OMDb** (free 1000/day tier) for: Rotten Tomatoes, Metacritic, IMDb scores
3. Builds rows by querying TMDb's discover API + filtering against quality thresholds
4. Writes one `rows.json`, commits to the repo

### Default rows

| Row | Logic |
|---|---|
| **Just Hit Streaming** | Digital release in last 60 days. Filter: RT ≥ 75% OR IMDb ≥ 7.0. Sort by digital release date desc |
| **Best of [year] So Far** | Released in current year. Top 30 by composite score (RT × 0.5 + Metacritic × 0.3 + IMDb × 20 × 0.2) |
| **You Probably Missed** | Released previous year, domestic box office < $50M, RT ≥ 80% |
| **Coming Soon to Streaming** | Upcoming digital releases in next 30 days |
| **[Brand shelves]** | A24, NEON, Studio Ghibli, Pixar, Marvel, Searchlight, Focus Features. Pre-filtered TMDb queries by production company |
| **Continue Watching / Watchlist** | TV-side only, from localStorage |

### `rows.json` schema (denormalized)

```json
{
  "generated_at": "2026-05-09T09:00:00Z",
  "shelves": [
    {
      "id": "just-hit-streaming",
      "display": "row",
      "title": "Just Hit Streaming",
      "subtitle": "Theatrical → home, last 60 days",
      "items": [{
        "imdb_id": "tt0xxxxxxx",
        "tmdb_id": 12345,
        "title": "Anora",
        "year": 2024,
        "runtime": 139,
        "genres": ["Drama", "Comedy"],
        "poster": "https://image.tmdb.org/t/p/w500/...",
        "backdrop": "https://image.tmdb.org/t/p/original/...",
        "logo": "https://image.tmdb.org/t/p/w500/...",
        "overview": "A young sex worker...",
        "scores": { "rt": 92, "metacritic": 88, "imdb": 7.6 },
        "digital_release_date": "2026-03-15",
        "director": "Sean Baker",
        "cast": ["Mikey Madison", "Mark Eydelshteyn"]
      }]
    },
    {
      "id": "a24",
      "display": "collection",
      "title": "A24",
      "logo_url": "...",
      "background_color": "#000000",
      "items": []
    }
  ]
}
```

Estimated size: ~150KB gzipped (10 rows × 30 items + 10 brand shelves × 30 items). Loads in under 250ms. TV does no joining or filtering — render directly. Refreshes daily at 09:00 UTC.

---

## Visual design language

**Locked design tokens.** A "cinematic Netflix" feel — same DNA as Netflix's app (bold, exclusive, content-forward) but with elevated execution.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0a0a0a` | Page background. Cinematic black |
| `--text` | `#f0ece4` | Primary text. Warm cream off-white |
| `--accent` | `#E50914` | Netflix red. Focus rings, brand mark, primary highlights, "Just Hit Streaming" labels |
| `--muted` | `rgba(240,236,228,0.55)` | Secondary text |
| `--surface` | `rgba(60,60,60,0.55)` | Translucent secondary buttons |
| `--success` | `#46d369` | Score indicators, positive accents |
| Title type | Times New Roman / Tiempos / Source Serif | Hero titles, poster titles. Light-to-regular weight, tight tracking |
| UI type | Inter (Helvetica fallback) | Body, buttons, meta. 400/700 weights |
| Meta tracking | +1.2–1.5px on uppercase | Pill labels, metadata rows |

### Hero treatment
Three-layer gradient over backdrop image: (1) bottom fade to bg, (2) left fade for text legibility, (3) red ambient glow at hero subject. Plus a soft radial vignette wrapping the edges.

### Focus state
- 3px solid `var(--accent)` outline, 3px offset
- `transform: scale(1.07) translateY(-4px)`
- Drop shadow: `0 18px 44px rgba(229, 9, 20, 0.45)`
- Transition: 180ms cubic-bezier ease

### Layout
- Disney+/HBO Max structure: top nav → hero (~58% height) → brand shelf → poster rows
- 7 items per row at 1920×1080 *and* at 4K (item size grows; row count stays the same — readability over density on an 86" screen)
- Brand shelf items use 16:9 aspect, poster row items use 16:9 (TV-style landscape art, not portrait)

Reference mockup: `docs/superpowers/specs/mockups/2026-05-09-home-hifi.html`.

---

## Phasing

### v0.1 — MVP
The smallest thing worth installing.

- Build pipeline: Vite + Preact + IPK packaging via `ares-cli`
- GitHub Action producing `rows.json` daily (one row to start: "Just Hit Streaming")
- Spatial nav engine + `useFocusable` hook
- Home screen: hero + one row + brand shelf (brand shelf list hardcoded initially)
- Detail screen: hero, metadata, "Play" button
- Player: HTML5 `<video>`, basic remote controls (play/pause, seek), resume to localStorage
- Stream fetching: hit one configured Torrentio + Real-Debrid addon, take first stream, play
- Design tokens applied
- Settings screen for addon URLs

### v0.2 — feels like a real app
- All home rows from `rows.json` rendering correctly
- Search screen (TMDb autocomplete + addon results)
- Library / Watchlist screen, Continue Watching row populated from localStorage
- Stream picker UI with quality/size
- Subtitle support: fetch from configured subtitle addon, render with WebVTT
- Loading skeletons, empty states, error toasts
- Multiple addon support
- Brand shelf items become real curated lists (not just static logos)

### v0.3+ — power-user features
- Custom subtitle source plugins (e.g., a SubDL scraper)
- Skip-intro markers (SponsorBlock-style)
- Discord rich presence
- Phone-as-remote (PWA paired via SSH)
- Home Assistant integration ("lights off when Play")
- LLM-suggested rows
- Custom user-defined collections
- Auto-update via GitHub releases

---

## Dev loop

1. **Local dev:** Vite dev server + Chrome at `--user-data-dir=/tmp/x --window-size=1920,1080`. 95% of dev happens here. Spatial nav works with arrow keys; no TV needed
2. **TV verification:** `npm run deploy` builds IPK and runs `ares-install -d $TV_IP package.ipk` over SSH (~10 second push)
3. **Live debug on TV:** `chrome://inspect` connected to WebOS DevTools (port 9999, already exposed via dev mode)

## Testing

| Layer | Approach |
|---|---|
| Spatial nav engine | Vitest unit tests — pure logic, no DOM |
| Addon protocol client | Vitest with mocked `fetch` |
| `rows.json` builder | Run GitHub Action script locally, JSON Schema assertion |
| Components | Skip — visual review in Chrome catches regressions |
| Remote / focus feel | Manual on real TV, walk a small test plan after each release |
| Player behavior | Manual on TV — keep a list of test files (mp4 H264, mkv H265, weird audio). Note: MKV container support in Chromium 79 `<video>` is patchy; for unsupported streams, MVP shows an error and we revisit (transcode-on-debrid, native WebOS media pipeline shim, or MSE) in v0.2 |

## Error handling principles

- **Addon down:** toast + fall back to next configured addon
- **`rows.json` fetch fails:** use last cached version from localStorage
- **TMDb fetch fails:** items show with what's in `rows.json`; optional details just don't appear
- **No streams found:** detail page says "No streams available — check your addons in Settings"
- **Video playback error:** show stream picker with failing source dimmed
- **localStorage quota:** prune oldest resume entries, retry

Principle: never break the app because something on the internet broke.

---

## Open questions / followups

- **Specific addon URLs** for Torrentio + Real-Debrid + OpenSubtitles — to be configured in Settings during MVP setup; not fixed in code
- **OMDb API key** — free tier needs registration; user to provision
- **TMDb API key** — free, user to provision
- **GitHub repo name + visibility** — public or private; affects raw.githubusercontent.com URL
- **Quality source if OMDb proves limiting** — could add Letterboxd scraping as v0.3 enhancement
- **Brand shelf items** — final list of 10 production companies to feature; A24, NEON, Studio Ghibli, Pixar, Marvel, Searchlight, Focus Features identified so far; need 3 more
- **Custom font choice** — Times New Roman is the spec fallback; if licensing permits we may switch to Tiempos or Source Serif Pro for better cinema feel
- **Container support** — Chromium 79 HTML5 video plays MP4/H264 reliably but is patchy on MKV/H265. Decide in v0.2: transcode-on-debrid, MSE polyfill, or expose WebOS native media pipeline via Luna bus
- **Embedded subtitles in MKV** — addon-fetched subtitles handle most cases; mux'd subtitles in container files are a v0.3 concern
