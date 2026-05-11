# Flixly Testing Strategy

A concrete, opinionated plan for an engineer to execute. The goal: stop relying on "deploy + look at screenshot" as the only verification step.

Stack assumptions (verified against `package.json` and `scripts/`):

- Preact 10 + TypeScript + Vite, plain CSS, custom spatial focus engine.
- Vitest 2 + happy-dom 15 already installed. 56 passing unit tests of pure logic (e.g. `src/nav/spatial.test.ts`).
- Custom CDP scripts at `scripts/tv-nav.mjs` and `scripts/tv-screenshot.mjs` already drive the real TV at `10.0.0.238:9998` via `Runtime.evaluate` + `Page.captureScreenshot`.
- TV: LG 86" webOS 6 (2021), Chromium 79 (per LG's compatibility table this is the actual embedded version, even though TV Labs' guidance recommends Chrome 68 DevTools for backward-compatible inspection — see Sources).
- Public repo `CaptFaraday/flixly`, GitHub Actions already runs daily for `rows.json`.

This document covers what to test, with what tools, in what order, and ends with a prioritized list.

---

## 1. Test pyramid for a TV app

The standard web pyramid (lots of unit, fewer integration, very few e2e) only partially applies. TV apps add a constraint: **the device is the single biggest source of bugs**, because the runtime is an old Chromium, the input is D-pad-only, and you cannot use a touch or mouse. Things that work flawlessly in a desktop dev server break on the TV.

Recommended distribution for Flixly today (heuristic, not law):

| Layer | Today | Target | Rationale |
|---|---|---|---|
| Pure-logic unit tests (`spatial.ts`, picker scoring, row aggregation, parsers) | 56 | ~100 | Cheap, fast, already running. Add as you find bugs. |
| Component tests (Preact + happy-dom + `@testing-library/preact`) | 0 | 20–40 | Each screen renders, key D-pad transitions, focus state on mount, localStorage round-trip. |
| Integration tests (full app, mocked network, happy-dom) | 0 | 5–10 | Navigation between screens, back button, watchlist persistence across reloads. |
| On-device CDP smoke tests (real TV at 9998) | manual | 3–5 automated | A single workflow per screen + the playback picker. Slow, expensive, but the only place that proves it works on Chromium 79. |
| Visual regression | 0 | 0 — defer | High flake-to-signal ratio on TV-sized images. Not worth it until something else is solid. |

### Reference projects worth studying

- **BBC LRUD Spatial** — the BBC's spatial nav library, the post-TAL replacement. Tests use Puppeteer to load `test/layouts/*.html` files and assert "from element X, pressing right focuses Y". This is exactly the pattern Flixly needs for its spatial engine. https://github.com/bbc/lrud-spatial
- **BBC TAL** is now archived (deprecated 2022, repo locked Dec 2025). Don't adopt it. Use it only as a historical reference for "what large TV apps test". https://github.com/bbc/tal
- **BBC iPlayer Web** documented their journey from local Selenium → Zalenium → BrowserStack. Key lesson: real-browser e2e flake was their #1 productivity drain; cloud devices fixed it. https://medium.com/bbc-product-technology/our-journey-with-our-end-to-end-tests-90e1be8f1b94
- **TV Labs / Suitest / HeadSpin** all exist as commercial OTT-device farms. Useful to know they exist; not worth the cost or integration burden for a hobbyist project with one target device on the local LAN.

---

## 2. Component testing in Preact + Vitest

### happy-dom vs jsdom

- **happy-dom** is what's already installed. Vitest docs say it is "considered to be faster than jsdom, but lacks some API." (https://vitest.dev/guide/environment.html)
- **jsdom** is the more complete browser-API emulation; you need it if you hit gaps (e.g. `Range`, `IntersectionObserver`, certain `getComputedStyle` paths used by spatial geometry).
- Recommendation: **stay on happy-dom**. Switch to jsdom only when a specific test fails because of a missing API. The spatial nav engine uses `getBoundingClientRect`, which both support, but happy-dom returns zeros unless you stub layout — see the "spatial nav specifically" section below.

