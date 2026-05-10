import { useFocusable } from '../nav/useFocusable';

interface Props {
  current: 'home' | 'search' | 'library' | 'settings';
  onNavigate: (to: 'home' | 'search' | 'library' | 'settings') => void;
}

export function TopNav({ current, onNavigate }: Props) {
  const items: Props['current'][] = ['home', 'search', 'library', 'settings'];
  return (
    <nav style={navStyle}>
      <span style={logoStyle}>duane</span>
      {items.map((id) => <NavItem key={id} id={id} active={current === id} onActivate={() => onNavigate(id)} />)}
    </nav>
  );
}

function NavItem({ id, active, onActivate }: { id: string; active: boolean; onActivate: () => void }) {
  const { ref, ...rest } = useFocusable({ onActivate, id: `nav-${id}` });
  return (
    <span ref={ref as any} {...rest} style={{ ...navItemStyle, opacity: active ? 1 : 0.55, fontWeight: active ? 600 : 400 }}>
      {id[0].toUpperCase() + id.slice(1)}
    </span>
  );
}

const navStyle: any = {
  position: 'absolute', top: 0, left: 0, right: 0, height: 64, zIndex: 20,
  display: 'flex', alignItems: 'center', padding: '0 48px', gap: 32,
  background: 'linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.4) 60%, transparent)',
};
const logoStyle: any = {
  fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 700,
  color: 'var(--accent)', fontSize: 28, letterSpacing: '-1px', marginRight: 16,
};
const navItemStyle: any = { fontSize: 16, color: 'var(--text)', cursor: 'pointer', padding: '4px 8px' };
