import { describe, it, expect } from 'vitest';
import { releaseGroupBonus } from './release-groups';

describe('releaseGroupBonus', () => {
  it('returns 0 for undefined / unknown groups', () => {
    expect(releaseGroupBonus(undefined)).toBe(0);
    expect(releaseGroupBonus('SomeRandomGroupNobodyKnows')).toBe(0);
  });

  it('returns a positive bonus for premium remux groups (TRaSH Remux Tier 01)', () => {
    expect(releaseGroupBonus('FraMeSToR')).toBeGreaterThan(0);
    expect(releaseGroupBonus('BiZKiT')).toBeGreaterThan(0);
    expect(releaseGroupBonus('ZQ')).toBeGreaterThan(0);
  });

  it('returns a positive bonus for premium WEB-DL groups (TRaSH WEB Tier 01)', () => {
    expect(releaseGroupBonus('FLUX')).toBeGreaterThan(0);
    expect(releaseGroupBonus('NTb')).toBeGreaterThan(0);
    expect(releaseGroupBonus('APEX')).toBeGreaterThan(0);
  });

  it('returns a negative penalty for low-quality groups (TRaSH LQ list)', () => {
    expect(releaseGroupBonus('YTS')).toBeLessThan(0);
    expect(releaseGroupBonus('YIFY')).toBeLessThan(0);
    expect(releaseGroupBonus('Tigole')).toBeLessThan(0);
    expect(releaseGroupBonus('GalaxyRG')).toBeLessThan(0);
  });

  it('matches case-insensitively (release-group capitalization varies)', () => {
    expect(releaseGroupBonus('flux')).toBe(releaseGroupBonus('FLUX'));
    expect(releaseGroupBonus('yts')).toBe(releaseGroupBonus('YTS'));
  });
});
