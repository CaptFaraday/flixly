import { describe, it, expect, beforeEach, vi } from 'vitest';
import { probeCodecs, probeBandwidthMbps } from './capabilities';

describe('probeCodecs', () => {
  beforeEach(() => {
    const orig = HTMLVideoElement.prototype.canPlayType;
    HTMLVideoElement.prototype.canPlayType = function (type: string) {
      if (type.includes('avc1')) return 'probably';
      if (type.includes('hev1.1')) return 'maybe';
      if (type.includes('hev1.2')) return '';
      if (type.includes('mp4a')) return 'probably';
      if (type.includes('ac-3')) return '';
      if (type.includes('ec-3')) return '';
      return '';
    } as any;
    return () => { HTMLVideoElement.prototype.canPlayType = orig; };
  });

  it('marks H264 supported when canPlayType says probably', () => {
    expect(probeCodecs().h264).toBe(true);
  });

  it('marks H265 main supported when canPlayType says maybe', () => {
    expect(probeCodecs().h265_main).toBe(true);
  });

  it('marks H265 main10 unsupported when canPlayType says empty', () => {
    expect(probeCodecs().h265_main10).toBe(false);
  });

  it('marks AC3/E-AC3 unsupported when canPlayType says empty', () => {
    const c = probeCodecs();
    expect(c.ac3).toBe(false);
    expect(c.eac3).toBe(false);
  });
});

describe('probeBandwidthMbps', () => {
  it('estimates Mbps from byte count and elapsed ms', async () => {
    const fakeBlob = new ArrayBuffer(5_000_000); // 5 MB
    let resolveFetch: (v: Response) => void;
    const fetchPromise = new Promise<Response>((res) => { resolveFetch = res; });
    vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchPromise as any);

    const start = performance.now();
    vi.spyOn(performance, 'now').mockImplementation(() => start);
    const result = probeBandwidthMbps('https://example/test.bin');
    vi.spyOn(performance, 'now').mockImplementation(() => start + 4000); // 4 seconds

    resolveFetch!(new Response(fakeBlob));
    const mbps = await result;

    // 5 MB in 4 s ≈ 10 Mbps
    expect(mbps).toBeGreaterThan(8);
    expect(mbps).toBeLessThan(12);
    vi.restoreAllMocks();
  });
});
