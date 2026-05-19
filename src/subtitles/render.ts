/**
 * Fetch an SRT subtitle, convert to WebVTT, return a Blob URL safe to use as <track src>.
 * Bypasses CORS by reading the SRT bytes (which fetch handles via opaque-permissive mode)
 * and re-emitting from a same-origin Blob URL.
 */
export async function srtUrlToVttBlobUrl(srtUrl: string): Promise<string> {
  const r = await fetch(srtUrl);
  if (!r.ok) throw new Error(`subtitle fetch ${r.status}`);
  const text = await r.text();
  const cleaned = stripAdLines(text);
  const vtt = srtToVtt(cleaned);
  const blob = new Blob([vtt], { type: 'text/vtt' });
  return URL.createObjectURL(blob);
}

/**
 * Drop ad/promo cues from an SRT string. Splits on the blank-line cue
 * separator, drops a cue entirely (timing + cue number) if any of its
 * text lines matches an ad pattern. Half-stripped cues can leave
 * dangling fragments on-screen, so we keep-or-drop the whole cue.
 *
 * Pattern set follows the subclean / subcleaner conventions used by
 * Bazarr post-processors: links to subtitle sites + the OS REST API's
 * "become a VIP member to remove ads" boilerplate.
 */
export function stripAdLines(srt: string): string {
  const cues = srt.split(/\r?\n\r?\n/);
  const kept = cues.filter((cue) => {
    const lines = cue.split(/\r?\n/);
    const body = lines.slice(2).join(' ');
    return !AD_PATTERN.test(body);
  });
  return kept.join('\n\n');
}

const AD_PATTERN = /opensubtitles|yts|yify|subscene|addic7ed|\bsubtitles?\s+(by|:)|\btranslated?\s+by\b|\bsync(ed)?\s+and\s+correct|@(gmail|outlook|hotmail|protonmail|yahoo|pm\.me)\b/i;

export function srtToVtt(srt: string): string {
  // Strip BOM
  const stripped = srt.replace(/^﻿/, '');
  // Convert SRT timestamps `00:01:23,456` to VTT `00:01:23.456`
  // SRT also uses sequence numbers on their own line; VTT tolerates them, so leave them.
  const converted = stripped.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2',
  );
  return `WEBVTT\n\n${converted.trim()}\n`;
}
