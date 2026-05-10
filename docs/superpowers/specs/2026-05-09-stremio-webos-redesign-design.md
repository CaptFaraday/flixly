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
- **Press Play, it plays.** When Real-Debrid has a good cached stream, the app just picks it and starts playing — no stream picker by default. The Stremio "pick from 50 sources across 5 addons" experience is what we're explicitly fixing
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

### 3. Stream + subtitle sources (baked-in, not user-configurable in MVP)
**Real-Debrid is the debrid backend.** First-class, hardcoded into the app. User provides only an API key in Settings — no addon URLs, no "which RD addon do I install."

**Torrentio is the source scraper.** Hardcoded URL, not exposed as a user-facing addon — its job is finding torrent info-hashes for a given IMDb ID. The app pipes those hashes into Real-Debrid's `instantAvailability` endpoint, takes the cached ones, and unrestricts the best match.

**OpenSubtitles** (or equivalent) is the subtitle source. Also baked in.

Power users can add additional addons (Comet, MediaFusion, custom) in v0.3+ via an advanced setting — but that path is hidden behind "Advanced" and not part of the default experience.

### Data flow

| Moment | What happens |
|---|---|
| **Cold start** | Shell from local IPK (~50ms) → parallel fetch `rows.json` (~100ms with 304s) → render home. localStorage gives us "Continue Watching" + watchlist |
| **Click into a movie** | Metadata already in `rows.json`. For full cast/similar/etc, fetch from TMDb (cached in IndexedDB, 1-day TTL). No addon traffic yet |
| **Click Play** | Torrentio → list of info-hashes → RD `instantAvailability` → cached set → ranking heuristic picks one → RD `unrestrict/link` → HTML5 `<video>`. Subtitles fetched in parallel. Resume position to localStorage every 10s. **No picker shown unless user holds the OK button on the Play button to "Show all sources"** |

### Cache layers

- IPK = local shell (no fetch needed)
- `localStorage` = user state (~1MB plenty)
- `IndexedDB` = TMDb metadata cache
- HTTP cache = poster images

---

## Stream selection philosophy

The single biggest UX failure of vanilla Stremio is the stream picker. We replace it with an opinionated **adaptive** auto-pick — opinionated about quality preferences, adaptive to your network and what your TV can actually play.

### How it adapts

A `Capabilities` module probes the environment on first launch (and re-probes periodically) and caches the results in localStorage:

**Codec probe.** `<video>.canPlayType()` for the codec/container combinations that matter — H264 (baseline/main/high), H265 (main, main10), VP9, AV1, audio codecs (AAC, AC3/E-AC3, Opus), containers (MP4, MKV, WebM). Result: a static map of "what this TV's Chromium can actually play in `<video>`." Stored as `caps.codecs` with `caps.probedAt` timestamp.

**Bandwidth probe.** On launch, fetch a known ~5MB file from Cloudflare/CDN, time it, compute sustained Mbps. Repeat on a 30-min cooldown. Stored as `caps.bandwidthMbps` with `caps.probedAt`. Falls back to `navigator.connection.downlink` if the API exists, but the file probe is more accurate.

**Hardware caps.** TV-specific facts (4K display, no Dolby Vision on this model, HDR10 support) — known at build time, baked into a constants file. We won't trust the browser to tell us; we know the TV.

The picker derives `pickConstraints` from these:

```ts
{
  maxBitrateMbps: caps.bandwidthMbps * 0.6,   // 40% headroom for buffering
  allowedCodecs: filterByProbe(caps.codecs),  // only what canPlayType said yes to
  allowedContainers: ['mp4', 'mkv-if-h264'],  // tightened by probe
  preferResolution: setting.prefer_4k && caps.bandwidthMbps > 25 ? '4k' : '1080p',
  rejectOversize: true                        // skip remuxes if bandwidth can't sustain
}
```

### Ranking heuristic (in order)

