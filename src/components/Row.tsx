import type { Movie } from '../types';
import { PosterCard } from './PosterCard';

interface Props { title: string; subtitle?: string; items: Movie[]; onSelect: (m: Movie) => void; }

export function Row({ title, subtitle, items, onSelect }: Props) {
  const visible = items.slice(0, 7);
  return (
    <section>
      <header style={headerStyle}>
        {subtitle && <div style={eyebrowStyle}>{subtitle}</div>}
        <h2 style={titleStyle}>{title}</h2>
      </header>
      <div style={gridStyle}>
        {visible.map((m) => <PosterCard key={m.imdb_id} movie={m} onActivate={() => onSelect(m)} />)}
      </div>
    </section>
  );
}

// Spacing references the --s-N tokens defined in tokens.css.
// (--s-2 = 8, --s-3 = 16, --s-4 = 24, --s-5 = 32)

// Eyebrow (small caps subtitle) sits ABOVE the title with a tiny breathing room (--s-2).
// Title sits ABOVE the poster grid with a clear --s-4 of breathing room.
const headerStyle: any = {
  marginBottom: 'var(--s-4)',
};
const eyebrowStyle: any = {
  fontFamily: 'var(--font-ui)',
  fontSize: 14, fontWeight: 600,
  letterSpacing: '2px',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 'var(--s-2)',
};
const titleStyle: any = {
  margin: 0,
  fontFamily: 'var(--font-ui)',
  fontSize: 28, fontWeight: 700,
  letterSpacing: '-0.4px',
  color: 'var(--text)',
  lineHeight: 1.1,
};
const gridStyle: any = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 'var(--s-3)',
};
