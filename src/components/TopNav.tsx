import './TopNav.css';
import { useFocusable } from '../nav/useFocusable';

interface Props {
  current: 'home' | 'search' | 'library' | 'settings';
  onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void;
}

export function TopNav({ current, onNavigate }: Props) {
  const items: Props['current'][] = ['home', 'search', 'library', 'settings'];
  return (
    <nav className="topnav">
      <span className="topnav__logo">FLIXLY</span>
      <div className="topnav__items">
        {items.map((id) => <NavItem key={id} id={id} active={current === id} onActivate={() => onNavigate(id)} />)}
      </div>
    </nav>
  );
}

function NavItem({ id, active, onActivate }: { id: string; active: boolean; onActivate: () => void }) {
  const { ref, ...rest } = useFocusable({ onActivate, id: `nav-${id}` });
  return (
    <span
      ref={ref as any}
      {...rest}
      className={active ? 'topnav__item topnav__item--active' : 'topnav__item'}
    >
      {id[0].toUpperCase() + id.slice(1)}
    </span>
  );
}
