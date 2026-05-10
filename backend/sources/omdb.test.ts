import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OmdbClient } from './omdb';

describe('OmdbClient', () => {
  let fetchSpy: any;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => vi.restoreAllMocks());

  it('returns parsed scores when OMDb has data', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      Response: 'True',
      imdbID: 'tt15239678',
      imdbRating: '8.5',
      Metascore: '79',
      Ratings: [
        { Source: 'Internet Movie Database', Value: '8.5/10' },
        { Source: 'Rotten Tomatoes', Value: '92%' },
        { Source: 'Metacritic', Value: '79/100' },
      ],
    })));

    const c = new OmdbClient('test-key');
    const scores = await c.getScores('tt15239678');
    expect(scores).toEqual({ rt: 92, metacritic: 79, imdb: 8.5 });
  });

  it('returns nulls when OMDb has no data', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      Response: 'False',
      Error: 'Movie not found!',
    })));

    const c = new OmdbClient('test-key');
    expect(await c.getScores('tt99999999')).toEqual({ rt: null, metacritic: null, imdb: null });
  });

  it('returns nulls and does not throw on 429 rate-limit', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Request limit reached!', { status: 401 }));
    const c = new OmdbClient('test-key');
    expect(await c.getScores('tt1')).toEqual({ rt: null, metacritic: null, imdb: null });
  });

  it('returns nulls when fields are absent', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      Response: 'True',
      imdbID: 'tt1',
      imdbRating: 'N/A',
      Ratings: [],
    })));
    const c = new OmdbClient('k');
    expect(await c.getScores('tt1')).toEqual({ rt: null, metacritic: null, imdb: null });
  });

  it('sends imdbID and key in query string', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ Response: 'False' })));
    const c = new OmdbClient('mykey123');
    await c.getScores('tt15239678');
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('i=tt15239678');
    expect(url).toContain('apikey=mykey123');
  });
});
