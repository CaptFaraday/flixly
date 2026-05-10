# TV UI Design Research — Distilled Rules for Flixly

Context: LG 86" 4K NanoCell, webOS 6 (Chromium 79), Preact 10 + plain CSS, ~10 ft viewing distance, render target 1920x1080.

This is a checklist, not an essay. Every number below has a source URL at the end of its section. Where I couldn't pull a number from an authoritative page (Apple's HIG is JS-rendered and WebFetch returns only the title), it is noted explicitly.

---

## 1. Viewport, Safe Zones, and Scaling

**Safe area: keep all essential UI within 5% of every edge.**

- Microsoft (Xbox / 10-foot UWP): on a 1920x1080 effective surface scaled to 960x540 epx, reserve **27 epx top/bottom and 48 epx left/right** as TV-unsafe — i.e. 5% of each axis. Non-essential visuals can extend past those edges, but **interactive elements and text must not**. Backgrounds, list edges, and nav-pane chrome *should* bleed to the edges to avoid a letterbox look.
- Android TV: **48 dp horizontal, 27 dp vertical** edge margins on a 960x540 MDPI canvas — the same 5% figure.
- LG webOS: "All selectable objects, text, and company branding must be placed within the Safe Area." Clickable elements may overlap the overscan only if **at least 54 px is inside the safe area**.
- Industry (You.i TV): older / mid-tier TVs vary; **85% of screen** is a paranoid floor used in production.

**Render target.** webOS app default is **1920x1080** graphics resolution on UHD models; the TV upscales to native 4K. Confirm at runtime via `window.innerWidth` / `window.innerHeight`. Stick to 1080p — don't try to "render at 4K" on Chromium 79.

**Scale strategy.** Microsoft's UWP uses an automatic **200% scale factor** on Xbox — i.e. design at 960x540, present at 1920x1080. The equivalent in CSS is **`html { font-size: 0.5208vw }`** (1vw on 1920 = 19.2px, so 1rem = 10px at 1080p) and to use `rem` everywhere. The fluid trick (`font-size: 1vw` or `0.625vw`) means every component auto-scales if the TV ever changes the render surface.

Sources:
- https://learn.microsoft.com/en-us/windows/apps/design/devices/designing-for-tv
- https://developer.android.com/design/ui/tv/guides/styles/layouts
- https://webostv.developer.lge.com/develop/specifications/app-resolution
- https://pascalpotvin.medium.com/designing-a-10ft-ui-ae2ca0da08b7

---

## 2. Typography

| Source | Body min | Captions min | Notes |
|---|---|---|---|
| Microsoft Xbox (epx, doubled to actual px @ 200%) | **15 epx = 30 px** | **12 epx = 24 px** | "Main text and reading content: 15 epx min. Non-critical: 12 epx min." |
| LG webOS | "smallest font must be readable at 3.5 m (10 ft)" | — | No explicit px floor published. |
| You.i TV / 10-ft UI guidance | **24 pt minimum** for all text | — | Strict floor that survives any TV. |
| Pixel rule of thumb (industry) | **22 px** below which text becomes unreadable at 10 ft | — | |

**Practical floor for Flixly:** body 24 px, captions 20 px, never below 18 px even for legal/metadata text.

**Weight.** Regular (400) weights become spindly at 10 ft. Use **500/600 for body**, **700 for headings**. Avoid thin/light weights entirely. webOS does not restrict app fonts; system font (LG Display) is recommended but not required.

**Line-height.** TV legibility guides converge on **1.3–1.5x** font-size for body text. Use 1.4 as default.

**Letter-spacing.** Add **+0.01em to +0.02em** on body to compensate for upscaling blur. All-caps headings should get +0.05em.

**Contrast.** WCAG AA = 4.5:1 for body, 3:1 for large text (>=18 pt regular or 14 pt bold). For TV viewed in mixed lighting, **target 7:1** for body — the WCAG AAA threshold — because TV picture modes (Vivid/Dynamic/Sport) often crush blacks or wash out whites.

