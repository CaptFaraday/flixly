# `rows.json` Backend — Design Spec

**Date:** 2026-05-10
**Author:** Duane (with Claude)
**Status:** Draft, awaiting review
**Plan reference:** TBD (Plan 2 in the WebOS app series)
**Parent spec:** `docs/superpowers/specs/2026-05-09-stremio-webos-redesign-design.md`

---

## Overview

Replace the bundled `public/sample-rows.json` placeholder with a daily-refreshed `rows.json` produced by a small GitHub Action. The action queries TMDb + OMDb, ranks movies by composite review scores, and commits the resulting JSON to the public repo. The Flixly TV app fetches the JSON from `raw.githubusercontent.com` on cold start.

This is the smallest change that turns the home screen from "one row of placeholder titles" into "real movies that actually got curated by data."

## Goals

- Home screen shows real movies that hit streaming recently, plus other curated rails (best of year, missed gems, brand collections)
- Refreshes daily without me having to redeploy the app
- Brand tiles (A24, NEON, Pixar, etc.) show real movies when clicked instead of dead-ending
- Costs zero infrastructure dollars (free GitHub Actions + free TMDb/OMDb tiers)

## Non-Goals

- "Coming Soon to Streaming" row — TMDb's future-digital-release-date data is patchy. Defer until we add a JustWatch-style scrape or accept lower fidelity
- Per-user personalization — `rows.json` is the same for everyone (just me)
- Real-time updates — daily refresh is enough; nothing time-sensitive lives on this surface

## Constraints

| Constraint | Implication |
|---|---|
| **Public GitHub repo** (`CaptFaraday/flixly`) | App fetches via `raw.githubusercontent.com`, no auth on TV side. API keys live as GitHub Action secrets, never committed |
| **OMDb free tier (1000 req/day)** | Daily build uses ~80 calls. Plenty of headroom |
| **TMDb rate limit (~50 req/sec)** | Daily build uses ~90 calls total. No issue |
| **TV runs Chromium 79** | `fetch()` over HTTPS works fine. `fetch()` over `file://` does not (already known from MVP). This is the whole reason we move to a network source |
| **Network-only on TV** | Per user choice: drop the bundled fallback. localStorage caches last successful fetch as the practical fallback |

---

## Approach

**Single repo, GitHub Action commits `rows.json` back to `main`.** The repo holds app source, backend builder, and the generated `rows.json` together. App fetches the JSON from `raw.githubusercontent.com/CaptFaraday/flixly/main/rows.json`.

Considered and rejected:
- **Two repos** (app + data) — cleaner separation but adds context-switching overhead for one-developer iteration
- **GitHub Pages instead of raw** — proper Content-Type but no real benefit; `fetch().json()` works fine with raw
- **Cloudflare Worker** — adds a moving part for no gain on this scope

---

## Architecture

Three independent pieces.

### 1. The TV app (existing)
Single change: `src/data/rows.ts` switches from `import sample from '../../public/sample-rows.json'` to a network `fetch()` from raw.githubusercontent.com. localStorage caches the last successful response. Bundled `sample-rows.json` is deleted from `public/`.

### 2. The backend builder (new)
Node TypeScript, runs in CI. Reads env (`TMDB_TOKEN`, `OMDB_API_KEY`), queries both APIs, builds row sets, writes `rows.json` to the repo root. Same script runs locally for dev / smoke testing — `npx tsx backend/build-rows.ts` with a `.env` loaded.

### 3. The GitHub Action (new)
`.github/workflows/refresh.yml`. Cron `0 9 * * *` (09:00 UTC daily) plus `workflow_dispatch` for manual trigger. Steps: checkout → setup Node 20 → `npm ci` → `npx tsx backend/build-rows.ts` → if `rows.json` changed, commit and push using the GitHub-provided `GITHUB_TOKEN`. Skip empty commits.

### Data flow

| Moment | What happens |
|---|---|
| **09:00 UTC daily** | Action runs in CI. Hits TMDb (~10 discover calls, ~80 detail/credit/release-date calls), hits OMDb (~80 score lookups). Outputs ~120KB gzipped JSON. Commits to `main` if changed |
| **TV cold start** | App `fetch()`es `https://raw.githubusercontent.com/CaptFaraday/flixly/main/rows.json` (~250ms via cloud-edge CDN). Renders home. Saves to localStorage |
| **TV cold start, network down** | Tries fetch, fails, reads localStorage. Shows last successful rows. If localStorage is also empty (first launch + offline), shows "Couldn't load rows" error |

