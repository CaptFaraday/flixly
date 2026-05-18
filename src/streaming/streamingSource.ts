import {
  Input,
  Output,
  UrlSource,
  Mp4OutputFormat,
  StreamTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  EncodedAudioPacketSource,
  ALL_FORMATS,
  type InputVideoTrack,
  type InputAudioTrack,
  type StreamTargetChunk,
} from 'mediabunny';
import { videoMimeForCodec, audioMimeForCodec } from './codecMime';
import { SourceBufferQueue } from './sourceBufferQueue';

const TARGET_BUFFER_AHEAD_S = 30;
const BACKPRESSURE_RESUME_AHEAD_S = 20;
const BACKPRESSURE_POLL_MS = 250;

export interface StreamingSourceOptions {
  startTimeSeconds?: number;
  getCurrentTime?: () => number;
}

export interface StreamingSource {
  objectUrl: string;
  dispose: () => void;
}

export function createStreamingSource(
  url: string,
  opts: StreamingSourceOptions = {},
): StreamingSource {
  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  let disposed = false;

  mediaSource.addEventListener('sourceopen', () => {
    if (disposed) return;
    void runPipeline(mediaSource, url, opts, () => disposed);
  }, { once: true });

  return {
    objectUrl,
    dispose: () => {
      disposed = true;
      URL.revokeObjectURL(objectUrl);
    },
  };
}

async function runPipeline(
  mediaSource: MediaSource,
  url: string,
  opts: StreamingSourceOptions,
  isDisposed: () => boolean,
): Promise<void> {
  try {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new UrlSource(url, {
        getRetryDelay: (n: number) => Math.min(2 ** n, 16),
      }),
    });
    const videoTrack = await input.getPrimaryVideoTrack();
    const audioTrack = await input.getPrimaryAudioTrack();
    if (isDisposed() || !videoTrack || !videoTrack.codec) return;

    // Surface the total duration to the video element so the UI shows
    // the right-hand timestamp. Without setting mediaSource.duration the
    // element reports duration NaN / 0:00 until endOfStream() is called
    // (which only happens when the full file finishes streaming).
    const totalDuration = await input.computeDuration().catch(() => 0);
    if (totalDuration > 0 && mediaSource.readyState === 'open') {
      try { mediaSource.duration = totalDuration; } catch { /* */ }
    }

    const videoCodecParam = await videoTrack.getCodecParameterString();
    if (!videoCodecParam) return;
    const videoSb = mediaSource.addSourceBuffer(videoMimeForCodec(videoCodecParam));
    const videoQueue = new SourceBufferQueue(videoSb);

    let audioSetup: { queue: SourceBufferQueue; mediabunnyCodec: NonNullable<InputAudioTrack['codec']> } | null = null;
    if (audioTrack && audioTrack.codec) {
      const audioCodecParam = await audioTrack.getCodecParameterString();
      if (audioCodecParam) {
        const sb = mediaSource.addSourceBuffer(audioMimeForCodec(audioCodecParam));
        audioSetup = {
          queue: new SourceBufferQueue(sb),
          mediabunnyCodec: audioTrack.codec,
        };
      }
    }

    const getCurrentTime = opts.getCurrentTime ?? (() => 0);
    const startTimeSeconds = opts.startTimeSeconds ?? 0;

    const tasks: Promise<void>[] = [
      pipeVideo(videoTrack, videoTrack.codec, videoQueue, startTimeSeconds, getCurrentTime, isDisposed),
    ];
    if (audioSetup && audioTrack) {
      tasks.push(pipeAudio(audioTrack, audioSetup.mediabunnyCodec, audioSetup.queue, getCurrentTime, isDisposed));
    }

    await Promise.all(tasks);

    if (!isDisposed() && mediaSource.readyState === 'open') {
      mediaSource.endOfStream();
    }
  } catch (e) {
    try {
      (window as unknown as { __flixlyMseError?: unknown }).__flixlyMseError =
        e instanceof Error ? { name: e.name, message: e.message } : String(e);
    } catch { /* */ }
    console.error('[flixly:mse]', e);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function applyBackpressure(
  queue: SourceBufferQueue,
  getCurrentTime: () => number,
  isDisposed: () => boolean,
): Promise<void> {
  const buf = queue.buffer.buffered;
  if (buf.length === 0) return;
  if (buf.end(buf.length - 1) - getCurrentTime() < TARGET_BUFFER_AHEAD_S) return;
  while (!isDisposed()) {
    await sleep(BACKPRESSURE_POLL_MS);
    const b = queue.buffer.buffered;
    if (b.length === 0) return;
    if (b.end(b.length - 1) - getCurrentTime() < BACKPRESSURE_RESUME_AHEAD_S) return;
  }
}

async function pipeVideo(
  track: InputVideoTrack,
  codec: NonNullable<InputVideoTrack['codec']>,
  queue: SourceBufferQueue,
  startTimeSeconds: number,
  getCurrentTime: () => number,
  isDisposed: () => boolean,
): Promise<void> {
  const decoderConfig = await track.getDecoderConfig();
  if (!decoderConfig) return;

  const sink = new EncodedPacketSink(track);
  const packetSource = new EncodedVideoPacketSource(codec);

  const writable = new WritableStream<StreamTargetChunk>({
    write: (chunk) => queue.append(chunk.data as BufferSource),
  });
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'fragmented' }),
    target: new StreamTarget(writable),
  });
  output.addVideoTrack(packetSource);
  await output.start();

  const firstPacket = startTimeSeconds > 0
    ? await sink.getKeyPacket(startTimeSeconds, { verifyKeyPackets: false }).catch(() => null)
    : null;

  let isFirst = true;
  const addPacket = async (p: Parameters<typeof packetSource.add>[0]) => {
    if (isFirst) {
      isFirst = false;
      await packetSource.add(p, { decoderConfig });
    } else {
      await packetSource.add(p);
    }
    await applyBackpressure(queue, getCurrentTime, isDisposed);
  };

  if (firstPacket) {
    await addPacket(firstPacket);
    let prev = firstPacket;
    while (!isDisposed()) {
      const next = await sink.getNextPacket(prev);
      if (!next) break;
      await addPacket(next);
      prev = next;
    }
  } else {
    for await (const packet of sink.packets()) {
      if (isDisposed()) break;
      await addPacket(packet);
    }
  }

  packetSource.close();
  await output.finalize();
}

async function pipeAudio(
  track: InputAudioTrack,
  codec: NonNullable<InputAudioTrack['codec']>,
  queue: SourceBufferQueue,
  getCurrentTime: () => number,
  isDisposed: () => boolean,
): Promise<void> {
  const decoderConfig = await track.getDecoderConfig();
  if (!decoderConfig) return;

  const sink = new EncodedPacketSink(track);
  const packetSource = new EncodedAudioPacketSource(codec);

  const writable = new WritableStream<StreamTargetChunk>({
    write: (chunk) => queue.append(chunk.data as BufferSource),
  });
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'fragmented' }),
    target: new StreamTarget(writable),
  });
  output.addAudioTrack(packetSource);
  await output.start();

  let isFirst = true;
  for await (const packet of sink.packets()) {
    if (isDisposed()) break;
    if (isFirst) {
      isFirst = false;
      await packetSource.add(packet, { decoderConfig });
    } else {
      await packetSource.add(packet);
    }
    await applyBackpressure(queue, getCurrentTime, isDisposed);
  }

  packetSource.close();
  await output.finalize();
}
