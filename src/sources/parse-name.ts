import type { ParsedName } from '../types';

const RES_PATTERNS: Array<[RegExp, ParsedName['resolution']]> = [
  [/\b(2160p|4k|uhd)\b/i, '2160p'],
  [/\b1080p\b/i, '1080p'],
  [/\b720p\b/i, '720p'],
];

const VCODEC_PATTERNS: Array<[RegExp, ParsedName['video_codec']]> = [
  [/\b(hevc|h\.?265|x265)\b/i, 'h265'],
  [/\b(avc|h\.?264|x264)\b/i, 'h264'],
  [/\bvp9\b/i, 'vp9'],
  [/\bav1\b/i, 'av1'],
];

const ACODEC_PATTERNS: Array<[RegExp, ParsedName['audio_codec']]> = [
  [/\btrue.?hd\b/i, 'truehd'],
  [/\bdts(.hd)?\b/i, 'dts'],
  [/\bflac\b/i, 'flac'],
  [/\bopus\b/i, 'opus'],
  [/\b(ddp|e.?ac.?3|eac3)/i, 'eac3'],
  [/\b(dd|ac.?3|ac3)/i, 'ac3'],
  [/\baac\b/i, 'aac'],
];

const SOURCE_PATTERNS: Array<[RegExp, ParsedName['source']]> = [
  [/\bremux\b/i, 'remux'],
  [/\b(bluray|bdrip)\b/i, 'bluray'],
  [/\bweb.?dl\b/i, 'webdl'],
  [/\bweb.?rip\b/i, 'webrip'],
  [/\bhdtv\b/i, 'hdtv'],
  [/\bdvdrip\b/i, 'dvdrip'],
];

const LANG_PATTERNS: Array<[RegExp, string]> = [
  [/\benglish|eng\b/i, 'en'],
  [/\bspanish|esp\b/i, 'es'],
  [/\bfrench|fre|fra\b/i, 'fr'],
  [/\bgerman|ger|deu\b/i, 'de'],
  [/\bjapanese|jpn|jap\b/i, 'ja'],
  [/\bhindi|hin\b/i, 'hi'],
  [/\bkorean|kor\b/i, 'ko'],
  [/\bitalian|ita\b/i, 'it'],
  [/\bportuguese|por\b/i, 'pt'],
];

const CONTAINER_PATTERNS: Array<[RegExp, ParsedName['container']]> = [
  [/\.mp4$/i, 'mp4'],
  [/\.mkv$/i, 'mkv'],
  [/\.webm$/i, 'webm'],
  [/\.avi$/i, 'avi'],
];

const GROUP_PATTERN = /-([A-Za-z0-9]+)(?:\.[a-z0-9]+)?$/;

function firstMatch<T>(name: string, patterns: Array<[RegExp, T]>): T | undefined {
  for (const [re, val] of patterns) if (re.test(name)) return val;
  return undefined;
}

export function parseName(name: string): ParsedName {
  const langs = LANG_PATTERNS.filter(([re]) => re.test(name)).map(([, code]) => code);
  const audio_languages = langs.length > 0 ? Array.from(new Set(langs)) : ['en'];
  return {
    resolution: firstMatch(name, RES_PATTERNS),
    video_codec: firstMatch(name, VCODEC_PATTERNS),
    audio_codec: firstMatch(name, ACODEC_PATTERNS),
    source: firstMatch(name, SOURCE_PATTERNS),
    container: firstMatch(name, CONTAINER_PATTERNS),
    group: name.match(GROUP_PATTERN)?.[1],
    audio_languages,
  };
}
