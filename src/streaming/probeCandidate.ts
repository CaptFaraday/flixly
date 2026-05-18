import { Input, UrlSource, ALL_FORMATS } from 'mediabunny';

export interface ProbeOk {
  ok: true;
  videoCodec: string;
  audioCodec: string | null;
  audioLanguage: string | null;
  durationSec: number;
}
export interface ProbeFail {
  ok: false;
  reason: string;
}
export type ProbeResult = ProbeOk | ProbeFail;

export async function probeCandidate(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<ProbeResult> {
  const timeout = opts.timeoutMs ?? 8000;
  try {
    return await withTimeout(probe(url), timeout);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

async function probe(url: string): Promise<ProbeResult> {
  const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
  const videoTrack = await input.getPrimaryVideoTrack();
  const audioTrack = await input.getPrimaryAudioTrack();
  const durationSec = await input.computeDuration();
  return {
    ok: true,
    videoCodec: videoTrack!.codec!,
    audioCodec: audioTrack && audioTrack.codec ? audioTrack.codec : null,
    audioLanguage: audioTrack ? (audioTrack.languageCode || null) : null,
    durationSec,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('probe timeout')), ms)),
  ]);
}
