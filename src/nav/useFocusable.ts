import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { SpatialNav } from './spatial';

export const navInstance = new SpatialNav();
export const focusedId = signal<string | null>(null);

navInstance.onFocusChange((id) => { focusedId.value = id; });

let counter = 0;
function makeId(prefix = 'f'): string { return `${prefix}-${++counter}`; }

interface Options {
  onActivate?: () => void;
  id?: string;
  autofocus?: boolean;
}

export function useFocusable(opts: Options = {}) {
  const ref = useRef<HTMLElement | null>(null);
  const [id] = useState(() => opts.id ?? makeId());

  // Hold the latest onActivate in a ref. The useEffect below registers a
  // stable trampoline (`() => onActivateRef.current?.()`) once per mount, so
  // it never tears down when the parent passes a fresh inline closure each
  // render. Without this, every parent re-render would unregister this
  // focusable; the spatial engine's unregister-of-current path then snaps
  // focus to whatever happens to be first in its entries Map — usually the
  // leftmost TopNav item — producing the "focus jumps to top on every
  // keystroke" symptom.
  const onActivateRef = useRef(opts.onActivate);
  onActivateRef.current = opts.onActivate;

  useEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    navInstance.register(
      id,
      { x: r.left, y: r.top, w: r.width, h: r.height },
      { onActivate: () => onActivateRef.current?.(), el: ref.current ?? undefined },
    );
    if (opts.autofocus) navInstance.setFocus(id);

    const ro = new ResizeObserver(() => {
      if (!ref.current) return;
      const r2 = ref.current.getBoundingClientRect();
      navInstance.updateRect(id, { x: r2.left, y: r2.top, w: r2.width, h: r2.height });
    });
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      navInstance.unregister(id);
    };
  // Intentionally omits opts.onActivate and opts.autofocus from deps. The
  // former is bridged via onActivateRef. The latter is a first-mount intent
  // only; flipping it later should not seize focus.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return {
    ref,
    focused: focusedId.value === id,
    'data-focusable': id,
    'data-focused': focusedId.value === id ? '' : undefined,
    'data-testid': id,
  };
}
