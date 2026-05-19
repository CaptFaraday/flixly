import { describe, it, expect, vi } from 'vitest';
import { probeAndShortCircuit } from './probe';
import type { StreamCandidate } from '../types';
import { parseName } from './parse-name';

const cand = (name: string): StreamCandidate => ({
  hash: name.replace(/\W/g, '').padEnd(40, 'a').slice(0, 40),
  filename: name,
  bytes: 1_000_000_000,
  seeds: 100,
  parsed: parseName(name),
  directUrl: `https://cdn.example/${encodeURIComponent(name)}`,
});

describe('probeAndShortCircuit', () => {
  it('short-circuits when probe[0] verifies and aborts the rest', async () => {
    const aborted: number[] = [];
    const resolvers: Array<(v: { ok: boolean }) => void> = [];
    const probe = vi.fn((_url: string, signal: AbortSignal) => {
      const idx = resolvers.length;
      signal.addEventListener('abort', () => { aborted.push(idx); });
      return new Promise<{ ok: boolean }>((resolve) => { resolvers.push(resolve); });
    });

    const candidates = [cand('A.mkv'), cand('B.mkv'), cand('C.mkv'), cand('D.mkv'), cand('E.mkv')];
    const promise = probeAndShortCircuit(candidates, { probe, topN: 5 });

    await Promise.resolve();
    expect(probe).toHaveBeenCalledTimes(5);

    resolvers[0]({ ok: true });

    const outcome = await promise;
    expect(outcome.verifiedIndex).toBe(0);
    expect(outcome.playable[0].filename).toBe('A.mkv');
    expect(outcome.playable.map((c) => c.filename)).toEqual(['A.mkv', 'B.mkv', 'C.mkv', 'D.mkv', 'E.mkv']);
    expect(aborted.sort()).toEqual([1, 2, 3, 4]);
  });

  it('preserves rank: probe[0] OK wins even when probe[1] resolves first', async () => {
    const resolvers: Array<(v: { ok: boolean }) => void> = [];
    const probe = vi.fn((_url: string, _signal: AbortSignal) => {
      return new Promise<{ ok: boolean }>((resolve) => { resolvers.push(resolve); });
    });

    const candidates = [cand('A.mkv'), cand('B.mkv'), cand('C.mkv')];
    const promise = probeAndShortCircuit(candidates, { probe, topN: 3 });

    await Promise.resolve();
    resolvers[1]({ ok: true });
    await new Promise((r) => setTimeout(r, 5));
    resolvers[0]({ ok: true });

    const outcome = await promise;
    expect(outcome.verifiedIndex).toBe(0);
    expect(outcome.playable[0].filename).toBe('A.mkv');
  });

  it('drops probed-and-failed candidates from the playable list', async () => {
    const resolvers: Array<(v: { ok: boolean; reason?: string }) => void> = [];
    const probe = vi.fn((_url: string, _signal: AbortSignal) => {
      return new Promise<{ ok: boolean; reason?: string }>((resolve) => { resolvers.push(resolve); });
    });

    const candidates = [cand('A.mkv'), cand('B.mkv'), cand('C.mkv'), cand('D.mkv')];
    const promise = probeAndShortCircuit(candidates, { probe, topN: 4 });

    await Promise.resolve();
    resolvers[0]({ ok: false, reason: 'dts' });
    resolvers[1]({ ok: false, reason: 'dts' });
    resolvers[2]({ ok: true });

    const outcome = await promise;
    expect(outcome.verifiedIndex).toBe(2);
    expect(outcome.playable.map((c) => c.filename)).toEqual(['C.mkv', 'D.mkv']);
  });

  it('returns no verified when all probes fail and drops them all', async () => {
    const probe = vi.fn(async () => ({ ok: false, reason: 'dts' }));
    const candidates = [cand('A.mkv'), cand('B.mkv'), cand('C.mkv')];
    const outcome = await probeAndShortCircuit(candidates, { probe, topN: 3 });

    expect(outcome.verifiedIndex).toBe(null);
    expect(outcome.playable).toEqual([]);
    expect(outcome.results).toHaveLength(3);
    expect(outcome.results.every((r) => !r.ok)).toBe(true);
  });

  it('keeps candidates past topN regardless of probe outcome', async () => {
    const probe = vi.fn(async () => ({ ok: false }));
    const candidates = [
      cand('A.mkv'), cand('B.mkv'), cand('C.mkv'),
      cand('D.mkv'), cand('E.mkv'), cand('F.mkv'),
    ];
    const outcome = await probeAndShortCircuit(candidates, { probe, topN: 3 });

    expect(outcome.verifiedIndex).toBe(null);
    expect(outcome.playable.map((c) => c.filename)).toEqual(['D.mkv', 'E.mkv', 'F.mkv']);
  });

  it('skips candidates without a directUrl', async () => {
    const probe = vi.fn(async () => ({ ok: true }));
    const candidates = [
      { ...cand('A.mkv'), directUrl: undefined },
      cand('B.mkv'),
    ];
    const outcome = await probeAndShortCircuit(candidates, { probe, topN: 5 });

    expect(probe).toHaveBeenCalledTimes(1);
    expect(outcome.verifiedIndex).toBe(1);
    expect(outcome.playable.map((c) => c.filename)).toEqual(['B.mkv', 'A.mkv']);
  });
});
