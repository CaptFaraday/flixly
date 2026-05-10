import { describe, it, expect } from 'vitest';
import { composite } from './score';

describe('composite', () => {
  it('combines RT, Metacritic, and IMDb according to the documented weights', () => {
    // RT × 0.5 + MC × 0.3 + (IMDb × 20) × 0.2
    // 90 × 0.5 + 80 × 0.3 + (8 × 20) × 0.2 = 45 + 24 + 32 = 101
    expect(composite({ rt: 90, metacritic: 80, imdb: 8 })).toBe(101);
  });

  it('falls back to TMDb vote_average × 20 when no scores available', () => {
    // (7.5 × 20) = 150 → that is the score in the absence of OMDb data
    expect(composite({ tmdbVoteAvg: 7.5 })).toBe(150);
  });

  it('uses partial scores when only some are present', () => {
    // Only RT given: 80 × 0.5 = 40 (no fallback applied because RT was provided)
    expect(composite({ rt: 80 })).toBe(40);
    // RT + MC: 80 × 0.5 + 70 × 0.3 = 40 + 21 = 61
    expect(composite({ rt: 80, metacritic: 70 })).toBe(61);
  });

  it('returns 0 when nothing is provided', () => {
    expect(composite({})).toBe(0);
  });

  it('treats null/undefined identically', () => {
    expect(composite({ rt: null as any, metacritic: undefined, imdb: 7 })).toBe(28);
  });
});
