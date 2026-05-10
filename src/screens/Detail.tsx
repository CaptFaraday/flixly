import './Detail.css';
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
  const playBtn = useFocusable({ id: 'detail-play', onActivate: onPlay, autofocus: true });
  const watchBtn = useFocusable({ id: 'detail-watch', onActivate: () => toggleWatchlist(movie.imdb_id) });
  const inList = watchlist.value.includes(movie.imdb_id);
  const { ref: playRef, ...playRest } = playBtn;
  const { ref: watchRef, ...watchRest } = watchBtn;

  return (
    <>
      <TopNav current="home" onNavigate={onNavigate} />
      <div className="detail__hero" style={{ backgroundImage: `url(${movie.backdrop})` }}>
        <div className="detail__overlay" />
      </div>
      <div className="detail__content">
        <h1 className="detail__title">{movie.title}</h1>
        <div className="detail__meta">
          <span className="detail__meta-item">{movie.year}</span>
          <span className="detail__meta-item">{Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</span>
          {movie.scores.rt != null && <span className="detail__meta-item detail__meta-item--rt">{movie.scores.rt}% RT</span>}
          {movie.director && <span className="detail__meta-item">Dir. {movie.director}</span>}
        </div>
        <p className="detail__overview">{movie.overview}</p>
        <div className="detail__btns">
          <span ref={playRef as any} {...playRest} className="detail__btn detail__btn--primary">▶ Play</span>
          <span ref={watchRef as any} {...watchRest} className="detail__btn detail__btn--secondary">{inList ? '✓ In Watchlist' : '+ Watchlist'}</span>
        </div>
        {movie.cast.length > 0 && (
          <div className="detail__cast">
            <div className="detail__cast-label">Cast</div>
            <div className="detail__cast-names">{movie.cast.join(' · ')}</div>
          </div>
        )}
      </div>
    </>
  );
}
