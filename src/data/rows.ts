import type { RowsFile } from '../types';
import sample from '../../public/sample-rows.json';

const CACHE_KEY = 'rows-cache-v1';

/**
 * MVP: bundle sample-rows.json into the build (file:// fetch is blocked in Chromium 79).
 * Plan 2 (rows.json backend) will replace this with a fetch from
 *   https://raw.githubusercontent.com/<user>/<repo>/main/rows.json
 * with localStorage fallback for offline/network-failure cases.
 */
export async function fetchRows(): Promise<RowsFile> {
  const data = sample as RowsFile;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* quota: ignore */ }
  return data;
}
