import { describe, it, expect } from 'vitest';
import { videoMimeForCodec, audioMimeForCodec } from './codecMime';

describe('videoMimeForCodec', () => {
  it('wraps HEVC hvc1 in video/mp4 MIME', () => {
    expect(videoMimeForCodec('hvc1.2.4.L153.B0')).toBe('video/mp4; codecs="hvc1.2.4.L153.B0"');
  });
});

describe('audioMimeForCodec', () => {
  it('wraps AC-3 in audio/mp4 MIME', () => {
    expect(audioMimeForCodec('ac-3')).toBe('audio/mp4; codecs="ac-3"');
  });
});