1. **Must be cached on Real-Debrid** (no waiting for torrent downloads, ever)
2. **Codec must pass the probe** — if the TV can't play H265 in `<video>`, H265 sources are rejected, period. No "let's try and see" — silent failure is the worst UX
3. **Bitrate must fit network** — estimated bitrate (`file_size_bytes * 8 / runtime_seconds`) must be ≤ `maxBitrateMbps`. A 50GB 4K REMUX needs ~30 Mbps sustained; we don't pick it on a 10 Mbps line
4. **Resolution preference** — 1080p by default. If `prefer_4k` is on AND bandwidth ≥ 25 Mbps AND the codec probe says we can play 4K H265, prefer 4K
5. **File size sanity** — for 1080p, prefer 2–6 GB (well-encoded); reject 12 GB+ 1080p (REMUX overkill)
6. **Audio language** — prefer English if multiple tracks
7. **Source quality tag** — REMUX > BluRay > WEB-DL > WEBRip > HDTV (parsed from torrent name)
8. **Tie-breaker** — higher seed count (more reliable RD cache hit)

### Probe persistence and re-probe rules

| Probe | Initial | Re-probe trigger |
|---|---|---|
| Codec capability | First launch | On app version change (new Chromium build) |
| Bandwidth | First launch | Every 30 min while app is open; immediately on `navigator.online` flip; immediately on a buffering event during playback |
| Hardware caps | Constant | Never (fixed at build time per TV model) |

### What the user sees
- **Default:** press Play → 1–2 second spinner → playback starts. Done.
- **No streams cached on RD:** show "No cached streams available — try again later" rather than queue an uncached download (would block playback). v0.2 may add an "Add to RD queue and notify when ready" action.
- **Want to override:** long-press OK on Play button → opens stream picker showing all RD-cached candidates with quality/size/source. For when the auto-pick is wrong (rare).

### What we DON'T do
- Don't show 50 streams by default
- Don't ask the user to choose between addons
- Don't expose torrent provider names ("[YTS] Movie 2024") in the default UI — they're an implementation detail
- Don't make the user understand "Comet vs Torrentio vs MediaFusion" — they shouldn't have to

## App module breakdown

| Module | Job | Talks to |
|---|---|---|
| **Spatial nav** | Owns focus. D-pad in → focus change. Pure logic, no DOM dep | Nothing |
| **Real-Debrid client** | Talks to RD REST API. `checkCache(hashes)`, `unrestrict(magnet)`. Holds API key | Network |
| **Source scraper** | Calls Torrentio (and v0.3+ optional addons) to get candidate info-hashes for an IMDb ID | Network |
| **Capabilities** | Probes codec support (`canPlayType`) + bandwidth (timed CDN fetch). Caches in localStorage. Exposes `pickConstraints()` | Network, localStorage |
| **Stream picker** | Pure function: takes candidates + capabilities → ranks/filters → returns best stream URL | RD client, scraper, Capabilities |
| **Name parser** | Parses torrent filenames into structured (resolution, codec, source, audio, group). Pure logic | Nothing |
| **Subtitle client** | Fetches subtitles from OpenSubtitles addon (and v0.3+ custom sources) | Network |
| **Suggestion layer** | Fetches `rows.json` from GitHub, parses, exposes typed rows | Network |
| **Metadata layer** | TMDb client + IndexedDB cache + dedup | Network + cache |
| **State store** | Signals-based reactive store. Watchlist, resume positions, RD API key, settings | localStorage |
| **Player** | HTML5 `<video>` wrapper, controls overlay, subtitle renderer, resume tracker | Stream picker, Subtitle client, State |
| **Theme** | CSS variables, fonts, spacing/motion tokens. One file | Nothing |
| **Screens** | Home / Detail / Library / Search / Player / Settings. Thin composition | Everything |

### File structure

