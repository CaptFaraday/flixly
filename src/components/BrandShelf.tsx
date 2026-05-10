import type { Collection } from '../types';
import { BrandTile } from './BrandTile';

export function BrandShelf({ collections, onSelect }: { collections: Collection[]; onSelect: (c: Collection) => void }) {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, letterSpacing: '-0.2px' }}>Studios &amp; Brands</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
        {collections.slice(0, 7).map((c) => <BrandTile key={c.id} collection={c} onActivate={() => onSelect(c)} />)}
      </div>
    </div>
  );
}
