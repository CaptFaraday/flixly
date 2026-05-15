import './Search.css';
import { useEffect, useRef, useState } from 'preact/hooks';
import { TopNav } from '../components/TopNav';
import { Keyboard } from '../components/Keyboard';
import { PosterGrid } from '../components/PosterGrid';
import { searchMovies, hydrateMovie } from '../data/tmdb';
import type { Movie } from '../types';

interface Props {
  onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void;
  onSelectMovie: (m: Movie) => void;
}

const DEBOUNCE_MS = 250;

export function Search({ onNavigate, onSelectMovie }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(false);

  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const myId = ++requestIdRef.current;
    debounceRef.current = window.setTimeout(async () => {
      try {
        const r = await searchMovies(query);
        if (myId === requestIdRef.current) {
          setResults(r);
          setLoading(false);
        }
      } catch (e) {
        if (myId === requestIdRef.current) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => { if (debounceRef.current != null) window.clearTimeout(debounceRef.current); };
  }, [query]);

  // DISABLED — same reason as Home/Library/Collection. Was likely
  // contributing to TorBox rate-limiting / slot saturation that broke
  // playback. Search results now show without availability badges
  // until the user opens Detail for a specific result.

  const handleSelectResult = async (m: Movie) => {
    if (hydrating) return;
    setHydrating(true);
    try {
      const full = await hydrateMovie(m);
      if (!full) {
        setError(`Couldn't open — TMDb doesn't have an IMDb mapping for "${m.title}".`);
        return;
      }
      onSelectMovie(full);
    } finally {
      setHydrating(false);
    }
  };

  return (
    <>
      <TopNav current="search" onNavigate={onNavigate} />
      <main className="search" data-screen="search">
        <aside className="search__pane">
          <div className="search__query">{query || <span className="search__placeholder">Type to search</span>}</div>
          <Keyboard
            onChar={(c) => setQuery((q) => q + c.toLowerCase())}
            onBackspace={() => setQuery((q) => q.slice(0, -1))}
            onClear={() => setQuery('')}
            onSpace={() => setQuery((q) => q + ' ')}
          />
        </aside>
        <section className="search__results">
          {renderResultsState({ query, loading, error, results, onSelect: handleSelectResult, hydrating })}
        </section>
      </main>
    </>
  );
}

function renderResultsState({ query, loading, error, results, onSelect, hydrating }: {
  query: string; loading: boolean; error: string | null; results: Movie[]; onSelect: (m: Movie) => void; hydrating: boolean;
}) {
  if (error) return <div className="search__hint search__hint--error">{error}</div>;
  if (hydrating) return <div className="search__hint">Opening…</div>;
  if (!query.trim()) return <div className="search__hint">Start typing to search TMDb's library.</div>;
  if (loading) return <div className="search__hint">Searching…</div>;
  return (
    <PosterGrid
      items={results}
      idPrefix="search"
      onSelect={onSelect}
      emptyText={`Nothing found for "${query}".`}
    />
  );
}