### @testing-library/preact

- `npm i -D @testing-library/preact @testing-library/user-event`
- It needs a DOM environment (Vitest's `environment: 'happy-dom'` is fine).
- API mirrors React Testing Library: `render`, `screen`, `fireEvent`, `userEvent`. Preact docs confirm this is the recommended approach: https://preactjs.com/guide/v10/preact-testing-library/
- `userEvent.keyboard('{ArrowRight}')` is the right primitive for D-pad simulation in component tests.

### Patterns for testing focusable components

Two problems happen the first time you try:

1. **happy-dom returns zero-size rects for everything.** Your spatial engine's geometry will think every element is at (0,0,0,0). Workaround: stub `Element.prototype.getBoundingClientRect` per test, or define a small `testRect()` helper that assigns layout by `data-testid`.
2. **`document.activeElement` is the underlying truth.** Test that the right element has focus, not that some prop changed. `expect(document.activeElement).toBe(screen.getByTestId('poster-2'))`.

Example pattern:

```ts
// src/nav/__tests__/posterRow.dpad.test.tsx
import { render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { Row } from '../../components/Row';

beforeEach(() => {
  // Layout stub: assigns a grid by data-testid index.
  Element.prototype.getBoundingClientRect = function () {
    const i = Number(this.getAttribute?.('data-testid')?.split('-')[1] ?? 0);
    return { x: i * 200, y: 100, width: 180, height: 240, top: 100, left: i * 200,
             right: i * 200 + 180, bottom: 340, toJSON: () => ({}) };
  };
});

test('right arrow from first poster focuses second', async () => {
  render(<Row items={mockItems} />);
  screen.getByTestId('poster-0').focus();
  await userEvent.keyboard('{ArrowRight}');
  expect(document.activeElement).toBe(screen.getByTestId('poster-1'));
});
```

This is the single highest-leverage pattern to land. See section 8.

---

## 3. End-to-end testing options

### Playwright via `connectOverCDP`

- Playwright supports attaching to a remote Chromium over CDP: `chromium.connectOverCDP('http://10.0.0.238:9998')`. (https://playwright.dev/docs/api/class-browsertype)
- Playwright docs explicitly warn: "Connecting over the Chrome DevTools Protocol is only supported for Chromium-based browsers" and "this connection is significantly lower fidelity than the Playwright protocol connection."
- **Risk for Chromium 79**: Playwright is built against modern Chromium (~120+ in current releases). Many Playwright APIs depend on CDP commands or events that didn't exist in 79. Concretely, **`page.route()` works on Chromium 79** because it uses the `Fetch` domain which existed in M63+. But things like `page.locator().screenshot()` rely on newer CDP method shapes and may fail. The pragmatic answer: **try it on a single smoke test; expect partial breakage**. If `page.goto`, `page.evaluate`, `page.keyboard.press`, `page.route`, and `page.screenshot` work, you have enough.
- The Playwright protocol connection (`connect`) requires matching major/minor versions and a Playwright-managed browser, so it's not an option for a TV running someone else's Chromium build.

### Puppeteer

- Simpler API, also CDP-based. Same Chromium 79 risk profile as Playwright.
- Notable: **BBC's LRUD Spatial test suite uses Puppeteer** with static HTML layouts. If you want to replicate that pattern (off-device, modern Chromium + spatial engine), Puppeteer is fine.
- Skip Puppeteer for on-device testing — it has no advantage over the WebSocket+CDP scripts you already wrote, and the route-mocking story is weaker than Playwright's.

### Selenium / WebdriverIO + `webos-tv-app-driver`

- The `webosose/com.webos.app.tv-app-driver` repo returns 404 today (verified). Appium has webOS support via third-party drivers but the architecture is poorly documented and aimed at QA shops with paid device farms (HeadSpin, Suitest).
- **Skip this path.** It's optimized for cross-platform OTT QA at scale, not for a one-developer one-TV setup.

### Custom CDP scripts (what you have)

- `scripts/tv-nav.mjs` already dispatches `KeyboardEvent`s via `Runtime.evaluate` and captures via `Page.captureScreenshot`. This is the lowest-friction, highest-compatibility option for the real TV.
- Limitations you should be aware of:
  - **No network mocking** out of the box. The TV's app hits real TMDb/OMDb/Torrentio/RD. To mock, you would need `Fetch.enable` + `Fetch.requestPaused` handlers (CDP supports this on Chromium 79). Doable but Playwright's `page.route()` is much nicer if it works on the device.
  - **Brittle timing.** Your script uses `setTimeout(400)` between key presses. This is the standard pattern but it's the source of all flake. Better: poll on a DOM signal (e.g. `data-focused="true"` attribute) instead of sleeping.
  - **No assertions beyond screenshots.** Add `Runtime.evaluate` calls that return JSON (`{ focusedId, currentScreen, watchlistLen }`) and assert on those, not on pixels.

### `ares-inspect` / `ares-cli`

- `ares-inspect -d DEVICE com.flixly.app` opens the same web inspector you already access at `http://10.0.0.238:9998`. It's a convenience wrapper, not an automation layer. https://github.com/webosose/ares-cli
- `ares-novacom -d DEVICE -f -p 9998:9222` is the port-forwarding command for TVs that bind the inspector to `localhost` only. You don't need it (port is already exposed on your network), but document it in your README for future devs.
- `ares-cli` is being moved to `@webos-tools/cli` as of March 2024 — keep an eye on that.
- **Use ares-cli for build/deploy automation in CI** (`ares-package`, `ares-install`, `ares-launch`) — not for assertions.

---

## 4. Test environment options

| Option | Verdict |
|---|---|
| **Real TV (10.0.0.238)** | Yes for the e2e tier. Only place the real Chromium 79 runs. Slow (deploy cycle ~30s, full smoke ~2min), requires TV powered on, only reachable from your desk. |
| **LG webOS emulator** | LG ships an emulator with the SDK but historically it ships an x86 build of an older webOS image; coverage of TV-specific quirks is poor. Worth a one-time evaluation but **don't build CI on it**. |
| **Headless Chromium 79 locally** | Effectively impossible. The Playwright-managed Chromium is current (~120+). You could install an old Chromium from puppeteer-archive, but you'd lose Playwright's bundled glue and accept significant flake. **Skip.** |
| **Modern headless Chromium with target-spoofing** | This is the right home for component + integration tests. You get fast, reliable runs. Accept the fidelity gap: any bug that's specific to Chromium 79 must be caught on-device. |

**Recommendation:** two-tier strategy.

1. **Vitest + happy-dom** for unit + component + small integration tests, running modern V8. This is 90% of test value.
2. **Custom CDP smoke suite** on the real TV for the 3-5 critical user journeys (Home loads, search returns results, playback picker runs end-to-end). Run on demand and in CI nightly.

The emulator and modern-Chromium-target-spoofing add layers without clear payoff. Defer.

---

## 5. Network mocking

You have four external HTTP dependencies: TMDb v3 (search), OMDb (rows builder, but server-side), Torrentio (streams), Real-Debrid (auth + instantAvailability/torrents). Plus `rows.json` from raw.githubusercontent.com.

### Tool comparison

| Tool | Where it runs | Pros | Cons |
|---|---|---|---|
| **msw (Mock Service Worker)** | Browser via Service Worker; Node via class extension. Same handlers in both. | One handler file usable in Vitest unit tests, integration tests, and even in `npm run dev` for offline development. Officially environment-agnostic. (https://mswjs.io/docs/) | Service Worker won't run on the TV (no SW registration in sideloaded mode). So msw is for the dev machine, not the TV. |
| **nock** | Node only; patches `http`/`https` modules. | Mature, well-known. | Doesn't help with Vite dev or with TV runs. Worse than msw for your stack. |
| **Playwright `page.route()`** | At the CDP level. | The cleanest API for e2e mocking; works in browser AND can be made to work over `connectOverCDP` to the TV if Chromium 79 cooperates. (https://playwright.dev/docs/api/class-route) | Tightly coupled to Playwright. |
| **CDP `Fetch.requestPaused` direct** | Anywhere CDP is available. | Works on Chromium 79 confirmed (Fetch domain exists since M63). | Manual plumbing. |

**Recommendation:** adopt **msw** for the dev machine (component + integration tests + optional offline-dev mode). Layer on **Playwright `page.route()` or raw CDP `Fetch.requestPaused`** if and only if you decide on-device tests need to mock streams. For most regressions, on-device tests can hit live TMDb — the failure modes you care about (RD `no_cached`, Torrentio empty) you should test as **unit tests with fixture responses**, not in e2e.

### Concrete fixtures to capture today

Stash these in `src/__fixtures__/`:

- One TMDb `/search/movie` happy-path response.
- One TMDb `/movie/{id}` detail response.
- One Torrentio response with `streams: []` and one with mixed quality streams.
- One RD `instantAvailability` deprecated/empty response (this is the bug you've been chasing).
- The current `rows.json` snapshot.

Capture them once with `curl`, commit them, never touch them again unless the API changes.

---

## 6. Visual regression testing

- **Percy / Chromatic / BackstopJS / Playwright snapshot** all work technically. None work *well* for TV apps:
  - TV resolution + heavy hero artwork means small antialiasing diffs flag every run.
  - Posters change daily (TMDb art changes, your `rows.json` rebuilds daily).
  - Most regressions you actually care about (focus state, navigation behavior, picker errors) are not visible in a single screenshot.
- **Worth it for this app: no, not yet.** Once you have stable focus assertions and a stable picker, *then* you can lock down hero/poster layout with snapshot tests targeted at single components (not full pages). Until then, treat the screenshot tooling you have as a debugging aid, not a test.

---

## 7. Spatial nav specifically

Three concentric rings of confidence:

1. **Geometry unit tests** — already exist in `src/nav/spatial.test.ts`. Keep adding cases as bugs are found. These are perfect Vitest fits, run in milliseconds.

2. **Component-level D-pad tests** — *the gap to close*. Render an actual `Row` or `PosterGrid` with `@testing-library/preact`, stub `getBoundingClientRect` to assign a known layout, focus an element, dispatch `{ArrowRight}`, and assert `document.activeElement`. This is exactly the BBC LRUD Spatial pattern, just in-process instead of Puppeteer.

3. **On-device sanity** — your existing `tv-nav.mjs` does this. The improvement: instead of only producing a screenshot, also `Runtime.evaluate` a function that returns the current focused element's `data-testid` and the current screen route. Assert on the JSON, not the pixels. Then the test reads `right right enter` → `focusedId === 'poster-2'` → `screen === 'detail'`.

The "focus snaps to first registered (Home nav item)" behavior — decide once: is it a bug or a feature? Either way, write the test that pins the behavior so changes are deliberate. My read: it's a bug for every screen except Home; the Detail screen should restore focus to the most recent action button, the Library should restore focus to the row/tile the user was on. Add a stack-based focus memory and test it.

---

## 8. Concrete recommendation

### The single highest-leverage test addition

**Add `@testing-library/preact` + the `getBoundingClientRect` stub pattern, and write 5–10 D-pad navigation tests for the Home row and the Detail screen action buttons.**

Why this and not something else:

- Your top stated pain is "look at the screen and see if it works is fragile and slow." D-pad bugs are the most common category. Component tests in Vitest run in <2s total and catch ~80% of "focus snaps wrong" regressions before deploy.
- You already have happy-dom installed. No new test runner. No new CI infrastructure.
- The pattern composes: once one D-pad test works, copy-paste-edit gets you 50 more in an afternoon.
- It directly closes the gap you named ("focus snaps to first registered — bug or acceptable?"). Writing the test forces the decision.

**First commit:** add `@testing-library/preact` and `@testing-library/user-event` to `devDependencies`, create `src/components/__tests__/Row.dpad.test.tsx`, land 3 tests (right from first, left from last is no-op, down from row 1 enters row 2). Time budget: 2 hours.

### Next layers, in order

1. **localStorage persistence integration tests** (1–2 hours). Render `<App />` in happy-dom, simulate adding a watchlist item, unmount, remount, assert it's still there. Fast, catches a real failure mode.
2. **msw + fixture suite + screen-render integration tests** (4–6 hours). For each screen, render it with a mocked network response set and assert the expected DOM. Closes the "did Home render correctly" gap.
3. **On-device CDP smoke suite** (4–8 hours). Refactor `tv-nav.mjs` into a small test runner with assertions (`Runtime.evaluate` returning JSON, not just screenshots). Three tests: cold-load Home, search → results, pick movie → Player runs picker → error or play. Wire into a GitHub Action that can be triggered manually (`workflow_dispatch`), since the TV isn't on a public network.
4. **Picker / RD / Torrentio error-path unit tests** (2–3 hours). Feed fixtures for `no_cached`, empty `streams`, 401 from RD. Assert the right error UI string is chosen. This is what currently only surfaces "in production on the couch."
5. **Back-button + focus-memory test** (2 hours, component-level). Pin the desired behavior. Decision required first.

### What to defer or skip entirely

- **Visual regression (Percy/Chromatic).** Defer until the test pyramid below it is solid. Possibly forever.
- **Selenium / Appium / webos-tv-app-driver.** Skip. Cost > benefit for a one-developer, one-TV setup.
- **LG webOS emulator-based CI.** Skip. The real TV is more useful and only marginally harder to run against.
- **Cloud TV device farms (TV Labs / Suitest / HeadSpin).** Skip. They're priced for OTT QA teams; your one TV is fine.
- **Playwright as your only e2e tool.** Try `connectOverCDP` to the TV as a 1-day spike; if `route()` and `keyboard.press()` work on Chromium 79, great. If they don't, stay on the hand-rolled CDP scripts. Don't invest more than a day before knowing.

### A note on the "look at the screen" problem

The fastest way to stop doing screenshot review is not "more screenshot tooling." It's **assertions on application state, not pixels.** Two changes make this dramatic:

- Add `data-testid` attributes to every focusable element and every screen container.
- Add a `window.__flixly = { route, focusedId, watchlist, isPlaying }` debug object updated on every state change.

Then any test — Vitest, Playwright, or your raw CDP script — can `Runtime.evaluate(() => window.__flixly)` and assert in one line. The screenshot becomes evidence for failures, not the test itself.

---

## Sources fetched

- LG webOS CLI overview — https://webostv.developer.lge.com/develop/tools/cli-introduction
- LG webOS Debugging with Inspectors — https://webostv.developer.lge.com/develop/tools/ide-debugging-with-inspectors (limited; doesn't document port 9998 specifically)
- webOS Homebrew web app guide — https://www.webosbrew.org/develop/guides/web-app/ (confirms port 9998 for sideloaded web apps, webOS 6+ supports modern Chrome DevTools)
- ares-cli repo — https://github.com/webosose/ares-cli (note: moving to `@webos-tools/cli`)
- TV Labs webOS docs — https://docs.tvlabs.ai/platform/platforms/webos (recommends Chrome 68 DevTools for webOS 6 backward compat)
- Playwright BrowserType (connectOverCDP) — https://playwright.dev/docs/api/class-browsertype
- Playwright Route API — https://playwright.dev/docs/api/class-route
- Vitest environments — https://vitest.dev/guide/environment.html
- Preact Testing Library — https://preactjs.com/guide/v10/preact-testing-library/
- Mock Service Worker — https://mswjs.io/docs/
- BBC TAL (archived) — https://github.com/bbc/tal
- BBC LRUD Spatial — https://github.com/bbc/lrud-spatial
- BBC iPlayer end-to-end testing journey — https://medium.com/bbc-product-technology/our-journey-with-our-end-to-end-tests-90e1be8f1b94
- HeadSpin: Appium for webOS — https://www.headspin.io/blog/guide-to-lg-webos-tv-testing-with-appium

### Sources I tried and couldn't access

- `https://github.com/webosose/com.webos.app.tv-app-driver` — returns HTTP 404. The webOS-specific WebDriver server referenced in older docs appears to not exist (or has been renamed). Treat the Selenium/WebdriverIO path as unsupported for sideloaded apps.
