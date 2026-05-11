import './PosterCard.css';
import { useFocusable } from '../nav/useFocusable';
import type { Movie } from '../types';

interface Props {
  movie: Movie;
  rowId: string;
  onActivate: () => void;
  progress?: number;  // 0..1 — when set, renders a resume bar at the bottom
}

export function PosterCard({ movie, rowId, onActivate, progress }: Props) {
  const { ref, ...rest } = useFocusable({ onActivate, id: `poster-${rowId}-${movie.imdb_id}` });
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
        {progress != null && progress > 0 && (
          <div className="poster__progress-track">
            <div className="poster__progress-bar" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
