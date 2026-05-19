import type { StreamCandidate } from '../types';

export interface ProbeResult {
  ok: boolean;
  reason?: string;
}

export type ProbeFn = (url: string, signal: AbortSignal) => Promise<ProbeResult>;

export interface ShortCircuitOptions {
  probe: ProbeFn;
  topN: number;
}

export interface ShortCircuitOutcome {
  playable: StreamCandidate[];
  results: Array<{ filename: string; ok: boolean; reason?: string }>;
  verifiedIndex: number | null;
}

export async function probeAndShortCircuit(
  candidates: StreamCandidate[],
  { probe, topN }: ShortCircuitOptions,
): Promise<ShortCircuitOutcome> {
  const top = candidates.slice(0, topN).filter((c) => !!c.directUrl);
  const controllers = top.map(() => new AbortController());
  const probes = top.map((c, i) =>
    probe(c.directUrl!, controllers[i].signal)
      .then((r) => ({ candidate: c, ok: r.ok, reason: r.reason }))
      .catch((e) => ({ candidate: c, ok: false, reason: e instanceof Error ? e.message : String(e) })),
  );

  const results: Array<{ filename: string; ok: boolean; reason?: string }> = [];
  let verifiedCandidate: StreamCandidate | null = null;
  let verifiedIndex: number | null = null;
  const failedFilenames = new Set<string>();

  for (let i = 0; i < probes.length; i++) {
    const r = await probes[i];
    results.push({ filename: r.candidate.filename, ok: r.ok, reason: r.reason });
    if (r.ok) {
      verifiedCandidate = r.candidate;
      verifiedIndex = candidates.indexOf(r.candidate);
      for (let j = i + 1; j < controllers.length; j++) controllers[j].abort();
      break;
    } else {
      failedFilenames.add(r.candidate.filename);
    }
  }

  const remaining = candidates.filter(
    (c) => !failedFilenames.has(c.filename) && c !== verifiedCandidate,
  );
  const playable = verifiedCandidate ? [verifiedCandidate, ...remaining] : remaining;

  return { playable, results, verifiedIndex };
}
