// Multi-provider subtitle cascade. Two effectively-distinct providers
// despite the shared OpenSubtitles brand:
//
//   OS_BASE  — Stremio's official v3 OpenSubtitles addon. The blog post
//              at https://blog.stremio.com/opensubtitles-addon-fixed/
//              documents that this addon migrated to the newer
//              OpenSubtitles.com API (May 2024 onwards). Different
//              upload pool, different content, different rate limits
//              than the legacy OS.org REST below.
//
//   OS_REST  — Legacy OpenSubtitles.org REST API. No API key required;
//              only a "TemporaryUserAgent" header (OS's documented dev
//              placeholder, fine for personal-scale use). Critically,
//              this endpoint supports moviehash matching — the v3
//              addon does not. Hash-matched subs were uploaded for the
//              EXACT rip we're playing, so timing/cuts are guaranteed
//              correct.
//
// Industry parallel: Jellyfin chains OpenSubtitles → Subscene → Addic7ed.
// Subscene shut down in 2024 and Addic7ed has aggressive anti-bot
// protection, so the realistic 2026 chain is OS.com + OS.org — which is
// what we have. Adding SubDL or SubSource would add more coverage but
// no smoke run has yet observed a movie where both OS providers return
// empty AND the file would otherwise play; the marginal value is low
// until that scenario appears.
const OS_BASE = 'https://opensubtitles-v3.strem.io';
const OS_REST = 'https://rest.opensubtitles.org';
// "TemporaryUserAgent" is OS's documented dev placeholder. For production we
// would register a real UA at https://www.opensubtitles.org/en/dev — has
// higher rate limits but the temp UA works for personal-scale use.
const OS_UA = 'TemporaryUserAgent';

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

/**
 * Rich subtitle lookup by IMDb ID. Queries OpenSubtitles' legacy REST API
 * (NOT the Stremio v3 community addon — that one strips most metadata).
 * Returns subs with `MovieReleaseName`, `SubFileName`, rating, downloads,
 * etc. — enough to pick the best match for a specific rip when no
 * hash-matched sub exists.
 *
 * Caller picks the best entry via `pickBestSubForRip`.
 */
export interface RichSubtitle {
  url: string;
  lang: string;
  releaseName: string;
  fileName: string;
  downloads: number;
  rating: number;
  fps: number;
}
const richCache = new Map<string, RichSubtitle[]>();
export async function fetchSubtitlesByImdb(imdbId: string, lang = 'eng'): Promise<RichSubtitle[]> {
  const cacheKey = `${imdbId}:${lang}`;
  if (richCache.has(cacheKey)) return richCache.get(cacheKey)!;
  try {
    // OS expects the imdbid without the "tt" prefix.
    const id = imdbId.replace(/^tt/, '');
    const url = `${OS_REST}/search/imdbid-${id}/sublanguageid-${lang}`;
    const r = await fetch(url, { headers: { 'User-Agent': OS_UA } });
    if (!r.ok) { richCache.set(cacheKey, []); return []; }
    const data = await r.json() as Array<Record<string, string>>;
    if (!Array.isArray(data)) { richCache.set(cacheKey, []); return []; }
    const out = data
      .filter((s) => s.IDSubtitleFile)
      .map((s) => ({
        // OS REST API's SubDownloadLink is gzipped, and Chromium 79 has no
        // DecompressionStream (added in Chrome 80). Stremio operates a
        // public proxy at subs5.strem.io that takes an OS file ID, fetches
        // and decompresses, and returns plain SRT with the right
        // Content-Type. We construct that URL from IDSubtitleFile.
        url: stremioSubProxyUrl(s.IDSubtitleFile),
        lang: (s.ISO639 || lang).toLowerCase(),
        releaseName: s.MovieReleaseName || '',
        fileName: s.SubFileName || '',
        downloads: Number(s.SubDownloadsCnt || 0),
        rating: Number(s.SubRating || 0),
        fps: Number(s.MovieFPS || 0),
      }));
    richCache.set(cacheKey, out);
    return out;
  } catch {
    richCache.set(cacheKey, []);
    return [];
  }
}

