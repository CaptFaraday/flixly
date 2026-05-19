import './Row.css';
import type { Movie } from '../types';
import { PosterCard } from './PosterCard';

interface Props { id: string; title: string; subtitle?: string; items: Movie[]; onSelect: (m: Movie) => void; }

export function Row({ id, title, subtitle, items, onSelect }: Props) {
  // Render all items. Off-screen posters are reached via D-pad Right;
  // spatial.ts calls scrollIntoView({inline:'nearest'}) on focus change
  // so the row scrolls horizontally to bring the next poster into view.
  return (
    <section>
      <header className="row__header">
        {subtitle && <div className="row__eyebrow">{subtitle}</div>}
        <h2 className="row__title">{title}</h2>
      </header>
      <div className="row__grid">
        {items.map((m) => <PosterCard key={m.imdb_id} rowId={id} movie={m} onActivate={() => onSelect(m)} />)}
      </div>
    </section>
  );
}
