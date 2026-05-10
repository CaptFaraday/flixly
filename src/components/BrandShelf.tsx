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

// Matches Row's header — same vertical rhythm so all rows feel consistent.
const headerStyle: any = {
  marginBottom: 'var(--s-4)',
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
