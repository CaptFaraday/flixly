import { describe, it, expect, vi } from 'vitest';
import { resolveDigitalReleaseDate } from './digital-release';

describe('resolveDigitalReleaseDate', () => {
  it('returns digital_us when present', async () => {
    const tmdb = { getReleaseDates: vi.fn().mockResolvedValue({ digital_us: '2024-04-16' }) };
    expect(await resolveDigitalReleaseDate(tmdb as any, 1)).toBe('2024-04-16');
  });

  it('returns release_date as fallback when no digital window exists', async () => {
    const tmdb = {
      getReleaseDates: vi.fn().mockResolvedValue({ digital_us: undefined }),
      getDetails: vi.fn().mockResolvedValue({ release_date: '2024-03-01' } as any),
    };
    expect(await resolveDigitalReleaseDate(tmdb as any, 1)).toBe('2024-03-01');
  });

  it('caches per call so repeated lookups hit the network once', async () => {
    const getReleaseDates = vi.fn().mockResolvedValue({ digital_us: '2024-04-16' });
    const tmdb = { getReleaseDates };
    const cache = new Map<number, Promise<string | undefined>>();
    await resolveDigitalReleaseDate(tmdb as any, 1, cache);
    await resolveDigitalReleaseDate(tmdb as any, 1, cache);
    expect(getReleaseDates).toHaveBeenCalledTimes(1);
  });
});
