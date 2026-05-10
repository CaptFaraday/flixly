import type { Collection } from '../types';
import { BrandTile } from './BrandTile';

export function BrandShelf({ collections, onSelect }: { collections: Collection[]; onSelect: (c: Collection) => void }) {
  return (
    <section>
      <header style={headerStyle}>
        <h2 style={titleStyle}>Studios &amp; Brands</h2>
      </header>
      <div style={gridStyle}>
        {collections.slice(0, 7).map((c) => <BrandTile key={c.id} collection={c} onActivate={() => onSelect(c)} />)}
      </div>
    </section>
  );
}

const headerStyle: any = { marginBottom: 14 };
const titleStyle: any = {
  margin: 0, fontFamily: 'var(--font-ui)',
  fontSize: 18, fontWeight: 700, letterSpacing: '-0.2px',
  color: 'var(--text)',
};
const gridStyle: any = {
  display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 14,
};
