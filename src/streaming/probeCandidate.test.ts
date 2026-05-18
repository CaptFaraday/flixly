import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track per-test which mock behaviour applies. Keyed by URL so the mock can
// differentiate "this URL probes OK" from "this URL throws" from "this URL hangs".
const behaviour = new Map<string, 'ok' | 'no-video' | 'throws' | 'hangs'>();

vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  UrlSource: vi.fn(),
  Input: vi.fn().mockImplementation(({ source: _src }: { source: unknown }) => {
    // The mocked UrlSource constructor was called with (url, opts). We
    // can't read the args from here easily — instead, the test sets a
    // global current-url before creating the Input. Default: 'ok'.
    const url = (globalThis as { __probeTestUrl?: string }).__probeTestUrl ?? '';
    const b = behaviour.get(url) ?? 'ok';
    return {
      getPrimaryVideoTrack: () => {
        if (b === 'no-video') return Promise.resolve(null);
        if (b === 'throws') return Promise.reject(new Error('parse failed'));
        if (b === 'hangs') return new Promise(() => { /* never resolves */ });
        return Promise.resolve({
          codec: 'hevc',
          languageCode: 'und',
          getCodecParameterString: () => Promise.resolve('hvc1.2.4.L153.B0'),
        });
      },
      getPrimaryAudioTrack: () => Promise.resolve({
        codec: 'ac-3',
        languageCode: 'eng',
        getCodecParameterString: () => Promise.resolve('ac-3'),
      }),
      computeDuration: () => Promise.resolve(5400),
    };
  }),
}));

import { probeCandidate } from './probeCandidate';

beforeEach(() => {
  behaviour.clear();
  delete (globalThis as { __probeTestUrl?: string }).__probeTestUrl;
});

describe('probeCandidate', () => {
  it('returns ok with parsed metadata when the source decodes', async () => {
    (globalThis as { __probeTestUrl?: string }).__probeTestUrl = 'https://ex.com/good.mkv';
    const r = await probeCandidate('https://ex.com/good.mkv');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.videoCodec).toBe('hevc');
      expect(r.audioCodec).toBe('ac-3');
      expect(r.audioLanguage).toBe('eng');
      expect(r.durationSec).toBe(5400);
    }
  });

  it('returns not-ok when the demuxer throws', async () => {
    (globalThis as { __probeTestUrl?: string }).__probeTestUrl = 'https://ex.com/bad.mkv';
    behaviour.set('https://ex.com/bad.mkv', 'throws');
    const r = await probeCandidate('https://ex.com/bad.mkv');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('parse failed');
  });

  it('returns not-ok when the demuxer hangs past timeoutMs', async () => {
    (globalThis as { __probeTestUrl?: string }).__probeTestUrl = 'https://ex.com/slow.mkv';
    behaviour.set('https://ex.com/slow.mkv', 'hangs');
    const r = await probeCandidate('https://ex.com/slow.mkv', { timeoutMs: 50 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/timeout/i);
  });
});
