import { useFocusable } from '../nav/useFocusable';
import type { Movie } from '../types';

interface Props { movie: Movie; onPlay: () => void; onMoreInfo: () => void; }

export function Hero({ movie, onPlay, onMoreInfo }: Props) {
  const { ref: playRef, ...playBtn } = useFocusable({ onActivate: onPlay, id: 'hero-play' });
  const { ref: infoRef, ...infoBtn } = useFocusable({ onActivate: onMoreInfo, id: 'hero-info' });

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
          <span ref={playRef as any} {...playBtn} style={btnPrimary}>▶ Play</span>
          <span ref={infoRef as any} {...infoBtn} style={btnSecondary}>ⓘ More Info</span>
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
