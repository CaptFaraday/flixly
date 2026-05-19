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
  [/\b(english|eng)\b/i, 'en'],
  [/\b(spanish|esp|latino|castellano)\b/i, 'es'],
  [/\b(french|fre|fra|truefrench|vff|vfq|vfi|vf)\b/i, 'fr'],
  [/\b(german|ger|deu|deutsch)\b/i, 'de'],
  [/\b(japanese|jpn|jap)\b/i, 'ja'],
  [/\b(hindi|hin)\b/i, 'hi'],
  [/\b(korean|kor)\b/i, 'ko'],
  [/\b(italian|ita)\b/i, 'it'],
  [/\b(portuguese|por|dublado|nacional)\b/i, 'pt'],
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

// MULTi / DUAL audio tag — release contains multiple audio tracks. The
// original language (typically English) is included alongside any detected
// dub, so we add 'en' to the detected language set. Based on the conventions
// surveyed in oleoo and parse-torrent-title's `langs` table.
const MULTI_AUDIO_PATTERN = /\b(multi\d*|dual[\s._-]?audio|multilang)\b/i;

export function parseName(name: string): ParsedName {
  const langs = LANG_PATTERNS.filter(([re]) => re.test(name)).map(([, code]) => code);
  const isMulti = MULTI_AUDIO_PATTERN.test(name);
  const set = new Set(langs);
  if (isMulti) set.add('en');
  const audio_languages = set.size > 0 ? Array.from(set) : ['en'];
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
