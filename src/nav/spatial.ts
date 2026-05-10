export interface Rect { x: number; y: number; w: number; h: number; }
export type Direction = 'up' | 'down' | 'left' | 'right';

interface Entry {
  id: string;
  rect: Rect;
  onActivate?: () => void;
}

type FocusListener = (id: string | null) => void;

export class SpatialNav {
  private entries = new Map<string, Entry>();
  private currentId: string | null = null;
  private listeners: FocusListener[] = [];

  get focused(): string | null { return this.currentId; }

  register(id: string, rect: Rect, opts?: { onActivate?: () => void }): void {
    this.entries.set(id, { id, rect, onActivate: opts?.onActivate });
    if (this.currentId === null) this.setFocus(id);
  }

  updateRect(id: string, rect: Rect): void {
    const e = this.entries.get(id);
    if (e) e.rect = rect;
  }

  unregister(id: string): void {
    this.entries.delete(id);
    if (this.currentId === id) {
      const next = this.entries.keys().next().value ?? null;
      this.setFocus(next);
    }
  }

  setFocus(id: string | null): void {
    if (id !== null && !this.entries.has(id)) return;
    if (this.currentId === id) return;
    this.currentId = id;
    for (const l of this.listeners) l(id);
  }

  onFocusChange(fn: FocusListener): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((l) => l !== fn); };
  }

  activate(): void {
    if (!this.currentId) return;
    const e = this.entries.get(this.currentId);
    e?.onActivate?.();
  }

  move(direction: Direction): void {
    if (!this.currentId) return;
    const from = this.entries.get(this.currentId);
    if (!from) return;
    const next = this.findNearest(from, direction);
    if (next) this.setFocus(next.id);
  }

  private findNearest(from: Entry, direction: Direction): Entry | null {
    const fcx = from.rect.x + from.rect.w / 2;
    const fcy = from.rect.y + from.rect.h / 2;

    let best: Entry | null = null;
    let bestScore = Infinity;

    for (const e of this.entries.values()) {
      if (e.id === from.id) continue;
      const cx = e.rect.x + e.rect.w / 2;
      const cy = e.rect.y + e.rect.h / 2;
      const dx = cx - fcx;
      const dy = cy - fcy;

      // primary axis check: must be in the right half-plane
      const inDir =
        (direction === 'right' && dx > 0) ||
        (direction === 'left' && dx < 0) ||
        (direction === 'down' && dy > 0) ||
        (direction === 'up' && dy < 0);
      if (!inDir) continue;

      // weighted distance: penalize off-axis movement
      const onAxis = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
      const offAxis = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = onAxis + offAxis * 2;

      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }
}
