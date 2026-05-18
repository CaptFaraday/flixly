export class SourceBufferQueue {
  private busy = false;
  private pending: Array<{ data: BufferSource; resolve: () => void }> = [];

  constructor(private buffer: SourceBuffer) {}

  append(data: BufferSource): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.busy) {
        this.pending.push({ data, resolve });
        return;
      }
      this.run(data, resolve);
    });
  }

  private run(data: BufferSource, resolve: () => void): void {
    this.busy = true;
    const onEnd = () => {
      this.buffer.removeEventListener('updateend', onEnd);
      this.busy = false;
      resolve();
      const next = this.pending.shift();
      if (next) this.run(next.data, next.resolve);
    };
    this.buffer.addEventListener('updateend', onEnd);
    this.buffer.appendBuffer(data);
  }
}
