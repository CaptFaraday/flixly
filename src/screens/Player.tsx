import './Player.css';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Movie, RDStream } from '../types';
import { settings, recordResume, resumePositions } from '../state/store';
import { useFocusable } from '../nav/useFocusable';
import { ensureCapabilities } from '../sources/capabilities';
import { fetchTorrentioCandidates } from '../sources/torrentio';
import { deleteTorrentByHash, checkCached } from '../sources/torbox';
import { rankAll, type PickReason } from '../sources/picker';
import type { StreamCandidate } from '../types';
import { preflightSubtitles, fetchSubtitlesForMovie, fetchSubtitlesByHash, fetchSubtitlesByImdb, pickBestSubForRip, scoreSubMatch } from '../subtitles/opensubtitles';
import { srtUrlToVttBlobUrl } from '../subtitles/render';
import { computeMoviehash } from '../subtitles/moviehash';
import { awaitCanPlay } from './awaitCanPlay';
import { useStreamingSource } from '../streaming/useStreamingSource';

type State =
  | { kind: 'preparing'; step: string }
  | { kind: 'playing'; stream: RDStream; index: number; total: number }
  | { kind: 'error'; reason: PickReason | 'rd_error' | 'no_streams' | 'unknown'; detail?: string };

const REASON_TEXT: Record<PickReason | 'rd_error' | 'no_streams' | 'unknown', string> = {
  no_cached: 'No cached versions on Real-Debrid right now. Try again later.',
  no_compatible_codec: 'All cached versions use a codec your TV can\'t play. Most often this is DTS or TrueHD audio (LG dropped DTS licensing on 2020+ models). Try a different title.',
  no_compatible_audio: 'All cached versions use an audio codec your TV can\'t play (e.g. DTS or TrueHD). Try a different title.',
  no_acceptable_language: 'No cached version with the right audio language. Try changing Audio Language in Settings.',
  no_acceptable_bitrate: 'All cached versions are too high-bitrate for your network right now. Try again later.',
  no_subtitles: 'No subtitles available for this title in your preferred language. Try switching Audio Language in Settings.',
  no_synced_subtitles: 'No cached version of this movie has matching subtitles available. Disable "Require subtitles" in Settings to play with best-effort subs that may drift.',
  no_title_match: 'Sources found, but none of them appear to actually be this movie (Torrentio metadata may be off). Try again later.',
  rd_error: 'Real-Debrid request failed. Check your API key in Settings.',
  no_streams: 'No sources found for this title. Try again later or check back when the title is more widely available.',
  unknown: 'Something went wrong starting playback. Try relaunching the app.',
};

