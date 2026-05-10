import { useEffect, useRef, useState } from 'preact/hooks';
import type { Movie, RDStream } from '../types';
import { settings, recordResume, resumePositions } from '../state/store';
import { ensureCapabilities } from '../sources/capabilities';
import { fetchTorrentioCandidates } from '../sources/torrentio';
import { RDClient } from '../sources/realdebrid';
import { rankAndPick, type PickReason } from '../sources/picker';
import { preflightSubtitles, fetchSubtitlesForMovie } from '../subtitles/opensubtitles';
import { srtUrlToVttBlobUrl } from '../subtitles/render';

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

  // Resume tracking — periodic + final flush on unmount
  useEffect(() => {
    if (state.kind !== 'playing') return;
    const v = videoRef.current;
    if (!v) return;
    const flush = () => {
      if (v.currentTime > 0 && v.duration > 0 && v.currentTime < v.duration * 0.95) {
        recordResume(movie.imdb_id, v.currentTime, v.duration || movie.runtime * 60);
      }
    };
    const id = setInterval(flush, 10_000);
    return () => {
      clearInterval(id);
      flush();
    };
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
        const tracks = await fetchSubtitlesForMovie(movie.imdb_id);
        const en = tracks.find((t) => t.lang === 'eng' || t.lang === 'en');
        if (!en || cancelled) return;
        blobUrl = await srtUrlToVttBlobUrl(en.url);
        if (cancelled) { URL.revokeObjectURL(blobUrl); return; }
        trackEl = document.createElement('track');
        trackEl.kind = 'subtitles';
        trackEl.label = 'English';
        trackEl.srclang = 'en';
        trackEl.src = blobUrl;
        trackEl.default = true;
        v.appendChild(trackEl);
      } catch {
        /* fail silently — subtitles are best-effort */
      }
    })();
    return () => {
      cancelled = true;
      if (trackEl && v.contains(trackEl)) v.removeChild(trackEl);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
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
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, width: '100vw', height: '100vh', background: '#000' }}
      controls
      autoPlay
      crossOrigin="anonymous"
    />
  );
}

const overlayStyle: any = { position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 64, color: 'var(--text)' };
const spinnerTextStyle: any = { fontSize: 16, opacity: 0.6, letterSpacing: '1.5px', textTransform: 'uppercase' };
const errorBtnStyle: any = { marginTop: 24, padding: '12px 24px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' };
