import type { Movie } from '../types';
import { PosterCard } from './PosterCard';

interface Props { title: string; subtitle?: string; items: Movie[]; onSelect: (m: Movie) => void; }

export function Row({ title, subtitle, items, onSelect }: Props) {
  const visible = items.slice(0, 7);
  return (
    <section>
      <header style={headerStyle}>
        <h2 style={titleStyle}>{title}</h2>
        {subtitle && <span style={subStyle}>{subtitle}</span>}
      </header>
      <div style={gridStyle}>
        {visible.map((m) => <PosterCard key={m.imdb_id} movie={m} onActivate={() => onSelect(m)} />)}
      </div>
    </section>
  );
}

const headerStyle: any = {
  display: 'flex', alignItems: 'baseline', gap: 18, marginBottom: 18,
};
const titleStyle: any = {
  margin: 0, fontFamily: 'var(--font-ui)',
  fontSize: 24, fontWeight: 700, letterSpacing: '-0.3px',
  color: 'var(--text)',
};
const subStyle: any = {
  fontSize: 13, fontWeight: 500, letterSpacing: '1.4px',
  textTransform: 'uppercase', color: 'var(--text-muted)',
};
const gridStyle: any = {
  display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 18,
};
