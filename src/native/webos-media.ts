import { lunaCall, lunaSubscribe, type LunaSubscription, isLunaAvailable } from './luna';

// Typed surface for com.webos.media — webOS's native media pipeline RPC.
// We don't replace <video> with raw Luna; LG's recommended pattern for web
// apps is to use <video> as the playback driver (it manages the video plane
// allocation) and use Luna for the things <video> doesn't expose:
//
//   - mediaOption parameters for startup optimization (skip buffer-then-seek)
//   - Hardware subtitles via setSubtitleSource (faster + sharper than <track>)
//   - Audio track selection that actually works for multi-audio MKVs
//   - Fine-grained pipeline events (bufferingStart/End, sourceInfo)
//
// The mediaId for these calls is exposed on the bridged <video> element
// as `videoElement.mediaId` after `loadedmetadata` fires.
//
// Reference:
//   https://www.webosose.org/docs/reference/ls2-api/com-webos-media/

const MEDIA = 'luna://com.webos.media';

export interface MediaSubscriptionEvent {
  subscription?: boolean;
  currentTime?: number;
  mediaState?: 'load' | 'play' | 'pause' | 'seek' | 'unload';
  bufferRange?: { beginTime: number; percent: number };
  bufferingStart?: boolean;
  bufferingEnd?: boolean;
  endOfStream?: boolean;
  error?: { errorCode?: number; errorText?: string };
  sourceInfo?: {
    programInfo?: Array<{
      duration?: number;
      videoStreams?: Array<{ codec: string; width: number; height: number }>;
      audioStreams?: Array<{ codec: string; sampleRate: number; channels: number; language?: string }>;
    }>;
  };
  videoInfo?: { codec: string; width: number; height: number; frameRate: number };
  audioInfo?: { codec: string; sampleRate: number; channels: number; bitrate?: number };
}

/** Subscribe to playback events for an active media pipeline. */
export function subscribeToMedia(
  mediaId: string,
  onEvent: (e: MediaSubscriptionEvent) => void,
): LunaSubscription {
  return lunaSubscribe<MediaSubscriptionEvent>(`${MEDIA}/subscribe`, { mediaId }, onEvent);
}

/**
 * Attach an external WebVTT or SRT subtitle file to a running pipeline.
 * Hardware-rendered on the video plane, lower latency than HTML <track>.
 * The pipeline must be in 'play' or 'pause' state.
 */
export async function setSubtitleSource(mediaId: string, uri: string): Promise<void> {
  if (!isLunaAvailable()) return;
  await lunaCall(`${MEDIA}/setSubtitleSource`, { mediaId, uri }).catch((e) => {
    // Some firmware versions return errorCode:-1 if the URI isn't reachable;
    // we let the caller fall back to <track> in that case.
    throw e;
  });
}

/** Show or hide hardware subtitles. */
export async function setSubtitleEnable(mediaId: string, enable: boolean): Promise<void> {
  if (!isLunaAvailable()) return;
  await lunaCall(`${MEDIA}/setSubtitleEnable`, { mediaId, enable }).catch(() => { /* */ });
}

/**
 * Switch the active audio (or text) track. webOS 4+ honors the 'enabled'
 * flag on HTMLVideoElement.audioTracks too, but the Luna call is more
 * reliable on this NANO75 / webOS 6 firmware (audioTracks reports correct
 * state but the underlying decoder occasionally ignores the toggle).
 */
export async function selectTrack(
  mediaId: string,
  type: 'audio' | 'video' | 'text',
  index: number,
): Promise<void> {
  if (!isLunaAvailable()) return;
  await lunaCall(`${MEDIA}/selectTrack`, { mediaId, type, index }).catch(() => { /* */ });
}

/**
 * Build the mediaOption query string that gets embedded in a <source
 * type="..."> attribute. Lets the pipeline pre-stage the right bytes
 * before the <video> element fully drives loading.
 *
 * Example use:
 *   <source src={url}
 *           type={`video/mp4;mediaOption=${buildMediaOption({ start: 0, audioLanguage: 'en' })}`} />
 */
export function buildMediaOption(opts: {
  /** Start playback position in seconds. Skips the post-load seek. */
  start?: number;
  /** Preferred audio language (3-letter ISO 639-2 code, e.g. 'eng'). */
  audioLanguage?: string;
  /** External subtitle URI (SRT or WebVTT). */
  subtitleUri?: string;
}): string {
  const option: Record<string, unknown> = {};
  const transmission: Record<string, unknown> = {};
  if (opts.start != null && opts.start > 0) {
    transmission.playTime = { start: Math.floor(opts.start * 1000) }; // milliseconds
  }
  if (opts.audioLanguage) {
    option.audio = { language: opts.audioLanguage };
  }
  if (opts.subtitleUri) {
    option.subtitle = { uri: opts.subtitleUri };
  }
  if (Object.keys(transmission).length > 0) option.transmission = transmission;
  return encodeURIComponent(JSON.stringify({ option }));
}
