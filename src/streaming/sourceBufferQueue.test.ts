import { describe, it, expect, vi } from 'vitest';
import { SourceBufferQueue } from './sourceBufferQueue';

function makeMockBuffer() {
  const listeners: Record<string, ((e?: Event) => void)[]> = {};
  const buffer = {
    appendBuffer: vi.fn(),
    addEventListener: vi.fn((event: string, handler: (e?: Event) => void) => {
      (listeners[event] ??= []).push(handler);
    }),
    removeEventListener: vi.fn(),
    updating: false,
  } as unknown as SourceBuffer;
  const fire = (event: string) => {
    (listeners[event] ?? []).forEach((h) => h());
  };
  return { buffer, fire };
}

describe('SourceBufferQueue', () => {
  it('resolves the append promise when updateend fires', async () => {
    const { buffer, fire } = makeMockBuffer();
    const queue = new SourceBufferQueue(buffer);

    const data = new Uint8Array([1, 2, 3]);
    const pending = queue.append(data);

    expect(buffer.appendBuffer).toHaveBeenCalledWith(data);
    fire('updateend');
    await pending;
  });

  it('serialises appends — second appendBuffer not called until first updateend fires', async () => {
    const { buffer, fire } = makeMockBuffer();
    const queue = new SourceBufferQueue(buffer);

    queue.append(new Uint8Array([1]));
    queue.append(new Uint8Array([2]));

    expect(buffer.appendBuffer).toHaveBeenCalledTimes(1);

    fire('updateend');
    await Promise.resolve();
    await Promise.resolve();

    expect(buffer.appendBuffer).toHaveBeenCalledTimes(2);
  });
});
