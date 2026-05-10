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
