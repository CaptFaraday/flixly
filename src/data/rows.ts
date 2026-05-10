import type { RowsFile } from '../types';

const SAMPLE_URL = '/sample-rows.json';
const CACHE_KEY = 'rows-cache-v1';

export async function fetchRows(): Promise<RowsFile> {
  try {
    const r = await fetch(SAMPLE_URL, { cache: 'default' });
    if (!r.ok) throw new Error(`rows fetch ${r.status}`);
    const data = (await r.json()) as RowsFile;
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    return data;
  } catch (e) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached) as RowsFile;
    throw e;
  }
}
