import { describe, it, expect, vi } from 'vitest';
import { preWarmProbes } from './prewarm-probes';
import type { StreamCandidate } from '../types';
import { parseName } from './parse-name';

const cand = (name: string, hasUrl = true): StreamCandidate => ({
  hash: name.replace(/\W/g, '').padEnd(40, 'a').slice(0, 40),
  filename: name,
  bytes: 1_000_000_000,
  seeds: 100,
  parsed: parseName(name),
  ...(hasUrl ? { directUrl: `https://cdn.example/${encodeURIComponent(name)}` } : {}),
});

describe('preWarmProbes', () => {
  it('fires a fetch to the localhost probe service for each top candidate', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const candidates = [cand('A.mkv'), cand('B.mkv'), cand('C.mkv')];
    preWarmProbes(candidates, 5);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('127.0.0.1:11470/probe');
    vi.restoreAllMocks();
  });

  it('swallows fetch rejections so a dead probe service does not crash the Detail screen', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11470'));
    const candidates = [cand('A.mkv')];
    expect(() => preWarmProbes(candidates, 5)).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    vi.restoreAllMocks();
  });
});
