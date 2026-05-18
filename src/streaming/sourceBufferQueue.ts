// Sequential SourceBuffer.appendBuffer queue. Promise-based; serialises
// appends so they don't overlap (calling appendBuffer while updating throws).
//
// On a synchronous QuotaExceededError, the buffer can't accept more data
// right now — the caller should back off, not crash. The queue rejects the
// individual append's promise with the error AND ensures internal state
// resets so subsequent appends can proceed once space is freed elsewhere
// (e.g., by playback consuming buffered data, or by an explicit remove()).
export class SourceBufferQueue {
  private busy = false;
  private pending: Array<{ data: BufferSource; resolve: () => void; reject: (e: Error) => void }> = [];

  constructor(public readonly buffer: SourceBuffer) {}

  append(data: BufferSource): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.busy) {
        this.pending.push({ data, resolve, reject });
        return;
      }
      this.run(data, resolve, reject);
    });
  }

  remove(start: number, end: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.busy) {
        // Defer removes via a tiny shim that runs them after current op.
        this.pending.push({
          data: new Uint8Array(0),
          resolve: () => { this.doRemove(start, end).then(resolve, reject); },
          reject,
        });
        return;
      }
      this.doRemove(start, end).then(resolve, reject);
    });
  }

  private doRemove(start: number, end: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.busy = true;
      const cleanup = (cb: () => void) => {
        this.buffer.removeEventListener('updateend', onEnd);
        this.buffer.removeEventListener('error', onError);
        this.busy = false;
        cb();
        this.pumpNext();
      };
      const onEnd = () => cleanup(resolve);
      const onError = () => cleanup(() => reject(new Error('SourceBuffer.remove failed')));
      this.buffer.addEventListener('updateend', onEnd);
      this.buffer.addEventListener('error', onError);
      try {
        this.buffer.remove(start, end);
      } catch (e) {
        cleanup(() => reject(e instanceof Error ? e : new Error(String(e))));
      }
    });
  }

  private run(data: BufferSource, resolve: () => void, reject: (e: Error) => void): void {
    this.busy = true;
    const cleanup = (cb: () => void) => {
      this.buffer.removeEventListener('updateend', onEnd);
      this.buffer.removeEventListener('error', onError);
      this.busy = false;
      cb();
      this.pumpNext();
    };
    const onEnd = () => cleanup(resolve);
    const onError = () => cleanup(() => reject(new Error('SourceBuffer append failed')));
    this.buffer.addEventListener('updateend', onEnd);
    this.buffer.addEventListener('error', onError);
    try {
      this.buffer.appendBuffer(data);
    } catch (e) {
      cleanup(() => reject(e instanceof Error ? e : new Error(String(e))));
    }
  }

  private pumpNext(): void {
    const next = this.pending.shift();
    if (next) this.run(next.data, next.resolve, next.reject);
  }
}
