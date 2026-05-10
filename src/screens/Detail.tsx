import { useFocusable } from '../nav/useFocusable';
import { TopNav } from '../components/TopNav';
import type { Movie } from '../types';
import { toggleWatchlist, watchlist } from '../state/store';

interface Props {
  movie: Movie;
  onPlay: () => void;
  onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void;
}

export function Detail({ movie, onPlay, onNavigate }: Props) {
  const playBtn = useFocusable({ id: 'detail-play', onActivate: onPlay });
  const watchBtn = useFocusable({ id: 'detail-watch', onActivate: () => toggleWatchlist(movie.imdb_id) });
  const inList = watchlist.value.includes(movie.imdb_id);
  const { ref: playRef, ...playRest } = playBtn;
  const { ref: watchRef, ...watchRest } = watchBtn;

  return (
    <>
      <TopNav current="home" onNavigate={onNavigate} />
      <div style={{ ...heroStyle, backgroundImage: `url(${movie.backdrop})` }}>
        <div style={overlayStyle} />
      </div>
      <div style={contentStyle}>
        <h1 style={titleStyle}>{movie.title}</h1>
        <div style={metaStyle}>
          <span>{movie.year}</span>
          <span>{Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</span>
          {movie.scores.rt != null && <span style={{ color: 'var(--success)', fontWeight: 700 }}>{movie.scores.rt}% RT</span>}
          {movie.director && <span>Dir. {movie.director}</span>}
        </div>
        <p style={{ fontSize: 18, lineHeight: 1.6, maxWidth: 720, marginBottom: 32 }}>{movie.overview}</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <span ref={playRef as any} {...playRest} style={btnPrimary}>▶ Play</span>
          <span ref={watchRef as any} {...watchRest} style={btnSecondary}>{inList ? '✓ In Watchlist' : '+ Watchlist'}</span>
        </div>
        {movie.cast.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>Cast</div>
            <div style={{ fontSize: 16 }}>{movie.cast.join(' · ')}</div>
          </div>
        )}
      </div>
    </>
  );
}

const heroStyle: any = { position: 'absolute', top: 0, left: 0, right: 0, height: '50%', backgroundSize: 'cover', backgroundPosition: 'center' };
const overlayStyle: any = { position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, var(--bg) 100%), linear-gradient(90deg, var(--bg) 0%, rgba(10,10,10,0.6) 40%, transparent 70%)' };
const contentStyle: any = { position: 'absolute', top: '40%', left: '5%', right: '5%' };
const titleStyle: any = { fontFamily: 'var(--font-display)', fontSize: 72, fontWeight: 400, letterSpacing: '-2px', lineHeight: 1, margin: '0 0 16px' };
const metaStyle: any = { display: 'flex', gap: 20, fontSize: 14, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 20, color: 'rgba(240,236,228,0.85)' };
const btnBase: any = { padding: '14px 28px', borderRadius: 4, fontSize: 14, fontWeight: 700, cursor: 'pointer' };
const btnPrimary: any = { ...btnBase, background: 'var(--text)', color: 'var(--bg)' };
const btnSecondary: any = { ...btnBase, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' };
