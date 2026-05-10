import { useFocusable } from '../nav/useFocusable';
import type { Movie } from '../types';

export function PosterCard({ movie, onActivate }: { movie: Movie; onActivate: () => void }) {
  const { ref, ...rest } = useFocusable({ onActivate, id: `poster-${movie.imdb_id}` });
  return (
    <div ref={ref as any} {...rest} style={cardStyle}>
      <img src={movie.poster} alt="" style={imgStyle} />
      <div style={infoOverlayStyle}>
        <div style={titleStyle}>{movie.title}</div>
        <div style={metaRowStyle}>
          <span style={yearStyle}>{movie.year}</span>
          {movie.scores.imdb != null && <span style={ratingStyle}>★ {movie.scores.imdb}</span>}
        </div>
      </div>
    </div>
  );
}

const cardStyle: any = {
  aspectRatio: '16/9', borderRadius: 8,
  overflow: 'hidden', position: 'relative',
  background: '#161616', cursor: 'pointer',
  border: '1px solid rgba(240,236,228,0.06)',
  boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.4)',
};
const imgStyle: any = {
  width: '100%', height: '100%', objectFit: 'cover',
  filter: 'saturate(0.92) contrast(1.06)',
};
const infoOverlayStyle: any = {
  position: 'absolute', inset: 0,
  background: 'linear-gradient(180deg, transparent 45%, rgba(0,0,0,0.45) 65%, rgba(0,0,0,0.95) 100%)',
  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
  padding: '10px 12px',
};
const titleStyle: any = {
  fontFamily: 'var(--font-display)',
  fontSize: 16, fontWeight: 600, letterSpacing: '-0.3px',
  lineHeight: 1.1, color: 'var(--text)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const metaRowStyle: any = {
  display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
  fontSize: 11, letterSpacing: '0.6px',
};
const yearStyle: any = { color: 'rgba(240,236,228,0.7)' };
const ratingStyle: any = {
  color: '#f5b34a', fontWeight: 700,
};
