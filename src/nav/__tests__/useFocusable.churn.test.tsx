import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { useFocusable, navInstance, focusedId } from '../useFocusable';
import { stubLayoutByTestId, type LayoutHelpers } from '../../__tests__/helpers/layout';

// Regression for the "focus snaps to nav-home on every keystroke" bug.
//
// Failure mode (now fixed): every parent re-render created a new
// `onActivate` closure for each `useFocusable` child. The old
// implementation listed `opts.onActivate` in the `useEffect` deps, so the
// effect tore down and re-registered on every render. While tearing down,
// the focused element unregistered; the engine's unregister fallback then
// snapped focus to the first entry in its Map (insertion order) — which
// in the real app was always the leftmost TopNav item.
//
// With the fix, `onActivate` is bridged through a ref so the effect runs
// ONCE per mount per id. This test would have hung indefinitely under
// the pre-fix code due to a focus-change → re-render → re-register
// cascade. Under the fix it terminates cleanly.

function makeRect(x: number, y: number, w: number, h: number): DOMRect {
  return {
    x, y, width: w, height: h,
    top: y, left: x, right: x + w, bottom: y + h,
    toJSON: () => ({ x, y, width: w, height: h }),
  } as DOMRect;
}

function Probe({ tick: _tick }: { tick: number }) {
  // The hazard is a fresh inline closure for onActivate on every render.
  const { ref: refA, ...restA } = useFocusable({ id: 'churn-a', onActivate: () => {} });
  const { ref: refB, ...restB } = useFocusable({ id: 'churn-b', onActivate: () => {} });
  return (
    <div>
      <span ref={refA as any} {...restA} />
      <span ref={refB as any} {...restB} />
    </div>
  );
}

describe('useFocusable does not snap focus on parent re-render', () => {
  let layout: LayoutHelpers;

  beforeEach(() => {
    (navInstance as any).entries.clear();
    (navInstance as any).currentId = null;
    layout = stubLayoutByTestId({
      'churn-a': makeRect(0, 0, 100, 50),
      'churn-b': makeRect(120, 0, 100, 50),
    });
  });

  afterEach(() => {
    cleanup();
    layout.restore();
  });

  it('keeps focus on the same id across forced re-renders', () => {
    const { rerender } = render(<Probe tick={0} />);

    navInstance.setFocus('churn-b');
    expect(focusedId.value).toBe('churn-b');

    rerender(<Probe tick={1} />);
    rerender(<Probe tick={2} />);
    rerender(<Probe tick={3} />);

    expect(focusedId.value).toBe('churn-b');
  });

  it('does not lose entries during re-render churn (Map state stays consistent)', () => {
    const { rerender } = render(<Probe tick={0} />);
    const before = (navInstance as any).entries.size;
    rerender(<Probe tick={1} />);
    rerender(<Probe tick={2} />);
    expect((navInstance as any).entries.size).toBe(before);
  });
});
