import { signal, effect } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { Home } from './screens/Home';
import { Settings } from './screens/Settings';
import { Detail } from './screens/Detail';
import { Player } from './screens/Player';
import { Search } from './screens/Search';
import { Library } from './screens/Library';
import { Collection } from './screens/Collection';
import { installInputListener } from './nav/input';
import { focusedId } from './nav/useFocusable';
import { watchlist, resumePositions, settings } from './state/store';
import type { Movie, Collection as CollectionType } from './types';

// Test-friendly state introspection. Lets Vitest tests, manual CDP scripts,
// and on-device smoke tests assert on app state via `window.__flixly`
// instead of pixel diffs. Only enabled in dev / test contexts where window
// is defined; harmless on the TV but useful when CDP is connected.
declare global {
  interface Window {
    __flixly?: {
      route: string;
      focusedId: string | null;
      watchlistCount: number;
      resumeCount: number;
      hasRdKey: boolean;
      hasTorboxKey: boolean;
    };
  }
}

type Route =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'library' }
  | { name: 'settings' }
  | { name: 'detail'; movie: Movie }
  | { name: 'collection'; collection: CollectionType }
  | { name: 'player'; movie: Movie };

export const route = signal<Route>({ name: 'home' });

const stack: Route[] = [{ name: 'home' }];
function push(r: Route) { stack.push(r); route.value = r; }
function pop() {
  if (stack.length > 1) { stack.pop(); route.value = stack[stack.length - 1]; }
}

export function App() {
  useEffect(() => installInputListener(pop), []);
  const r = route.value;
  switch (r.name) {
    case 'home':
      return <Home
        onNavigate={(to) => push({ name: to } as Route)}
        onSelectMovie={(movie) => push({ name: 'detail', movie })}
        onSelectCollection={(collection) => push({ name: 'collection', collection })}
      />;
    case 'settings':
      return <Settings onNavigate={(to) => push({ name: to } as Route)} />;
    case 'detail':
      return <Detail
        movie={r.movie}
        onPlay={() => push({ name: 'player', movie: r.movie })}
        onNavigate={(to) => push({ name: to } as Route)}
      />;
    case 'player':
      return <Player movie={r.movie} onClose={pop} />;
    case 'search':
      return <Search
        onNavigate={(to) => push({ name: to } as Route)}
        onSelectMovie={(movie) => push({ name: 'detail', movie })}
      />;
    case 'library':
      return <Library
        onNavigate={(to) => push({ name: to } as Route)}
        onSelectMovie={(movie) => push({ name: 'detail', movie })}
      />;
    case 'collection':
      return <Collection
        collection={r.collection}
        onNavigate={(to) => push({ name: to } as Route)}
        onSelectMovie={(movie) => push({ name: 'detail', movie })}
      />;
  }
}

if (typeof window !== 'undefined') {
  effect(() => {
    window.__flixly = {
      route: route.value.name,
      focusedId: focusedId.value,
      watchlistCount: watchlist.value.length,
      resumeCount: Object.keys(resumePositions.value).length,
      hasRdKey: !!settings.value.rd_api_key,
      hasTorboxKey: !!settings.value.torbox_api_key,
    };
  });
}
