/**
 * Fetch an SRT subtitle, convert to WebVTT, return a Blob URL safe to use as <track src>.
 * Bypasses CORS by reading the SRT bytes (which fetch handles via opaque-permissive mode)
 * and re-emitting from a same-origin Blob URL.
 */
export async function srtUrlToVttBlobUrl(srtUrl: string): Promise<string> {
  const r = await fetch(srtUrl);
  if (!r.ok) throw new Error(`subtitle fetch ${r.status}`);
  const text = await r.text();
  const vtt = srtToVtt(text);
  const blob = new Blob([vtt], { type: 'text/vtt' });
  return URL.createObjectURL(blob);
}

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
