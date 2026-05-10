export interface ScoreInputs {
  rt?: number | null;          // 0-100
  metacritic?: number | null;  // 0-100
  imdb?: number | null;        // 0-10
  tmdbVoteAvg?: number | null; // 0-10 (TMDb fallback)
}

/**
 * Composite review score, used to rank candidates within rows like
 * "Best of {year}" and "You Probably Missed". When OMDb provides RT/MC/IMDb
 * we use the weighted formula; when none of those exist, we fall back to
 * (TMDb vote_average × 20).
 *
 * Weights (per spec):  RT × 0.5 + Metacritic × 0.3 + (IMDb × 20) × 0.2
 */
export function composite(s: ScoreInputs): number {
  const hasOmdb =
    (s.rt != null && s.rt > 0) ||
    (s.metacritic != null && s.metacritic > 0) ||
    (s.imdb != null && s.imdb > 0);

  if (!hasOmdb) {
    return s.tmdbVoteAvg != null ? s.tmdbVoteAvg * 20 : 0;
  }

  const rtPart = (s.rt ?? 0) * 0.5;
  const mcPart = (s.metacritic ?? 0) * 0.3;
  const imdbPart = (s.imdb ?? 0) * 20 * 0.2;
  return rtPart + mcPart + imdbPart;
}
