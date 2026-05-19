import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { Row } from '../Row';
import { installInputListener } from '../../nav/input';
import { navInstance } from '../../nav/useFocusable';
import { stubHorizontalRow, type LayoutHelpers } from '../../__tests__/helpers/layout';
import type { Movie } from '../../types';

function mockMovie(i: number): Movie {
  return {
    imdb_id: `tt${1000000 + i}`,
    tmdb_id: i,
    title: `Movie ${i}`,
    year: 2024,
    runtime: 120,
    genres: ['Drama'],
    poster: '',
    backdrop: '',
    overview: '',
    scores: {},
    cast: [],
  };
}

describe('Row D-pad navigation', () => {
  let layout: LayoutHelpers;
  let uninstall: () => void;
  let activated: string[] = [];

  beforeEach(() => {
    // Reset the singleton focus engine between tests
    (navInstance as any).entries.clear();
    (navInstance as any).currentId = null;
    activated = [];
    layout = stubHorizontalRow();
    uninstall = installInputListener();
  });

  afterEach(() => {
    uninstall();
    layout.restore();
    cleanup();
  });

  it('mounts and registers all posters as focusable', () => {
    const items = [mockMovie(1), mockMovie(2), mockMovie(3)];
    render(<Row id="test" title="Test" items={items} onSelect={(m) => activated.push(m.imdb_id)} />);
    // Three posters should be registered via useFocusable
    expect(document.querySelectorAll('[data-focusable]').length).toBe(3);
  });

  it('renders ALL posters when given more than 6 (no implicit cap)', () => {
    // Previously Row sliced to the first 6 items; anything past col 5 was
    // unreachable. Real-world bug: a movie at row 1 col 6 (Send Help in
    // just-hit-streaming) was a black hole because the poster never even
    // rendered.
    const items = Array.from({ length: 10 }, (_, i) => mockMovie(i + 1));
    render(<Row id="test" title="Test" items={items} onSelect={() => {}} />);
    expect(document.querySelectorAll('[data-focusable]').length).toBe(10);
  });

  it('right arrow moves focus from first poster to second', async () => {
    const user = userEvent.setup();
    const items = [mockMovie(1), mockMovie(2), mockMovie(3)];
    render(<Row id="test" title="Test" items={items} onSelect={(m) => activated.push(m.imdb_id)} />);

    // Spatial engine auto-focuses first registered, but the data-focused
    // attribute reflects the engine's state, not document.activeElement.
    // Assert against the engine's `focused` getter.
    const firstId = navInstance.focused;
    expect(firstId).toMatch(/^poster-test-tt1000001/);

    await user.keyboard('{ArrowRight}');
    const secondId = navInstance.focused;
    expect(secondId).toMatch(/^poster-test-tt1000002/);
  });

  it('right arrow on rightmost poster is a no-op (clamps at edge)', async () => {
    const user = userEvent.setup();
    const items = [mockMovie(1), mockMovie(2)];
    render(<Row id="test" title="Test" items={items} onSelect={() => {}} />);

    // Move to last poster
    await user.keyboard('{ArrowRight}');
    const lastId = navInstance.focused;
    expect(lastId).toMatch(/^poster-test-tt1000002/);

    // Try to go further right
    await user.keyboard('{ArrowRight}');
    expect(navInstance.focused).toBe(lastId);
  });

  it('Enter activates the focused poster', async () => {
    const user = userEvent.setup();
    const items = [mockMovie(1), mockMovie(2)];
    render(<Row id="test" title="Test" items={items} onSelect={(m) => activated.push(m.imdb_id)} />);

    await user.keyboard('{Enter}');
    expect(activated).toEqual(['tt1000001']);
  });

  it('uses unique focus IDs per row (rowId prefix avoids duplicate-movie collision)', () => {
    const items = [mockMovie(1)];
    const { container: c1 } = render(<Row id="row-a" title="A" items={items} onSelect={() => {}} />);
    const a = c1.querySelector('[data-focusable]')?.getAttribute('data-focusable');
    cleanup();
    (navInstance as any).entries.clear();
    (navInstance as any).currentId = null;
    const { container: c2 } = render(<Row id="row-b" title="B" items={items} onSelect={() => {}} />);
    const b = c2.querySelector('[data-focusable]')?.getAttribute('data-focusable');
    expect(a).not.toBe(b);
    expect(a).toContain('row-a');
    expect(b).toContain('row-b');
  });
});
