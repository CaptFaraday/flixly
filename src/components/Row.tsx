import type { Movie } from '../types';
import { PosterCard } from './PosterCard';

interface Props { title: string; subtitle?: string; items: Movie[]; onSelect: (m: Movie) => void; }

export function Row({ title, subtitle, items, onSelect }: Props) {
  return (
    <div>
      <div style={labelStyle}>{title}{subtitle && <span style={subStyle}> · {subtitle}</span>}</div>
      <div style={gridStyle}>
        {items.slice(0, 7).map((m) => <PosterCard key={m.imdb_id} movie={m} onActivate={() => onSelect(m)} />)}
      </div>
    </div>
  );
}

const labelStyle: any = { fontSize: 14, fontWeight: 700, marginBottom: 10, letterSpacing: '-0.2px' };
const subStyle: any = { fontWeight: 400, opacity: 0.6, marginLeft: 8 };
const gridStyle: any = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 };
