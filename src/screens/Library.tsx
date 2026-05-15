import './Library.css';
import { useEffect, useState } from 'preact/hooks';
import { TopNav } from '../components/TopNav';
import { PosterGrid } from '../components/PosterGrid';
import { fetchRows, findMovie } from '../data/rows';
import { watchlist, resumePositions } from '../state/store';
import type { RowsFile, Movie } from '../types';

interface Props {
  onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void;
  onSelectMovie: (m: Movie) => void;
}

const FINISHED_THRESHOLD = 0.95;  // hide resume entries past 95% (already-watched)

export function Library({ onNavigate, onSelectMovie }: Props) {
  const [rows, setRows] = useState<RowsFile | null>(null);

  useEffect(() => {
    fetchRows({ onUpdate: setRows }).then(({ data }) => setRows(data)).catch(() => { /* localStorage cache will still work */ });
  }, []);

  // Continue Watching: sort resume entries by updated_at desc, skip finished
  const resumeEntries = Object.values(resumePositions.value)
    .filter((r) => r.duration_seconds > 0 && r.position_seconds / r.duration_seconds < FINISHED_THRESHOLD)
    .sort((a, b) => b.updated_at - a.updated_at);

  // Prefer the snapshot stored on the resume entry itself (covers movies
  // that were watched via search but never appeared in rows.json). Fall
  // back to rows.json lookup for legacy entries that pre-date the snapshot.
  const continueWatching: Movie[] = resumeEntries
    .map((r) => r.movie ?? findMovie(rows, r.imdb_id))
    .filter((m): m is Movie => !!m);

  const progressMap: Record<string, number> = Object.fromEntries(
    resumeEntries.map((r) => [r.imdb_id, r.position_seconds / r.duration_seconds]),
  );

  // Watchlist: imdb_ids in order they were added; hydrate to Movie
  const watchlistMovies: Movie[] = watchlist.value
    .map((id) => findMovie(rows, id))
    .filter((m): m is Movie => !!m);

  return (
    <>
      <TopNav current="library" onNavigate={onNavigate} />
      <main className="library" data-screen="library">
        <h1 className="library__title">Library</h1>

        <section className="library__section">
          <h2 className="library__row-title">Continue Watching</h2>
          <PosterGrid
            items={continueWatching}
            idPrefix="cw"
            onSelect={onSelectMovie}
            progressMap={progressMap}
            emptyText="Nothing in progress. Movies you start will appear here."
            autofocusFirst={continueWatching.length > 0}
          />
        </section>

        <section className="library__section">
          <h2 className="library__row-title">My Watchlist</h2>
          <PosterGrid
            items={watchlistMovies}
            idPrefix="wl"
            onSelect={onSelectMovie}
            emptyText="Your watchlist is empty. Press + Watchlist from any movie's detail page."
            autofocusFirst={continueWatching.length === 0 && watchlistMovies.length > 0}
          />
        </section>
      </main>
    </>
  );
}
