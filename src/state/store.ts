import { signal, effect } from '@preact/signals';
import type { Settings, ResumePosition } from '../types';
import { loadJSON, saveJSON } from './persistence';

const defaultSettings: Settings = {
  rd_api_key: '',
  prefer_4k: false,
  audio_language: 'en',
  require_subtitles: true,
};

export const settings = signal<Settings>(loadJSON('settings-v1', defaultSettings));
export const watchlist = signal<string[]>(loadJSON('watchlist-v1', []));        // imdb_ids
export const resumePositions = signal<Record<string, ResumePosition>>(loadJSON('resume-v1', {}));

effect(() => saveJSON('settings-v1', settings.value));
effect(() => saveJSON('watchlist-v1', watchlist.value));
effect(() => saveJSON('resume-v1', resumePositions.value));

export function setRDKey(key: string): void {
  settings.value = { ...settings.value, rd_api_key: key };
}
export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  settings.value = { ...settings.value, [key]: value };
}
export function toggleWatchlist(imdb_id: string): void {
  const list = watchlist.value;
  watchlist.value = list.includes(imdb_id) ? list.filter((id) => id !== imdb_id) : [...list, imdb_id];
}
export function recordResume(imdb_id: string, position_seconds: number, duration_seconds: number): void {
  resumePositions.value = {
    ...resumePositions.value,
    [imdb_id]: { imdb_id, position_seconds, duration_seconds, updated_at: Date.now() },
  };
}