```
app/src/
  screens/        Home.tsx, Detail.tsx, Library.tsx, Search.tsx, Player.tsx, Settings.tsx
  nav/            spatial.ts, useFocusable.ts
  sources/        realdebrid.ts, torrentio.ts, picker.ts, parse-name.ts, capabilities.ts
  subtitles/      opensubtitles.ts, render.ts
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
- **Stream selection: Torrentio → RD cache check → adaptive auto-pick (codec probe + bandwidth probe) → play. No picker shown.**
- Capabilities module: codec probe at startup, bandwidth probe at startup + every 30 min
- Design tokens applied
- Settings screen: just a Real-Debrid API key field + a "prefer 4K" toggle

### v0.2 — feels like a real app
- All home rows from `rows.json` rendering correctly
- Search screen (TMDb autocomplete)
- Library / Watchlist screen, Continue Watching row populated from localStorage
- **Long-press Play to open stream picker** (the escape hatch when auto-pick is wrong)
- Subtitle support: fetch from OpenSubtitles, render with WebVTT
- "Add to RD queue" action when no cached streams found, with notification on ready
- Loading skeletons, empty states, error toasts
- Brand shelf items become real curated lists (not just static logos)
- Container/codec strategy decision (MKV/H265 path)

### v0.3+ — power-user features
- **Advanced source addons** (Comet, MediaFusion, custom) for users who want more sources
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

- **Torrentio down:** toast "Couldn't find sources — try again later." Don't pretend
- **Real-Debrid down or API key invalid:** toast pointing to Settings to re-enter key
- **`rows.json` fetch fails:** use last cached version from localStorage
- **TMDb fetch fails:** items show with what's in `rows.json`; optional details just don't appear
- **No cached streams on RD:** "No cached streams available right now — try again later." Don't queue an uncached torrent (blocks playback). v0.2 adds an opt-in "queue it" action
- **Video playback error (codec issue):** treat as a probe miss — mark that codec as unsupported in localStorage, refilter candidates, try next match. Only show picker if all candidates fail
- **Buffering during playback:** trigger an immediate bandwidth re-probe; if the new estimate is < current stream's bitrate, offer "switch to a lower-bitrate version" toast that picks again with tighter constraints
- **localStorage quota:** prune oldest resume entries, retry

Principle: never break the app because something on the internet broke.

---

## Open questions / followups

- **Real-Debrid API key** — user provides in Settings on first run; nothing else to configure for source/debrid in MVP
- **Torrentio addon URL** — hardcoded in app (their public manifest URL); user-invisible
- **OpenSubtitles addon URL** — hardcoded in app; user-invisible
- **OMDb API key** — free tier needs registration; lives in the GitHub Action secret, not on the TV
- **TMDb API key** — free; lives in the GitHub Action secret AND in the app (read-only public key, OK to ship)
- **GitHub repo name + visibility** — public or private; affects raw.githubusercontent.com URL
- **Quality source if OMDb proves limiting** — could add Letterboxd scraping as v0.3 enhancement
- **Brand shelf items** — final list of 10 production companies to feature; A24, NEON, Studio Ghibli, Pixar, Marvel, Searchlight, Focus Features identified so far; need 3 more
- **Custom font choice** — Times New Roman is the spec fallback; if licensing permits we may switch to Tiempos or Source Serif Pro for better cinema feel
- **Container support** — Chromium 79 HTML5 video plays MP4/H264 reliably but is patchy on MKV/H265. Codec probe at startup tells us what works; v0.2 decides whether to plumb the WebOS native media pipeline (via Luna bus) for the codecs `<video>` rejects. Until then, those candidates just get filtered out
- **HDR passthrough** — TV supports HDR10/HLG natively, but Chromium 79's `<video>` element can't trigger HDR mode from a web context. Real 4K HDR playback requires the WebOS native media pipeline. v0.2+ concern
- **Embedded subtitles in MKV** — addon-fetched subtitles handle most cases; mux'd subtitles in container files are a v0.3 concern
- **Bandwidth probe target** — pick a stable CDN-hosted ~5MB file. Cloudflare's `speed.cloudflare.com` endpoints work; alternative: a static asset in our own GitHub Pages
