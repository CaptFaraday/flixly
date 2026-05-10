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

  useEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    navInstance.register(id, { x: r.left, y: r.top, w: r.width, h: r.height }, { onActivate: opts.onActivate });
    if (opts.autofocus) navInstance.setFocus(id);

    // Re-measure on resize
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
  }, [id, opts.onActivate]);

  return {
    ref,
    focused: focusedId.value === id,
    'data-focusable': id,
    'data-focused': focusedId.value === id ? '' : undefined,
  };
}
