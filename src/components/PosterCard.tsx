import { useFocusable } from '../nav/useFocusable';
import type { Movie } from '../types';

export function PosterCard({ movie, onActivate }: { movie: Movie; onActivate: () => void }) {
  const { ref, ...rest } = useFocusable({ onActivate, id: `poster-${movie.imdb_id}` });
  return (
    <div ref={ref as any} {...rest} style={cardStyle}>
      <img src={movie.poster} alt="" style={imgStyle} />
      <div style={infoStyle}>
        <div style={titleStyle}>{movie.title}</div>
        <div style={metaStyle}>{movie.year} · ★ {movie.scores.imdb ?? '—'}</div>
      </div>
    </div>
  );
}

const cardStyle: any = { aspectRatio: '16/9', borderRadius: 4, overflow: 'hidden', position: 'relative', background: '#1a1a1a', cursor: 'pointer' };
const imgStyle: any = { width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.85) saturate(0.85) contrast(1.05)' };
const infoStyle: any = { position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 35%, rgba(0,0,0,0.92) 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '8px 11px' };
const titleStyle: any = { fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, letterSpacing: '-0.3px', lineHeight: 1.05 };
const metaStyle: any = { fontSize: 9.5, opacity: 0.7, letterSpacing: '1.2px', marginTop: 3, textTransform: 'uppercase' };
