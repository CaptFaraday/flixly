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
        <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
          <span ref={playRef as any} {...playBtn} style={btnPrimary}>▶ Play</span>
          <span ref={infoRef as any} {...infoBtn} style={btnSecondary}>ⓘ More Info</span>
        </div>
      </div>
    </div>
  );
}

const heroFrameStyle: any = {
  position: 'absolute', top: 0, left: 0, right: 0, height: '56%',
  overflow: 'hidden',
};
const backdropStyle: any = {
  position: 'absolute', inset: 0,
  backgroundSize: 'cover', backgroundPosition: 'center 30%',
  // Mild cinematic grade — keep image alive but dial saturation a notch
  filter: 'saturate(0.92) contrast(1.05)',
};
const overlayStyle: any = {
  position: 'absolute', inset: 0,
  background: [
    // Bottom fade into the page background so hero merges into the rows below
    'linear-gradient(180deg, transparent 40%, rgba(10,10,10,0.65) 80%, var(--bg) 100%)',
    // Left dark wash — only as far as the text needs (tighter so the image breathes)
    'linear-gradient(90deg, rgba(10,10,10,0.82) 0%, rgba(10,10,10,0.35) 38%, transparent 60%)',
    // Subtle red ambient near the upper-right
    'radial-gradient(ellipse 55% 45% at 80% 30%, rgba(229, 9, 20, 0.10) 0%, transparent 65%)',
  ].join(', '),
};
const contentStyle: any = {
  position: 'absolute', bottom: '10%', left: '4%', maxWidth: '44%',
  zIndex: 5,
};
const pillStyle: any = {
  display: 'inline-block',
  background: 'rgba(229, 9, 20, 0.08)',
  border: '1px solid rgba(229,9,20,0.55)',
  color: '#ff6171',
  padding: '6px 16px',
  borderRadius: 999,
  fontSize: 11, fontWeight: 700, letterSpacing: '3px',
  marginBottom: 22, textTransform: 'uppercase',
};
const titleStyle: any = {
  fontFamily: 'var(--font-display)',
  fontSize: 76, fontWeight: 400,
  letterSpacing: '-2.5px', lineHeight: 0.95,
  margin: '0 0 16px 0',
  textShadow: '0 6px 24px rgba(0,0,0,0.6)',
};
const metaStyle: any = {
  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
  fontSize: 15, letterSpacing: '0.5px', marginBottom: 18,
  color: 'rgba(240,236,228,0.92)',
};
const dotStyle: any = { opacity: 0.5 };
const descStyle: any = {
  fontSize: 17, lineHeight: 1.55, marginBottom: 0,
  opacity: 0.88, maxWidth: '92%',
  textShadow: '0 2px 10px rgba(0,0,0,0.6)',
};
const btnBase: any = {
  padding: '14px 32px', borderRadius: 4,
  fontSize: 15, fontWeight: 700, letterSpacing: '0.5px',
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
};
const btnPrimary: any = {
  ...btnBase,
  background: 'var(--text)', color: 'var(--bg)',
};
const btnSecondary: any = {
  ...btnBase,
  background: 'rgba(80,80,80,0.55)', color: 'var(--text)',
  border: '1px solid rgba(240,236,228,0.18)',
};
