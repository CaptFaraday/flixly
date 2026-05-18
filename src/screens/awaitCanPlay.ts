// Resolve when the video element is ready to play (readyState >= HAVE_FUTURE_DATA).
// Used to delay work that contends with the initial metadata fetch — most
// importantly the OpenSubtitles moviehash compute, whose Range requests on
// the same TorBox CDN URL otherwise steal bandwidth from <video>'s own
// fetch and inflate time-to-first-frame.
const HAVE_FUTURE_DATA = 3;

export function awaitCanPlay(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HAVE_FUTURE_DATA) return Promise.resolve();
  return new Promise<void>((resolve) => {
    video.addEventListener('canplay', () => resolve(), { once: true });
  });
}