Sources:
- https://learn.microsoft.com/en-us/windows/apps/design/devices/designing-for-tv (the 15/12 epx numbers)
- https://pascalpotvin.medium.com/designing-a-10ft-ui-ae2ca0da08b7
- https://developer.android.com/design/ui/tv/guides/styles/typography (roles only — Material 3 sizes were not fetchable; treat the Microsoft Xbox numbers as ground truth)

---

## 3. Color and Contrast

**Don't use #000000 or #FFFFFF.**

- On OLED (the user's NanoCell is LCD with local dimming — less critical but the rule still helps), pure black pixels turn off and produce visible "blooming" gradients next to bright UI. Use **#0A0A0F to #14141A** as your darkest background.
- Pure white on a 4K HDR-capable panel in default picture mode causes halos and chromatic fringing. **Use #F1F1F1** (You.i TV's published value) as your brightest text.
- Microsoft's Xbox color rule: stay inside **RGB 16–235** (hex 10–EB). Modern webOS doesn't apply this scaling itself — the TV panel does — so values outside this range may band or clip on some panels. Design within it.

**Saturation.** TVs in "Standard" / "Cinema" picture modes render closest to sRGB; "Vivid" oversaturates. Design and verify in Standard. Brand accents at full saturation often look radioactive on TV — **drop saturation by ~10–15%** vs. a web mock.

**HDR.** Chromium 79 does not have meaningful HDR canvas support. Treat the app as SDR. Don't waste effort on `display-p3` or HDR media queries.

**Lines and 1-pixel borders.** Interlaced TV displays (mostly retired but the rendering pipelines persist) flicker on **odd-pixel lines**. Use 2 px or thicker borders. Avoid 1 px hairlines.

**Power.** Android TV docs note darker UI saves backlight power and avoids glare in low-light viewing — the natural choice for a movie app anyway.

Sources:
- https://learn.microsoft.com/en-us/windows/apps/design/devices/designing-for-tv ("TV-safe colors")
- https://developer.android.com/design/ui/tv/guides/foundations/color-on-tv
- https://pascalpotvin.medium.com/designing-a-10ft-ui-ae2ca0da08b7 (#f1f1f1, 2 px line rule)

---

## 4. Spacing and Rhythm

**Common TV grids:**
- Android TV: **12-column grid, 52 dp columns, 20 dp gutters, 58 dp side padding** on a 960x540 design canvas. Translated to 1080p that's **104 px columns, 40 px gutters, 116 px side padding**.
- Microsoft Xbox: implicit **8 epx grid** (= 16 px at 1080p) from Fluent Design.

**Inter-component breathing room.** TV requires more space than a desktop app because the eye is scanning 86" from 10 ft. As a rule, **multiply your desktop spacing scale by ~1.5–2x**. Card-to-card gaps in a row: at least **24 px**; row-to-row vertical gaps: at least **48 px**; section margins: **64–96 px**.

**Viewport padding.** Top: 48–72 px, bottom: 48–72 px, sides: **64–96 px** (sits comfortably inside the 5% safe area on 1920px = 96 px).

Sources:
- https://developer.android.com/design/ui/tv/guides/styles/layouts (12-col, 52/20/58 dp)
- https://learn.microsoft.com/en-us/windows/apps/design/devices/designing-for-tv

---

## 5. Focus and Navigation

**Focus indicator (Android TV's official taxonomy):**
- **Scale**: 1.025x, 1.05x, or 1.1x. Use **1.05x** for posters/cards, **1.025x** for buttons (don't scale tiny things much or text reflows).
- **Glow/elevation**: 2–32 dp glow. On a TV this maps to a soft **outer box-shadow** in the accent color, e.g. `0 0 0 4px var(--accent), 0 8px 32px rgba(accent, 0.45)`.
- **Outline**: a thick (**4–6 px**) outline outside the element with a small inset (**2–4 px**) reads cleanest at 10 ft. Pure outlines without scale feel flat; pure scale without outline gets lost on busy backgrounds.
- **Color shift**: surface and content color change is the third lever. Use sparingly.

**Combine at least two** of the four (scale + outline is the safest default).

**Animation timing.** Neither Android nor Microsoft publish a specific ms value. Industry consensus (Disney+, Netflix, Apple TV reverse-engineered):
- **150–200 ms** for focus moves between adjacent items
- **250–350 ms** for transitions between rows / pages
- Easing: **`cubic-bezier(0.4, 0, 0.2, 1)`** (Material standard) or **`cubic-bezier(0.32, 0.72, 0, 1)`** (Apple-ish snappy ease-out). Don't use linear; don't use bounce.
- **Don't animate scale on every keydown if the user holds the D-pad** — debounce to "next item" final state, or the UI feels like jelly. Cap at one in-flight focus animation.

**Spatial navigation patterns:**
- **Clamp at edges of a row** (don't wrap horizontally) — wrapping disorients.
- **Wrap or jump vertically** between rows only when it matches the row's content boundary.
- **Focus memory per screen**: when returning to a previous screen, restore the last-focused element. Netflix, Apple TV, Disney+ all do this.
- **Six clicks max** to traverse a screen edge-to-edge (Microsoft). If a row has 30 items, that's fine — but the user should be able to escape that row vertically in 1 press.

**webOS D-pad keycodes (confirmed by community + LG samples):**

| Key | `keyCode` |
|---|---|
| Left | 37 |
| Up | 38 |
| Right | 39 |
| Down | 40 |
| Enter / OK | 13 |
| Back | **461** (webOS-specific; NOT the browser's standard backspace) |
| Play | 415 |
| Pause | 19 |
| Stop | 413 |
| FastForward | 417 |
| Rewind | 412 |
| Red / Green / Yellow / Blue | 403 / 404 / 405 / 406 |

**Back-button gotcha (we already hit this).** The webOS Back key fires `keyCode 461` *and* the platform fires a `popstate` if the app has history. If you don't pre-empt it, the WAM (webOS App Manager) will close the app. Pattern:

```ts
// In an outermost handler, capture phase, before history triggers anything:
window.addEventListener('keydown', (e) => {
  if (e.keyCode === 461) {
    e.preventDefault();
    e.stopPropagation();
    // your own routing: pop modal, then route, then minimize
  }
}, { capture: true });
```

Also, push a sentinel state on startup (`history.pushState({app:'flixly'}, '')`) so a stray `history.back()` doesn't fall off the stack.

Sources:
- https://developer.android.com/design/ui/tv/guides/styles/focus-system (scale 1.025/1.05/1.1, glow 2–32 dp)
- https://learn.microsoft.com/en-us/windows/apps/design/devices/designing-for-tv (6-click max, XY focus)
- https://forum.webostv.developer.lge.com/t/keycodes-for-lg-webos-standard-and-magic-remote/239
- https://github.com/webOS-TV-app-samples/BackButtonControl

---

## 6. Performance on webOS / Chromium 79

**Engine.** webOS 6 ships **Chromium 79 / Blink** (user-agent confirmed `Chrome/79.0.3945.79`). webOS switched WebKit → Blink at webOS 3. Once shipped, **LG never updates the Chromium version on a given webOS major release** — so this is permanent for our device.

**Supported in Chromium 79 (relevant to us):**
- CSS Grid (full Level 1)
- Flexbox
- Custom properties / `var()`
- `position: sticky`
- `IntersectionObserver`, `ResizeObserver`
- `requestIdleCallback`
- ES2019 (most of it — async/await, optional catch, flat/flatMap)
- `<picture>`, `srcset`
- `will-change`, `transform: translate3d()`

**NOT supported / partial in Chromium 79:**
- **`:focus-visible`** (shipped in Chrome 86) — use a custom `.is-focused` class or `:focus` with manual mouse-detection.
- **`aspect-ratio` CSS property** (Chrome 88) — fall back to padding-top hack for posters.
- **`gap` on flexbox** (Chrome 84) — works on `grid` only; use margins between flex children.
- **`backdrop-filter`** is enabled but slow on TV silicon — avoid on scrolling surfaces.
- **`content-visibility: auto`** (Chrome 85) — not available; do your own off-screen culling.
- **Container queries** (Chrome 105) — no.
- **`:has()`** (Chrome 105) — no.
- **`color-mix()`, `oklch()`, relative color syntax** — no.
- **`scroll-behavior: smooth`** is available but janky on TV — manually animate scrolls with `requestAnimationFrame` for predictable timing.
- **WebP** is supported; **AVIF** is not (Chrome 85).

**Memory.** LG doesn't publish per-app RAM ceilings, but field reports for webOS 6 apps put the working set around **~250 MB before WAM kills you**. Practical implications:
- **Virtualize long rows** — never render all posters at once. 1080p, 60 posters at 200×300 each is fine; 600 isn't.
- **Drop image refs** outside the viewport (use `IntersectionObserver` to swap `src` to a 1×1 placeholder when off-screen far enough).
- Be ruthless with closures and event listeners — leaks kill within minutes.

**GPU/CPU.** TV SoCs (LG's α7 Gen 4 on the 86" NanoCell) are weak on JS but their compositor is fine. Rules:
- **Only animate `transform` and `opacity`.** Animating `top/left/width/height/box-shadow` triggers layout/paint and stutters at 30 fps.
- **`will-change: transform`** on focus-eligible elements that animate scale. Don't blanket-apply (each `will-change` reserves a GPU layer).
- **`contain: layout style paint`** on cards and rows — Chromium 79 supports it and it noticeably speeds up scroll. Avoid `contain: size` unless you've set explicit dimensions.

**Image loading.**
- **Lazy-load posters** (`loading="lazy"` works in Chromium 79) but it's conservative; prefer your own `IntersectionObserver` with `rootMargin: '600px'` to start fetching just before they scroll into view.
- **Use `srcset`** and serve **400-px-wide JPEGs** for poster cards — bigger is wasted; smaller is fuzzy at 1.1x scale. webOS upscales the surface anyway.
- **Preload only the first row's hero/poster batch**, not everything.

Sources:
- https://gist.github.com/throwaway96/5648720758e354a018c95150d0bb7fb8 (webOS → Chromium mapping)
- https://explore.whatismybrowser.com/useragents/parse/243656056-chrome-webos-smart-tv-blink
- https://caniuse.com (used to check Chrome 79 feature thresholds — see above lists)

---

## 7. Motion Design

**Why motion at all.** On a 10-ft UI the user moves focus with abstract D-pad inputs — they need motion to *confirm* the system understood. Static highlight swap is jarring.

**What works:**
- **Subtle scale on focus** (1.025–1.10x).
- **Opacity fade** for un-focused dimming (0.6–0.7 alpha on other cards in the row).
- **Translate slides** when changing pages or rows — 200–300 ms, ease-out.
- **Stagger** by 30–50 ms across a row when entering a screen (Netflix / Apple TV pattern).

**What feels bad:**
- Heavy parallax (the Apple TV poster parallax tilt is **iconic** but expensive — skip on Chromium 79).
- Fast cuts with no transition between screens.
- Bouncy springs on focus (cute on touch, awful with held D-pad).
- Animating box-shadow.

**Easing presets to copy:**
- Material standard: `cubic-bezier(0.4, 0, 0.2, 1)` — safe default.
- Apple-feel decel: `cubic-bezier(0.32, 0.72, 0, 1)`.
- Disney+ row slide: `cubic-bezier(0.5, 0, 0.1, 1)` (steeper start, gentle settle).

(Exact Disney+/Netflix easings are not officially published — these are reverse-engineered approximations from devtools recordings, included because they read better than `ease-in-out`.)

---

## 8. Stack-Specific Notes for Preact + CSS

**Inline styles vs CSS file.** Move to CSS files for everything structural. Inline styles are fine for **truly dynamic** values (e.g. focused poster's transform). Reasons:
1. Inline style objects allocate per-render in Preact — wasteful at 30 fps on a TV chip.
2. They sidestep CSS custom properties' biggest superpower: editing one token and watching every component update.
3. They make `:focus`, `:hover`, `:active`, and class-based focus state impossible — you end up reinventing them in JS.

Recommended pattern: **component.module.css** (or plain `.css` since we're not using CSS Modules) for the 95%, `style={{ transform: ... }}` only for runtime-computed values.

**Root font-size = 1vw trick.** Yes, adopt it. Set `:root { font-size: clamp(8px, 0.5208vw, 14px) }` (0.5208vw of 1920 = 10px). Then **every size in rem auto-scales**. Even better, alias your spacing tokens to rem: `--s-3: 1.6rem` (= 16px @ 1080p).

**CSS Grid for top-level layouts, Flex for rows.** Major page = grid (header / hero / shelves / footer). Each shelf row = horizontal flex. Avoid absolute positioning except for overlays/modals — it makes spatial focus calculations brittle.

**CSS reset.** Yes — add a small one. Modern Normalize is overkill; for TV it's:
```css
*, *::before, *::after { box-sizing: border-box; }
html, body, #app { height: 100%; margin: 0; }
body { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; overflow: hidden; }
img { display: block; max-width: 100%; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; }
:focus { outline: none; } /* we draw our own */
```

**`contain` for performance.** Apply to repeating list items:
```css
.poster { contain: layout style paint; }
.shelf-row { contain: layout style; }
```
Don't `contain: size` unless dimensions are explicit — Preact reflow during initial render can fight it.

**Chromium 79 CSS compat quick-reference (yes / no):**

| Feature | Chrome 79? |
|---|---|
| CSS Grid | yes |
| Flex `gap` | no — use grid or margins |
| `:focus-visible` | no — class-based |
| `aspect-ratio` | no — padding-top hack |
| Custom props / `var()` | yes |
| `clamp()`, `min()`, `max()` | yes |
| `position: sticky` | yes |
| `backdrop-filter` | yes but slow |
| `content-visibility` | no |
| Container queries | no |
| `:has()` | no |
| `color-mix()` / `oklch()` | no |
| WebP / AVIF | WebP yes, AVIF no |
| `loading="lazy"` | yes |
| `IntersectionObserver` | yes |
| `ResizeObserver` | yes |

**Vite config.** We already have `target: 'chrome79'`. Add:
- `build.cssTarget: 'chrome79'` (so postcss doesn't emit `gap`, `:focus-visible`, etc. without fallbacks)
- `build.assetsInlineLimit: 0` (don't inline images as base64 — TV cache prefers separate requests)
- Image plugin: produce `.webp` at 400 w / 800 w; skip avif.

---

## 9. Audit of Current Spacing Tokens

Current:
```
--s-1: 4px;  --s-2: 8px;  --s-3: 16px;  --s-4: 24px;
--s-5: 32px; --s-6: 48px; --s-7: 64px;
```

Verdict: **the low end is too low; the high end is too low.** `--s-1: 4px` and `--s-2: 8px` are useful for borders / icon-text gaps, fine to keep. But `--s-7: 64px` is the *minimum* section gap for TV, not the maximum.

**Recommended:**
```css
:root {
  --s-1: 0.4rem;   /* 4px  — borders, icon gaps */
  --s-2: 0.8rem;   /* 8px  — tight inline */
  --s-3: 1.2rem;   /* 12px — chip padding */
  --s-4: 1.6rem;   /* 16px — card inner padding */
  --s-5: 2.4rem;   /* 24px — card-to-card in row */
  --s-6: 3.2rem;   /* 32px — group padding */
  --s-7: 4.8rem;   /* 48px — row-to-row */
  --s-8: 6.4rem;   /* 64px — section gap */
  --s-9: 9.6rem;   /* 96px — viewport side padding (= 5% safe edge) */
}
```

(Assumes you also adopt the `font-size: 0.5208vw` trick so 1rem = 10px @ 1080p.) If you keep px, just shift each token: `--s-1: 4 / --s-2: 8 / --s-3: 12 / --s-4: 16 / --s-5: 24 / --s-6: 32 / --s-7: 48 / --s-8: 64 / --s-9: 96`.

The key change: **add two new tiers at the top (`--s-8`, `--s-9`)** for major section / viewport padding. That's what's missing today — components have nothing to reach for between "card padding" and "edge of screen," so they hardcode random values.

---

## 10. Checklist (one page, for every new component)

**Sizing**
- [ ] All sizes in `rem` (or token), not raw px
- [ ] No hardcoded values that don't trace back to `--s-N` or a typography token
- [ ] Interactive elements at least **48 px tall** (Microsoft: 32 epx min × 1.5–2x TV scale)
- [ ] Text at minimum **24 px body**, **20 px caption**, never below 18 px

**Typography**
- [ ] Weight 500+ for body, 700 for headings
- [ ] Line-height 1.3–1.5
- [ ] Letter-spacing +0.01em body, +0.05em all-caps
- [ ] Text color ≥ 7:1 contrast against background (use a contrast checker)

**Color**
- [ ] No `#000` or `#fff` — use near-black (≤ #14141A) and off-white (≥ #F1F1F1)
- [ ] Brand accents tested at -15% saturation
- [ ] All borders ≥ 2 px

**Safe area**
- [ ] Nothing interactive within 5% of any screen edge (96 px side, 54 px top/bottom on 1920×1080)
- [ ] Backgrounds and list edges may bleed beyond

**Focus**
- [ ] Visible focus state combines at least 2 of {scale, outline, glow, color}
- [ ] Outline ≥ 4 px, offset 2–4 px
- [ ] Transition 150–250 ms, `cubic-bezier(0.4, 0, 0.2, 1)`
- [ ] Animates only `transform` / `opacity`
- [ ] `will-change: transform` if it animates scale
- [ ] Component contains `contain: layout style paint` if it repeats

**Navigation**
- [ ] Horizontal navigation clamps at edges; no wrap
- [ ] Vertical navigation behavior matches row boundaries
- [ ] Returning to this screen restores last-focused element
- [ ] No element traps focus (always has at least one neighbor to escape to)
- [ ] No `:hover`-only affordances — D-pad has no hover

**webOS specifics**
- [ ] Back key (`keyCode 461`) handled with `capture: true` and `preventDefault`
- [ ] History sentinel pushed at app start
- [ ] No `:focus-visible` selectors (use class-based)
- [ ] No `aspect-ratio` (use padding-top hack)
- [ ] No `flex gap` (use grid or margins)

**Perf**
- [ ] Long lists virtualized
- [ ] Off-screen images released to placeholder
- [ ] No `box-shadow` animations
- [ ] No `backdrop-filter` on scrolling surfaces
- [ ] Images served via `srcset` at 400 w / 800 w WebP

**Verify on real hardware** (emulator lies about overscan and chip speed). View at 10 ft. If you can't read it from the couch, the metric was wrong.

---

## Sources I could not fully fetch

Listed so the controller knows what's missing:

- **Apple HIG (tvOS) — Layout, Focus and Selection, Typography pages.** All return only the page `<title>` to WebFetch; Apple's site is fully JS-rendered. The tvOS numbers in section 2 (29 pt body etc.) are widely-cited Apple norms but should be re-verified directly in Xcode's Developer Documentation viewer or by capturing the rendered HTML manually before being treated as Apple-published.
- **LG webOS design-principles, overscan, remote-control, magic-remote pages.** All accessible via the dev portal but their content is also JS-rendered; WebFetch returned only navigation. The webOS numbers used here come from the Microsoft / Android sources and corroborating community / forum posts (cited).
- **Material Design 3 typography type-scale-tokens page.** JS-rendered; only the title was returned. Specific sp values for `body-large`, `headline-large`, etc. were not pulled. The Microsoft Xbox 15 epx / 12 epx figures are used as ground truth instead.
- **BBC GEL** ("how to design for TV") was blocked by the WebFetch host filter.
- **Netflix Tech Blog "TV doesn't need an app store"** returned 404.

Where this matters most: the **focus animation timing in section 7** is reverse-engineered industry consensus, not officially published by any platform vendor. The Material easing curve is documented; the Apple/Disney/Netflix variants are inferred.
