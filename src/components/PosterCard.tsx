import './PosterCard.css';
import { useFocusable } from '../nav/useFocusable';
import type { Movie } from '../types';

export function PosterCard({ movie, onActivate }: { movie: Movie; onActivate: () => void }) {
  const { ref, ...rest } = useFocusable({ onActivate, id: `poster-${movie.imdb_id}` });
  return (
    <div ref={ref as any} {...rest} className="poster">
      <div className="poster__inner">
        <img src={movie.poster} alt="" className="poster__img" />
        <div className="poster__info">
          <div className="poster__title">{movie.title}</div>
          <div className="poster__meta">
            <span className="poster__year">{movie.year}</span>
            {movie.scores.imdb != null && <span className="poster__rating">★ {movie.scores.imdb}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
