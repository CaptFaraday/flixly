/**
 * Stubs Element.prototype.getBoundingClientRect so spatial focus tests have
 * sensible rectangles to work with. happy-dom returns zeros otherwise.
 *
 * Layout strategy: scan all `[data-focusable]` elements in document order
 * and lay them out in a horizontal row (first), then wrap to next row if
 * a row delimiter is hit (a `data-row-break` attribute on any element).
 * For most tests this gives realistic geometry without manually placing
 * every element.
 *
 * For specific test layouts that need precise control, pass a
 * `layoutByTestId` map.
 */
export interface LayoutHelpers {
  restore: () => void;
}

const ITEM_W = 200;
const ITEM_H = 240;
const ROW_GAP = 40;

export function stubLayoutByTestId(layoutByTestId: Record<string, DOMRect>): LayoutHelpers {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const id = this.getAttribute?.('data-testid');
    if (id && layoutByTestId[id]) return layoutByTestId[id];
    return original.call(this);
  };
  return { restore: () => { Element.prototype.getBoundingClientRect = original; } };
}

/**
 * Auto-layout helper for horizontal-row component tests. Lays out every
 * focusable in a single horizontal row at y=0.
 */
export function stubHorizontalRow(): LayoutHelpers {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const focusables = Array.from(document.querySelectorAll('[data-focusable]'));
    const index = focusables.indexOf(this);
    if (index < 0) return original.call(this);
    const x = index * (ITEM_W + 10);
    return makeRect(x, 0, ITEM_W, ITEM_H);
  };
  return { restore: () => { Element.prototype.getBoundingClientRect = original; } };
}

/**
 * Multi-row auto-layout: wraps focusables into rows of `cols` items.
 */
export function stubGrid(cols: number): LayoutHelpers {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const focusables = Array.from(document.querySelectorAll('[data-focusable]'));
    const index = focusables.indexOf(this);
    if (index < 0) return original.call(this);
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = col * (ITEM_W + 10);
    const y = row * (ITEM_H + ROW_GAP);
    return makeRect(x, y, ITEM_W, ITEM_H);
  };
  return { restore: () => { Element.prototype.getBoundingClientRect = original; } };
}

function makeRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x, y, width, height,
    top: y, left: x, right: x + width, bottom: y + height,
    toJSON: () => ({ x, y, width, height }),
  } as DOMRect;
}
