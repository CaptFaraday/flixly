import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { Home } from './screens/Home';
import { Settings } from './screens/Settings';
import { installInputListener } from './nav/input';
import type { Movie, Collection } from './types';

type Route =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'library' }
  | { name: 'settings' }
  | { name: 'detail'; movie: Movie }
  | { name: 'collection'; collection: Collection }
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
      return <DetailPlaceholder movie={r.movie} />;
    case 'player':
      return <PlayerPlaceholder movie={r.movie} />;
    default:
      return <div style={{ padding: 64 }}>Coming soon: {r.name}</div>;
  }
}

function DetailPlaceholder({ movie }: { movie: Movie }) {
  return <div style={{ padding: 64 }}><h1>{movie.title}</h1><p>Detail screen — Task 22 builds this.</p></div>;
}
function PlayerPlaceholder({ movie }: { movie: Movie }) {
  return <div style={{ padding: 64 }}><h1>Playing {movie.title}</h1><p>Player — Task 23+ builds this.</p></div>;
}
