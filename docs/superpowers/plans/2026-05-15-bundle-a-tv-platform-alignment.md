# Bundle A — TV Platform Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Flixly's Player + app manifest with the now-verified LG webOS 6.0 / Chromium 79 official documentation we just located, and fix two specific factual inaccuracies that have been silently misleading future debugging.

**Architecture:** Four small, independent changes — one config flag, one comment rewrite, one error-message correction, one toolchain verification. No new modules, no new tests for the comment/string/config changes (string and comment edits aren't behavioral). Task 4 is an investigation that may or may not require a code change depending on what we find.

**Tech Stack:** Preact 10 + TypeScript, Vite 5 (target chrome79), webOS 6.0 packaged app (IPK), Vitest.

**Source documents:**
- LG video/audio matrix (webOS 6.0): https://webostv.developer.lge.com/develop/specifications/video-audio-60
- LG mediaOption guide: https://webostv.developer.lge.com/develop/guides/mediaoption-parameter
- LG Back Button guide: https://webostv.developer.lge.com/develop/guides/back-button
- LG audioTracks confirmation thread: https://forum.webostv.developer.lge.com/t/video-multi-audio/24156

**Out of scope (Bundle B — separate future plan):**
- Re-introduce `mediaOption` for resume optimization using LG's documented syntax
- `visibilitychange` handler for app suspend/resume
- `audioTracks.addEventListener('addtrack', ...)` for late-arriving tracks
- `<track>` error listener for subtitle failures
- Runtime capability probe surface (`window.__flixlyCapabilities`)

**Out of scope (Bundle C — defer):**
- HEAD/Range preflight on resolved URL as final-mile backstop
- CLAUDE.md doc of Chrome 79 + webOS 6 gotcha list

---

## File Structure

```
src/
  screens/
    Player.tsx                MODIFY — line 22 (REASON_TEXT.no_compatible_codec)
                              MODIFY — lines 564-574 (mediaOption comment block)
webos-info.json               MODIFY — add "disableBackHistoryAPI": true
vite.config.ts                INSPECT only (Task 4); may need update if downleveling broken
dist/assets/index-*.js        INSPECT only (Task 4 verification)
```

No new files. No new tests (all changes are config/string/comment, not behavior).

---

## Task 1: Correct the codec rejection error message

**Files:**
- Modify: `src/screens/Player.tsx` (line 22)

**Why:** The current message blames "likely H.265" for `no_compatible_codec` rejection. LG's video-audio-60 spec confirms HEVC Main / Main10 are fully HW-accelerated to 4K@60 L5.1 on webOS 6.0 / NANO75. The real codec exclusion on this TV (and most LG 2020+ models) is DTS / DTS-HD MA / TrueHD audio — LG dropped DTS licensing on 2020+ panels. Our `picker.ts` already filters those out via `audioCodecOK`, but the user-facing string blames the wrong thing, which has cost time in debugging.

- [ ] **Step 1: Read current line 22 in Player.tsx**

Run: `grep -n "no_compatible_codec" "C:/Users/Duane/Desktop/Custom Stremio TV App/src/screens/Player.tsx"`

Expected: One match in REASON_TEXT around line 22.

- [ ] **Step 2: Replace the error string**

Use Edit on `src/screens/Player.tsx`:

old_string:
```ts
  no_compatible_codec: 'All cached versions use a video codec your TV can\'t play in the browser (likely H.265). Try a different title.',
```

new_string:
```ts
  no_compatible_codec: 'All cached versions use a codec your TV can\'t play. Most often this is DTS or TrueHD audio (LG dropped DTS licensing on 2020+ models). Try a different title.',
```

- [ ] **Step 3: Type-check passes**

Run from `C:/Users/Duane/Desktop/Custom Stremio TV App`: `npx tsc --noEmit`

Expected: No new errors. Exit code 0.

- [ ] **Step 4: Tests still pass**

Run: `npx vitest run`

Expected: 134/134 passing (no test references this string).

- [ ] **Step 5: Commit**

Run from `C:/Users/Duane/Desktop/Custom Stremio TV App`:
```bash
git add src/screens/Player.tsx
git commit -m "fix(player): correct codec-rejection error message per LG audio matrix

The previous message blamed H.265, but webOS 6.0 / NANO75 supports HEVC
Main/Main10 to 4K60 (LG video-audio-60 spec). The real exclusion is DTS
and TrueHD — LG dropped DTS licensing on 2020+ models. Picker filters
already enforce this correctly; only the user-facing string was misleading."
```

Expected: Commit succeeds.

---

## Task 2: Rewrite the outdated mediaOption comment block

**Files:**
- Modify: `src/screens/Player.tsx` (lines 564-574)

**Why:** The current comment block claims `<source type="video/mp4;mediaOption=...">` is "unusable" because Chromium 79's canPlayType rejects it. LG's own published mediaOption guide (https://webostv.developer.lge.com/develop/guides/mediaoption-parameter) shows this exact pattern is the supported, recommended API on real webOS HW — the vendor-forked Chromium 79 strips the suffix before canPlayType evaluation. Our earlier RPO failure was caused by resume contamination from placeholder playback (already fixed), not by mediaOption being rejected. The misleading comment will cost time the next time anyone wants to optimize resume.

- [ ] **Step 1: Replace the comment block**

Use Edit on `src/screens/Player.tsx`:

old_string:
```ts
  // Always use the bare `<video src>` form. The mediaOption-on-<source>
  // optimization for resume turns out to be unusable here: Chromium 79's
  // canPlayType rejects any MIME with the `;mediaOption=...` codec param
  // (it can't parse the param at the HTML layer, and pre-rejection happens
  // before the native bridge sees it), so the resume <source> always errors
  // with "Empty src attribute". Resume position is applied in JS instead
  // (see the loadedmetadata effect above — v.currentTime = resume position).
  // We pay ~500ms more on the resume seek vs native pre-staging, but we
  // gain: src-attribute auto-reload on candidate switch, no canPlayType
  // pitfalls, no <source>/src form-switch race during multi-candidate
  // fallback.
```

new_string:
```ts
  // Always use the bare `<video src>` form for the current implementation.
  //
  // mediaOption IS supported per LG's official guide
  // (https://webostv.developer.lge.com/develop/guides/mediaoption-parameter) —
  // the webOS-vendored Chromium 79 strips `;mediaOption=...` before canPlayType
  // evaluation and forwards the JSON payload to the native pipeline. Earlier
  // attempts to use it caused "Empty src attribute" failures, but that turned
  // out to be resume contamination from placeholder playback, not mediaOption
  // rejection. The Simulator does reject the suffix; only real HW handles it.
  //
  // We're using the bare form anyway because:
  // (a) src-attribute changes auto-reload via React's reconciler, simpler for
  //     multi-candidate fallback than form-switching between <source> and src;
  // (b) Resume seek via `v.currentTime = ...` on loadedmetadata works fine
  //     (~500ms slower than native pre-staging but invisible at TV scale).
  //
  // Re-introducing mediaOption as a resume optimization is a Bundle B task.
  // If/when we do: use LG's exact syntax — `encodeURI(JSON.stringify(options))`
  // (not bare JSON), `option.transmission.playTime.start` in MILLISECONDS,
  // and set it via `source.setAttribute('type', 'video/mp4;mediaOption=' + …)`.
```

- [ ] **Step 2: Type-check passes**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Tests still pass**

Run: `npx vitest run`

Expected: 134/134 passing.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Player.tsx
git commit -m "docs(player): correct misleading mediaOption comment per LG docs

LG's official mediaOption guide shows the <source type=...mediaOption=>
pattern works on real webOS HW (vendor-forked Chromium 79 strips the
suffix before canPlayType). Earlier 'unusable' claim was a misdiagnosis
of resume contamination from placeholder playback. Comment now reflects
docs and lists the exact syntax to use if/when we re-introduce it."
```

Expected: Commit succeeds.

---

## Task 3: Add `disableBackHistoryAPI: true` to `webos-info.json`

**Files:**
- Modify: `webos-info.json`

**Why:** LG's Back Button guide (https://webostv.developer.lge.com/develop/guides/back-button) documents that on webOS 6.0+ without `disableBackHistoryAPI: true`, the platform intercepts the Back key and shows a "Quit app?" popup BEFORE our keydown handler runs. jellyfin-webos sets this flag for the same reason. The Player.tsx Back handler (`keyCode === 461`) is currently being competed-with by the platform.

- [ ] **Step 1: Add the flag to `webos-info.json`**

Use Edit on `C:/Users/Duane/Desktop/Custom Stremio TV App/webos-info.json`:

old_string:
```json
  "resolution": "1920x1080",
  "uiRevision": 2
}
```

new_string:
```json
  "resolution": "1920x1080",
  "uiRevision": 2,
  "disableBackHistoryAPI": true
}
```

- [ ] **Step 2: Verify JSON is valid**

Run from `C:/Users/Duane/Desktop/Custom Stremio TV App`: `node -e "JSON.parse(require('fs').readFileSync('webos-info.json','utf8')); console.log('valid')"`

Expected: `valid` printed, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add webos-info.json
git commit -m "feat(webos): add disableBackHistoryAPI to prevent Back popup intercept

Without this flag, webOS 6.0+ shows a 'Quit app?' confirmation popup when
the user presses Back, BEFORE our Player keydown handler can run. Documented
at https://webostv.developer.lge.com/develop/guides/back-button. Matches
jellyfin-webos manifest. Lets our Player.tsx Back handler (keyCode 461)
close the player cleanly without platform-side interception."
```