export function Player({ movie, onClose }: { movie: Movie; onClose: () => void }) {
  const [state, setState] = useState<State>({ kind: 'preparing', step: 'starting' });
  const [picks, setPicks] = useState<StreamCandidate[]>([]);
  const [pickIndex, setPickIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Track per-attempt failures so the final error screen can summarize them.
  const failuresRef = useRef<Array<{ index: number; filename: string; detail: string }>>([]);

  // MSE pipeline. createStreamingSource owns the HTTP layer; the <video>
  // element reads from a blob: MediaSource URL. This sidesteps the webOS
  // native pipeline's idle-socket-death bug entirely (no long-lived HTTP
  // connection for the native layer to mismanage). Resume position is
  // passed in as startTimeSeconds so the pipeline begins at the nearest
  // keyframe ≤ the resume target — the video element naturally starts
  // playback at the first appended segment's timestamp, no separate
  // currentTime seek required.
  const playingUrl = state.kind === 'playing' ? state.stream.url : '';
  // Capture the resume position ONCE per movie at mount. The resume-tracking
  // effect below ticks resumePositions every 10 s during playback; if we
  // read it reactively here, the streaming source would tear down and
  // re-create itself every 10 s, restarting playback from the new keyframe
  // (the "MGM logo on a loop" symptom). The ref captures the value at the
  // first render for this movie and stays stable across the whole play.
  const startTimeSecondsRef = useRef<number | undefined>(undefined);
  if (startTimeSecondsRef.current === undefined) {
    const r = resumePositions.value[movie.imdb_id]?.position_seconds;
    startTimeSecondsRef.current = r && r > 5 ? r : -1; // -1 sentinel "computed, no resume"
  }
  const startTimeSeconds = startTimeSecondsRef.current === -1 ? undefined : startTimeSecondsRef.current;
  const mseUrl = useStreamingSource(playingUrl, { startTimeSeconds, videoRef });

  // Stage 1: fetch candidates + rank. Runs once per movie.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = settings.value;
        if (!s.torbox_api_key && !s.rd_api_key) {
          setState({ kind: 'error', reason: 'rd_error', detail: 'Set your TorBox (or Real-Debrid) API key in Settings first.' });
          return;
        }

        const t0 = performance.now();
        const tStage: Record<string, number> = {};

        setState({ kind: 'preparing', step: 'probing' });
        const caps = await ensureCapabilities();
        if (cancelled) return;
        tStage.capabilities = Math.round(performance.now() - t0);

        setState({ kind: 'preparing', step: 'fetching sources' });
        const tFetchStart = performance.now();
        const [rawCandidates, subLangs] = await Promise.all([
          fetchTorrentioCandidates(movie.imdb_id, { torbox: s.torbox_api_key, realdebrid: s.rd_api_key }),
          preflightSubtitles(movie.imdb_id),
        ]);
        tStage.fetchCandidatesAndSubLangs = Math.round(performance.now() - tFetchStart);
        if (cancelled) return;
        if (rawCandidates.length === 0) { setState({ kind: 'error', reason: 'no_streams' }); return; }

        // Real-time cache verification against TorBox. Torrentio's
        // `cachedonly=true` filter relies on its own scraper DB which may
        // be hours/days stale; TorBox's `/checkcached` endpoint is the
        // ground truth ("which hashes would stream right now without
        // queueing"). Filtering here eliminates the 30-sec "downloading
        // to debrid" placeholder at its source, AND prevents zombie queue
        // entries because we never trigger createtorrent on uncached hashes.
        // Bonus: TorBox returns real per-file sizes, more accurate than
        // Torrentio's videoSize (which is whole-torrent size) for picker
        // decisions.
        let candidates = rawCandidates;
        if (s.torbox_api_key) {
          const tCheckStart = performance.now();
          const cached = await checkCached(rawCandidates.map((c) => c.hash), s.torbox_api_key);
          if (cancelled) return;
          tStage.checkCached = Math.round(performance.now() - tCheckStart);
          if (cached.size > 0) {
            candidates = rawCandidates
              .filter((c) => cached.has(c.hash.toLowerCase()))
              .map((c) => {
                const entry = cached.get(c.hash.toLowerCase());
                const realBytes = entry?.bestVideoFile?.size;
                return realBytes && realBytes > 0 ? { ...c, bytes: realBytes } : c;
              });
          }
          // If cached.size === 0 the API call failed (or nothing was cached);
          // fall through to unfiltered candidates and let multi-candidate
          // fallback do its job — better than an error screen on transient
          // TorBox issues.
          if (candidates.length === 0) {
            setState({ kind: 'error', reason: 'no_cached', detail: 'No candidates are actually cached on TorBox right now.' });
            return;
          }
        }

        const subsAvailable = subLangs.includes(s.audio_language) || subLangs.includes('en');
        const result = rankAll(
          candidates,
          candidates.map((c) => c.hash),
          caps, s, subLangs,
          movie.runtime / 60,
          subsAvailable,
          movie.title,
          movie.year,
        );
        if (result.kind === 'rejected') { setState({ kind: 'error', reason: result.reason }); return; }

        // Filter out anything that lost its directUrl (defensive — Torrentio
        // with RD config consistently returns one, but this protects us if
        // something changes upstream).
        let playable = result.candidates.filter((c) => !!c.directUrl);
        if (playable.length === 0) { setState({ kind: 'error', reason: 'no_streams', detail: 'No resolver URLs in Torrentio response.' }); return; }

        // Sub-aware filtering: when the user has require_subtitles ON, only
        // keep candidates for which at least one OpenSubtitles entry passes
        // the strict-match scorer (edit-tag and source agreement). This
        // turns "best pixels, hope subs sync" into "best pixels GIVEN that
        // sync is verified" — eliminates the REMASTERED-rip-with-original-
        // edit-subs class of bug entirely. If no candidate has matching
        // subs, surface a clear error so the user can disable the
        // requirement and fall back to best-effort matching.
        if (s.require_subtitles) {
          const tSubFilterStart = performance.now();
          const rich = await fetchSubtitlesByImdb(movie.imdb_id, 'eng');
          if (cancelled) return;
          tStage.subAwareFiltering = Math.round(performance.now() - tSubFilterStart);
          if (rich.length > 0) {
            const SUB_MATCH_THRESHOLD = 50;
            const subbed = playable.filter((c) =>
              rich.some((sub) => scoreSubMatch(c.filename, sub) >= SUB_MATCH_THRESHOLD),
            );
            if (subbed.length === 0) {
              setState({ kind: 'error', reason: 'no_synced_subtitles' });
              return;
            }
            playable = subbed;
          }
          // If rich.length === 0 (OS has nothing for this movie), fall through
          // and let the user have at least the best stream — the existing
          // require_subtitles check earlier in the picker would have already
          // caught the totally-no-subs case.
        }

        failuresRef.current = [];
        tStage.totalStage1 = Math.round(performance.now() - t0);
        try {
          (window as any).__flixlyStartupTimes = {
            movie: movie.imdb_id,
            ts: Date.now(),
            stages: tStage,
            playableCount: playable.length,
          };
        } catch { /* */ }
        setPicks(playable);
        setPickIndex(0);
      } catch (e) {
        if (cancelled) return;
        const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        try {
          (window as any).__flixlyLastError = { reason: 'rd_error', detail, ts: Date.now(), movie: movie.imdb_id, stage: 'fetch' };
          localStorage.setItem('flixly:lastPlayerError', JSON.stringify({ reason: 'rd_error', detail, ts: Date.now(), movie: movie.imdb_id, stage: 'fetch' }));
        } catch { /* best-effort */ }
        console.error('[flixly:player] fetch failed:', detail, e);
        setState({ kind: 'error', reason: 'rd_error', detail });
      }
    })();
    return () => { cancelled = true; };
  }, [movie.imdb_id]);

  // Stage 2: pick the current attempt and present it to <video>. Re-runs
  // whenever pickIndex advances (after a failure).
  useEffect(() => {
    if (picks.length === 0) return;
    if (pickIndex >= picks.length) {
      const detail = failuresRef.current.map((f) => `[${f.index}] ${f.filename}: ${f.detail}`).join(' | ');
      try {
        (window as any).__flixlyLastError = { reason: 'rd_error', detail, ts: Date.now(), movie: movie.imdb_id, stage: 'playback', triedCount: picks.length };
      } catch { /* best-effort */ }
      console.error('[flixly:player] all candidates failed:', failuresRef.current);
      setState({ kind: 'error', reason: 'rd_error', detail: `Tried ${picks.length} cached streams; all failed.` });
      return;
    }
    const c = picks[pickIndex];
    // Mark when we hand the URL to <video> so we can measure how long the
    // browser's video pipeline takes (decoder spin-up + initial buffer).
    try { (window as any).__flixlyVideoSrcSetAt = performance.now(); } catch { /* */ }
    setState({ kind: 'playing', stream: { url: c.directUrl!, filename: c.filename, bytes: c.bytes }, index: pickIndex, total: picks.length });
    // Mirror current attempt info so we can see in real time what's playing
    // (or being attempted), even before any failures occur.
    try {
      (window as any).__flixlyCurrentAttempt = {
        movie: movie.imdb_id,
        index: pickIndex,
        total: picks.length,
        filename: c.filename,
        bytes: c.bytes,
      };
    } catch { /* */ }
  }, [picks, pickIndex, movie.imdb_id]);

  // Stage 3: detect playback failures and advance to the next pick.
  //
  // Two failure modes we react to:
  //
  // (a) Hard error — <video> fires `error`. Usually a 4xx on the resolver,
  //     decode failure, or unsupported source. Easy to detect.
  //
  // (b) "Soft" failure: RD's copyright placeholder. When a file is DMCA'd,
  //     RD silently serves a ~30-second copyright takedown video instead
  //     of returning an error. <video> plays it cleanly — no error event.
  //     We catch it on `loadedmetadata` by comparing the file duration to
  //     the TMDb runtime: a real movie is always >= 50% of the expected
  //     length. Threshold is intentionally permissive — extras / behind-
  //     the-scenes shorts on the same magnet would be filtered out anyway
  //     by the picker (mainstream rips put the feature first), and a real
  //     90-min film vs a 30-sec placeholder is a 180× ratio, not a
  //     borderline call.
  //
  // RD's cache can be stale even with Torrentio's `cachedonly=true`
  // (Torrentio's check ran hours ago, the file got pulled between then
  // and now). Without auto-advance, the user sees an error for a single
  // broken stream while several working ones sit unused right behind it.
  useEffect(() => {
    if (state.kind !== 'playing') return;
    const v = videoRef.current;
    if (!v) return;
    const advance = (detail: string) => {
      const failed = picks[state.index];
      console.warn('[flixly:player] candidate', state.index, 'failed:', detail, failed?.filename);
      failuresRef.current.push({ index: state.index, filename: failed?.filename ?? '?', detail });
      // Mirror to window so we can read the full failure log via CDP without
      // waiting for the all-failed error screen.
      try {
        (window as any).__flixlyLastFailures = {
          movie: movie.imdb_id,
          totalCandidates: picks.length,
          failures: failuresRef.current.slice(),
          ts: Date.now(),
        };
      } catch { /* */ }
      // Clean up the TorBox queue entry this candidate created. Without
      // this, the user's 3 active slots fill with zombies and TorBox
      // starts serving the "torrent is being downloaded" placeholder for
      // every new playback. Fire-and-forget — must not block fallback.
      const apiKey = settings.value.torbox_api_key;
      if (apiKey && failed?.hash) {
        deleteTorrentByHash(failed.hash, apiKey).catch(() => { /* swallowed inside */ });
      }
      setPickIndex((i) => i + 1);
    };
    const onError = () => {
      const code = v.error?.code;
      const codeName = code === 1 ? 'ABORTED' : code === 2 ? 'NETWORK' : code === 3 ? 'DECODE' : code === 4 ? 'SRC_NOT_SUPPORTED' : 'UNKNOWN';
      advance(`MediaError ${codeName} (${code}) ${v.error?.message ?? ''}`.trim());
    };
    const onLoadedMetadata = () => {
      const expectedSec = movie.runtime * 60;
      const actualSec = v.duration;
      if (!isFinite(actualSec) || actualSec <= 0) return;
      // Either: dramatically shorter than expected runtime, OR (when we
      // don't know the runtime) shorter than 5 minutes outright.
      const tooShort =
        (expectedSec > 0 && actualSec < expectedSec * 0.5) ||
        (expectedSec === 0 && actualSec < 300);
      if (tooShort) {
        advance(`duration ${Math.round(actualSec)}s vs expected ${expectedSec}s — likely RD copyright placeholder`);
      }
    };
    // Hang timer: a dead CDN that accepts the TCP handshake but never sends
    // bytes will spin forever without firing error or loadedmetadata. Arm
    // on loadstart, clear on either resolution event, advance if it fires.
    let hangTimer: number | null = null;
    const HANG_TIMEOUT_MS = 20_000;
    const armHang = () => {
      if (hangTimer != null) window.clearTimeout(hangTimer);
      hangTimer = window.setTimeout(() => {
        hangTimer = null;
        advance(`hang: no metadata in ${HANG_TIMEOUT_MS / 1000}s`);
      }, HANG_TIMEOUT_MS);
    };
    const clearHang = () => {
      if (hangTimer != null) { window.clearTimeout(hangTimer); hangTimer = null; }
    };
    const onLoadStartForHang = () => armHang();
    const onLoadedMetadataClearHang = () => clearHang();
    v.addEventListener('error', onError);
    v.addEventListener('loadedmetadata', onLoadedMetadata);
    v.addEventListener('loadstart', onLoadStartForHang);
    v.addEventListener('loadedmetadata', onLoadedMetadataClearHang);
    v.addEventListener('error', clearHang);
    return () => {
      clearHang();
      v.removeEventListener('error', onError);
      v.removeEventListener('loadedmetadata', onLoadedMetadata);
      v.removeEventListener('loadstart', onLoadStartForHang);
      v.removeEventListener('loadedmetadata', onLoadedMetadataClearHang);
      v.removeEventListener('error', clearHang);
    };
  }, [state, picks, movie.runtime]);

  // Resume tracking — periodic + final flush on unmount
  useEffect(() => {
    if (state.kind !== 'playing') return;
    const v = videoRef.current;
    if (!v) return;
    const flush = () => {
      if (v.currentTime > 0 && v.duration > 0 && v.currentTime < v.duration * 0.95) {
        // Don't record resume from placeholder playback. If the loaded media
        // is dramatically shorter than the expected runtime (e.g. a 30-sec
        // "torrent is being downloaded" notice instead of a 109-min film),
        // saving "you watched 25s of a 30s file" pollutes the resume store
        // and worse, makes useMediaOption=true on the next candidate render —
        // which switches <video src> to <source> and the new candidate's URL
        // is never loaded.
        const expectedSec = movie.runtime * 60;
        if (expectedSec > 0 && v.duration < expectedSec * 0.5) return;
        recordResume(movie.imdb_id, v.currentTime, v.duration || movie.runtime * 60, movie);
      }
    };
    const id = setInterval(flush, 10_000);
    return () => {
      clearInterval(id);
      flush();
    };
  }, [state.kind, movie.imdb_id, movie.runtime]);

  // After React swaps state.stream.url, force the video element to actually
  // pick up the new source. Setting the `src` attribute to a new value
  // triggers an auto-reload, but switching between `<video src>` and
  // `<video><source>` forms (which we do for resume vs fresh plays) does
  // NOT — the element keeps showing the previously loaded media. Without
  // this, multi-candidate fallback advances state but the user keeps
  // seeing the old (placeholder) source forever.
  useEffect(() => {
    if (state.kind !== 'playing') return;
    const v = videoRef.current;
    if (!v) return;
    v.load();
  }, [state.kind === 'playing' ? state.stream.url : '']);

  // Apply resume position when metadata loads, then start playback when
  // the browser's media pipeline reports it can play. Per LG webOS docs and
  // Smart-TV performance guidance, the `autoPlay` attribute starts playback
  // before the decoder is fully ready and can stutter on cold starts. The
  // recommended pattern is preload="auto" + canplay → manual v.play().
  useEffect(() => {
    const v = videoRef.current;
    if (!v || state.kind !== 'playing') return;
    const onLoadedMeta = () => {
      // With the MSE pipeline, the video buffer starts at the keyframe <=
      // requested resume position (not at 0). currentTime=0 is outside the
      // buffered range, so the video element can't decode anything and shows
      // black. Bump the playhead into the buffered range: prefer the
      // captured resume position if it's inside the buffer; otherwise the
      // first buffered timestamp.
      const target = startTimeSecondsRef.current && startTimeSecondsRef.current > 5
        ? startTimeSecondsRef.current
        : (v.buffered.length > 0 ? v.buffered.start(0) : 0);
      if (target > 0.001 && v.buffered.length > 0) {
        const safe = Math.max(v.buffered.start(0), Math.min(target, v.buffered.end(0) - 0.1));
        v.currentTime = safe;
      }
      // Kick off playback on loadedmetadata too. The canplay handler races
      // with seek state transitions when a candidate switch happens — if
      // canplay fires while the element is mid-seek the v.play() call gets
      // suppressed, leaving the video paused on a black frame with
      // buffered data sitting unused. Calling play() here as well is
      // idempotent on an already-playing element and resolves the race.
      v.play().catch(() => { /* user-gesture / transient errors fine */ });
      try {
        const start = (window as any).__flixlyVideoSrcSetAt;
        if (typeof start === 'number') {
          (window as any).__flixlyVideoTimings = { ...(window as any).__flixlyVideoTimings, loadedMetadataMs: Math.round(performance.now() - start) };
        }
      } catch { /* */ }
    };
    const onCanPlay = () => {
      v.play().catch(() => {/* user-gesture or transient errors are fine here */});
      try {
        const start = (window as any).__flixlyVideoSrcSetAt;
        if (typeof start === 'number') {
          (window as any).__flixlyVideoTimings = { ...(window as any).__flixlyVideoTimings, canPlayMs: Math.round(performance.now() - start) };
        }
      } catch { /* */ }
    };
    v.addEventListener('loadedmetadata', onLoadedMeta);
    v.addEventListener('canplay', onCanPlay);
    return () => {
      v.removeEventListener('loadedmetadata', onLoadedMeta);
      v.removeEventListener('canplay', onCanPlay);
    };
  }, [state.kind, movie.imdb_id]);

  // Multi-audio track selection: when the video has multiple audio tracks,
  // enable the one matching the user's preferred language. The standard
  // HTML5 videoElement.audioTracks API works on webOS 6.0 (verified on the
  // NANO75 with a 4K HEVC + AC-3 multi-audio MKV — the .enabled toggle
  // actually changes which track outputs sound). MKVs rip with arbitrary
  // default tracks (often Italian or director's commentary); without this
  // fix the user gets whatever the muxer happened to set.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || state.kind !== 'playing') return;
    const onLoaded = () => {
      // audioTracks is in the HTML5 Audio/Video Tracks API spec but isn't in
      // TypeScript's default DOM lib (it's marked unstable). Cast to access
      // it; on webOS 6 it's well-supported per LG's developer forum and our
      // own empirical tests.
      const tracks: { length: number; [i: number]: { language: string; enabled: boolean } } | undefined =
        (v as unknown as { audioTracks?: any }).audioTracks;
      if (!tracks || tracks.length <= 1) return;
      const want = settings.value.audio_language;
      let target = -1;
      for (let i = 0; i < tracks.length; i++) {
        const lang = (tracks[i].language || '').toLowerCase();
        if (lang === want || lang.startsWith(want)) { target = i; break; }
      }
      if (target < 0 && want !== 'en') {
        for (let i = 0; i < tracks.length; i++) {
          const lang = (tracks[i].language || '').toLowerCase();
          if (lang === 'en' || lang.startsWith('en')) { target = i; break; }
        }
      }
      if (target < 0) return;
      // HTMLMediaElement audioTracks API only. We previously also called
      // Luna selectTrack defensively, but Jellyfin (the canonical webOS app)
      // uses HTMLMediaElement exclusively, LG discourages direct Luna calls,
      // and we have no evidence Luna is more reliable for our case. If
      // audio-track-selection bugs surface in practice, the right move is
      // to mirror Jellyfin's approach (re-routing the stream with a new
      // audio index), not to add Luna.
      for (let i = 0; i < tracks.length; i++) tracks[i].enabled = (i === target);
    };
    v.addEventListener('loadedmetadata', onLoaded);
    return () => v.removeEventListener('loadedmetadata', onLoaded);
  }, [state.kind, movie.imdb_id]);

  // Subtitle track — fetch SRT, convert to VTT, attach as Blob URL (CORS-safe)
  useEffect(() => {
    if (state.kind !== 'playing') return;
    const v = videoRef.current;
    if (!v) return;
    let blobUrl: string | null = null;
    let trackEl: HTMLTrackElement | null = null;
    let cancelled = false;
    (async () => {
      try {
        // Wait for the video element to be playable before touching the same
        // CDN URL. computeMoviehash issues HEAD + 2 Range GETs against
        // state.stream.url; if those fire while <video> is still pulling the
        // initial MKV preamble, they share the TorBox edge's per-token
        // bandwidth cap (measured ~10 Mbps) and inflate time-to-first-frame
        // by several seconds. Deferring until canplay is user-invisible —
        // subs only render after the video starts anyway.
        await awaitCanPlay(v);
        if (cancelled) return;
        // Prefer hash-matched subs: compute the OpenSubtitles moviehash from
        // the file's first/last 64KB and query OS by that hash. Subs uploaded
        // with this hash were authored against this exact rip, so timing
        // and cuts will be correct. If the lookup returns nothing (the rip
        // is uncommon and no one uploaded matching subs for it), fall back
        // to imdb-id-based lookup, which finds *some* English subs but they
        // may be authored for a different cut/framerate.
        const diag: any = { movie: movie.imdb_id, ts: Date.now() };
        let chosen: { url: string; lang: string } | undefined;
        const hashResult = await computeMoviehash(state.stream.url);
        if (cancelled) return;
        diag.hashComputed = !!hashResult;
        diag.hash = hashResult?.hash;
        diag.size = hashResult?.size;
        if (hashResult) {
          const hashed = await fetchSubtitlesByHash(hashResult.hash, hashResult.size, 'eng');
          if (cancelled) return;
          diag.hashMatchedCount = hashed.length;
          if (hashed.length > 0) {
            chosen = hashed[0];
            diag.subSource = 'hash-matched';
          }
        }
        if (!chosen) {
          // Smart fallback: query OS REST API with full metadata, score
          // each sub by token overlap with the playing rip's filename
          // (release group, source, resolution, codec). Picks the sub
          // most likely to be authored for THIS rip even when no hash
          // match exists.
          const rich = await fetchSubtitlesByImdb(movie.imdb_id, 'eng');
          if (cancelled) return;
          diag.richSubsCount = rich.length;
          const best = pickBestSubForRip(rich, state.stream.filename);
          if (best) {
            chosen = { url: best.url, lang: best.lang };
            diag.subSource = 'rich-imdb-best-match';
            diag.matchedReleaseName = best.releaseName;
            diag.matchedFilename = best.fileName;
          }
          // Last-ditch: the v3 addon has different/more subs sometimes.
          if (!chosen) {
            const tracks = await fetchSubtitlesForMovie(movie.imdb_id);
            if (cancelled) return;
            diag.legacyAddonCount = tracks.length;
            chosen = tracks.find((t) => t.lang === 'eng' || t.lang === 'en');
            diag.subSource = chosen ? 'v3-addon-first-match' : 'none';
          }
        }
        diag.chosenUrl = chosen?.url;
        try { (window as any).__flixlyLastSubs = diag; } catch { /* */ }
        if (!chosen) return;

        // HTML <track> + WebVTT blob path. We previously tried Luna
        // setSubtitleSource for hardware rendering, but verification against
        // community consensus came up empty: LG's own gist explicitly
        // discourages direct com.webos.media use, the canonical webOS app
        // (jellyfin-webos) uses <track> not Luna for subtitles, and the
        // native pipeline reportedly only accepts WebVTT (we send SRT).
        // Sticking with the proven path.
        blobUrl = await srtUrlToVttBlobUrl(chosen.url);
        if (cancelled) { URL.revokeObjectURL(blobUrl); return; }
        trackEl = document.createElement('track');
        trackEl.kind = 'subtitles';
        trackEl.label = 'English';
        trackEl.srclang = 'en';
        trackEl.src = blobUrl;
        trackEl.default = true;
        v.appendChild(trackEl);
        // Force the track to show. The HTML spec says `default` should
        // auto-enable, but Chromium 79 on WebOS is inconsistent — sometimes
        // the track loads but its `mode` stays 'disabled', meaning no subs
        // render. Explicitly setting 'showing' is the workaround documented
        // for this class of platforms (Tizen, webOS, older smart-TV browsers).
        // Wait one tick so the browser has registered the new track.
        setTimeout(() => {
          if (cancelled) return;
          const tts = v.textTracks;
          if (tts && tts.length > 0) {
            const last = tts[tts.length - 1];
            if (last && last.mode !== 'showing') last.mode = 'showing';
          }
        }, 0);
      } catch {
        /* fail silently — subtitles are best-effort */
      }
    })();
    return () => {
      cancelled = true;
      if (trackEl && v.contains(trackEl)) v.removeChild(trackEl);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  // CRITICAL: include the playing stream URL in deps. The multi-candidate
  // fallback advances state.stream.url between candidates without changing
  // state.kind. Without the URL in deps, this effect captures the FIRST
  // candidate's URL, computes its hash, finds a sub for that file (often
  // a 1MB junk placeholder), and attaches the wrong sub to whatever
  // candidate eventually plays. Was the cause of "Meet the Robinsons" bug
  // where size showed 1.18MB while the actual rip was 3.3GB.
  }, [state.kind, movie.imdb_id, state.kind === 'playing' ? state.stream.url : '']);

  // Esc/back closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.keyCode === 461 || e.keyCode === 27) { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (state.kind === 'preparing') {
    return <div className="player__overlay" data-screen="player"><div className="player__spinner-text">{state.step}…</div></div>;
  }
  if (state.kind === 'error') {
    return (
      <div className="player__overlay" data-screen="player">
        <h2 className="player__error-title">Can't play right now</h2>
        <p className="player__error-body">{REASON_TEXT[state.reason]}{state.detail && ` — ${state.detail}`}</p>
        <button onClick={onClose} className="player__error-btn">Back</button>
      </div>
    );
  }
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

  return (
    <>
      <video
        ref={videoRef}
        src={mseUrl ?? undefined}
        className="player__video"
        data-screen="player"
        preload="auto"
      />

      <PlayerControls videoRef={videoRef} title={movie.title} onClose={onClose} />
    </>
  );
}

