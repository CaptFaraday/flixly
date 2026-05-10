import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RDClient } from './realdebrid';

describe('RDClient', () => {
  let client: RDClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new RDClient('test-api-key');
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => vi.restoreAllMocks());

  it('checkCache sends auth header and returns cached hashes', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': { rd: [{ '1': { filename: 'movie.mkv', filesize: 5_000_000_000 } }] },
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb': [],
    })));
    const cached = await client.checkCache(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']);
    expect(cached).toEqual(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
    const call = fetchSpy.mock.calls[0];
    expect((call[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-api-key' });
  });

  it('unrestrict returns a streamable URL', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'torrent-id' })))
      .mockResolvedValueOnce(new Response(''))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'downloaded', links: ['https://rd.example/file'] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ download: 'https://cdn.example/movie.mkv' })));

    const url = await client.unrestrict('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(url).toBe('https://cdn.example/movie.mkv');
  });

  it('throws on 401 invalid key', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"error":"bad_token"}', { status: 401 }));
    await expect(client.checkCache(['x'])).rejects.toThrow(/RD api/);
  });
});
