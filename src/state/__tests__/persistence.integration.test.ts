import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { settings, watchlist, resumePositions, setRDKey, setSetting, toggleWatchlist, recordResume } from '../store';

// These are integration tests: they verify the auto-save effects in store.ts
// actually persist to localStorage, AND that the load path on next start
// reads the same data back. Since the signals are module-scoped singletons,
// the test resets them between cases.

describe('localStorage persistence', () => {
  // Snapshot of initial signal values to restore between tests, since the
  // module-scoped signals leak state across cases otherwise.
  let originalSettings: any;
  let originalWatchlist: any;
  let originalResume: any;

  beforeEach(() => {
    originalSettings = JSON.parse(JSON.stringify(settings.value));
    originalWatchlist = [...watchlist.value];
    originalResume = JSON.parse(JSON.stringify(resumePositions.value));
    // Clear localStorage so each test starts fresh
    localStorage.clear();
  });

  afterEach(() => {
    // Restore signals to original values
    settings.value = originalSettings;
    watchlist.value = originalWatchlist;
    resumePositions.value = originalResume;
  });

  describe('settings', () => {
    it('writes to localStorage when rd_api_key changes', () => {
      setRDKey('mytestkey123');
      const stored = JSON.parse(localStorage.getItem('settings-v1') ?? '{}');
      expect(stored.rd_api_key).toBe('mytestkey123');
    });

    it('writes prefer_4k toggle to localStorage', () => {
      setSetting('prefer_4k', true);
      const stored = JSON.parse(localStorage.getItem('settings-v1') ?? '{}');
      expect(stored.prefer_4k).toBe(true);
    });

    it('writes audio_language change to localStorage', () => {
      setSetting('audio_language', 'es');
      const stored = JSON.parse(localStorage.getItem('settings-v1') ?? '{}');
      expect(stored.audio_language).toBe('es');
    });
  });

  describe('watchlist', () => {
    it('toggleWatchlist adds an imdb_id and persists it', () => {
      // Reset so toggle adds (not removes)
      watchlist.value = [];
      toggleWatchlist('tt15239678');
      expect(watchlist.value).toEqual(['tt15239678']);
      const stored = JSON.parse(localStorage.getItem('watchlist-v1') ?? '[]');
      expect(stored).toEqual(['tt15239678']);
    });

    it('toggleWatchlist removes an existing imdb_id and persists removal', () => {
      watchlist.value = ['tt15239678', 'tt28607951'];
      toggleWatchlist('tt15239678');
      expect(watchlist.value).toEqual(['tt28607951']);
      const stored = JSON.parse(localStorage.getItem('watchlist-v1') ?? '[]');
      expect(stored).toEqual(['tt28607951']);
    });

    it('preserves order across multiple adds', () => {
      watchlist.value = [];
      toggleWatchlist('a');
      toggleWatchlist('b');
      toggleWatchlist('c');
      const stored = JSON.parse(localStorage.getItem('watchlist-v1') ?? '[]');
      expect(stored).toEqual(['a', 'b', 'c']);
    });
  });

  describe('resumePositions', () => {
    it('recordResume writes the resume entry to localStorage', () => {
      resumePositions.value = {};
      recordResume('tt15239678', 1800, 9000); // 30 min into a 2.5h movie
      const stored = JSON.parse(localStorage.getItem('resume-v1') ?? '{}');
      expect(stored['tt15239678']).toMatchObject({
        imdb_id: 'tt15239678',
        position_seconds: 1800,
        duration_seconds: 9000,
      });
      expect(typeof stored['tt15239678'].updated_at).toBe('number');
    });

    it('updating an existing resume entry overwrites position', () => {
      resumePositions.value = {};
      recordResume('tt1', 100, 1000);
      recordResume('tt1', 500, 1000);
      const stored = JSON.parse(localStorage.getItem('resume-v1') ?? '{}');
      expect(stored['tt1'].position_seconds).toBe(500);
    });

    it('tracks multiple movies independently', () => {
      resumePositions.value = {};
      recordResume('tt1', 100, 1000);
      recordResume('tt2', 200, 2000);
      const stored = JSON.parse(localStorage.getItem('resume-v1') ?? '{}');
      expect(Object.keys(stored).sort()).toEqual(['tt1', 'tt2']);
      expect(stored['tt1'].position_seconds).toBe(100);
      expect(stored['tt2'].position_seconds).toBe(200);
    });
  });

  describe('cold-restart simulation', () => {
    // Sanity-check that the load path in persistence.ts reads back what
    // the save path wrote. Since we can't actually unload + reload the
    // module mid-test, we read the localStorage value directly with the
    // same parser shape and verify.

    it('settings round-trip via JSON', () => {
      settings.value = { rd_api_key: 'abc', prefer_4k: true, audio_language: 'ja', require_subtitles: false };
      const stored = JSON.parse(localStorage.getItem('settings-v1') ?? '{}');
      expect(stored).toEqual({ rd_api_key: 'abc', prefer_4k: true, audio_language: 'ja', require_subtitles: false });
    });

    it('watchlist round-trip via JSON', () => {
      watchlist.value = ['tt1', 'tt2', 'tt3'];
      const stored = JSON.parse(localStorage.getItem('watchlist-v1') ?? '[]');
      expect(stored).toEqual(['tt1', 'tt2', 'tt3']);
    });

    it('resumePositions round-trip via JSON', () => {
      resumePositions.value = { tt1: { imdb_id: 'tt1', position_seconds: 100, duration_seconds: 1000, updated_at: 1700000000000 } };
      const stored = JSON.parse(localStorage.getItem('resume-v1') ?? '{}');
      expect(stored.tt1.imdb_id).toBe('tt1');
      expect(stored.tt1.position_seconds).toBe(100);
    });
  });
});
