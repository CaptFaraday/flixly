/**
 * Pick the canonical release year. Prefers the earliest /release_dates
 * entry; falls back to TMDb's "primary" release_date.
 *
 * Why: TMDb's primary release_date tracks the most recent theatrical
 * event (re-release, anniversary screening). Hamilton (tt8503618) is
 * the canonical example — primary is 2025-09-05 (a 2025 re-release)
 * but the original Disney+ release was 2020-07-03. Torrents are named
 * with the ORIGINAL year, so anchoring on the earliest date keeps the
 * picker's title-year filter working.
 */
export function pickReleaseYear(primary: string | undefined, earliest: string | undefined): number {
  const earlyYear = Number((earliest ?? '').slice(0, 4));
  if (earlyYear) return earlyYear;
  const primaryYear = Number((primary ?? '').slice(0, 4));
  return primaryYear || 0;
}
