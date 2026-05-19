import { describe, it, expect, vi } from 'vitest';
import { stripAdLines, srtUrlToVttBlobUrl } from './render';

const cue = (n: number, body: string) =>
  `${n}\n00:00:${String(n).padStart(2, '0')},000 --> 00:00:${String(n + 1).padStart(2, '0')},000\n${body}\n`;

describe('stripAdLines', () => {
  it('drops cues that promote opensubtitles', () => {
    const srt = [cue(1, 'Real dialogue here'), cue(2, 'Support us and become a VIP member to remove all ads from www.OpenSubtitles.org')].join('\n');
    const out = stripAdLines(srt);
    expect(out).not.toMatch(/OpenSubtitles/i);
    expect(out).toContain('Real dialogue here');
  });

  it('drops cues that promote YTS / YIFY', () => {
    const srt = [cue(1, 'Some line'), cue(2, 'Visit YTS.MX for more movies'), cue(3, 'Brought to you by YIFY')].join('\n');
    const out = stripAdLines(srt);
    expect(out).not.toMatch(/YTS\.MX/i);
    expect(out).not.toMatch(/YIFY/i);
    expect(out).toContain('Some line');
  });

  it('drops cues that promote other subtitle sites (subscene, addic7ed)', () => {
    const srt = [cue(1, 'Hi'), cue(2, 'Download from subscene.com'), cue(3, 'Sync by addic7ed.com')].join('\n');
    const out = stripAdLines(srt);
    expect(out).not.toMatch(/subscene/i);
    expect(out).not.toMatch(/addic7ed/i);
    expect(out).toContain('Hi');
  });

  it('preserves dialogue that contains the substring "yts" inside a real word ("bytes")', () => {
    // /yts/i without word boundaries would falsely match "bytes". Verify
    // the pattern is anchored so common English words survive.
    const srt = [cue(1, 'The drive has only 64 bytes left.')].join('\n');
    const out = stripAdLines(srt);
    expect(out).toContain('64 bytes left');
  });

  it('drops cues that are uploader/translator credit lines', () => {
    const srt = [
      cue(1, 'Dialogue cue'),
      cue(2, 'Subtitles by John Doe'),
      cue(3, 'Translated by FooBar'),
      cue(4, 'Synced and corrected by qux'),
    ].join('\n');
    const out = stripAdLines(srt);
    expect(out).not.toMatch(/Subtitles by/i);
    expect(out).not.toMatch(/Translated by/i);
    expect(out).not.toMatch(/Synced and corrected/i);
    expect(out).toContain('Dialogue cue');
  });

  it('drops cues containing personal email addresses (gmail, hotmail, protonmail, etc.)', () => {
    const srt = [
      cue(1, 'Dialogue line'),
      cue(2, 'Contact me at translator@gmail.com'),
      cue(3, 'support@protonmail.com'),
    ].join('\n');
    const out = stripAdLines(srt);
    expect(out).not.toMatch(/@gmail\.com/i);
    expect(out).not.toMatch(/@protonmail\.com/i);
    expect(out).toContain('Dialogue line');
  });
});

describe('srtUrlToVttBlobUrl', () => {
  it('strips ad cues from the fetched SRT before emitting the VTT blob', async () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\nVisit YTS.MX for more\n\n2\n00:00:03,000 --> 00:00:04,000\nReal dialogue\n';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(srt, { status: 200 }));
    let captured: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => { captured = obj as Blob; return 'blob:fake'; });
    await srtUrlToVttBlobUrl('about:test');
    const text = await captured!.text();
    expect(text).not.toMatch(/YTS\.MX/i);
    expect(text).toContain('Real dialogue');
    vi.restoreAllMocks();
  });
});
