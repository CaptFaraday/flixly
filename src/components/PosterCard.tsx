import { useFocusable } from '../nav/useFocusable';
import type { Movie } from '../types';

export function PosterCard({ movie, onActivate }: { movie: Movie; onActivate: () => void }) {
  const { ref, ...rest } = useFocusable({ onActivate, id: `poster-${movie.imdb_id}` });
  return (
    <div ref={ref as any} {...rest} style={wrapperStyle}>
      <div style={innerStyle}>
        <img src={movie.poster} alt="" style={imgStyle} />
        <div style={infoOverlayStyle}>
          <div style={titleStyle}>{movie.title}</div>
          <div style={metaRowStyle}>
            <span style={yearStyle}>{movie.year}</span>
            {movie.scores.imdb != null && <span style={ratingStyle}>★ {movie.scores.imdb}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// 16:9 via padding-top hack — Chromium 79 lacks the aspect-ratio property.
const wrapperStyle: any = {
  position: 'relative',
  width: '100%',
  paddingTop: '56.25%',  // 9/16
};
const innerStyle: any = {
  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  borderRadius: 8, overflow: 'hidden',
  background: '#161616', cursor: 'pointer',
  border: '1px solid rgba(240,236,228,0.06)',
  boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.4)',
};
const imgStyle: any = {
  width: '100%', height: '100%', objectFit: 'cover',
  filter: 'saturate(0.92) contrast(1.06)',
};
const infoOverlayStyle: any = {
  position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
  background: 'linear-gradient(180deg, transparent 45%, rgba(0,0,0,0.45) 65%, rgba(0,0,0,0.95) 100%)',
  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
  padding: '10px 12px',
};
const titleStyle: any = {
  fontFamily: 'var(--font-display)',
  fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px',
  lineHeight: 1.1, color: 'var(--text)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const metaRowStyle: any = {
  display: 'flex', alignItems: 'center', marginTop: 6,
  fontSize: 14, letterSpacing: '0.6px',
};
const yearStyle: any = { color: 'rgba(240,236,228,0.7)', marginRight: 10 };  // margin instead of gap
const ratingStyle: any = { color: '#f5b34a', fontWeight: 700 };
