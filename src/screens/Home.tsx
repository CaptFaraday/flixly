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
        <main style={mainStyle}>
          <div style={errorStyle}>
            <h2 style={errorTitleStyle}>Couldn't load rows</h2>
            <p style={errorBodyStyle}>{error}</p>
            <p style={errorHintStyle}>Check your network and relaunch the app.</p>
          </div>
        </main>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <TopNav current="home" onNavigate={onNavigate} />
        <main style={mainStyle}>
          <HeroSkeleton />
          <div style={belowHeroStyle}>
            <div style={sectionGapStyle}><BrandShelfSkeleton /></div>
            <RowSkeleton />
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
      <main style={mainStyle}>
        {heroMovie && <Hero movie={heroMovie} onPlay={() => onSelectMovie(heroMovie)} onMoreInfo={() => onSelectMovie(heroMovie)} />}
        <div style={belowHeroStyle}>
          {collections.length > 0 && (
            <div style={sectionGapStyle}><BrandShelf collections={collections} onSelect={onSelectCollection} /></div>
          )}
          {rows.map((row, i) => (
            <div key={row.id} style={i < rows.length - 1 ? sectionGapStyle : undefined}>
              <Row title={row.title} subtitle={row.subtitle} items={row.items} onSelect={onSelectMovie} />
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

const mainStyle: any = {
  position: 'relative',
};
// Vertical rhythm uses --s-N tokens. --s-7 (64) between sections, --s-5 (32)
// between hero and first section. Horizontal padding 5% is the TV-safe-zone margin.
// Flex gap unsupported in Chromium 79 — use marginBottom on each child instead.
const belowHeroStyle: any = {
  padding: '0 5% var(--s-7)',
  marginTop: 'var(--s-5)',
  position: 'relative',
  zIndex: 4,
};
const sectionGapStyle: any = {
  marginBottom: 'var(--s-7)',
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
  fontSize: 18, opacity: 0.55,
};
