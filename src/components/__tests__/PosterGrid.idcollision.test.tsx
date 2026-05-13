import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { PosterGrid } from '../PosterGrid';
import { navInstance } from '../../nav/useFocusable';
import type { Movie } from '../../types';

// Regression for the "all search results light up at once" bug.
//
// Failure mode (now fixed): TMDb search results don't carry imdb_id until
// the user selects one (Search.tsx hydrates on click). PosterCard built its
// focus id as `poster-${rowId}-${movie.imdb_id}`, so every un-hydrated
// search hit got the literal id "poster-search-undefined". All 20 cards
// matched `focusedId.value === id` and rendered `data-focused`
// simultaneously, and the spatial engine's entries Map kept only the
// last-registered card (overwrote the rest).
//
// Fix: PosterCard falls back to `movie.tmdb_id` when imdb_id is absent.

function tmdbSearchResult(i: number): Movie {
  return {
    imdb_id: undefined as unknown as string, // <-- what TMDb actually gives us
    tmdb_id: 100 + i,
    title: `TMDb Movie ${i}`,
    year: 2024,
    runtime: 0,
    genres: [],
    poster: '',
    backdrop: '',
    overview: '',
    scores: {},
    cast: [],
  };
}

describe('PosterGrid with un-hydrated TMDb results', () => {
  beforeEach(() => {
    (navInstance as any).entries.clear();
    (navInstance as any).currentId = null;
  });

  afterEach(() => cleanup());

  it('assigns a unique data-focusable id to each card even when imdb_id is undefined', () => {
    const items = [tmdbSearchResult(1), tmdbSearchResult(2), tmdbSearchResult(3)];
    const { container } = render(
      <PosterGrid items={items} idPrefix="search" onSelect={() => {}} />,
    );
    const ids = Array.from(container.querySelectorAll('[data-focusable]'))
      .map((el) => el.getAttribute('data-focusable'));

    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3); // all distinct
    expect(ids.every((id) => id && !id.endsWith('undefined'))).toBe(true);
  });

  it('registers every card with the spatial engine (no Map-key collisions)', () => {
    const items = [tmdbSearchResult(1), tmdbSearchResult(2), tmdbSearchResult(3)];
    render(<PosterGrid items={items} idPrefix="search" onSelect={() => {}} />);
    expect((navInstance as any).entries.size).toBe(3);
  });

  it('prefers imdb_id when present (still works for rows.json-backed items)', () => {
    const hydrated: Movie = { ...tmdbSearchResult(1), imdb_id: 'tt1234567' };
    const { container } = render(
      <PosterGrid items={[hydrated]} idPrefix="search" onSelect={() => {}} />,
    );
    const id = container.querySelector('[data-focusable]')?.getAttribute('data-focusable');
    expect(id).toBe('poster-search-tt1234567');
  });
});
