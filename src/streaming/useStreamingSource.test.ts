import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/preact';

const created: Array<{ url: string; startTimeSeconds: number | undefined }> = [];
const disposed: string[] = [];

vi.mock('./streamingSource', () => ({
  createStreamingSource: vi.fn((url: string, opts?: { startTimeSeconds?: number }) => {
    const objectUrl = `blob:fake-${created.length}`;
    created.push({ url, startTimeSeconds: opts?.startTimeSeconds });
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
});
