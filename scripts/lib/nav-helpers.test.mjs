import { describe, it, expect } from 'vitest';
import { shouldSkipFocusId } from './nav-helpers.mjs';

describe('shouldSkipFocusId', () => {
  it('returns true for brand shelf collection tiles', () => {
    expect(shouldSkipFocusId('brand-marvel')).toBe(true);
  });

  it('returns true for top-nav items', () => {
    expect(shouldSkipFocusId('nav-home')).toBe(true);
    expect(shouldSkipFocusId('nav-search')).toBe(true);
  });

  it('returns false for poster cards (the row destinations)', () => {
    expect(shouldSkipFocusId('poster-trending-tt1234567')).toBe(false);
  });

  it('returns false for null / undefined / empty inputs', () => {
    expect(shouldSkipFocusId(null)).toBe(false);
    expect(shouldSkipFocusId(undefined)).toBe(false);
    expect(shouldSkipFocusId('')).toBe(false);
  });
});