Expected: Commit succeeds.

---

## Task 4: Verify Vite is downleveling `?.` and `??` for Chrome 79

**Files:**
- Inspect: `dist/assets/index-*.js` (the production bundle)
- Modify (only if needed): `vite.config.ts`

**Why:** Chrome 79 (Dec 2019) does NOT support optional chaining (`?.`) or nullish coalescing (`??`) — both shipped in Chrome 80 (Feb 2020). Our `vite.config.ts` sets `target: 'chrome79'`, which esbuild should respect and transpile both operators down. But if for some reason the bundle still contains raw `?.` / `??` in JS contexts, those would throw SyntaxError on the TV — silently, before any code runs. Worth a 30-second check.

This task is an investigation. If clean, no code change needed; just verification step + commit-skip.

- [ ] **Step 1: Build a fresh bundle**

Run from `C:/Users/Duane/Desktop/Custom Stremio TV App`: `npx vite build`

Expected: Build succeeds; `dist/assets/index-<hash>.js` exists.

- [ ] **Step 2: Find the bundle filename**

Run from `C:/Users/Duane/Desktop/Custom Stremio TV App`: `ls dist/assets/index-*.js`

Expected: One file matching the pattern. Note its exact name (e.g. `index-AbCdEf12.js`).

- [ ] **Step 3: Scan the bundle for raw optional chaining `?.` in JS contexts**

