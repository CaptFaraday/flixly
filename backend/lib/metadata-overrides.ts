import { readFileSync } from 'node:fs';

/**
 * Apply a per-tmdb_id metadata override to a movie record. Used to
 * correct entries where TMDB itself has stale or surprising data
 * (e.g. re-released films whose "primary" release_date tracks the
 * re-release, not the original). The override file lives at
 * backend/data/metadata-overrides.json and is checked into the repo.
 *
 * Keys are tmdb_id as string. Currently only the `year` field is
 * supported, but the contract is open for future fields (title etc.).
 */
export interface MetadataOverride { year?: number }

export function applyOverride<T extends { tmdb_id: number }>(
  movie: T,
  overrides: Record<string, MetadataOverride>,
): T {
  const ov = overrides[String(movie.tmdb_id)];
  if (!ov) return movie;
  return { ...movie, ...(ov.year != null ? { year: ov.year } : {}) };
}

/**
 * Load overrides from a JSON file. Returns {} if the file is missing or
 * unreadable — an absent file means "no overrides configured", which is
 * a valid default (only repos with curated corrections need it).
 */
export function loadOverrides(jsonPath: string): Record<string, MetadataOverride> {
  try {
    const raw = readFileSync(jsonPath, 'utf8');
    return JSON.parse(raw);
  } catch { return {}; }
}
