import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TmdbClient } from './tmdb';

describe('TmdbClient', () => {
  let fetchSpy: any;

  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => vi.restoreAllMocks());

  it('discover() sends Bearer token and returns parsed results', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      page: 1, total_results: 2, total_pages: 1,
      results: [
        { id: 1, title: 'Movie A', release_date: '2024-04-16', vote_average: 8.0, vote_count: 200, poster_path: '/a.jpg', backdrop_path: '/b.jpg', genre_ids: [18], overview: 'OA', popularity: 100 },
        { id: 2, title: 'Movie B', release_date: '2024-05-01', vote_average: 7.0, vote_count: 150, poster_path: '/c.jpg', backdrop_path: '/d.jpg', genre_ids: [35], overview: 'OB', popularity: 80 },
      ],
    })));

    const c = new TmdbClient('test-token');
    const result = await c.discover({ 'release_date.gte': '2024-04-01' });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].title).toBe('Movie A');

    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toContain('https://api.themoviedb.org/3/discover/movie');
    expect(call[0]).toContain('release_date.gte=2024-04-01');
    expect((call[1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-token',
      Accept: 'application/json',
    });
  });

  it('getDetails() returns expanded movie metadata', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 693134, imdb_id: 'tt15239678', title: 'Dune: Part Two',
      runtime: 166, release_date: '2024-03-01',
      vote_average: 8.5, vote_count: 6000,
      poster_path: '/p.jpg', backdrop_path: '/b.jpg', overview: 'Paul...',
      genres: [{ id: 878, name: 'Science Fiction' }],
      revenue: 711800000, popularity: 145.6,
    })));

    const c = new TmdbClient('test-token');
    const m = await c.getDetails(693134);
    expect(m.title).toBe('Dune: Part Two');
    expect(m.imdb_id).toBe('tt15239678');
    expect(m.runtime).toBe(166);
    expect(m.genres).toEqual(['Science Fiction']);
  });

  it('getCredits() returns simplified cast and director', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 1,
      cast: [
        { name: 'Star A', order: 0 },
        { name: 'Star B', order: 1 },
        { name: 'Bit', order: 50 },
      ],
      crew: [
        { name: 'Some Editor', job: 'Editor' },
        { name: 'Denis V', job: 'Director' },
      ],
    })));

    const c = new TmdbClient('test-token');
    const credits = await c.getCredits(1);
    expect(credits.director).toBe('Denis V');
    expect(credits.cast).toEqual(['Star A', 'Star B', 'Bit']); // top 3 by order
  });

  it('getReleaseDates() returns the earliest release date across all countries/types', async () => {
    // TMDb's /movie/{id}.release_date returns the most recent theatrical
    // event (re-release, anniversary screening, etc.), not the original.
    // Hamilton (tt8503618) is a real example: /movie/.release_date is
    // 2025-09-05 (a 2025 theatrical re-release) but the original Disney+
    // release was 2020-07-03. Torrents use the original year, so the
    // picker's title-year filter rejects sources. We need the EARLIEST
    // date from /release_dates to anchor the year correctly.
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 1,
      results: [
        { iso_3166_1: 'US', release_dates: [
          { type: 3, release_date: '2025-09-05T00:00:00.000Z', note: '' },
          { type: 4, release_date: '2020-07-03T00:00:00.000Z', note: 'Disney+' },
        ]},
        { iso_3166_1: 'AT', release_dates: [
          { type: 4, release_date: '2020-07-03T00:00:00.000Z', note: 'Disney+' },
        ]},
      ],
    })));
    const c = new TmdbClient('test-token');
    const d = await c.getReleaseDates(1);
    expect(d.earliest).toBe('2020-07-03');
  });

  it('getReleaseDates() filters digital-type entries', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 1,
      results: [
        { iso_3166_1: 'US', release_dates: [
          { type: 3, release_date: '2024-03-01T00:00:00.000Z', note: 'Theatrical' },
          { type: 4, release_date: '2024-04-16T00:00:00.000Z', note: 'Digital' },
        ]},
      ],
    })));

    const c = new TmdbClient('test-token');
    const d = await c.getReleaseDates(1);
    expect(d.digital_us).toBe('2024-04-16');
  });

  it('throws on 401', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"status_message":"bad"}', { status: 401 }));
    const c = new TmdbClient('bad-token');
    await expect(c.discover({})).rejects.toThrow(/TMDb 401/);
  });

  it('retries once on 429 with Retry-After header before failing', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [], page: 1, total_results: 0, total_pages: 0 })));
    const c = new TmdbClient('t');
    const r = await c.discover({});
    expect(r.results).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
