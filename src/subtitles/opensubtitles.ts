const OS_BASE = 'https://opensubtitles-v3.strem.io';

export interface SubtitleTrack { lang: string; url: string; id: string; }

const cache = new Map<string, SubtitleTrack[]>();

export async function fetchSubtitlesForMovie(imdbId: string): Promise<SubtitleTrack[]> {
  if (cache.has(imdbId)) return cache.get(imdbId)!;
  try {
    const r = await fetch(`${OS_BASE}/subtitles/movie/${imdbId}.json`);
    if (!r.ok) throw new Error(`OS ${r.status}`);
    const data = (await r.json()) as { subtitles?: Array<{ lang: string; url: string; id: string }> };
    const tracks: SubtitleTrack[] = (data.subtitles ?? []).map((s) => ({ lang: s.lang, url: s.url, id: s.id }));
    cache.set(imdbId, tracks);
    return tracks;
  } catch {
    cache.set(imdbId, []);
    return [];
  }
}

/** Returns the set of language codes for which we have subtitles. */
export async function preflightSubtitles(imdbId: string): Promise<string[]> {
  const tracks = await fetchSubtitlesForMovie(imdbId);
  return Array.from(new Set(tracks.map((t) => normalizeLang(t.lang))));
}

function normalizeLang(lang: string): string {
  // OpenSubtitles uses 3-letter codes; normalize to 2-letter where possible.
  const map: Record<string, string> = {
    eng: 'en', spa: 'es', fre: 'fr', ger: 'de', jpn: 'ja',
    hin: 'hi', kor: 'ko', ita: 'it', por: 'pt', rus: 'ru',
  };
  return map[lang.toLowerCase()] ?? lang.toLowerCase();
}
