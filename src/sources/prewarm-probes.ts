import type { StreamCandidate } from '../types';

export function preWarmProbes(candidates: StreamCandidate[], topN: number): void {
  const playable = candidates.filter((c) => !!c.directUrl).slice(0, topN);
  for (const c of playable) {
    fetch(`http://127.0.0.1:11470/probe?url=${encodeURIComponent(c.directUrl!)}`);
  }
}
