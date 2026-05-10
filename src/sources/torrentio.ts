import type { StreamCandidate } from '../types';
import { parseName } from './parse-name';

// Public Torrentio addon manifest. Configurable later if user wants a different scraper addon.
const TORRENTIO_BASE = 'https://torrentio.strem.fun';

interface TorrentioStream {
  name: string;
  title: string;
  infoHash: string;
  fileIdx?: number;
  behaviorHints?: { bingeGroup?: string; videoSize?: number };
}

/**
 * Torrentio's response title encodes filename + seeds + size on multiple lines.
 * Example title:
 *   "Dune.Part.Two.2024.1080p.WEB-DL.DDP5.1.H.264-FLUX.mkv\n👤 1234 💾 5.4 GB"
 */
function extractFilename(title: string): string {
  return title.split('\n')[0]?.trim() ?? '';
}
function extractSeeds(title: string): number {
  const m = title.match(/👤\s*(\d+)/);
  return m ? Number(m[1]) : 0;
}
function extractBytes(title: string, hint?: number): number {
  if (hint) return hint;
  const m = title.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2].toUpperCase() === 'GB' ? Math.round(n * 1_000_000_000) : Math.round(n * 1_000_000);
}

export async function fetchTorrentioCandidates(imdbId: string): Promise<StreamCandidate[]> {
  const r = await fetch(`${TORRENTIO_BASE}/stream/movie/${imdbId}.json`);
  if (!r.ok) throw new Error(`Torrentio ${r.status}`);
  const data = (await r.json()) as { streams: TorrentioStream[] };
  return (data.streams ?? []).map((s) => {
    const filename = extractFilename(s.title);
    return {
      hash: s.infoHash.toLowerCase(),
      filename,
      bytes: extractBytes(s.title, s.behaviorHints?.videoSize),
      seeds: extractSeeds(s.title),
      parsed: parseName(filename),
    };
  });
}
