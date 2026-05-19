import { describe, it, expect } from 'vitest';
import { parseName } from './parse-name';

describe('parseName', () => {
  it('parses a typical 1080p WEB-DL', () => {
    const p = parseName('Dune.Part.Two.2024.1080p.WEB-DL.DDP5.1.H.264-FLUX.mkv');
    expect(p.resolution).toBe('1080p');
    expect(p.video_codec).toBe('h264');
    expect(p.audio_codec).toBe('eac3');
    expect(p.source).toBe('webdl');
    expect(p.container).toBe('mkv');
    expect(p.group).toBe('FLUX');
  });

  it('parses 4K HDR REMUX with TrueHD', () => {
    const p = parseName('Anora.2024.2160p.BluRay.REMUX.HEVC.TrueHD.7.1.Atmos-FraMeSToR.mkv');
    expect(p.resolution).toBe('2160p');
    expect(p.video_codec).toBe('h265');
    expect(p.audio_codec).toBe('truehd');
    expect(p.source).toBe('remux');
  });

  it('extracts language tags', () => {
    const p = parseName('Movie.2024.1080p.MULTI.ENG.HINDI.x264-GROUP.mkv');
    expect(p.audio_languages.sort()).toEqual(['en', 'hi']);
  });

  it('defaults to English when no language is mentioned', () => {
    const p = parseName('Movie.2024.1080p.WEB-DL.x264.mkv');
    expect(p.audio_languages).toEqual(['en']);
  });

  it('handles HEVC variants', () => {
    expect(parseName('X.2024.HEVC.mkv').video_codec).toBe('h265');
    expect(parseName('X.2024.x265.mkv').video_codec).toBe('h265');
    expect(parseName('X.2024.h.265.mkv').video_codec).toBe('h265');
  });

  it('handles AAC vs DDP variants', () => {
    expect(parseName('X.AAC.mp4').audio_codec).toBe('aac');
    expect(parseName('X.DDP5.1.mkv').audio_codec).toBe('eac3');
    expect(parseName('X.DD5.1.mkv').audio_codec).toBe('ac3');
    expect(parseName('X.DTS-HD.mkv').audio_codec).toBe('dts');
  });

  it('returns undefined for fields not detectable', () => {
    const p = parseName('Random.mkv');
    expect(p.resolution).toBeUndefined();
    expect(p.video_codec).toBeUndefined();
  });

  it('detects Dublado as Portuguese-only audio (no implicit English)', () => {
    const p = parseName('Project.Hail.Mary.2026.1080p.WEBRip.Dublado.mkv');
    expect(p.audio_languages).toEqual(['pt']);
  });

  it('detects Latino as Spanish-only audio', () => {
    const p = parseName('Movie.2024.1080p.WEBRip.Latino.x264.mkv');
    expect(p.audio_languages).toEqual(['es']);
  });

  it('detects Castellano as Spanish-only audio', () => {
    const p = parseName('Movie.2024.1080p.WEBRip.Castellano.x264.mkv');
    expect(p.audio_languages).toEqual(['es']);
  });

  it('detects French dub markers TRUEFRENCH and VFF/VFQ/VFI as French-only audio', () => {
    expect(parseName('Movie.2024.1080p.TRUEFRENCH.WEB-DL.x264.mkv').audio_languages).toEqual(['fr']);
    expect(parseName('Movie.2024.1080p.VFF.WEB-DL.x264.mkv').audio_languages).toEqual(['fr']);
    expect(parseName('Movie.2024.1080p.VFQ.WEB-DL.x264.mkv').audio_languages).toEqual(['fr']);
    expect(parseName('Movie.2024.1080p.VFI.WEB-DL.x264.mkv').audio_languages).toEqual(['fr']);
  });

  it('detects bare VF as French (but not VFF/VFQ/VFI which already matched as French)', () => {
    expect(parseName('Movie.2024.1080p.VF.WEB-DL.x264.mkv').audio_languages).toEqual(['fr']);
  });

  it('does not tag VOSTFR (French subtitles, original audio) as French audio', () => {
    // VOSTFR = Version Originale Sous-Titrée Français — audio is original
    // language, subs are French. Must not be detected as French audio.
    const p = parseName('Movie.2024.1080p.VOSTFR.WEB-DL.x264.mkv');
    expect(p.audio_languages).toEqual(['en']);
  });

  it('treats MULTi tag as multi-audio: adds English to the detected dub language', () => {
    // MULTi = multi-language release. Original (English) audio track is
    // included alongside the dub, so the user with audio_language=en still
    // gets a playable track.
    const p = parseName('Movie.2024.1080p.MULTi.VFF.WEB-DL.x264.mkv');
    expect(p.audio_languages.sort()).toEqual(['en', 'fr']);
  });

  it('does not tag Legendado (Portuguese subs, original audio) as Portuguese audio', () => {
    // Legendado = subtitled. Audio is original language; subs are Portuguese.
    // Must not be detected as Portuguese audio.
    const p = parseName('Movie.2024.1080p.Legendado.WEB-DL.x264.mkv');
    expect(p.audio_languages).toEqual(['en']);
  });

  it('detects Nacional (Brazilian-domestic synonym for Dublado) as Portuguese', () => {
    const p = parseName('Movie.2024.1080p.Nacional.WEB-DL.x264.mkv');
    expect(p.audio_languages).toEqual(['pt']);
  });

  it('detects Deutsch (German native marker) as German', () => {
    const p = parseName('Movie.2024.1080p.Deutsch.WEB-DL.x264.mkv');
    expect(p.audio_languages).toEqual(['de']);
  });
});
