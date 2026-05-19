import { describe, it, expect } from 'vitest';
import { pickReleaseYear } from './release-year';

describe('pickReleaseYear', () => {
  it('uses the earliest /release_dates year when available (Hamilton case)', () => {
    // /movie/.release_date is 2025-09-05 (theatrical re-release) but the
    // original Disney+ release was 2020-07-03. Torrents use the original
    // year, so we anchor on the earliest date.
    const year = pickReleaseYear('2025-09-05', '2020-07-03');
    expect(year).toBe(2020);
  });

  it('falls back to the primary release_date when no earliest is given', () => {
    const year = pickReleaseYear('2024-03-01', undefined);
    expect(year).toBe(2024);
  });
});
