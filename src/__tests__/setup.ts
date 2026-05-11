// Global vitest setup. Polyfills a working localStorage / sessionStorage.
//
// Why: Node 25 ships a built-in `globalThis.localStorage` getter that errors
// (and lacks `setItem`/`getItem`/`clear`) unless launched with
// `--localstorage-file=...`. happy-dom installs its own Storage on `window`,
// but the Node global shadows it via the property descriptor, so our app
// code (`localStorage.setItem(...)`) explodes in tests. We replace the
// global with a real in-memory Storage so tests can exercise persistence.

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

const ls = new MemoryStorage();
const ss = new MemoryStorage();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  enumerable: true,
  get: () => ls,
  set: () => {/* readonly */},
});
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  enumerable: true,
  get: () => ss,
  set: () => {/* readonly */},
});
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    enumerable: true,
    get: () => ls,
    set: () => {/* readonly */},
  });
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    enumerable: true,
    get: () => ss,
    set: () => {/* readonly */},
  });
}