Use Grep on the bundle file:
- Pattern: `\)\?\.|\]\?\.|\w\?\.`  (matches `)?.`, `]?.`, or word-char followed by `?.` — narrow to actual operator usage, not strings)
- Path: the bundle file from Step 2
- output_mode: count

Expected: Either `0` matches (downlevel working — proceed to Step 4) OR `N>0` matches (downlevel broken — see Step 3a).

- [ ] **Step 3a: ONLY if Step 3 found matches — fix Vite config**

If matches found, the most likely cause is the esbuild target not being honored for our IIFE output. Add an explicit `esbuild.target` to `vite.config.ts`:

Use Edit on `vite.config.ts`:

old_string:
```ts
  build: {
    target: 'chrome79',
    cssTarget: 'chrome79',
    assetsInlineLimit: 0,
```

new_string:
```ts
  esbuild: {
    target: 'chrome79',
  },
  build: {
    target: 'chrome79',
    cssTarget: 'chrome79',
    assetsInlineLimit: 0,
```

Then re-run Step 1 + Step 3. Expected: 0 matches after re-build.

- [ ] **Step 4: Scan the bundle for raw nullish coalescing `??` in JS contexts**

Use Grep on the bundle file:
- Pattern: `\)\s*\?\?|\w\s*\?\?` (matches operator-usage `??`, not strings like "??" or comments)
- Path: the bundle file from Step 2
- output_mode: count

