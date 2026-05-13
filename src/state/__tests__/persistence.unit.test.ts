import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadJSON, saveJSON } from '../persistence';

describe('loadJSON', () => {
  beforeEach(() => localStorage.clear());

  it('returns the fallback when the key is missing', () => {
    expect(loadJSON('missing-key', { a: 1 })).toEqual({ a: 1 });
  });

  it('returns the fallback when stored value is empty string', () => {
    localStorage.setItem('k', '');
    expect(loadJSON('k', 'fb')).toBe('fb');
  });

  it('returns the parsed value when stored JSON is valid', () => {
    localStorage.setItem('k', JSON.stringify({ rd_api_key: 'abc', prefer_4k: true }));
    expect(loadJSON('k', {})).toEqual({ rd_api_key: 'abc', prefer_4k: true });
  });

  it('returns the fallback when stored value is corrupt JSON', () => {
    localStorage.setItem('k', '{not-json');
    expect(loadJSON('k', { ok: false })).toEqual({ ok: false });
  });

  it('returns the fallback when localStorage.getItem throws', () => {
    const orig = localStorage.getItem;
    localStorage.getItem = () => { throw new Error('SecurityError'); };
    try {
      expect(loadJSON('k', 99)).toBe(99);
    } finally {
      localStorage.getItem = orig;
    }
  });

  it('preserves array fallbacks (object identity not required, structure is)', () => {
    const fb: number[] = [];
    expect(loadJSON('k', fb)).toEqual([]);
  });
});

describe('saveJSON', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('serializes the value to JSON and writes it under the given key', () => {
    saveJSON('k', { x: 1, y: 'two' });
    expect(localStorage.getItem('k')).toBe('{"x":1,"y":"two"}');
  });

  it('overwrites a previously written value', () => {
    saveJSON('k', 1);
    saveJSON('k', 2);
    expect(localStorage.getItem('k')).toBe('2');
  });

  it('warns when localStorage throws QuotaExceededError (DOMException)', () => {
    const orig = localStorage.setItem;
    localStorage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    try {
      saveJSON('k', { big: 'x'.repeat(10) });
    } finally {
      localStorage.setItem = orig;
    }
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toBe('localStorage full');
  });

  it('swallows but does NOT warn on a non-QuotaExceeded DOMException', () => {
    const orig = localStorage.setItem;
    localStorage.setItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    try {
      saveJSON('k', { x: 1 });
    } finally {
      localStorage.setItem = orig;
    }
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('swallows but does NOT warn on a plain Error', () => {
    const orig = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('something else'); };
    try {
      saveJSON('k', { x: 1 });
    } finally {
      localStorage.setItem = orig;
    }
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
