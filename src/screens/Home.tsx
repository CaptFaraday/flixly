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
        <div style={errorStyle}>
          <h2 style={errorTitleStyle}>Couldn't load rows</h2>
          <p style={errorBodyStyle}>{error}</p>
          <p style={errorHintStyle}>Check your network and relaunch the app.</p>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <TopNav current="home" onNavigate={onNavigate} />
        <HeroSkeleton />
        <div style={belowHeroStyle}>
          <BrandShelfSkeleton />
          <RowSkeleton />
        </div>
      </>
    );
  }

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
const errorStyle: any = {
  padding: '120px 64px', maxWidth: 700,
};
const errorTitleStyle: any = {
  fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 400,
  margin: '0 0 16px', color: 'var(--text)',
};
const errorBodyStyle: any = {
  fontSize: 18, opacity: 0.8, marginBottom: 12,
};
const errorHintStyle: any = {
  fontSize: 16, opacity: 0.55,
};
