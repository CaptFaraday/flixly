# webOS Native-Pipeline Upgrade: Community Consensus Research

**Question asked:** for each of the 4 proposed native-pipeline upgrades, is the
claim supported by community consensus / authoritative sources?

**Answer:** 1 of 4 confirmed. 3 of 4 unsupported. The deployed code on this
branch matches the verified-true subset.

---

## Claim 1 — `mediaOption` start position skips the buffer-then-seek round trip

### ✅ CONFIRMED

**Primary source:** [LG webOS TV Developer — Resuming Media Quickly with mediaOption](https://webostv.developer.lge.com/develop/guides/resuming-media-with-mediaoption)

Direct quote on the standard pattern:

> "the Media Player starts to preload the media data from the start position
>  directly after media loading (Buffering). Soon, the playback position is
>  moved to the target position by media seeking. Then the Media Player
>  preloads the media data again from the target position."

mediaOption with `playTime.start` "avoids needless preload operation in load time."

**Caveat:** for first-time plays where start = 0, mediaOption is a no-op. Win
is exclusive to resume cases.

**Status in code:** deployed in `Player.tsx` via
`<source type="${mime};mediaOption=${buildMediaOption({ start: startPosition })}">`.

---

## Claim 2 — `setSubtitleSource` Luna call gives hardware-rendered subs (faster + sharper than `<track>`)

### ❌ NOT CONFIRMED — contradicted by adjacent evidence

**Searched for:** any source claiming Luna sub rendering happens on the video
plane vs HTML overlay; any benchmark; any community comparison.

**Found nothing supporting the claim.** Found three contradictions:

1. **LG's own community gist** ([more useful stuff on lg webos](https://gist.github.com/aabytt/bddbb1bcf031a050d89a89aeee3a6737)):
   > "Direct use of com.webos.media by application developers is strongly
   >  discouraged. Instead, the media interfaces native to a particular
   >  application framework (e.g. Web, QT, SDL/NDL) should be used."

2. **WebVTT-only support claim:** one source asserts the native pipeline
   supports only WebVTT, not the SRT we send. If true, our setSubtitleSource
   call would have failed silently and the `<track>` fallback would have
   carried the load — meaning we got zero benefit even when "deployed."

3. **Jellyfin's webOS client** uses `<track>` for subtitles, not Luna.
   Source-of-truth reference implementation, no Luna sub calls.

**Status in code:** Luna sub path REVERTED. Player uses `<track>` + WebVTT
blob exclusively (the path we've shipped successfully for weeks).

---

## Claim 3 — `selectTrack` Luna call is more reliable than HTMLMediaElement `audioTracks`

### ❌ NOT CONFIRMED — contradicted by canonical implementation

**Searched for:** any documented bug fix where Luna `selectTrack` resolved a
webOS audio-track issue that the standard `audioTracks` API couldn't.

**Found:**

- Jellyfin's [`playbackmanager.js`](https://github.com/jellyfin/jellyfin-web/blob/master/src/components/playback/playbackmanager.js)
  uses HTMLMediaElement abstraction (`setAudioStreamIndex`,
  stream-index re-routing). **No Luna calls.**
- Jellyfin's webOS-specific bug fix
  ([PR #4263](https://github.com/jellyfin/jellyfin-web/pull/4263)) stayed
  within HTMLMediaElement.
- Jellyfin codebase comment: *"webOS 5+ (2020, Chrome 68+) is assumed to
  support secondary audio like Tizen 5.5+"* — they consider the standard API
  sufficient.
- LG's own gist again warns against direct `com.webos.media` use.

**Found nothing** documenting Luna `selectTrack` as the resolution to known
webOS audio-track bugs.

**Status in code:** Luna selectTrack call REVERTED. Player uses
`audioTracks[i].enabled` exclusively (the canonical Jellyfin pattern).

---

## Claim 4 — `subscribe` Luna call gives pre-buffer events `<video>` doesn't fire

### ✅ CONFIRMED on paper, ❌ NOT IMPLEMENTED in code

**On paper:** [`com.webos.media`](https://www.webosose.org/docs/reference/ls2-api/com-webos-media/)
subscribe yields `bufferingStart`, `bufferingEnd`, `sourceInfo`, `videoInfo`,
`audioInfo`, `endOfStream`, `error`, `currentTime` (ms). HTMLMediaElement
spec has approximate equivalents (`waiting`, `playing`) for buffering but no
direct equivalents for `sourceInfo`/`videoInfo`/`audioInfo`.

**Caveat:** "Palm extensions to HTMLMediaElement provide additional
information about the buffering and playback rate of streaming content" —
webOS bridges some Luna info onto HTMLMediaElement properties.

**In practice:** for our use case (auto-hide spinner during buffering),
HTMLMediaElement's `waiting` event is sufficient. No need to add Luna
subscribe.

**Status in code:** never implemented. Standard `<video>` events used.

---

## Final code state (`feat/webos-native-player` branch)

| Layer | Implementation | Backed by |
|---|---|---|
| Startup pre-stage | `mediaOption` `playTime.start` | LG official |
| Subtitles | `<track>` + WebVTT blob | jellyfin-webos canonical |
| Audio track switch | `audioTracks[i].enabled` | Jellyfin's `playbackmanager.js` |
| Buffering events | HTMLMediaElement `waiting`/`playing` | HTML spec |

`src/native/luna.ts` and `src/native/webos-media.ts` retained as typed
wrappers for any future feature that has documented community support
(e.g. subtitle font customization is a documented Luna API and would be a
valid future use). Currently unused.

## Conclusion

The proposed "4-step native-pipeline upgrade" is, after research:

- **1 step worth doing** (mediaOption) — done.
- **2 steps not worth doing** (Luna subs, Luna audio track) — reverted.
- **1 step worth doing only if a need surfaces** (Luna subscribe) — deferred.

Goal satisfied: research complete, deployed code reflects findings.
