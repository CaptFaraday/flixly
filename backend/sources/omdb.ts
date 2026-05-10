const BASE = 'https://www.omdbapi.com/';

export interface OmdbScores {
  rt: number | null;          // 0-100
  metacritic: number | null;  // 0-100
  imdb: number | null;        // 0-10
}

const NULL_SCORES: OmdbScores = { rt: null, metacritic: null, imdb: null };

export class OmdbClient {
  constructor(private apiKey: string) {}

  /**
   * Best-effort score lookup. Never throws — failures (network, rate-limit,
   * not-found, missing fields) all collapse to nulls so the caller can
   * fall back to TMDb data without try/catch noise.
   */
  async getScores(imdbId: string): Promise<OmdbScores> {
    const url = `${BASE}?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(this.apiKey)}`;
    let raw: any;
    try {
      const r = await fetch(url);
      if (!r.ok) return NULL_SCORES;
      raw = await r.json();
    } catch {
      return NULL_SCORES;
    }
    if (raw.Response !== 'True') return NULL_SCORES;

    const rtRating = (raw.Ratings ?? []).find((r: any) => r.Source === 'Rotten Tomatoes');
    const rt = rtRating ? parseInt(String(rtRating.Value).replace('%', ''), 10) : NaN;

    const mc = parseInt(raw.Metascore, 10);
    const imdb = parseFloat(raw.imdbRating);

    return {
      rt: Number.isFinite(rt) ? rt : null,
      metacritic: Number.isFinite(mc) ? mc : null,
      imdb: Number.isFinite(imdb) ? imdb : null,
    };
  }
}
