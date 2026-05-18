import { useEffect, useState } from 'preact/hooks';
import { createStreamingSource } from './streamingSource';

interface Options {
  startTimeSeconds?: number;
  /** Ref to the playing <video> element. Used by the streaming pipeline for
   *  backpressure (it keeps the SourceBuffer no more than N seconds ahead of
   *  the playhead so we don't exceed the buffer quota). */
  videoRef?: { current: HTMLVideoElement | null };
}

export function useStreamingSource(url: string, opts?: Options): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!url) { setObjectUrl(null); return; }
    const handle = createStreamingSource(url, {
      startTimeSeconds: opts?.startTimeSeconds,
      getCurrentTime: opts?.videoRef
        ? () => opts.videoRef!.current?.currentTime ?? 0
        : undefined,
    });
    setObjectUrl(handle.objectUrl);
    return () => {
      handle.dispose();
      setObjectUrl(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, opts?.startTimeSeconds]);
  return objectUrl;
}