function stremioSubProxyUrl(idSubtitleFile: string): string {
  return `https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/${idSubtitleFile}`;
}

/**
 * Score how well a subtitle matches a specific rip's filename for sync purposes.
 *
 * Returns 0–100. Hard filters return 0 (sync impossible):
 *   - Edit-tag mismatch (REMASTERED rip vs non-REMASTERED sub, etc.)
 *   - Source mismatch (BluRay sub on WEB-DL rip — different framerates)
 *
 * Surviving subs get a baseline 50, plus bonuses for same release group
 * (very strong correlation with same encode/timing).
 *
 * 50+ = "should sync"; 80+ = "very likely perfect"; 0 = "skip, will drift".
 */
export function scoreSubMatch(ripFilename: string, sub: RichSubtitle): number {
  const subText = `${sub.releaseName} ${sub.fileName}`;
  // HARD FILTER 1: edit-tag set must be identical. A REMASTERED edit has
  // different scene cuts than the original; subs WILL drift.
  const ripEdits = extractEditTags(ripFilename);
  const subEdits = extractEditTags(subText);
  if (!setsEqual(ripEdits, subEdits)) return 0;
  // HARD FILTER 2: source must match if detected for both. A BluRay sub on
  // a WEB-DL rip drifts because framerates differ (BluRay = 23.976fps,
  // WEB-DL often = 24fps or 25fps, depending on origin).
  const ripSource = extractSource(ripFilename);
  const subSource = extractSource(subText);
  if (ripSource && subSource && ripSource !== subSource) return 0;

  let score = 50;
  const ripGroup = extractGroup(ripFilename);
  const subGroup = extractGroup(subText);
  if (ripGroup && subGroup && ripGroup === subGroup) score += 35;
  // Edit/source match (when both have the tag) is a bigger signal than null/null.
  if (ripEdits.size > 0) score += 10;
  if (ripSource && subSource) score += 5;
  return Math.min(100, score);
}

const EDIT_TAG_PATTERNS: Array<[RegExp, string]> = [
  // REMASTERED variants. Tigole and other modern groups often tag remasters
  // as "RM4K" (or "4K REMASTER", "REMASTER 4K"). The plain "REMASTER" pattern
  // alone misses these — and a 4K-remaster has different scene cuts/timing
  // than the original release, so subs from the non-remaster ETRG/RARBG-style
  // rips drift. Real-world bug: "In Bruges (2008) RM4K (1080p ... Tigole)"
  // was getting "In.Bruges.2008.1080p.BluRay.x264.AC3-ETRG.eng.srt" attached.
  [/\bREMASTER(ED)?\b|\bRM4K\b|\b4K\s*REMASTER(ED)?\b|\bREMASTER(ED)?\s*4K\b/i, 'REMASTERED'],
  [/\bEXTENDED\b|\bEXT\.?CUT\b/i, 'EXTENDED'],
  [/\bUNRATED\b|\bUNCUT\b/i, 'UNRATED'],
  [/\bDIRECTOR'?S?[\s\.\-]?CUT\b|\bDCUT\b/i, 'DIRECTORS'],
  [/\bIMAX\b/i, 'IMAX'],
];
function extractEditTags(s: string): Set<string> {
  const out = new Set<string>();
  for (const [re, tag] of EDIT_TAG_PATTERNS) if (re.test(s)) out.add(tag);
  return out;
}
function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

const SOURCE_PATTERNS: Array<[RegExp, string]> = [
  [/\bREMUX\b/i, 'BLURAY'], // remux is BluRay-source
  [/\bBLU.?RAY\b|\bBDRIP\b|\bBDREMUX\b/i, 'BLURAY'],
  [/\bWEB.?DL\b/i, 'WEBDL'],
  [/\bWEB.?RIP\b/i, 'WEBRIP'],
  [/\bHDTV\b/i, 'HDTV'],
  [/\bDVDRIP\b|\bDVD\.RIP\b/i, 'DVDRIP'],
  [/\bWEB\b/i, 'WEBDL'], // bare "WEB" tag
];
function extractSource(s: string): string | null {
  for (const [re, src] of SOURCE_PATTERNS) if (re.test(s)) return src;
  return null;
}

// Release group is usually the trailing token after a final dash before the
// file extension. Examples: "Movie.2024.1080p.BluRay.x264-RARBG.mkv" → RARBG.
function extractGroup(filename: string): string | null {
  const m = filename.match(/-([A-Za-z0-9]+)(?:_eng)?\s?(?:SDH)?(?:\.[a-z0-9]+)?$/);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Pick the best sub for a rip, returning undefined when no sub scores
 * at least `minScore`. Use minScore=50 to require sync compatibility.
 */
export function pickBestSubForRip(
  subs: RichSubtitle[],
  ripFilename: string,
  minScore = 0,
): RichSubtitle | undefined {
  if (subs.length === 0) return undefined;
  const scored = subs
    .map((s) => ({ sub: s, score: scoreSubMatch(ripFilename, s) }))
    .filter((x) => x.score >= minScore);
  if (scored.length === 0) return undefined;
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.sub.downloads - a.sub.downloads;
  });
  return scored[0].sub;
}