Expected: Either `0` matches (proceed to Step 5) OR `N>0` (apply Step 3a's fix if not already, re-test).

- [ ] **Step 5: Report findings**

If both scans returned 0: write a one-line comment in this plan checkbox: `Verified clean: 0 raw ?. or ?? in bundle <hash>`. No commit needed.

If a fix was applied in Step 3a: commit the vite.config.ts change:

```bash
git add vite.config.ts
git commit -m "build: explicit esbuild target chrome79 to ensure ?. and ?? downleveling

Chrome 79 (webOS 6.0's bundled Chromium) does NOT support optional chaining
or nullish coalescing — those landed in Chrome 80. Vite's build.target alone
wasn't downleveling them on our IIFE output; setting esbuild.target as well
forces full transformation."
```

Expected: Either no commit (clean) or one commit (fix applied).

---

## Task 5: Build, deploy, and verify Bundle A on TV

**Files:**
- No code changes; this is the deploy + verify step.

**Why:** All four prior tasks landed in source. We need a fresh IPK, install it via the SCP+luna-send workaround (ares-install is blocked by /media/developer/temp permissions on this TV), launch, and verify two specific behaviors: (a) the new bundle is running, (b) the Back button now closes the player without a webOS popup intercept.

- [ ] **Step 1: Fresh build**

Run from `C:/Users/Duane/Desktop/Custom Stremio TV App`: `npx vite build`

Expected: Build succeeds; new `dist/assets/index-<hash>.js` (hash differs from prior build because of source changes).

- [ ] **Step 2: Package IPK**

Run from `C:/Users/Duane/Desktop/Custom Stremio TV App`: `ares-package dist`

Expected: `Success` printed; `com.flixly.tv_0.1.0_all.ipk` exists in project root.

- [ ] **Step 3: Copy IPK to job dir for spaceless path**

Run: `cp "C:/Users/Duane/Desktop/Custom Stremio TV App/com.flixly.tv_0.1.0_all.ipk" "$CLAUDE_JOB_DIR/flixly.ipk"`

Expected: File copied (~140 KB).

- [ ] **Step 4: SCP the IPK to the TV's writable temp**

Run: `scp -i "$HOME/.ssh/webos_rsa_dec" -P 9922 -o StrictHostKeyChecking=no -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa "$CLAUDE_JOB_DIR/flixly.ipk" prisoner@10.0.0.238:/media/developer/temp/flixly.ipk`

Expected: SCP succeeds (no error; warning about post-quantum KEX is benign).

- [ ] **Step 5: Trigger install via luna-send, wait, verify bundle hash**

Run: `ssh -i "$HOME/.ssh/webos_rsa_dec" -p 9922 -o StrictHostKeyChecking=no -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa -o ConnectTimeout=8 -o ServerAliveInterval=3 prisoner@10.0.0.238 "(/usr/bin/luna-send-pub -n 8 -f luna://com.webos.appInstallService/dev/install '{\"id\":\"com.flixly.tv\",\"ipkUrl\":\"/media/developer/temp/flixly.ipk\",\"subscribe\":true}' &); sleep 12; grep -o 'index-[A-Za-z0-9]*\.js' /media/developer/apps/usr/palm/applications/com.flixly.tv/index.html"`

Expected: Output ends with `index-<NEWHASH>.js` matching the hash from Step 1.

- [ ] **Step 6: Launch the app**

Run: `ares-launch --device tv com.flixly.tv`

Expected: `Launched application com.flixly.tv`.

- [ ] **Step 7: Verify new bundle string changes via CDP**

Run from `C:/Users/Duane/Desktop/Custom Stremio TV App`: This requires a small CDP eval. Reuse `scripts/probe-state.mjs` patterns; or evaluate inline:

```bash
node -e "
import('http').then(({default: http}) => http.get('http://10.0.0.238:9998/json/list', r => {
  let d=''; r.on('data',c=>d+=c); r.on('end', async () => {
    const target = JSON.parse(d).find(t => t.url && t.url.includes('flixly'));
    const { WebSocket } = await import('ws');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
      ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: 'document.body.innerText.includes(\"DTS\") ? \"NEW_STRING_PRESENT\" : \"OLD_STRING_STILL_THERE\"', returnByValue: true } }));
    });
    ws.on('message', msg => {
      const m = JSON.parse(msg.toString());
      if (m.id === 2) { console.log(m.result?.result?.value); ws.close(); process.exit(0); }
    });
  });
});
"
```

Expected: This will only verify the string if the user happens to trigger the error screen. SKIP this step in the strict sense — true verification of Task 1 happens organically next time a codec-rejection error fires. Move on.

- [ ] **Step 8: Verify Back-button behavior (Task 3 manual verification)**

Manual: User opens any movie that plays, then presses Back on the LG remote.

Expected: Player closes immediately and returns to Detail screen. NO "Quit app?" popup appears before the close.

If popup appears: Task 3's change didn't take effect. Confirm `dist/appinfo.json` (which Vite copies from `webos-info.json`) contains `"disableBackHistoryAPI": true`. Rebuild + redeploy if missing.

- [ ] **Step 9: Final task list update**

Mark Tasks 1-5 as completed in the TaskList. Report Bundle A complete to the user.

No git commit for this task — deployment isn't a source change.

---

## Self-Review

**1. Spec coverage:**
- Misleading H.265 message → Task 1 ✓
- Outdated mediaOption comment → Task 2 ✓
- Missing disableBackHistoryAPI → Task 3 ✓
- Vite downleveling verification → Task 4 ✓
- Deploy + verify → Task 5 ✓

All four Bundle A items covered. Bundle B + C items explicitly listed as out of scope.

**2. Placeholder scan:**
No "TBD", "TODO", "fill in details", or vague "handle X" language. Every step has the actual content needed.

**3. Type consistency:**
No new types introduced. References to existing identifiers (`REASON_TEXT`, `state.kind`, `videoRef`, `keyCode === 461`, `disableBackHistoryAPI`, `target: 'chrome79'`, `esbuild.target`) are all verified against current source or LG docs.

**4. Risk assessment:**
- Task 1: pure string change. Zero behavioral risk.
- Task 2: pure comment change. Zero behavioral risk.
- Task 3: adds one JSON field. Risk: if `disableBackHistoryAPI` is mis-spelled or LG's manifest schema rejects it, the IPK might fail to install. Mitigated by Step 2 JSON-validity check; install failure is detectable in Step 5 luna-send output. The field name comes directly from LG's documented manifest schema.
- Task 4: read-only inspection by default. Modifies vite.config.ts only if a real problem is detected; the fix is the documented Vite/esbuild pattern.
- Task 5: deployment. Risk is install failure; recoverable via the same SCP+luna-send pattern we've used reliably.

No discovered issues. Plan ready for execution.
