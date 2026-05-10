import './BrandShelf.css';
import type { Collection } from '../types';
import { BrandTile } from './BrandTile';

export function BrandShelf({ collections, onSelect }: { collections: Collection[]; onSelect: (c: Collection) => void }) {
  return (
    <section>
      <header className="brand-shelf__header">
        <h2 className="brand-shelf__title">Studios &amp; Brands</h2>
      </header>
      <div className="brand-shelf__grid">
        {collections.slice(0, 7).map((c) => <BrandTile key={c.id} collection={c} onActivate={() => onSelect(c)} />)}
      </div>
    </section>
  );
}
