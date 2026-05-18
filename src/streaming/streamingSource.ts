// MSE-based streaming source. Hands the <video> element a blob: URL backed
// by a MediaSource; the network fetch + container demux + per-track fMP4
// muxing all run in JS via Mediabunny.
//
// Why this exists: the webOS native pipeline silently drops idle TCP sockets
// during read-throttled streaming, freezing playback after ~80 s with no
// error event. By owning the HTTP layer in JS we sidestep that bug entirely.
//
// Architecture:
//   URL → Mediabunny Input (UrlSource, HTTP Range)
//       → EncodedPacketSink(videoTrack) → EncodedVideoPacketSource → Output(fMP4) → SourceBuffer(video)
//       → EncodedPacketSink(audioTrack) → EncodedAudioPacketSource → Output(fMP4) → SourceBuffer(audio)
//
// Two SourceBuffers (not one combined) because webOS MSE rejects the
// hvc1+ac-3 combo MIME but accepts each codec in its own buffer.
//
// Tests: pure helpers (codecMime, sourceBufferQueue) are unit-tested.
// This module's MSE wiring is verified on-device — the industry pattern
// for MSE code (shaka, hls.js, mediabunny itself all rely on real-browser
// integration tests rather than mocks, because faithful MSE mocks are a
// substantial maintenance burden with weak signal).

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

export interface StreamingSourceOptions {
  startTimeSeconds?: number;
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
    void runPipeline(mediaSource, url, opts.startTimeSeconds ?? 0, () => disposed);
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
  startTimeSeconds: number,
  isDisposed: () => boolean,
): Promise<void> {
  try {
    const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url, { getRetryDelay: (n) => Math.min(2 ** n, 16) }) });
    const videoTrack = await input.getPrimaryVideoTrack();
    const audioTrack = await input.getPrimaryAudioTrack();
    if (isDisposed() || !videoTrack || !videoTrack.codec) return;

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

    const tasks: Promise<void>[] = [
      pipeVideo(videoTrack, videoTrack.codec, videoQueue, startTimeSeconds, isDisposed),
    ];
    if (audioSetup && audioTrack) {
      tasks.push(pipeAudio(audioTrack, audioSetup.mediabunnyCodec, audioSetup.queue, isDisposed));
    }

    await Promise.all(tasks);

    if (!isDisposed() && mediaSource.readyState === 'open') {
      mediaSource.endOfStream();
    }
  } catch (e) {
    try { (window as unknown as { __flixlyMseError?: unknown }).__flixlyMseError = e instanceof Error ? { name: e.name, message: e.message } : String(e); }
    catch { /* */ }
    console.error('[flixly:mse]', e);
  }
}

async function pipeVideo(
  track: InputVideoTrack,
  codec: NonNullable<InputVideoTrack['codec']>,
  queue: SourceBufferQueue,
  startTimeSeconds: number,
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

  // Initial resume seek: start from the nearest keyframe ≤ requested time.
  // Otherwise iterate from the beginning of the file.
  const firstPacket = startTimeSeconds > 0
    ? await sink.getKeyPacket(startTimeSeconds, { verifyKeyPackets: false }).catch(() => null)
    : null;

  // EncodedVideoPacketSource.add() requires decoderConfig metadata on the
  // first packet to describe the bitstream shape (codec, codedWidth/Height,
  // colorSpace, any extradata). Subsequent packets carry no metadata.
  let isFirst = true;
  const addPacket = async (p: Parameters<typeof packetSource.add>[0]) => {
    if (isFirst) {
      isFirst = false;
      await packetSource.add(p, { decoderConfig });
    } else {
      await packetSource.add(p);
    }
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

  // EncodedAudioPacketSource.add() requires decoderConfig metadata on the
  // first packet (codec, numberOfChannels, sampleRate, optional description).
  let isFirst = true;

  // Audio decodes from any packet boundary; sequential iteration is fine.
  // MediaSource discards audio before currentTime, so a resume seek into the
  // middle of the audio will sound clean once the video keyframe lines up.
  for await (const packet of sink.packets()) {
    if (isDisposed()) break;
    if (isFirst) {
      isFirst = false;
      await packetSource.add(packet, { decoderConfig });
    } else {
      await packetSource.add(packet);
    }
  }

  packetSource.close();
  await output.finalize();
}
