import { useFocusable } from '../nav/useFocusable';
import type { Movie } from '../types';

interface Props { movie: Movie; onPlay: () => void; onMoreInfo: () => void; }

export function Hero({ movie, onPlay, onMoreInfo }: Props) {
  const { ref: playRef, ...playBtn } = useFocusable({ onActivate: onPlay, id: 'hero-play' });
  const { ref: infoRef, ...infoBtn } = useFocusable({ onActivate: onMoreInfo, id: 'hero-info' });

  return (
    <div style={heroFrameStyle}>
      <div style={{ ...backdropStyle, backgroundImage: `url(${movie.backdrop})` }} />
      <div style={overlayStyle} />
      <div style={contentStyle}>
        <div style={pillStyle}>JUST HIT STREAMING</div>
        <h1 style={titleStyle}>{movie.title}</h1>
        <div style={metaStyle}>
          <span>{movie.year}</span>
          <span style={dotStyle}>·</span>
          <span>{Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</span>
          {movie.scores.rt != null && <>
            <span style={dotStyle}>·</span>
            <span style={{ color: 'var(--success)', fontWeight: 700 }}>{movie.scores.rt}% RT</span>
          </>}
          {movie.scores.imdb != null && <>
            <span style={dotStyle}>·</span>
            <span>★ {movie.scores.imdb}</span>
          </>}
        </div>
        <p style={descStyle}>{movie.overview}</p>
        <div style={{ display: 'flex', gap: 24, marginTop: 36 }}>
          <span ref={playRef as any} {...playBtn} style={btnPrimary}>▶ Play</span>
          <span ref={infoRef as any} {...infoBtn} style={btnSecondary}>ⓘ More Info</span>
        </div>
      </div>
    </div>
  );
}

// Hero is 60% tall: enough for big title + meta + description + buttons + breathing.
const heroFrameStyle: any = {
  position: 'absolute', top: 0, left: 0, right: 0, height: '60%',
  overflow: 'hidden',
};
const backdropStyle: any = {
  position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
  backgroundSize: 'cover', backgroundPosition: 'center 30%',
  filter: 'saturate(0.95) contrast(1.05)',
};
const overlayStyle: any = {
  position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
  background: [
    'linear-gradient(180deg, transparent 35%, rgba(10,10,10,0.7) 78%, var(--bg) 100%)',
    'linear-gradient(90deg, rgba(10,10,10,0.85) 0%, rgba(10,10,10,0.40) 40%, transparent 65%)',
    'radial-gradient(ellipse 55% 45% at 80% 30%, rgba(229, 9, 20, 0.10) 0%, transparent 65%)',
  ].join(', '),
};
const contentStyle: any = {
  position: 'absolute', bottom: '11%', left: '5%', maxWidth: '42%',
  zIndex: 5,
};
const pillStyle: any = {
  display: 'inline-block',
  background: 'rgba(229, 9, 20, 0.10)',
  border: '1px solid rgba(229,9,20,0.55)',
  color: '#ff6171',
  padding: '7px 18px',
  borderRadius: 999,
  fontSize: 13, fontWeight: 700, letterSpacing: '3.5px',
  marginBottom: 28, textTransform: 'uppercase',
};
// TV-scale title — needs to read from across the room. Disney+ and Netflix both go big.
const titleStyle: any = {
  fontFamily: 'var(--font-display)',
  fontSize: 116, fontWeight: 400,
  letterSpacing: '-3.5px', lineHeight: 0.94,
  margin: '0 0 22px 0',
  textShadow: '0 8px 32px rgba(0,0,0,0.65)',
};
const metaStyle: any = {
  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
  fontSize: 19, letterSpacing: '0.5px', marginBottom: 22,
  color: 'rgba(240,236,228,0.92)',
};
const dotStyle: any = { opacity: 0.45 };
const descStyle: any = {
  fontSize: 21, lineHeight: 1.5, marginBottom: 0,
  opacity: 0.88, maxWidth: '94%',
  textShadow: '0 2px 12px rgba(0,0,0,0.6)',
};
const btnBase: any = {
  padding: '16px 36px', borderRadius: 4,
  fontSize: 17, fontWeight: 700, letterSpacing: '0.5px',
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
};
const btnPrimary: any = {
  ...btnBase,
  background: 'var(--text)', color: 'var(--bg)',
  boxShadow: '0 4px 18px rgba(0,0,0,0.5)',
};
const btnSecondary: any = {
  ...btnBase,
  background: 'rgba(70,70,70,0.55)', color: 'var(--text)',
  border: '1px solid rgba(240,236,228,0.20)',
};
