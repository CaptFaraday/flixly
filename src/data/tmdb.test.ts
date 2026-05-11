import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { searchMovies, hydrateImdbId } from './tmdb';

describe('TMDb browser client', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    // Ensure the API key env is set for the duration of the test
    (import.meta as any).env = { ...(import.meta as any).env, VITE_TMDB_API_KEY: 'test-key' };
  });
  afterEach(() => vi.restoreAllMocks());

  describe('searchMovies', () => {
    it('returns empty array for empty query without hitting network', async () => {
      const result = await searchMovies('   ');
      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('calls /search/movie and maps results to Movie shape', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        results: [
          {
            id: 693134,
            title: 'Dune: Part Two',
            release_date: '2024-03-01',
            poster_path: '/p.jpg',
            backdrop_path: '/b.jpg',
            overview: 'Paul...',
            vote_average: 8.5,
          },
          {
            id: 1,
            title: 'No date',
            release_date: '',
            poster_path: null,
            backdrop_path: null,
            overview: '',
            vote_average: 0,
          },
        ],
      })));

      const result = await searchMovies('dune');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        tmdb_id: 693134,
        title: 'Dune: Part Two',
        year: 2024,
        poster: 'https://image.tmdb.org/t/p/w500/p.jpg',
        backdrop: 'https://image.tmdb.org/t/p/original/b.jpg',
        scores: { imdb: 8.5 },
      });
      expect(result[1]).toMatchObject({
        tmdb_id: 1,
        title: 'No date',
        year: 0,
        poster: '',
        backdrop: '',
      });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('/search/movie');
      expect(url).toContain('query=dune');
      expect(url).toContain('api_key=test-key');
    });

    it('returns up to 30 results', async () => {
      const fakeResults = Array.from({ length: 50 }).map((_, i) => ({
        id: i + 1, title: `Movie ${i + 1}`, release_date: '2024-01-01',
        poster_path: '/x.jpg', backdrop_path: '/y.jpg', overview: '', vote_average: 7,
      }));
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ results: fakeResults })));

      const result = await searchMovies('many');
      expect(result).toHaveLength(30);
    });

    it('throws on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 401 }));
      await expect(searchMovies('x')).rejects.toThrow(/TMDb search 401/);
    });
  });

  describe('hydrateImdbId', () => {
    it('fetches external_ids and returns imdb_id', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        imdb_id: 'tt15239678',
        id: 693134,
      })));

      const id = await hydrateImdbId(693134);
      expect(id).toBe('tt15239678');

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('/movie/693134/external_ids');
    });

    it('returns null when imdb_id is missing', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 })));
      expect(await hydrateImdbId(1)).toBe(null);
    });

    it('returns null on non-OK response (caller treats as failure)', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 404 }));
      expect(await hydrateImdbId(1)).toBe(null);
    });
  });
});
