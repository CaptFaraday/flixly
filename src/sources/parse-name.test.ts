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
});
