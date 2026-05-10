import './Row.css';
import type { Movie } from '../types';
import { PosterCard } from './PosterCard';

interface Props { id: string; title: string; subtitle?: string; items: Movie[]; onSelect: (m: Movie) => void; }

export function Row({ id, title, subtitle, items, onSelect }: Props) {
  const visible = items.slice(0, 6);
  return (
    <section>
      <header className="row__header">
        {subtitle && <div className="row__eyebrow">{subtitle}</div>}
        <h2 className="row__title">{title}</h2>
      </header>
      <div className="row__grid">
        {visible.map((m) => <PosterCard key={m.imdb_id} rowId={id} movie={m} onActivate={() => onSelect(m)} />)}
      </div>
    </section>
  );
}
