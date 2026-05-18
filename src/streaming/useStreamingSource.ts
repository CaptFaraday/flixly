import { useEffect, useState } from 'preact/hooks';
import { createStreamingSource } from './streamingSource';

export function useStreamingSource(
  url: string,
  opts?: { startTimeSeconds?: number },
): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!url) { setObjectUrl(null); return; }
    const handle = createStreamingSource(url, opts);
    setObjectUrl(handle.objectUrl);
    return () => {
      handle.dispose();
      setObjectUrl(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, opts?.startTimeSeconds]);
  return objectUrl;
}
