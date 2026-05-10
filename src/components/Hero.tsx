import './Hero.css';
import { useFocusable } from '../nav/useFocusable';
import type { Movie } from '../types';

interface Props { movie: Movie; onPlay: () => void; onMoreInfo: () => void; }

export function Hero({ movie, onPlay, onMoreInfo }: Props) {
  const { ref: playRef, ...playBtn } = useFocusable({ onActivate: onPlay, id: 'hero-play' });
  const { ref: infoRef, ...infoBtn } = useFocusable({ onActivate: onMoreInfo, id: 'hero-info' });

  return (
    <div className="hero">
      <div className="hero__backdrop" style={{ backgroundImage: `url(${movie.backdrop})` }} />
      <div className="hero__overlay" />
      <div className="hero__content">
        <div className="hero__pill">JUST HIT STREAMING</div>
        <h1 className="hero__title">{movie.title}</h1>
        <div className="hero__meta">
          <span>{movie.year}</span>
          <span className="hero__dot">·</span>
          <span>{Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</span>
          {movie.scores.rt != null && <>
            <span className="hero__dot">·</span>
            <span className="hero__rt">{movie.scores.rt}% RT</span>
          </>}
          {movie.scores.imdb != null && <>
            <span className="hero__dot">·</span>
            <span>★ {movie.scores.imdb}</span>
          </>}
        </div>
        <p className="hero__desc">{movie.overview}</p>
        <div className="hero__btns">
          <span ref={playRef as any} {...playBtn} className="hero__btn hero__btn--primary">▶ Play</span>
          <span ref={infoRef as any} {...infoBtn} className="hero__btn hero__btn--secondary">ⓘ More Info</span>
        </div>
      </div>
    </div>
  );
}
