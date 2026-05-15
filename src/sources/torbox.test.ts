import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { deleteTorrentByHash, checkCached } from './torbox';

describe('deleteTorrentByHash', () => {
  let fetchSpy: any;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => vi.restoreAllMocks());

  it('looks up the torrent_id by hash and deletes it', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          { id: 111, hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          { id: 222, hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
        ],
      })))
      .mockResolvedValueOnce(new Response('{"success":true}'));

    const ok = await deleteTorrentByHash('BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'key');
    expect(ok).toBe(true);

    const [listCall, delCall] = fetchSpy.mock.calls;
    expect(listCall[0]).toMatch(/torrents\/mylist/);
    expect((listCall[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer key' });

    expect(delCall[0]).toMatch(/torrents\/controltorrent/);
    expect((delCall[1] as RequestInit).method).toBe('POST');
    const body = JSON.parse((delCall[1] as RequestInit).body as string);
    expect(body).toEqual({ torrent_id: 222, operation: 'delete', all: false });
  });

  it('returns false when hash is not in the queue (nothing to delete)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 1, hash: 'cafebabe' }] })));
    const ok = await deleteTorrentByHash('deadbeef', 'key');
    expect(ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no second call
  });

  it('returns false on missing inputs without calling fetch', async () => {
    expect(await deleteTorrentByHash('', 'key')).toBe(false);
    expect(await deleteTorrentByHash('hash', '')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('swallows network errors instead of throwing', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network'));
    const ok = await deleteTorrentByHash('aaaa', 'key');
    expect(ok).toBe(false);
  });

  it('returns false if mylist responds non-OK', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    const ok = await deleteTorrentByHash('aaaa', 'key');
    expect(ok).toBe(false);
  });
});

describe('checkCached', () => {
  let fetchSpy: any;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => vi.restoreAllMocks());

  it('returns a map keyed by lowercase hash with the biggest video file', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      data: [
        {
          hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          files: [
            { id: 0, name: 'readme.txt', short_name: 'readme.txt', size: 100, mimetype: 'text/plain' },
            { id: 1, name: 'movie.mkv', short_name: 'movie.mkv', size: 16_000_000_000, mimetype: 'video/x-matroska' },
            { id: 2, name: 'sample.mkv', short_name: 'sample.mkv', size: 50_000_000, mimetype: 'video/x-matroska' },
          ],
        },
      ],
    })));
    const result = await checkCached(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'], 'key');
    expect(result.size).toBe(1);
    const entry = result.get('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(entry?.bestVideoFile?.short_name).toBe('movie.mkv');
    expect(entry?.bestVideoFile?.size).toBe(16_000_000_000);
  });

  it('excludes hashes that TorBox does not return (= not cached)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      data: [{ hash: 'aaaa', files: [{ id: 0, name: 'm.mp4', short_name: 'm.mp4', size: 1_000_000_000, mimetype: 'video/mp4' }] }],
    })));
    const result = await checkCached(['aaaa', 'bbbb', 'cccc'], 'key');
    expect(result.size).toBe(1);
    expect(result.has('bbbb')).toBe(false);
    expect(result.has('cccc')).toBe(false);
  });

  it('handles entries with no video files (bestVideoFile is null)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      data: [{ hash: 'aaaa', files: [{ id: 0, name: 'readme.txt', short_name: 'readme.txt', size: 100, mimetype: 'text/plain' }] }],
    })));
    const result = await checkCached(['aaaa'], 'key');
    expect(result.get('aaaa')?.bestVideoFile).toBeNull();
  });

  it('returns empty map on missing inputs without calling fetch', async () => {
    expect((await checkCached([], 'key')).size).toBe(0);
    expect((await checkCached(['aaaa'], '')).size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns empty map on network errors / non-OK responses (caller falls back)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 500 }));
    expect((await checkCached(['aaaa'], 'key')).size).toBe(0);
    fetchSpy.mockRejectedValueOnce(new Error('boom'));
    expect((await checkCached(['aaaa'], 'key')).size).toBe(0);
  });

  it('sends POST with Authorization header and hashes body', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ data: [] })));
    await checkCached(['aaaa', 'bbbb'], 'mykey');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/checkcached\?format=list&list_files=true/);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer mykey', 'Content-Type': 'application/json' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ hashes: ['aaaa', 'bbbb'] });
  });
});
