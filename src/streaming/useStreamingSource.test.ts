import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/preact';

const created: Array<{ url: string; startTimeSeconds: number | undefined; getCurrentTime?: () => number }> = [];
const disposed: string[] = [];

vi.mock('./streamingSource', () => ({
  createStreamingSource: vi.fn((url: string, opts?: { startTimeSeconds?: number; getCurrentTime?: () => number }) => {
    const objectUrl = `blob:fake-${created.length}`;
    created.push({ url, startTimeSeconds: opts?.startTimeSeconds, getCurrentTime: opts?.getCurrentTime });
    return { objectUrl, dispose: () => disposed.push(objectUrl) };
  }),
}));

import { useStreamingSource } from './useStreamingSource';

beforeEach(() => {
  created.length = 0;
  disposed.length = 0;
});

describe('useStreamingSource', () => {
  it('returns null and does not start a pipeline when URL is empty', () => {
    const { result } = renderHook(() => useStreamingSource(''));
    expect(result.current).toBeNull();
    expect(created).toHaveLength(0);
  });

  it('creates a streaming source for a non-empty URL and returns its objectUrl', () => {
    const { result } = renderHook(() => useStreamingSource('https://example.com/a.mkv'));
    expect(created).toHaveLength(1);
    expect(created[0].url).toBe('https://example.com/a.mkv');
    expect(result.current).toBe('blob:fake-0');
  });

  it('disposes the streaming source on unmount', () => {
    const { unmount } = renderHook(() => useStreamingSource('https://example.com/b.mkv'));
    expect(disposed).toHaveLength(0);
    unmount();
    expect(disposed).toEqual(['blob:fake-0']);
  });

  it('passes a getCurrentTime callback that reads from the supplied video ref', () => {
    const fakeVideo = { currentTime: 42 } as HTMLVideoElement;
    const videoRef = { current: fakeVideo };
    renderHook(() => useStreamingSource('https://example.com/c.mkv', { videoRef }));
    expect(created).toHaveLength(1);
    expect(typeof created[0].getCurrentTime).toBe('function');
    expect(created[0].getCurrentTime!()).toBe(42);

    // Updating the ref's currentTime reflects in the callback.
    fakeVideo.currentTime = 100;
    expect(created[0].getCurrentTime!()).toBe(100);
  });
});