/** Hash-matched subtitle lookup. */
export async function fetchSubtitlesByHash(hash: string, size: number, lang = 'eng'): Promise<SubtitleTrack[]> {
  try {
    const url = `${OS_REST}/search/moviebytesize-${size}/moviehash-${hash}/sublanguageid-${lang}`;
    const r = await fetch(url, { headers: { 'User-Agent': OS_UA } });
    if (!r.ok) return [];
    const data = await r.json() as Array<{
      IDSubtitleFile?: string;
      SubDownloadLink?: string;
      SubFormat?: string;
      SubLanguageID?: string;
      ISO639?: string;
      SubRating?: string;
      MatchedBy?: string;
    }>;
    if (!Array.isArray(data) || data.length === 0) return [];
    return data
      .filter((s) => s.IDSubtitleFile)
      .map((s) => ({
        id: s.IDSubtitleFile!,
        lang: (s.ISO639 || lang).toLowerCase(),
        // SubDownloadLink is gzipped and Chromium 79 has no DecompressionStream.
        // Route through Stremio's subs proxy which auto-decompresses and
        // returns plain SRT.
        url: stremioSubProxyUrl(s.IDSubtitleFile!),
      }));
  } catch {
    return [];
  }
}

/** Returns the set of language codes for which we have subtitles.
 *
 * Tries the Stremio v3 OpenSubtitles mirror first (fast, cached). If it
 * returns nothing — observed on tt33100314 / Remarkably Bright Creatures
 * where the v3 mirror has no English subs but the REST API has plenty —
 * fall back to the OS REST API for English specifically. Without this
 * fallback the picker rejects the entire movie as no_subtitles and the
 * user sees "Can't play right now" for movies that have working subs. */
export async function preflightSubtitles(imdbId: string): Promise<string[]> {
  const tracks = await fetchSubtitlesForMovie(imdbId);
  if (tracks.length > 0) {
    return Array.from(new Set(tracks.map((t) => normalizeLang(t.lang))));
  }
  const richEnglish = await fetchSubtitlesByImdb(imdbId, 'eng');
  return richEnglish.length > 0 ? ['en'] : [];
}

function normalizeLang(lang: string): string {
  // OpenSubtitles uses 3-letter codes; normalize to 2-letter where possible.
  const map: Record<string, string> = {
    eng: 'en', spa: 'es', fre: 'fr', ger: 'de', jpn: 'ja',
    hin: 'hi', kor: 'ko', ita: 'it', por: 'pt', rus: 'ru',
  };
  return map[lang.toLowerCase()] ?? lang.toLowerCase();
}
