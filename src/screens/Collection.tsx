import './Collection.css';
import { TopNav } from '../components/TopNav';
import { PosterGrid } from '../components/PosterGrid';
import { BRAND_CONFIG } from '../data/brands';
import type { Collection as CollectionT, Movie } from '../types';

interface Props {
  collection: CollectionT;
  onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void;
  onSelectMovie: (m: Movie) => void;
}

export function Collection({ collection, onNavigate, onSelectMovie }: Props) {
  const cfg = BRAND_CONFIG[collection.id];
  const bg = cfg?.bg ?? '#161616';

  return (
    <>
      <TopNav current="home" onNavigate={onNavigate} />
      <main className="collection" data-screen="collection">
        <header
          className="collection__header"
          style={{ background: `radial-gradient(ellipse 90% 80% at 50% 30%, rgba(255,255,255,0.08) 0%, transparent 60%), ${bg}` }}
        >
          {cfg?.logo ? (
            <img
              src={cfg.logo}
              alt={collection.title}
              className="collection__logo"
              style={cfg.logoFilter ? { filter: cfg.logoFilter } : undefined}
            />
          ) : (
            <h1 className="collection__title-fallback">{collection.title}</h1>
          )}
        </header>

        <div className="collection__body">
          <h2 className="collection__films-label">Films</h2>
          <PosterGrid
            items={collection.items}
            idPrefix={`collection-${collection.id}`}
            onSelect={onSelectMovie}
            emptyText="No films available right now. Check back tomorrow."
            autofocusFirst
          />
        </div>
      </main>
    </>
  );
}
