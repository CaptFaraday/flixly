import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyOverride, loadOverrides } from './metadata-overrides';

describe('applyOverride', () => {
  it('returns the input unchanged when no override is defined for this tmdb_id', () => {
    const movie = { tmdb_id: 999999, year: 2020, title: 'Some Movie' };
    expect(applyOverride(movie, {})).toEqual(movie);
  });

  it('replaces the year when an override exists for the tmdb_id', () => {
    const movie = { tmdb_id: 556574, year: 2025, title: 'Hamilton' };
    const overrides = { '556574': { year: 2020 } };
    expect(applyOverride(movie, overrides)).toEqual({ tmdb_id: 556574, year: 2020, title: 'Hamilton' });
  });

  it('skips override keys whose name starts with underscore (comment fields)', () => {
    // The JSON file uses _comment / _reason / _title fields for human-
    // readable annotations. Those must not be treated as override data
    // even though they appear at the override object's top level.
    const movie = { tmdb_id: 1, year: 2025 };
    const overrides = { '1': { _title: 'Hamilton', _reason: 'because', year: 2020 } as any };
    expect(applyOverride(movie, overrides)).toEqual({ tmdb_id: 1, year: 2020 });
  });
});

describe('loadOverrides', () => {
  it('returns {} when the file does not exist (no overrides configured is the default)', () => {
    expect(loadOverrides('/nonexistent/path/that/should/not/exist.json')).toEqual({});
  });

  it('parses overrides from a real file on disk', () => {
    const dir = join(tmpdir(), 'flixly-overrides-test-' + Date.now());
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'overrides.json');
    try {
      writeFileSync(path, JSON.stringify({ '556574': { year: 2020 } }), 'utf8');
      const loaded = loadOverrides(path);
      expect(loaded['556574']).toEqual({ year: 2020 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
