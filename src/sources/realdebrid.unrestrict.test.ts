import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RDClient } from './realdebrid';

describe('RDClient.checkCache', () => {
  let client: RDClient;
  let fetchSpy: any;

  beforeEach(() => {
    client = new RDClient('test-key');
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns empty array immediately and does not hit the network when given empty hash list', async () => {
    const cached = await client.checkCache([]);
    expect(cached).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('joins multiple hashes with slashes in the URL', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}'));
    await client.checkCache(['aaa', 'bbb', 'ccc']);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/torrents/instantAvailability/aaa/bbb/ccc');
  });

  it('filters out hashes whose value is an empty array (RD: not cached)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      a: [],
      b: { rd: [{ '1': { filename: 'm.mkv', filesize: 1 } }] },
      c: [],
      d: { rd: [{ '0': { filename: 'n.mkv', filesize: 2 } }] },
    })));
    const cached = await client.checkCache(['a', 'b', 'c', 'd']);
    expect(cached.sort()).toEqual(['b', 'd']);
  });

  it('filters out hashes whose value is null', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      a: null,
      b: { rd: [{ '0': {} }] },
    })));
    const cached = await client.checkCache(['a', 'b']);
    expect(cached).toEqual(['b']);
  });

  it('throws when the API returns a non-2xx status, including status code in the message', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    await expect(client.checkCache(['x'])).rejects.toThrow(/429/);
  });
});

describe('RDClient.unrestrict file selection', () => {
  let client: RDClient;
  let fetchSpy: any;

  beforeEach(() => {
    client = new RDClient('test-key');
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => vi.restoreAllMocks());

  // Helper: queue the 4 mandatory calls (addMagnet, selectFiles, info, unrestrict)
  // with the given info + the unrestrict response.
  function queueRequests(info: any, downloadUrl: string) {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'tid' })))
      .mockResolvedValueOnce(new Response('')) // selectFiles
      .mockResolvedValueOnce(new Response(JSON.stringify(info)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ download: downloadUrl })));
  }

  it('picks the largest VIDEO file by bytes when multiple selected files exist', async () => {
    queueRequests({
      status: 'downloaded',
      links: ['L0', 'L1', 'L2'],
      files: [
        { id: 1, path: '/movie/sample.mkv',     bytes: 50_000_000,    selected: 1 }, // sample
        { id: 2, path: '/movie/feature.mkv',    bytes: 5_000_000_000, selected: 1 }, // <-- largest video
        { id: 3, path: '/movie/extras.txt',     bytes: 1_000,          selected: 1 }, // text, not video
      ],
    }, 'https://cdn/picked');

    await client.unrestrict('hhhh');

    // The unrestrict call should have used L1 (matches index of feature.mkv)
    const unrestrictBody = fetchSpy.mock.calls[3][1].body as URLSearchParams;
    expect(unrestrictBody.get('link')).toBe('L1');
  });

  it('falls back to the largest file overall when none of the selected files are videos', async () => {
    queueRequests({
      status: 'downloaded',
      links: ['L0', 'L1'],
      files: [
        { id: 1, path: '/x/readme.nfo', bytes: 500,         selected: 1 },
        { id: 2, path: '/x/archive.zip', bytes: 1_000_000,  selected: 1 }, // largest non-video
      ],
    }, 'https://cdn/zipped');

    await client.unrestrict('hhhh');

    const body = fetchSpy.mock.calls[3][1].body as URLSearchParams;
    expect(body.get('link')).toBe('L1');
  });

  it('defaults to link index 0 when files array is empty or missing', async () => {
    queueRequests({
      status: 'downloaded',
      links: ['L0', 'L1'],
      files: [], // empty
    }, 'https://cdn/first');

    await client.unrestrict('hhhh');

    const body = fetchSpy.mock.calls[3][1].body as URLSearchParams;
    expect(body.get('link')).toBe('L0');
  });

  it('throws if status never becomes "downloaded" within the polling window', async () => {
    // 16 polls + addMagnet + selectFiles = 18 calls, all returning "downloading"
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'tid' })))
      .mockResolvedValueOnce(new Response(''));
    for (let i = 0; i < 16; i++) {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'downloading' })));
    }
    // Speed up the test by stubbing setTimeout to fire immediately
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: any) => { fn(); return 0 as any; }) as any);

    await expect(client.unrestrict('hhhh')).rejects.toThrow(/not cached or stalled/);
  });

  it('throws when status is downloaded but the links array is empty', async () => {
    queueRequests({ status: 'downloaded', links: [], files: [] }, 'never-used');
    await expect(client.unrestrict('hhhh')).rejects.toThrow(/no links returned/);
  });

  it('returns the downloaded torrent as soon as status flips to downloaded (does not exhaust the loop)', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'tid' })))
      .mockResolvedValueOnce(new Response(''))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'downloading' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'queued' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'downloaded',
        links: ['L0'],
        files: [{ id: 1, path: '/x.mkv', bytes: 1, selected: 1 }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ download: 'https://cdn/done' })));
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: any) => { fn(); return 0 as any; }) as any);

    const url = await client.unrestrict('hhhh');
    expect(url).toBe('https://cdn/done');
    // 2 setup + 3 polls + 1 unrestrict = 6 fetches; ensure we stopped early
    expect(fetchSpy).toHaveBeenCalledTimes(6);
  });

  it('sends Authorization Bearer header on every request', async () => {
    queueRequests({
      status: 'downloaded',
      links: ['L0'],
      files: [{ id: 1, path: '/x.mkv', bytes: 1, selected: 1 }],
    }, 'https://cdn/x');
    await client.unrestrict('hhhh');

    for (const call of fetchSpy.mock.calls) {
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer test-key');
    }
  });

  it('skips files where selected === 0 when matching against links array', async () => {
    queueRequests({
      status: 'downloaded',
      links: ['L0', 'L1'],
      files: [
        { id: 1, path: '/skipped.mkv',  bytes: 9_000_000_000, selected: 0 }, // big but not selected
        { id: 2, path: '/picked-small.mkv', bytes: 100_000, selected: 1 },
        { id: 3, path: '/picked-big.mkv',   bytes: 200_000, selected: 1 }, // largest selected video
      ],
    }, 'https://cdn/y');

    await client.unrestrict('hhhh');

    const body = fetchSpy.mock.calls[3][1].body as URLSearchParams;
    // Selected video files map to L0, L1 in order; picked-big is index 1
    expect(body.get('link')).toBe('L1');
  });
});
