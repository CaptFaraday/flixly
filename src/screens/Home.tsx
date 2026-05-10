import './Home.css';
import { useEffect, useState } from 'preact/hooks';
import { TopNav } from '../components/TopNav';
import { Hero } from '../components/Hero';
import { Row } from '../components/Row';
import { BrandShelf } from '../components/BrandShelf';
import { HeroSkeleton } from '../components/HeroSkeleton';
import { RowSkeleton } from '../components/RowSkeleton';
import { BrandShelfSkeleton } from '../components/BrandShelfSkeleton';
import { fetchRows } from '../data/rows';
import type { RowsFile, Movie, Collection, Row as RowType } from '../types';

interface Props {
  onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void;
  onSelectMovie: (m: Movie) => void;
  onSelectCollection: (c: Collection) => void;
}

export function Home({ onNavigate, onSelectMovie, onSelectCollection }: Props) {
  const [data, setData] = useState<RowsFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRows({ onUpdate: setData })
      .then(({ data }) => setData(data))
      .catch((e) => setError(String(e instanceof Error ? e.message : e)));
  }, []);

  if (error && !data) {
    return (
      <>
        <TopNav current="home" onNavigate={onNavigate} />
        <main className="home">
          <div className="home__error">
            <h2 className="home__error-title">Couldn't load rows</h2>
            <p className="home__error-body">{error}</p>
            <p className="home__error-hint">Check your network and relaunch the app.</p>
          </div>
        </main>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <TopNav current="home" onNavigate={onNavigate} />
        <main className="home">
          <HeroSkeleton />
          <div className="home__below-hero">
            <div className="home__section"><BrandShelfSkeleton /></div>
            <div className="home__section"><RowSkeleton /></div>
          </div>
        </main>
      </>
    );
  }

  const rows = data.shelves.filter((s): s is RowType => s.display === 'row');
  const collections = data.shelves.filter((s): s is Collection => s.display === 'collection');
  const heroMovie = rows[0]?.items[0];

  return (
    <>
      <TopNav current="home" onNavigate={onNavigate} />
      <main className="home">
        {heroMovie && <Hero movie={heroMovie} onPlay={() => onSelectMovie(heroMovie)} onMoreInfo={() => onSelectMovie(heroMovie)} />}
        <div className="home__below-hero">
          {collections.length > 0 && (
            <div className="home__section"><BrandShelf collections={collections} onSelect={onSelectCollection} /></div>
          )}
          {rows.map((row) => (
            <div key={row.id} className="home__section">
              <Row id={row.id} title={row.title} subtitle={row.subtitle} items={row.items} onSelect={onSelectMovie} />
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
