import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { Home } from './screens/Home';
import { Settings } from './screens/Settings';
import { Detail } from './screens/Detail';
import { Player } from './screens/Player';
import { Search } from './screens/Search';
import { Library } from './screens/Library';
import { Collection } from './screens/Collection';
import { installInputListener } from './nav/input';
import type { Movie, Collection as CollectionType } from './types';

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