---

## Repo layout (after this plan)

```
flixly/                              # CaptFaraday/flixly on GitHub (public)
├── README.md
├── package.json                     # app deps + a few backend deps (tsx, dotenv-style env loading)
├── webos-info.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── public/                          # icons (sample-rows.json removed)
├── src/                             # TV app source — rows.ts modified
├── scripts/                         # deploy.sh, make-icon.mjs, tv-*.mjs
├── docs/                            # specs + plans
├── backend/                         # NEW
│   ├── build-rows.ts                # entry point
│   ├── sources/
│   │   ├── tmdb.ts                  # TMDb client
│   │   └── omdb.ts                  # OMDb client
│   ├── lib/
│   │   ├── score.ts                 # composite score
│   │   ├── score.test.ts
│   │   └── digital-release.ts       # resolve digital release date per movie
│   └── tsconfig.json                # Node-target TS config
├── rows.json                        # NEW — generated daily, committed to main
├── .env.example                     # NEW — placeholders for TMDB_TOKEN / OMDB_API_KEY
└── .github/
    └── workflows/
        └── refresh.yml              # daily cron + commit-back
```

---

## Backend module breakdown

| Module | Job | Calls |
|---|---|---|
| **`build-rows.ts`** | Orchestrator. Loads .env, runs each row builder in parallel, composes the `shelves` array, writes `rows.json`. Idempotent | tmdb, omdb |
| **`sources/tmdb.ts`** | TMDb v3 REST client with Bearer auth. Methods: `discover(filters)`, `getDetails(tmdbId)`, `getReleaseDates(tmdbId)`, `getCredits(tmdbId)`. Returns typed objects | network |
| **`sources/omdb.ts`** | OMDb client. `getScores(imdbId)` returns `{ rt, metacritic, imdb }`. Best-effort: returns nulls and the row builder falls back to TMDb's `vote_average` | network |
| **`lib/score.ts`** | `composite({rt, metacritic, imdb, tmdbVoteAvg})` → number. Pure logic | nothing |
| **`lib/digital-release.ts`** | `resolveDigitalReleaseDate(tmdbId)` via `getReleaseDates` (TMDb returns release windows; we filter type=4 = Digital). Caches per run | tmdb |

---

## Row definitions

Concrete TMDb queries and per-movie filters.

| Row | Discover query | Per-movie filter | Sort + cap |
|---|---|---|---|
| **Just Hit Streaming** | `release_date.gte={today-60d}&with_release_type=4&vote_count.gte=100&with_original_language=en` | RT ≥ 75 OR IMDb ≥ 7.0 | digital_release_date desc, top 30 |
| **Best of {year}** | `primary_release_year={year}&vote_count.gte=200&with_original_language=en` | none | composite desc, top 30 |
| **You Probably Missed** | `primary_release_year={year-1}&vote_count.gte=100` | revenue < $50M AND RT ≥ 80 | composite desc, top 30 |
| **A24** | `with_companies=41077&vote_count.gte=20` | none | popularity desc, top 20 |
| **NEON** | `with_companies=193481` | none | popularity desc, top 20 |
| **Studio Ghibli** | `with_companies=10342` | none | popularity desc, top 20 |
| **Pixar** | `with_companies=3` | none | popularity desc, top 20 |
| **Marvel Studios** | `with_companies=420` | none | popularity desc, top 20 |
| **Searchlight** | `with_companies=43` | none | popularity desc, top 20 |
| **Focus Features** | `with_companies=10146` | none | popularity desc, top 20 |

**Composite score:** `RT × 0.5 + Metacritic × 0.3 + (IMDb × 20) × 0.2`. Falls back to `(TMDb vote_average × 20)` per-movie when OMDb has no data.

---

## Schema

The existing `src/types.ts` `RowsFile` shape is the contract:

