import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ensureCapabilities } from './capabilities';

const CACHE_KEY = 'capabilities-v1';

function makeCodecsForCanPlayType(): typeof HTMLVideoElement.prototype.canPlayType {
  return function (type: string) {
    if (type.includes('avc1')) return 'probably';
    if (type.includes('hev1.1')) return 'maybe';
    if (type.includes('hev1.2')) return '';
    if (type.includes('vp9')) return 'maybe';
    if (type.includes('av01')) return '';
    if (type.includes('mp4a')) return 'probably';
    if (type.includes('ac-3')) return '';
    if (type.includes('ec-3')) return '';
    return '';
  } as any;
}

describe('ensureCapabilities', () => {
  let origCanPlay: any;
  let origFetch: any;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    origCanPlay = HTMLVideoElement.prototype.canPlayType;
    HTMLVideoElement.prototype.canPlayType = makeCodecsForCanPlayType();
    origFetch = globalThis.fetch;
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000);
  });

  afterEach(() => {
    HTMLVideoElement.prototype.canPlayType = origCanPlay;
    globalThis.fetch = origFetch;
    nowSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('probes bandwidth and writes the result when no cache exists', async () => {
    const fakeBlob = new ArrayBuffer(5_000_000);
    const fetchSpy = vi.fn().mockResolvedValue(new Response(fakeBlob));
    globalThis.fetch = fetchSpy as any;
    // Force a deterministic elapsed time of 4000 ms
    let nowCallCount = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      nowCallCount++;
      return nowCallCount === 1 ? 0 : 4000;
    });

    const caps = await ensureCapabilities();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(caps.bandwidthMbps).toBeGreaterThan(8);
    expect(caps.bandwidthMbps).toBeLessThan(12);
    expect(caps.codecs.h264).toBe(true);
    expect(caps.codecs.av1).toBe(false);
    expect(caps.probedAt).toBe(1_000_000_000_000);
    expect(localStorage.getItem(CACHE_KEY)).not.toBeNull();
  });

  it('returns cached capabilities without re-probing when cache is fresh and codecs match', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;

    const cached = {
      codecs: {
        h264: true, h265_main: true, h265_main10: false, vp9: true,
        av1: false, aac: true, ac3: false, eac3: false,
      },
      bandwidthMbps: 45.2,
      probedAt: 1_000_000_000_000 - 60_000, // 1 minute ago — well within 30-min window
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));

    const caps = await ensureCapabilities();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(caps).toEqual(cached);
  });

  it('re-probes bandwidth when the cache is older than 30 minutes', async () => {
    const fakeBlob = new ArrayBuffer(5_000_000);
    const fetchSpy = vi.fn().mockResolvedValue(new Response(fakeBlob));
    globalThis.fetch = fetchSpy as any;
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(4000);

    const cached = {
      codecs: {
        h264: true, h265_main: true, h265_main10: false, vp9: true,
        av1: false, aac: true, ac3: false, eac3: false,
      },
      bandwidthMbps: 999,
      probedAt: 1_000_000_000_000 - (31 * 60 * 1000), // 31 minutes ago
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));

    const caps = await ensureCapabilities();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(caps.bandwidthMbps).not.toBe(999); // got re-probed
    expect(caps.probedAt).toBe(1_000_000_000_000);
  });

  it('re-probes when stored codecs differ from current (eg TV firmware update changed support)', async () => {
    const fakeBlob = new ArrayBuffer(5_000_000);
    const fetchSpy = vi.fn().mockResolvedValue(new Response(fakeBlob));
    globalThis.fetch = fetchSpy as any;
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(4000);

    // Stored cache says av1 is supported — but our canPlayType stub says it's not.
    // That mismatch must trigger a re-probe even though probedAt is recent.
    const cached = {
      codecs: {
        h264: true, h265_main: true, h265_main10: false, vp9: true,
        av1: true, // <-- differs from current
        aac: true, ac3: false, eac3: false,
      },
      bandwidthMbps: 45.2,
      probedAt: 1_000_000_000_000 - 60_000,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));

    const caps = await ensureCapabilities();

    // Codecs object reflects the current canPlayType output, not the stored one
    expect(caps.codecs.av1).toBe(false);
  });

  it('keeps cached bandwidth when probe fails and a cached value exists', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as any;

    const cached = {
      codecs: {
        h264: true, h265_main: true, h265_main10: false, vp9: true,
        av1: false, aac: true, ac3: false, eac3: false,
      },
      bandwidthMbps: 42,
      probedAt: 1_000_000_000_000 - (31 * 60 * 1000), // stale → triggers re-probe
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));

    const caps = await ensureCapabilities();

    expect(caps.bandwidthMbps).toBe(42); // fell back to cached value
  });

  it('defaults bandwidth to 50 Mbps when probe fails and no cache exists', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as any;

    const caps = await ensureCapabilities();

    expect(caps.bandwidthMbps).toBe(50);
  });

  it('persists the result so the next call reads from cache', async () => {
    const fakeBlob = new ArrayBuffer(5_000_000);
    const fetchSpy = vi.fn().mockResolvedValue(new Response(fakeBlob));
    globalThis.fetch = fetchSpy as any;
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(4000);

    await ensureCapabilities();
    fetchSpy.mockClear();

    await ensureCapabilities();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns the fallback path when cached JSON is corrupt', async () => {
    localStorage.setItem(CACHE_KEY, '{not-json');
    const fakeBlob = new ArrayBuffer(5_000_000);
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(fakeBlob)) as any;
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(4000);

    const caps = await ensureCapabilities();

    expect(caps.probedAt).toBe(1_000_000_000_000); // fresh probe ran
  });
});
