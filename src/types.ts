export interface Scores {
  rt?: number;
  metacritic?: number;
  imdb?: number;
}

export interface Movie {
  imdb_id: string;
  tmdb_id: number;
  title: string;
  year: number;
  runtime: number;             // minutes
  genres: string[];
  poster: string;              // URL
  backdrop: string;            // URL
  logo?: string;               // URL
  overview: string;
  scores: Scores;
  digital_release_date?: string; // ISO date
  director?: string;
  cast: string[];
}

export interface Row {
  id: string;
  display: 'row';
  title: string;
  subtitle?: string;
  items: Movie[];
}

export interface Collection {
  id: string;
  display: 'collection';
  title: string;
  logo_url?: string;
  background_color?: string;
  items: Movie[];
}

export type Shelf = Row | Collection;

export interface RowsFile {
  generated_at: string;
  shelves: Shelf[];
}

export interface ParsedName {
  resolution?: '720p' | '1080p' | '2160p' | '4k';
  video_codec?: 'h264' | 'h265' | 'vp9' | 'av1';
  audio_codec?: 'aac' | 'ac3' | 'eac3' | 'dts' | 'truehd' | 'flac' | 'opus';
  audio_languages: string[];   // ISO 639-1 codes parsed from filename, e.g. ['en']
  source?: 'remux' | 'bluray' | 'webdl' | 'webrip' | 'hdtv' | 'dvdrip';
  group?: string;
  container?: 'mp4' | 'mkv' | 'webm' | 'avi';
}

export interface StreamCandidate {
  hash: string;                // info hash
  filename: string;
  bytes: number;
  seeds: number;
  parsed: ParsedName;
}

export interface RDStream {
  url: string;                 // unrestricted CDN URL
  filename: string;
  bytes: number;
}

export interface Capabilities {
  codecs: {
    h264: boolean;
    h265_main: boolean;
    h265_main10: boolean;
    vp9: boolean;
    av1: boolean;
    aac: boolean;
    ac3: boolean;
    eac3: boolean;
  };
  bandwidthMbps: number;
  probedAt: number;            // epoch ms
}

export interface Settings {
  rd_api_key: string;
  prefer_4k: boolean;
  audio_language: 'en' | 'es' | 'fr' | 'de' | 'ja' | 'any';
  require_subtitles: boolean;
}

export interface ResumePosition {
  imdb_id: string;
  position_seconds: number;
  duration_seconds: number;
  updated_at: number;          // epoch ms
}
