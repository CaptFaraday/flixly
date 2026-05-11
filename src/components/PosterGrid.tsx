import './PosterGrid.css';
import { PosterCard } from './PosterCard';
import type { Movie } from '../types';

interface Props {
  items: Movie[];
  idPrefix: string;
  onSelect: (m: Movie) => void;
  emptyText?: string;
  progressMap?: Record<string, number>;
}

export function PosterGrid({ items, idPrefix, onSelect, emptyText, progressMap }: Props) {
  if (items.length === 0) {
    return <div className="poster-grid__empty">{emptyText ?? 'Nothing here yet.'}</div>;
  }
  return (
    <div className="poster-grid">
      {items.map((m) => (
        <PosterCard
          key={m.imdb_id || `${m.tmdb_id}`}
          movie={m}
          rowId={idPrefix}
          onActivate={() => onSelect(m)}
          progress={progressMap?.[m.imdb_id]}
        />
      ))}
    </div>
  );
}