```ts
interface RowsFile {
  generated_at: string;
  shelves: Shelf[];
}
type Shelf = Row | Collection;
interface Row { id: string; display: 'row'; title: string; subtitle?: string; items: Movie[]; }
interface Collection { id: string; display: 'collection'; title: string; logo_url?: string; background_color?: string; items: Movie[]; }
interface Movie { imdb_id; tmdb_id; title; year; runtime; genres; poster; backdrop; logo?; overview; scores; digital_release_date?; director?; cast; }
```

**No schema changes.** Backend writes JSON conforming to it.

---

## CI workflow

`.github/workflows/refresh.yml`:

```yaml
name: refresh rows.json

on:
  schedule:
    - cron: '0 9 * * *'
  workflow_dispatch:

permissions:
  contents: write

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

**Secrets** (set via `gh secret set` or in repo Settings → Secrets and variables → Actions):
- `TMDB_TOKEN` — TMDb v4 API Read Access Token
- `OMDB_API_KEY` — OMDb activated key

`GITHUB_TOKEN` is provided automatically.

---

## API budget

| API | Calls per build | Daily limit | Headroom |
|---|---|---|---|
| TMDb | ~90 | None (per-second only, ~50/s) | Unlimited |
| OMDb | ~80 | 1000/day | 12× |
| Output size | ~390 entries × 1KB | — | ~400KB raw, ~120KB gzipped over the wire |

---

## Error handling

- **TMDb fetch fails** → retry once with 2s backoff, then fail the workflow. Stale `rows.json` stays in the repo; app keeps using whatever it last cached
- **OMDb fetch fails for a single movie** → best-effort, fall back to TMDb `vote_average × 20` for that movie's score. Don't fail the whole build
- **OMDb rate-limit (429)** → log and proceed with TMDb-only scores for remaining items. Workflow succeeds; quality of "Best of" / "You Probably Missed" rows degrades slightly
- **App fetch from raw fails** → localStorage fallback if available, else clear error UI
- **App localStorage parse fails** → clear and refetch
- **No changes since last build** → workflow exits cleanly without an empty commit (the `git diff --quiet` check)

Principle: never break the app because something on the internet broke. Always fall back to the last good state.

---

## Testing

| Layer | Approach |
|---|---|
| `lib/score.ts` | Vitest unit tests — pure formula, easy to assert edge cases (zero scores, missing fields, all-null fallback) |
| `sources/tmdb.ts`, `sources/omdb.ts` | Vitest with `vi.spyOn(fetch)` returning canned JSON. Verify request shape, parsing, error paths |
| `build-rows.ts` end-to-end | Manual local run with real keys, eyeball `rows.json` before pushing CI |
| CI workflow itself | `workflow_dispatch` button — manually trigger from GitHub UI, watch the action run, confirm rows.json gets committed |
| TV-side `fetchRows()` | Manual on TV after deploy — open Settings, force a reload, confirm fresh data shows |

---

## Rollout sequence

1. Write `backend/` scripts + unit tests
2. Run `tsx backend/build-rows.ts` locally with `.env`; eyeball the produced `rows.json`
3. Create the GitHub repo `CaptFaraday/flixly` via `gh repo create --public`
4. Push current code; set the two Action secrets via `gh secret set TMDB_TOKEN < ...` and `gh secret set OMDB_API_KEY < ...`
5. Add `.github/workflows/refresh.yml`, commit & push
6. Trigger workflow manually (`gh workflow run refresh.yml`), watch logs, verify `rows.json` gets committed back
7. Update `src/data/rows.ts` to network fetch; delete `public/sample-rows.json`
8. Deploy to TV (`npm run deploy`), verify fresh content shows up

Total time: ~2 hours of work, mostly write-and-test on the backend script.

---

## Open questions / followups

- **Repo name** — `CaptFaraday/flixly` vs `CaptFaraday/flixly-tv` vs another name. Locked in as `flixly` unless we change it during plan execution
- **Marvel Studios company ID** — TMDb has multiple "Marvel" entities (`420` Marvel Studios, `7505` Marvel Entertainment, `19551` Marvel). `420` is the modern MCU; verify during local smoke test
- **Studio Ghibli's small `vote_count`** — Ghibli films are popular but TMDb may have lower vote_count thresholds. May need a lower `vote_count.gte` for that collection specifically
- **Rate-limit hardening** — if OMDb starts erroring, consider caching scores in a small SQLite file committed alongside (skips re-querying titles whose scores haven't changed). Defer until it's an actual problem
