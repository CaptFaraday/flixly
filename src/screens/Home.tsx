import { useEffect, useState } from 'preact/hooks';
import { TopNav } from '../components/TopNav';
import { Hero } from '../components/Hero';
import { Row } from '../components/Row';
import { BrandShelf } from '../components/BrandShelf';
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
    fetchRows().then(setData).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div style={errorStyle}>Couldn't load rows: {error}</div>;
  if (!data) return <div style={loadingStyle}>Loading…</div>;

  const rows = data.shelves.filter((s): s is RowType => s.display === 'row');
  const collections = data.shelves.filter((s): s is Collection => s.display === 'collection');
  const heroMovie = rows[0]?.items[0];

  return (
    <>
      <TopNav current="home" onNavigate={onNavigate} />
      {heroMovie && <Hero movie={heroMovie} onPlay={() => onSelectMovie(heroMovie)} onMoreInfo={() => onSelectMovie(heroMovie)} />}
      <div style={belowHeroStyle}>
        {collections.length > 0 && <BrandShelf collections={collections} onSelect={onSelectCollection} />}
        {rows.map((row) => (
          <Row key={row.id} title={row.title} subtitle={row.subtitle} items={row.items} onSelect={onSelectMovie} />
        ))}
      </div>
    </>
  );
}

const belowHeroStyle: any = {
  position: 'absolute', top: '57%', left: '5%', right: '5%', bottom: '4%',
  display: 'flex', flexDirection: 'column', gap: 44,
  zIndex: 4,
};
const loadingStyle: any = { padding: 64, opacity: 0.6 };
const errorStyle: any = { padding: 64, color: 'var(--accent)' };
