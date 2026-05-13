import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialNav, type Rect } from './spatial';

const rect = (x: number, y: number, w = 100, h = 60): Rect => ({ x, y, w, h });

describe('SpatialNav', () => {
  let nav: SpatialNav;

  beforeEach(() => {
    nav = new SpatialNav();
  });

  it('focuses the first registered element', () => {
    nav.register('a', rect(0, 0));
    expect(nav.focused).toBe('a');
  });

  it('moves right to the nearest element on the right', () => {
    nav.register('a', rect(0, 0));
    nav.register('b', rect(120, 0));
    nav.register('c', rect(0, 100));
    nav.move('right');
    expect(nav.focused).toBe('b');
  });

  it('moves down to the element directly below over diagonal ones', () => {
    nav.register('a', rect(0, 0));
    nav.register('right-diagonal', rect(200, 100));
    nav.register('directly-below', rect(0, 100));
    nav.move('down');
    expect(nav.focused).toBe('directly-below');
  });

  it('does nothing when no element exists in the requested direction', () => {
    nav.register('a', rect(0, 0));
    nav.move('left');
    expect(nav.focused).toBe('a');
  });

  it('unregister removes the element and shifts focus if needed', () => {
    nav.register('a', rect(0, 0));
    nav.register('b', rect(120, 0));
    nav.move('right');
    expect(nav.focused).toBe('b');
    nav.unregister('b');
    expect(nav.focused).toBe('a');
  });

  it('unregister of focused element jumps to the spatially NEAREST remaining entry, not first-by-insertion-order', () => {
    // Regression for the "focus snaps to nav-home on every interaction" bug.
    // Previously, when the focused element unregistered, the engine picked
    // `entries.keys().next().value` — the first-inserted entry — which in
    // the real app was always a TopNav item registered early on. The new
    // behavior picks the spatially nearest entry by center-to-center distance.
    nav.register('top-nav', rect(0, 0, 100, 33));      // registered first
    nav.register('row-A', rect(0, 500, 100, 100));     // far from top-nav, near row-B
    nav.register('row-B', rect(120, 500, 100, 100));   // focused, gets unregistered
    nav.register('row-C', rect(240, 500, 100, 100));

    nav.setFocus('row-B');
    nav.unregister('row-B');

    // Nearest to row-B by Euclidean center-to-center is row-A (dx=120)
    // or row-C (dx=120) — both tied. NOT top-nav (~509 px away).
    expect(['row-A', 'row-C']).toContain(nav.focused);
    expect(nav.focused).not.toBe('top-nav');
  });

  it('unregister sets focus to null when no entries remain', () => {
    nav.register('only', rect(0, 0));
    nav.unregister('only');
    expect(nav.focused).toBe(null);
  });

  it('manually setFocus to a registered id', () => {
    nav.register('a', rect(0, 0));
    nav.register('b', rect(120, 0));
    nav.setFocus('b');
    expect(nav.focused).toBe('b');
  });

  it('emits a focus-change event when focus moves', () => {
    nav.register('a', rect(0, 0));
    nav.register('b', rect(120, 0));
    const seen: (string | null)[] = [];
    nav.onFocusChange((id) => seen.push(id));
    nav.move('right');
    expect(seen).toEqual(['b']);
  });

  it('activate triggers the registered handler', () => {
    let pressed = false;
    nav.register('a', rect(0, 0), { onActivate: () => { pressed = true; } });
    nav.activate();
    expect(pressed).toBe(true);
  });
});