const HIDE_AFTER_MS = 4000;

function PlayerControls({ videoRef, title, onClose }: {
  videoRef: { current: HTMLVideoElement | null };
  title: string;
  onClose: () => void;
}) {
  const [paused, setPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shown, setShown] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  // Auto-hide after inactivity. Re-arm on every interaction so the overlay
  // sticks around as long as the user is doing something.
  const armHide = () => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setShown(false), HIDE_AFTER_MS);
  };
  const wake = () => {
    setShown(true);
    armHide();
  };

  // Mirror the underlying <video> state into Preact state so the overlay
  // re-renders in sync with playback.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    const onDur = () => setDuration(v.duration || 0);
    const onPlay = () => { setPaused(false); armHide(); };
    const onPause = () => {
      setPaused(true);
      // Always show the overlay when paused — the user is mid-decision; don't
      // hide their controls.
      setShown(true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    setPaused(v.paused);
    setCurrentTime(v.currentTime);
    setDuration(v.duration || 0);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any keypress wakes the overlay. Registered in CAPTURE phase because the
  // nav input listener in input.ts also uses capture and calls
  // stopPropagation() on every D-pad key it recognizes — bubble-phase
  // listeners would never see arrow keys at all (the bug we hit: number
  // keys woke the overlay because the nav handler ignores them, but D-pad
  // didn't because the handler consumed it).
  useEffect(() => {
    const onKey = () => wake();
    window.addEventListener('keydown', onKey, true);
    armHide();
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => { /* user-gesture errors are fine here */ });
    else v.pause();
  };
  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + delta));
    armHide();
  };

  if (!shown) return null;
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  return (
    <div className="player__controls">
      <div className="player__title-bar">
        <h1 className="player__movie-title">{title}</h1>
      </div>
      <div className="player__bottom">
        <div className="player__progress-track">
          <div className="player__progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="player__time-row">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        <div className="player__buttons">
          <ControlButton id="player-back" label="◀ Back" onActivate={onClose} />
          <ControlButton id="player-skip-back" label="⏪ 10s" onActivate={() => seekBy(-10)} />
          <ControlButton id="player-play" label={paused ? '▶ Play' : '⏸ Pause'} onActivate={togglePlay} autofocus />
          <ControlButton id="player-skip-fwd" label="10s ⏩" onActivate={() => seekBy(10)} />
        </div>
      </div>
    </div>
  );
}

function ControlButton({ id, label, onActivate, autofocus }: { id: string; label: string; onActivate: () => void; autofocus?: boolean }) {
  const { ref, ...rest } = useFocusable({ id, onActivate, autofocus });
  return <span ref={ref as any} {...rest} className="player__btn">{label}</span>;
}

function formatTime(s: number): string {
  if (!isFinite(s) || s <= 0) return '0:00';
  const total = Math.floor(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
