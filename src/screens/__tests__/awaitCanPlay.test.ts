import { describe, it, expect, vi } from 'vitest';
import { awaitCanPlay } from '../awaitCanPlay';

// HAVE_FUTURE_DATA — the readyState corresponding to the `canplay` event
// having already fired. Hardcoded here so the test reads independently
// of the DOM lib.
const HAVE_FUTURE_DATA = 3;

describe('awaitCanPlay', () => {
  it('resolves immediately without subscribing when readyState >= HAVE_FUTURE_DATA', async () => {
    const addEventListener = vi.fn();
    const video = { readyState: HAVE_FUTURE_DATA, addEventListener } as unknown as HTMLVideoElement;

    await awaitCanPlay(video);

    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('resolves when canplay fires if readyState is below HAVE_FUTURE_DATA', async () => {
    let canplayHandler: ((ev: Event) => void) | null = null;
    const video = {
      readyState: 0,
      addEventListener: vi.fn((event: string, handler: (ev: Event) => void) => {
        if (event === 'canplay') canplayHandler = handler;
      }),
    } as unknown as HTMLVideoElement;

    let resolved = false;
    const pending = awaitCanPlay(video).then(() => { resolved = true; });

    // Microtask flush — give the promise a chance to settle if the
    // implementation incorrectly resolves immediately.
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(canplayHandler).not.toBeNull();

    canplayHandler!(new Event('canplay'));
    await pending;
    expect(resolved).toBe(true);
  });
});
